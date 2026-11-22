import * as vscode from 'vscode';
import { randomUUID } from 'crypto';
import { deriveColors, parseHexInput } from '../models/colors';
import { SshHost } from '../models/sshConfig';
import { describeConnection, describeTarget } from '../models/describe';
import { suggestTypeForTarget } from '../models/prodDetection';
import { listSshHosts } from '../services/sshHostService';
import { listWslDistros } from '../services/wslService';
import {
  ACCENT_PRESETS,
  COLOR_EXAMPLE,
  DEFAULT_ACCENT_BY_TYPE,
  ENVIRONMENT_TYPES,
  Environment,
  EnvironmentColors
} from '../models/environment';

async function ask(
  prompt: string,
  value?: string,
  placeHolder?: string
): Promise<string | undefined> {
  return vscode.window.showInputBox({
    title: 'Envhue',
    prompt,
    value,
    placeHolder,
    ignoreFocusOut: true
  });
}

async function askColor(
  label: string,
  current: string
): Promise<string | undefined> {
  const value = await vscode.window.showInputBox({
    title: 'Envhue',
    prompt: `${label} color (hexadecimal, e.g. ${COLOR_EXAMPLE})`,
    value: current,
    ignoreFocusOut: true,
    validateInput: (input) =>
      parseHexInput(input)
        ? undefined
        : `Not a valid color (${input.length} characters received). ` +
          `Use a hexadecimal color such as ${COLOR_EXAMPLE}.`
  });

  return parseHexInput(value)?.toUpperCase();
}

async function pickAccent(current: string): Promise<string | undefined> {
  const picked = await vscode.window.showQuickPick(
    [
      { label: '$(circle-filled) Keep current', description: current, color: current },
      ...ACCENT_PRESETS.map((preset) => ({
        label: `$(symbol-color) ${preset.label}`,
        description: preset.color,
        color: preset.color
      })),
      { label: '$(edit) Custom hexadecimal color…', description: '', color: '' }
    ],
    {
      title: 'Envhue — Accent color',
      placeHolder: 'Pick an accent color',
      ignoreFocusOut: true
    }
  );

  if (!picked) {
    return undefined;
  }

  return picked.color ? picked.color : askColor('Accent', current);
}

type HostItem = vscode.QuickPickItem & { alias?: string };

function describeHost(host: SshHost): string {
  if (host.hostName) {
    return host.user ? `${host.user}@${host.hostName}` : host.hostName;
  }

  return host.user ?? '';
}

/**
 * Suggests the hosts found in the user's SSH configuration, with a manual
 * entry as a fallback (and as the only option when no host is found).
 */
async function askSshHost(current?: string): Promise<string | undefined> {
  const clean = (value: string | undefined): string | undefined =>
    value?.trim().replace(/^ssh-remote\+/, '') || undefined;

  const askManually = async (): Promise<string | undefined> =>
    clean(
      await ask(
        'SSH host or alias configured in Remote - SSH',
        current ?? '',
        'e.g. staging-host'
      )
    );

  let hosts: SshHost[] = [];

  try {
    hosts = await listSshHosts();
  } catch {
    hosts = [];
  }

  if (hosts.length === 0) {
    return askManually();
  }

  // The current host (when editing) comes first, even if it is not in the file.
  const items: HostItem[] = [];

  if (current && !hosts.some((host) => host.alias === current)) {
    items.push({
      label: `$(remote) ${current}`,
      description: 'current · not found in your SSH configuration',
      alias: current
    });
  }

  const sorted = hosts.slice().sort(
    (a, b) =>
      Number(b.alias === current) - Number(a.alias === current) ||
      a.alias.localeCompare(b.alias)
  );

  for (const host of sorted) {
    const details = describeHost(host);

    items.push({
      label: `$(remote) ${host.alias}`,
      description: host.alias === current
        ? `${details ? `${details} · ` : ''}current`
        : details,
      alias: host.alias
    });
  }

  items.push(
    { label: '', kind: vscode.QuickPickItemKind.Separator },
    { label: '$(edit) Enter a host manually…' }
  );

  const picked = await vscode.window.showQuickPick(items, {
    title: 'Envhue — SSH host',
    placeHolder: 'Pick a host from your SSH configuration',
    matchOnDescription: true,
    ignoreFocusOut: true
  });

  if (!picked) {
    return undefined;
  }

  return picked.alias ?? askManually();
}

