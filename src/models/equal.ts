// Pure module (no "vscode" import) so that it can be unit-tested.

function stable(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stable);
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, item]) => [key, stable(item)])
    );
  }

  return value;
}

/**
 * Structural equality for plain settings values. Unlike util.isDeepStrictEqual
 * it ignores prototypes and key order: objects returned by VS Code's
 * configuration API are not always plain objects, which made a strict
 * comparison report "different" (and write the settings again) every time.
 */
export function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(stable(a)) === JSON.stringify(stable(b));
}
