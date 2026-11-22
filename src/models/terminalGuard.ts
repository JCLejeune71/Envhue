// Pure module (no "vscode" import) so that it can be unit-tested.
//
// Read-only mode locks the editor and the Explorer, not the terminal. This
// recognizes command lines that look like they change something, so Envhue can
// warn when one runs in a locked environment. It is a hint based on the first
// words of each command: it cannot stop a command, and it misses what it does
// not know (a script, an alias, a tool it has no rule for).

const MUTATING: RegExp[] = [
  /^(rm|rmdir|mv|shred|truncate|dd|mkfs\S*|chmod|chown|chgrp|ln|touch|mkdir|tee)$/,
  /^sed$/,                       // checked for -i below
  /^git$/,                       // checked for the sub-command below
  /^(terraform|tofu)$/,
  /^kubectl$/,
  /^helm$/,
  /^docker(-compose)?$/,
  /^(systemctl|service)$/,
  /^(apt|apt-get|yum|dnf|apk|brew|pip|pip3)$/,
  /^npm$/,
  /^(shutdown|reboot|poweroff|halt|kill|killall|pkill)$/,
  /^(psql|mysql|sqlcmd|mongosh|redis-cli)$/,
  /^ansible-playbook$/
];

const GIT_CHANGING = /^(push|commit|reset|checkout|switch|clean|rebase|merge|pull|stash|restore|rm|mv|tag|cherry-pick|revert|apply|am|branch)$/;
const TERRAFORM_CHANGING = /^(apply|destroy|import|taint|untaint|state|force-unlock)$/;
const KUBECTL_CHANGING = /^(apply|delete|patch|scale|rollout|edit|replace|create|drain|cordon|uncordon|annotate|label|set|exec)$/;
const HELM_CHANGING = /^(install|upgrade|uninstall|rollback|delete)$/;
const DOCKER_CHANGING = /^(rm|rmi|prune|kill|stop|restart|down|up|run|exec|build|push|pull|volume|network|system)$/;
const SERVICE_CHANGING = /^(stop|restart|reload|disable|enable|start|mask|kill)$/;
const PACKAGE_CHANGING = /^(install|remove|purge|uninstall|upgrade|update|autoremove|add|del)$/;
const NPM_CHANGING = /^(install|i|uninstall|update|publish|unpublish|ci|link|prune|dedupe|deprecate)$/;
const SQL_CHANGING = /\b(drop|delete\s+from|truncate|alter|update\s+\w+\s+set|insert\s+into|create)\b/i;

const READ_ONLY = /^(get|list|ls|ps|status|show|describe|logs|log|plan|diff|version|inspect|top|config|help|history|search|info|validate|fmt|output|blame|remote|grep|cat-file|rev-parse|events|images|stats|compose|container|image)$/;

/**
 * The first word that is either a read-only or a changing sub-command decides:
 * flags and their values (kubectl -n prod delete ...) come before it.
 */
function subCommandChanges(args: string[], changing: RegExp): boolean {
  for (const arg of args) {
    if (changing.test(arg)) {
      return true;
    }

    if (READ_ONLY.test(arg) && !/^(compose|container|image)$/.test(arg)) {
      return false;
    }
  }

  return false;
}

function words(segment: string): string[] {
  const tokens = segment.trim().split(/\s+/).filter(Boolean);

  // Skip leading VAR=value assignments and common wrappers.
  while (
    tokens.length > 0 &&
    (/^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[0]) || /^(sudo|time|nohup|command|exec|env)$/.test(tokens[0]))
  ) {
    tokens.shift();
  }

  return tokens;
}

function segmentChanges(segment: string): boolean {
  const [command = '', ...args] = words(segment);
  const binary = command.replace(/^.*[\\/]/, '').replace(/\.exe$/i, '').toLowerCase();

  if (!MUTATING.some((pattern) => pattern.test(binary))) {
    return /\b(sh|bash|zsh|pwsh|powershell)$/.test(binary) && args.length > 0 && args.includes('-c');
  }

  const sub = args.find((arg) => !arg.startsWith('-')) ?? '';

  switch (binary) {
    case 'sed': return args.some((arg) => /^-[A-Za-z]*i/.test(arg) || arg.startsWith('--in-place'));
    case 'git': return subCommandChanges(args, GIT_CHANGING);
    case 'terraform':
    case 'tofu': return subCommandChanges(args, TERRAFORM_CHANGING);
    case 'kubectl': return subCommandChanges(args, KUBECTL_CHANGING);
    case 'helm': return subCommandChanges(args, HELM_CHANGING);
    case 'docker':
    case 'docker-compose': return subCommandChanges(args, DOCKER_CHANGING);
    case 'systemctl':
    case 'service': return args.some((arg) => SERVICE_CHANGING.test(arg));
    case 'npm': return NPM_CHANGING.test(sub);
    case 'psql':
    case 'mysql':
    case 'sqlcmd':
    case 'mongosh':
    case 'redis-cli': return SQL_CHANGING.test(segment);
    case 'ansible-playbook': return !args.some((arg) => arg === '--check' || arg === '-C');
    case 'apt':
    case 'apt-get':
    case 'yum':
    case 'dnf':
    case 'apk':
    case 'brew':
    case 'pip':
    case 'pip3': return PACKAGE_CHANGING.test(sub);
    default: return true;
  }
}

/** True when the command line probably changes files, services or data. */
export function looksMutating(commandLine: string): boolean {
  const line = commandLine.trim();

  if (!line) {
    return false;
  }

  // Output redirected into a file (but not to /dev/null or a file descriptor).
  if (/(^|[^>&0-9])>{1,2}\s*(?!\/dev\/null|&)\S/.test(line)) {
    return true;
  }

  // "curl ... | sh" runs whatever was downloaded.
  if (/\|\s*(sudo\s+)?(sh|bash|zsh)\b/.test(line)) {
    return true;
  }

  return line.split(/&&|\|\||;|\|/).some(segmentChanges);
}