/**
 * Suggests the installed WSL distributions, with a manual entry as a fallback
 * (and as the only option when none can be listed).
 */
async function askWslDistro(current?: string): Promise<string | undefined> {
  const clean = (value: string | undefined): string | undefined =>
    value?.trim().replace(/^wsl\+/, '') || undefined;

  const askManually = async (): Promise<string | undefined> =>
    clean(await ask('WSL distribution name', current ?? '', 'e.g. Ubuntu'));

  const distros = await listWslDistros();

  if (distros.length === 0) {
    return askManually();
  }

  // The current distribution comes first, even if it is not listed any more.
  const names = current
    ? [current, ...distros.filter((name) => name !== current)]
    : distros;

  const picked = await vscode.window.showQuickPick(
    [
      ...names.map((name) => ({
        label: `$(terminal-linux) ${name}`,
        description: name === current ? 'current' : '',
        distro: name
      })),
      { label: '', kind: vscode.QuickPickItemKind.Separator, distro: '' },
      { label: '$(edit) Enter a distribution manually…', distro: '' }
    ],
    {
      title: 'Envhue — WSL distribution',
      placeHolder: 'Pick an installed distribution',
      ignoreFocusOut: true
    }
  );

  if (!picked) {
    return undefined;
  }

  return picked.distro || askManually();
}

/** Asks for the accent color, then how the other colors are chosen. */
export async function askColors(
  existing: Environment | undefined,
  type: Environment['type']
): Promise<EnvironmentColors | undefined> {
  const sameType = existing?.type === type;
  const accent = await pickAccent(
    sameType ? existing.colors.accent : DEFAULT_ACCENT_BY_TYPE[type]
  );

  if (!accent) {
    return undefined;
  }

  const derived = deriveColors(accent);
  const accentUnchanged = sameType && existing.colors.accent === accent;

  const choices: Array<vscode.QuickPickItem & { value: 'keep' | 'derive' | 'custom' }> = [];

  if (accentUnchanged) {
    choices.push({
      label: 'Keep current colors',
      description: 'Background, sidebar and text stay as they are',
      value: 'keep'
    });
  }

  choices.push(
    {
      label: 'Derive the other colors automatically',
      description: 'Recommended: background, sidebar and readable text',
      value: 'derive'
    },
    {
      label: 'Customize background, sidebar and text',
      value: 'custom'
    }
  );

  const choice = await vscode.window.showQuickPick(choices, {
    title: 'Envhue — Colors',
    placeHolder: 'How should the other colors be chosen?',
    ignoreFocusOut: true
  });

  if (!choice) {
    return undefined;
  }

  if (choice.value === 'keep' && existing) {
    return existing.colors;
  }

  if (choice.value === 'derive') {
    return derived;
  }

  const background = await askColor('Background', existing?.colors.background ?? derived.background);
  if (!background) return undefined;

  const sidebar = await askColor('Sidebar', existing?.colors.sidebar ?? derived.sidebar);
  if (!sidebar) return undefined;

  const text = await askColor('Text on the accent color', existing?.colors.text ?? derived.text);
  if (!text) return undefined;

  return { accent, background, sidebar, text };
}

export interface Location {
  connection: Environment['connection'];
  server?: string;
  distro?: string;
  folderPath: string;
}

