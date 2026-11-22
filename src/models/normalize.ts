import { createHash } from 'crypto';
import { deriveColors, parseHexInput } from './colors';
import {
  CONNECTION_TYPES,
  ConnectionType,
  DEFAULT_ACCENT_BY_TYPE,
  ENVIRONMENT_TYPES,
  Environment,
  EnvironmentColors,
  EnvironmentSetup,
  EnvironmentType,
  LegacyEnvironment
} from './environment';

// Pure module (no "vscode" import): turns whatever is stored in the user's
// settings into a valid Environment, or drops it.

export const EXTENSION_ID_PATTERN =
  /^[a-zA-Z0-9][a-zA-Z0-9-]*\.[a-zA-Z0-9][a-zA-Z0-9-]*$/;

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function firstHex(...values: unknown[]): string | undefined {
  for (const value of values) {
    const parsed = parseHexInput(value);

    if (parsed) {
      return parsed;
    }
  }

  return undefined;
}

/** Deterministic id, so an entry without "id" keeps the same identity. */
export function stableId(
  connection: ConnectionType,
  server: string | undefined,
  path: string
): string {
  const hash = createHash('sha1')
    .update([connection, server ?? '', path].join('|'))
    .digest('hex');

  return `env-${hash.slice(0, 10)}`;
}

export function normalizeSetup(value: unknown): EnvironmentSetup | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const setup = value as Partial<EnvironmentSetup>;

  if (setup.mode === 'profile') {
    const profileName = text(setup.profileName);
    return profileName ? { mode: 'profile', profileName } : undefined;
  }

  if (setup.mode === 'extensions') {
    const ids = Array.isArray(setup.extensions)
      ? setup.extensions.filter(
          (id): id is string =>
            typeof id === 'string' && EXTENSION_ID_PATTERN.test(id)
        )
      : [];

    return {
      mode: 'extensions',
      extensions: [...new Set(ids.map((id) => id.toLowerCase()))]
    };
  }

  if (setup.mode === 'none') {
    return { mode: 'none' };
  }

  return undefined;
}

export function normalizeEnvironment(value: unknown): Environment | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const item = value as Partial<Environment> & LegacyEnvironment;
  const legacy = typeof item.Nom === 'string';

  const name = text(legacy ? item.Nom : item.name);
  const path = text(legacy ? item.Dossier : item.path);

  if (!name || !path) {
    return undefined;
  }

  const rawServer = text(legacy ? item.Serveur : item.server);

  const connection: ConnectionType = legacy
    ? (rawServer ? 'ssh' : 'local')
    : (CONNECTION_TYPES.includes(item.connection as ConnectionType)
        ? (item.connection as ConnectionType)
        : 'local');

  const server = connection === 'ssh'
    ? rawServer?.replace(/^ssh-remote\+/, '')
    : undefined;

  const distro = connection === 'wsl' && !legacy
    ? text(item.distro)?.replace(/^wsl\+/, '')
    : undefined;

  const type: EnvironmentType = ENVIRONMENT_TYPES.includes(item.type as EnvironmentType)
    ? (item.type as EnvironmentType)
    : (item.Confirmer ? 'PROD' : 'CUSTOM');

  const raw: Partial<EnvironmentColors> | undefined = legacy ? undefined : item.colors;
  const accent = firstHex(raw?.accent, item.Accent) ?? DEFAULT_ACCENT_BY_TYPE[type];
  const derived = deriveColors(accent);

  const colors: EnvironmentColors = {
    accent,
    background: firstHex(raw?.background, item.Fond) ?? derived.background,
    sidebar: firstHex(raw?.sidebar, item.Lateral) ?? derived.sidebar,
    text: firstHex(raw?.text, item.Texte) ?? derived.text
  };

  return {
    id: text(item.id) ?? stableId(connection, server ?? distro, path),
    name,
    client: text(item.client),
    type,
    connection,
    path,
    server,
    distro,
    colors,
    setup: normalizeSetup(item.setup),
    requireConfirmation: legacy
      ? Boolean(item.Confirmer)
      : Boolean(item.requireConfirmation),
    readOnly: legacy ? false : item.readOnly === true,
    favorite: Boolean(item.favorite)
  };
}
