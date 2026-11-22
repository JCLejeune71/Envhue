import * as path from 'path';
import * as os from 'os';
import * as vscode from 'vscode';
import { decodeDevContainerHostPath, isSameHostPath } from '../models/devContainer';
import { Environment } from '../models/environment';

function localFolderUri(folder: string): vscode.Uri {
  return vscode.Uri.file(path.resolve(folder.replace(/^~(?=$|[\\/])/, os.homedir())));
}

function remoteFolderUri(
  environment: Environment,
  authority: string
): vscode.Uri {
  if (!environment.path.startsWith('/')) {
    throw new Error(
      `The remote path for "${environment.name}" must be an absolute POSIX path.`
    );
  }

  return vscode.Uri.from({
    scheme: 'vscode-remote',
    authority,
    path: path.posix.normalize(environment.path)
  });
}

/**
 * The URI VS Code is asked to open. A dev container environment is opened as
 * its local folder first; it is then reopened in its container (see
 * environmentPicker.ts).
 */
export function buildEnvironmentUri(environment: Environment): vscode.Uri {
  switch (environment.connection) {
    case 'ssh': {
      const server = environment.server?.trim().replace(/^ssh-remote\+/, '');

      if (!server) {
        throw new Error(`The SSH host is missing for "${environment.name}".`);
      }

      return remoteFolderUri(environment, `ssh-remote+${server}`);
    }

    case 'wsl': {
      const distro = environment.distro?.trim().replace(/^wsl\+/, '');

      if (!distro) {
        throw new Error(`The WSL distribution is missing for "${environment.name}".`);
      }

      return remoteFolderUri(environment, `wsl+${distro}`);
    }

    default:
      return localFolderUri(environment.path);
  }
}

function normalizePath(value: string, scheme: string): string {
  const normalized = scheme === 'file'
    ? path.normalize(value)
    : path.posix.normalize(value);
  const trimmed = normalized.length > 1
    ? normalized.replace(/[\\/]+$/, '')
    : normalized;

  return process.platform === 'win32' && scheme === 'file'
    ? trimmed.toLowerCase()
    : trimmed;
}

function sameUri(a: vscode.Uri, b: vscode.Uri): boolean {
  return a.scheme === b.scheme &&
    a.authority.toLowerCase() === b.authority.toLowerCase() &&
    normalizePath(a.path, a.scheme) === normalizePath(b.path, b.scheme);
}

/** True when the URI is a workspace folder opened inside a dev container. */
export function isDevContainerUri(uri: vscode.Uri): boolean {
  return uri.scheme === 'vscode-remote' &&
    decodeDevContainerHostPath(uri.authority) !== undefined;
}

export function isCurrentEnvironment(
  uri: vscode.Uri,
  environment: Environment
): boolean {
  try {
    const expected = buildEnvironmentUri(environment);

    if (sameUri(uri, expected)) {
      return true;
    }

    // Inside the container, the folder is recognized through the local folder
    // path encoded in the authority.
    if (environment.connection === 'devcontainer' && uri.scheme === 'vscode-remote') {
      const hostPath = decodeDevContainerHostPath(uri.authority);

      return hostPath !== undefined && isSameHostPath(hostPath, expected.fsPath);
    }

    return false;
  } catch {
    return false;
  }
}

export interface CurrentEnvironment {
  environment: Environment;
  folder: vscode.WorkspaceFolder;
}

/** Finds the registered environment matching any open workspace folder. */
export function findCurrentEnvironment(
  folders: readonly vscode.WorkspaceFolder[] | undefined,
  environments: Environment[]
): CurrentEnvironment | undefined {
  for (const folder of folders ?? []) {
    const environment = environments.find((item) =>
      isCurrentEnvironment(folder.uri, item)
    );

    if (environment) {
      return { environment, folder };
    }
  }

  return undefined;
}