/** Asks where the environment is. Starts from the current values when editing. */
async function askLocation(existing?: Environment): Promise<Location | undefined> {
  const connectionItems = [
    { label: 'Local folder', description: '', value: 'local' as const },
    { label: 'Remote SSH', description: '', value: 'ssh' as const },
    { label: 'WSL', description: '', value: 'wsl' as const },
    {
      label: 'Dev Container',
      description: 'Local folder reopened in its dev container',
      value: 'devcontainer' as const
    }
  ].map((item) => (item.value === existing?.connection
    ? { ...item, description: 'current' }
    : item))
    .sort((a, b) =>
      Number(b.value === existing?.connection) - Number(a.value === existing?.connection)
    );

  const connection = await vscode.window.showQuickPick(connectionItems, {
    title: 'Connection type',
    placeHolder: existing
      ? `Current: ${describeTarget(existing)}`
      : 'Where is this environment located?'
  });
  if (!connection) return undefined;

  let server: string | undefined;
  let distro: string | undefined;
  let folderPath: string | undefined;

  if (connection.value === 'local' || connection.value === 'devcontainer') {
    const isContainer = connection.value === 'devcontainer';
    const currentPath =
      existing && (existing.connection === 'local' || existing.connection === 'devcontainer')
        ? existing.path
        : undefined;

    const choice = await vscode.window.showQuickPick(
      [
        ...(currentPath
          ? [{ label: '$(check) Keep current folder', description: currentPath, value: 'keep' as const }]
          : []),
        { label: 'Browse for folder', description: '', value: 'browse' as const },
        {
          label: 'Enter or edit the path',
          description: currentPath ? 'starts from the current path' : '',
          value: 'manual' as const
        }
      ],
      {
        title: isContainer
          ? 'Folder containing the .devcontainer configuration'
          : 'Local folder',
        ignoreFocusOut: true
      }
    );
    if (!choice) return undefined;

    if (choice.value === 'keep') {
      folderPath = currentPath;
    } else if (choice.value === 'browse') {
      const selected = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        defaultUri: currentPath ? vscode.Uri.file(currentPath) : undefined,
        openLabel: 'Select environment folder'
      });
      folderPath = selected?.[0]?.fsPath;
    } else {
      folderPath = await ask('Absolute local folder path', currentPath ?? existing?.path ?? '');
    }
  } else if (connection.value === 'wsl') {
    distro = await askWslDistro(existing?.distro);

    if (!distro) return undefined;

    folderPath = await ask(
      'Absolute path inside the distribution',
      existing?.path ?? '',
      '/home/user/project'
    );

    if (!folderPath?.startsWith('/')) {
      void vscode.window.showErrorMessage('The WSL path must start with /.');
      return undefined;
    }
  } else {
    server = await askSshHost(existing?.server);

    if (!server) return undefined;

    folderPath = await ask(
      'Absolute remote POSIX path',
      existing?.path ?? '',
      '/home/user/project'
    );

    if (!folderPath?.startsWith('/')) {
      void vscode.window.showErrorMessage('The remote path must start with /.');
      return undefined;
    }
  }

  if (!folderPath?.trim()) return undefined;

  return { connection: connection.value, server, distro, folderPath: folderPath.trim() };
}

export async function editEnvironment(
  existing?: Environment
): Promise<Environment | undefined> {
  const name = await ask('Environment name', existing?.name, 'e.g. Client A - DEV');
  if (!name?.trim()) return undefined;

  const client = await ask('Client or project name (optional)', existing?.client ?? '');
  if (client === undefined) return undefined;

  const location = await askLocation(existing);
  if (!location) return undefined;

  const { connection, server, distro, folderPath } = location;

  const suggested = suggestTypeForTarget({
    name,
    server,
    distro,
    path: folderPath
  });
  const typeFirst = existing?.type ?? suggested;
  const typeChoice = await vscode.window.showQuickPick(
    ENVIRONMENT_TYPES.map((value) => ({
      label: value,
      description:
        value === suggested
          ? 'suggested from the name, host or folder'
          : value === existing?.type
            ? 'current'
            : '',
      value
    })).sort(
      (a, b) => Number(b.value === typeFirst) - Number(a.value === typeFirst)
    ),
    {
      title: 'Environment type',
      placeHolder: suggested === 'PROD'
        ? 'This looks like production. Select the environment category'
        : 'Select the environment category'
    }
  );
  if (!typeChoice) return undefined;

  const colors = await askColors(existing, typeChoice.value);
  if (!colors) return undefined;

  const isProd = typeChoice.value === 'PROD';
  const confirmationOptions = [
    {
      label: 'Require confirmation before opening',
      description: existing?.requireConfirmation ? 'current' : '',
      value: true
    },
    {
      label: 'No confirmation',
      description: existing && !existing.requireConfirmation ? 'current' : '',
      value: false
    }
  ];
  const preferConfirmation = existing?.requireConfirmation ?? isProd;
  const requireConfirmation = await vscode.window.showQuickPick(
    preferConfirmation ? confirmationOptions : confirmationOptions.slice().reverse(),
    {
      title: 'Sensitive environment',
      placeHolder: 'Should Envhue ask before opening this environment?',
      ignoreFocusOut: true
    }
  );
  if (!requireConfirmation) return undefined;

  const readOnlyOptions = [
    {
      label: 'Read-only (recommended for PROD)',
      description:
        'Locks files in the editor and Explorer, not the terminal' +
        (existing?.readOnly ? ' · current' : ''),
      value: true
    },
    {
      label: 'Editable',
      description: existing && !existing.readOnly ? 'No lock · current' : 'No lock',
      value: false
    }
  ];
  const preferReadOnly = existing?.readOnly ?? isProd;
  const readOnlyChoice = await vscode.window.showQuickPick(
    preferReadOnly ? readOnlyOptions : readOnlyOptions.slice().reverse(),
    {
      title: 'Read-only mode',
      placeHolder:
        'Open this environment read-only? You can unlock it for a session at any time.',
      ignoreFocusOut: true
    }
  );
  if (!readOnlyChoice) return undefined;

  return {
    id: existing?.id ?? randomUUID(),
    name: name.trim(),
    client: client.trim() || undefined,
    type: typeChoice.value,
    connection,
    path: folderPath,
    server,
    distro,
    colors,
    requireConfirmation: requireConfirmation.value || isProd,
    readOnly: readOnlyChoice.value,
    favorite: existing?.favorite ?? false,
    setup: existing?.setup
  };
}

