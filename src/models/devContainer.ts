// Pure helpers (no "vscode" import) so they can be unit-tested.
//
// A window opened in a dev container has workspace folders such as
// vscode-remote://dev-container+<hex>/workspaces/app, where <hex> is the
// hexadecimal encoding of either the local folder path or a JSON object
// containing it ({"hostPath": "..."}). Decoding it lets Envhue recognize the
// environment from inside the container.

export const DEV_CONTAINER_AUTHORITY_PREFIX = 'dev-container+';

function hexToUtf8(hex: string): string | undefined {
  if (!/^([0-9a-fA-F]{2})+$/.test(hex)) {
    return undefined;
  }

  return Buffer.from(hex, 'hex').toString('utf8');
}

/** Extracts the local (host) folder path from a dev container authority. */
export function decodeDevContainerHostPath(authority: string): string | undefined {
  if (!authority.toLowerCase().startsWith(DEV_CONTAINER_AUTHORITY_PREFIX)) {
    return undefined;
  }

  // The payload may be followed by "@<remote>" when the host is itself remote.
  const encoded = authority
    .slice(DEV_CONTAINER_AUTHORITY_PREFIX.length)
    .split('@')[0];

  const payload = hexToUtf8(encoded)?.trim();

  if (!payload) {
    return undefined;
  }

  if (payload.startsWith('{')) {
    try {
      const parsed = JSON.parse(payload) as { hostPath?: unknown };

      return typeof parsed.hostPath === 'string' && parsed.hostPath.trim()
        ? parsed.hostPath.trim()
        : undefined;
    } catch {
      return undefined;
    }
  }

  return payload;
}

/** Normalizes a host path for comparison (slashes, drive letter, trailing slash). */
export function normalizeHostPath(value: string): string {
  let result = value.trim().replace(/\\/g, '/').replace(/^\/(?=[A-Za-z]:)/, '');

  result = result.replace(/\/+$/, '') || '/';

  // Windows paths are case-insensitive.
  return /^[A-Za-z]:/.test(result) ? result.toLowerCase() : result;
}

export function isSameHostPath(a: string, b: string): boolean {
  return normalizeHostPath(a) === normalizeHostPath(b);
}
