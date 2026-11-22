// Pure module (no "vscode" or "fs" import) so that it can be unit-tested.
// It understands the subset of the OpenSSH client configuration format that
// is needed to list the hosts a user can connect to.

export interface SshHost {
  /** The alias used on the command line and by Remote - SSH. */
  alias: string;
  hostName?: string;
  user?: string;
}

export interface ParsedSshConfig {
  /** Concrete hosts declared in the file, in order of appearance. */
  hosts: SshHost[];
  /** Paths or globs given to "Include" directives, to be resolved by the caller. */
  includes: string[];
}

interface ConfigLine {
  keyword: string;
  value: string;
}

function parseLine(line: string): ConfigLine | undefined {
  const trimmed = line.trim();

  if (!trimmed || trimmed.startsWith('#')) {
    return undefined;
  }

  const match = /^([A-Za-z]+)\s*(?:=\s*|\s+)(.*)$/.exec(trimmed);

  if (!match) {
    return undefined;
  }

  return {
    keyword: match[1].toLowerCase(),
    value: match[2].replace(/\s+#.*$/, '').trim()
  };
}

/** Splits a value into words, honoring double quotes. */
function splitWords(value: string): string[] {
  const words: string[] = [];
  const pattern = /"([^"]*)"|(\S+)/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(value)) !== null) {
    words.push(match[1] ?? match[2]);
  }

  return words;
}

/**
 * Parses the text of an SSH config file. Patterns ("*", "?", "!") are not
 * connectable aliases and are skipped. As in OpenSSH, the first value
 * obtained for a setting wins.
 */
export function parseSshConfig(text: string): ParsedSshConfig {
  const hosts = new Map<string, SshHost>();
  const includes: string[] = [];
  let current: SshHost[] = [];

  for (const line of text.split(/\r?\n/)) {
    const parsed = parseLine(line);

    if (!parsed) {
      continue;
    }

    switch (parsed.keyword) {
      case 'host':
        current = [];

        for (const pattern of splitWords(parsed.value)) {
          if (/[*?!]/.test(pattern)) {
            continue;
          }

          const host = hosts.get(pattern) ?? { alias: pattern };
          hosts.set(pattern, host);
          current.push(host);
        }
        break;

      case 'match':
        current = [];
        break;

      case 'include':
        includes.push(...splitWords(parsed.value));
        break;

      case 'hostname':
        for (const host of current) {
          host.hostName ??= parsed.value;
        }
        break;

      case 'user':
        for (const host of current) {
          host.user ??= parsed.value;
        }
        break;

      default:
        break;
    }
  }

  return { hosts: [...hosts.values()], includes };
}