async function askRemotePath(label: string, current: string, message: string): Promise<string | undefined> {
  const value = await ask(label, current, '/home/user/project');

  if (value === undefined) return undefined;

  if (!value.trim().startsWith('/')) {
    void vscode.window.showErrorMessage(message);
    return undefined;
  }

  return value.trim();
}

/**
 * Changes only the location of an environment: its path, its SSH host or WSL
 * distribution, or (from the last choice) its whole connection. Every prompt
 * starts from the current value.
 */
export async function editLocation(existing: Environment): Promise<Environment | undefined> {
  const items: Array<vscode.QuickPickItem & { value: 'path' | 'host' | 'distro' | 'connection' }> = [
    { label: '$(folder) Change the path', description: existing.path, value: 'path' }
  ];

  if (existing.connection === 'ssh') {
    items.push({
      label: '$(remote) Change the SSH host',
      description: existing.server ?? '',
      value: 'host'
    });
  } else if (existing.connection === 'wsl') {
    items.push({
      label: '$(terminal-linux) Change the distribution',
      description: existing.distro ?? '',
      value: 'distro'
    });
  }

  items.push({
    label: '$(arrow-swap) Change the connection type…',
    description: describeConnection(existing),
    value: 'connection'
  });

  const choice = await vscode.window.showQuickPick(items, {
    title: `Envhue — Location of ${existing.name}`,
    placeHolder: `Current: ${describeTarget(existing)}`,
    ignoreFocusOut: true
  });

  if (!choice) return undefined;

  if (choice.value === 'host') {
    const server = await askSshHost(existing.server);
    return server ? { ...existing, server } : undefined;
  }

  if (choice.value === 'distro') {
    const distro = await askWslDistro(existing.distro);
    return distro ? { ...existing, distro } : undefined;
  }

  if (choice.value === 'connection') {
    const location = await askLocation(existing);

    return location
      ? {
          ...existing,
          connection: location.connection,
          server: location.server,
          distro: location.distro,
          path: location.folderPath
        }
      : undefined;
  }

  // Path only.
  if (existing.connection === 'ssh' || existing.connection === 'wsl') {
    const path = await askRemotePath(
      'Absolute path',
      existing.path,
      'The path must start with /.'
    );
    return path ? { ...existing, path } : undefined;
  }

  const how = await vscode.window.showQuickPick(
    [
      { label: 'Edit the path', description: 'starts from the current path', value: 'manual' as const },
      { label: 'Browse for folder', description: 'opens at the current folder', value: 'browse' as const }
    ],
    { title: 'Folder', placeHolder: existing.path, ignoreFocusOut: true }
  );

  if (!how) return undefined;

  let path: string | undefined;

  if (how.value === 'browse') {
    const selected = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      defaultUri: vscode.Uri.file(existing.path),
      openLabel: 'Select environment folder'
    });
    path = selected?.[0]?.fsPath;
  } else {
    path = (await ask('Absolute local folder path', existing.path))?.trim();
  }

  return path ? { ...existing, path } : undefined;
}
