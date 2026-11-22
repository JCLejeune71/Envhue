import type { Environment } from './environment';

// Pure helpers (no "vscode" import) so they can be unit-tested.

type ConnectionFields = Pick<Environment, 'connection' | 'server' | 'distro'>;
type TargetFields = ConnectionFields & Pick<Environment, 'path'>;

/** Short description of where an environment lives, for lists and tooltips. */
export function describeConnection(environment: ConnectionFields): string {
  switch (environment.connection) {
    case 'ssh':
      return environment.server ? `SSH: ${environment.server}` : 'SSH';
    case 'wsl':
      return environment.distro ? `WSL: ${environment.distro}` : 'WSL';
    case 'devcontainer':
      return 'Dev Container';
    default:
      return 'Local';
  }
}

/** Full target (location and path), for confirmation dialogs. */
export function describeTarget(environment: TargetFields): string {
  switch (environment.connection) {
    case 'ssh':
      return `${environment.server ?? '?'}:${environment.path}`;
    case 'wsl':
      return `WSL ${environment.distro ?? '?'}:${environment.path}`;
    case 'devcontainer':
      return `Dev Container · ${environment.path}`;
    default:
      return environment.path;
  }
}
