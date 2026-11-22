import { Environment, EnvironmentType } from './environment';
import { normalizeEnvironment } from './normalize';
import {
  ParsedRoot,
  guessEnvironmentType,
  parseRootPath
} from './projectImport';

// Pure module (no "vscode" import) so that it can be unit-tested.

function lastSegments(path: string, count: number): string[] {
  return path.split(/[\\/]+/).filter(Boolean).slice(-count);
}

function baseName(path: string): string {
  return lastSegments(path, 1)[0] ?? '';
}

/**
 * Guesses the environment type from where a folder is: its name, the SSH host
 * or WSL distribution, and the last two folders of its path. Whole words only,
 * so "product" or "reproduction" never count as "prod".
 */
export function suggestTypeForTarget(target: {
  name?: string;
  server?: string;
  distro?: string;
  path: string;
}): EnvironmentType | undefined {
  return guessEnvironmentType(target.name ?? '', [
    target.server ?? '',
    target.distro ?? '',
    ...lastSegments(target.path, 2)
  ]);
}

function parse(location: string, home: string): ParsedRoot | undefined {
  const parsed = parseRootPath(location, home);

  return 'unsupported' in parsed ? undefined : parsed;
}

/** True when an unregistered location looks like production. */
export function looksLikeProduction(location: string, home: string): boolean {
  const root = parse(location, home);

  return root !== undefined && suggestTypeForTarget(root) === 'PROD';
}

/** Builds a PROD environment for the location, or undefined if unsupported. */
export function productionEnvironmentFor(
  location: string,
  home: string,
  readOnly: boolean
): Environment | undefined {
  const root = parse(location, home);

  if (!root) {
    return undefined;
  }

  const base = baseName(root.path) || root.server || root.distro || 'Production';

  return normalizeEnvironment({
    name: `${base} - PROD`,
    type: 'PROD',
    connection: root.connection,
    path: root.path,
    server: root.server,
    distro: root.distro,
    requireConfirmation: true,
    readOnly
  });
}
