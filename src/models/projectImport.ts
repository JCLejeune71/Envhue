import { parseHexInput } from './colors';
import { decodeDevContainerHostPath } from './devContainer';
import { ENVIRONMENT_TYPES, Environment, EnvironmentType } from './environment';
import { normalizeEnvironment } from './normalize';

// Pure module (no "vscode" import) so that it can be unit-tested.
//
// Turns the project list of "Project Manager" (alefragnani.project-manager)
// into Envhue environments, and reads the color chosen with "Peacock"
// (johnpapa.vscode-peacock) from the project's own workspace settings.

export interface ProjectManagerProject {
  name: string;
  rootPath: string;
  tags: string[];
}

export interface ImportCandidate {
  project: ProjectManagerProject;
  /** Absent when the project cannot be represented (reason says why). */
  environment?: Environment;
  reason?: string;
  /** Where the accent color comes from. */
  colorSource: 'peacock' | 'type' | 'default';
}

/** Parses projects.json; tolerant of missing fields, drops unusable entries. */
export function parseProjectManagerProjects(text: string): ProjectManagerProject[] {
  let data: unknown;

  try {
    data = JSON.parse(text.replace(/^﻿/, ''));
  } catch {
    return [];
  }

  if (!Array.isArray(data)) {
    return [];
  }

  const projects: ProjectManagerProject[] = [];

  for (const item of data) {
    if (!item || typeof item !== 'object') {
      continue;
    }

    const entry = item as Record<string, unknown>;
    const name = typeof entry.name === 'string' ? entry.name.trim() : '';
    const rootPath = typeof entry.rootPath === 'string' ? entry.rootPath.trim() : '';

    // Project Manager can disable an entry without deleting it.
    if (!name || !rootPath || entry.enabled === false) {
      continue;
    }

    projects.push({
      name,
      rootPath,
      tags: Array.isArray(entry.tags)
        ? entry.tags.filter((tag): tag is string => typeof tag === 'string')
        : []
    });
  }

  return projects;
}

export interface ParsedRoot {
  connection: Environment['connection'];
  path: string;
  server?: string;
  distro?: string;
}

/** Interprets a Project Manager "rootPath" (local path or remote URI). */
export function parseRootPath(
  rootPath: string,
  home: string
): ParsedRoot | { unsupported: string } {
  const remote = /^vscode-remote:\/\/([^/]+)(\/.*)?$/i.exec(rootPath);

  if (!remote) {
    if (/^[a-z][a-z0-9+.-]+:\/\//i.test(rootPath)) {
      return { unsupported: 'Unsupported location' };
    }

    return {
      connection: 'local',
      path: rootPath.replace(/^\$home(?=[\\/]|$)/i, home.replace(/[\\/]+$/, ''))
    };
  }

  const authority = decodeURIComponent(remote[1]);
  const path = decodeURIComponent(remote[2] ?? '/');

  if (authority.toLowerCase().startsWith('ssh-remote+')) {
    return { connection: 'ssh', server: authority.slice('ssh-remote+'.length), path };
  }

  if (authority.toLowerCase().startsWith('wsl+')) {
    return { connection: 'wsl', distro: authority.slice('wsl+'.length), path };
  }

  if (authority.toLowerCase().startsWith('dev-container+')) {
    const hostPath = decodeDevContainerHostPath(authority);

    return hostPath
      ? { connection: 'devcontainer', path: hostPath }
      : { unsupported: 'Dev Container folder not recognized' };
  }

  return { unsupported: 'Unsupported remote (Codespaces, tunnels…)' };
}

/** Guesses DEV / TEST / PREPROD / PROD from the project name and tags. */
export function guessEnvironmentType(
  name: string,
  tags: string[]
): EnvironmentType | undefined {
  const tokens = [name, ...tags]
    .join(' ')
    .toLowerCase()
    .replace(/pre[\s_-]+prod/g, 'preprod')
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

  const has = (...words: string[]): boolean =>
    words.some((word) => tokens.includes(word));

  if (has('preprod', 'staging', 'stage', 'uat', 'recette', 'preproduction')) {
    return 'PREPROD';
  }

  if (has('prod', 'production', 'prd')) {
    return 'PROD';
  }

  if (has('test', 'tests', 'qa', 'integration', 'int')) {
    return 'TEST';
  }

  if (has('dev', 'development', 'develop', 'sandbox')) {
    return 'DEV';
  }

  return undefined;
}

/** Removes comments and trailing commas from JSON with comments (settings.json). */
export function stripJsonc(text: string): string {
  let out = '';
  let inString = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (inString) {
      out += char;

      if (char === '\\') {
        out += next ?? '';
        i++;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      out += char;
    } else if (char === '/' && next === '/') {
      while (i < text.length && text[i] !== '\n') i++;
      out += '\n';
    } else if (char === '/' && next === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++;
      i++;
    } else {
      out += char;
    }
  }

  return out.replace(/,(\s*[}\]])/g, '$1');
}

/**
 * Reads the color Peacock stored in a workspace's settings.json: the
 * "peacock.color" value, or else the title bar color it wrote.
 */
export function parsePeacockColor(settingsText: string): string | undefined {
  let data: unknown;

  try {
    data = JSON.parse(stripJsonc(settingsText.replace(/^﻿/, '')));
  } catch {
    return undefined;
  }

  if (!data || typeof data !== 'object') {
    return undefined;
  }

  const settings = data as Record<string, unknown>;
  const customizations = settings['workbench.colorCustomizations'];
  const titleBar =
    customizations && typeof customizations === 'object'
      ? (customizations as Record<string, unknown>)['titleBar.activeBackground']
      : undefined;

  const color = parseHexInput(settings['peacock.color']) ?? parseHexInput(titleBar);

  return color?.toUpperCase();
}

/** Builds an Envhue candidate from a Project Manager project. */
export function buildImportCandidate(
  project: ProjectManagerProject,
  home: string,
  peacockColor?: string
): ImportCandidate {
  const parsed = parseRootPath(project.rootPath, home);

  if ('unsupported' in parsed) {
    return { project, reason: parsed.unsupported, colorSource: 'default' };
  }

  const type = guessEnvironmentType(project.name, project.tags);
  const accent = parseHexInput(peacockColor)?.toUpperCase();

  const environment = normalizeEnvironment({
    name: project.name,
    type: type && ENVIRONMENT_TYPES.includes(type) ? type : 'CUSTOM',
    connection: parsed.connection,
    path: parsed.path,
    server: parsed.server,
    distro: parsed.distro,
    colors: accent ? { accent } : undefined
  });

  if (!environment) {
    return { project, reason: 'Invalid project', colorSource: 'default' };
  }

  return {
    project,
    environment,
    colorSource: accent ? 'peacock' : type ? 'type' : 'default'
  };
}

function samePath(a: string, b: string): boolean {
  const clean = (value: string): string =>
    value.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();

  return clean(a) === clean(b);
}

/** True when an equivalent environment is already registered. */
export function isAlreadyRegistered(
  candidate: Environment,
  existing: Environment[]
): boolean {
  return existing.some(
    (item) =>
      item.id === candidate.id ||
      (item.connection === candidate.connection &&
        (item.server ?? item.distro ?? '') ===
          (candidate.server ?? candidate.distro ?? '') &&
        samePath(item.path, candidate.path))
  );
}
