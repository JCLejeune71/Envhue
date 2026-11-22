import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { parseSshConfig, SshHost } from '../models/sshConfig';

const MAX_INCLUDE_DEPTH = 5;

function expandHome(value: string): string {
  return value.replace(/^~(?=$|[\\/])/, os.homedir());
}

/**
 * Resolves an "Include" argument. Like OpenSSH, relative paths are relative
 * to ~/.ssh, and a wildcard is supported in the last path segment.
 */
async function expandInclude(pattern: string, sshDirectory: string): Promise<string[]> {
  const expanded = expandHome(pattern);
  const resolved = path.isAbsolute(expanded)
    ? expanded
    : path.join(sshDirectory, expanded);

  if (!/[*?]/.test(resolved)) {
    return [resolved];
  }

  const directory = path.dirname(resolved);
  const base = path.basename(resolved);

  if (/[*?]/.test(directory)) {
    return [];
  }

  const regex = new RegExp(
    '^' +
      base
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.') +
      '$'
  );

  try {
    return (await fs.readdir(directory))
      .filter((name) => regex.test(name))
      .sort()
      .map((name) => path.join(directory, name));
  } catch {
    return [];
  }
}

async function readHosts(
  file: string,
  sshDirectory: string,
  depth: number,
  visited: Set<string>,
  output: SshHost[]
): Promise<void> {
  if (depth > MAX_INCLUDE_DEPTH || visited.has(file)) {
    return;
  }

  visited.add(file);

  let text: string;

  try {
    text = await fs.readFile(file, 'utf8');
  } catch {
    return; // Missing or unreadable file: nothing to suggest.
  }

  const parsed = parseSshConfig(text);
  output.push(...parsed.hosts);

  for (const include of parsed.includes) {
    for (const included of await expandInclude(include, sshDirectory)) {
      await readHosts(included, sshDirectory, depth + 1, visited, output);
    }
  }
}

/**
 * Lists the host aliases of the user's SSH configuration (the file set in
 * `remote.SSH.configFile`, or ~/.ssh/config). Envhue runs as a UI extension,
 * so this reads the configuration of the local machine.
 */
export async function listSshHosts(): Promise<SshHost[]> {
  const sshDirectory = path.join(os.homedir(), '.ssh');

  const configured = vscode.workspace
    .getConfiguration('remote.SSH')
    .get<string>('configFile');

  const file = configured?.trim()
    ? expandHome(configured.trim())
    : path.join(sshDirectory, 'config');

  const hosts: SshHost[] = [];
  await readHosts(file, sshDirectory, 0, new Set(), hosts);

  const unique = new Map<string, SshHost>();

  for (const host of hosts) {
    if (!unique.has(host.alias)) {
      unique.set(host.alias, host);
    }
  }

  return [...unique.values()];
}
