// Pure helpers (no "vscode" import) so they can be unit-tested.
//
// Read-only mode relies on VS Code's own "files.readonlyInclude" and
// "files.readonlyExclude" settings, written to the workspace settings like
// the colors. Only Envhue's own patterns are ever added or removed, so the
// user's other patterns are preserved.

type Patterns = Record<string, unknown>;

/** Marks every file of the workspace as read-only. */
export const READONLY_INCLUDE_PATTERNS: readonly string[] = ['**'];

/**
 * Stays writable even in read-only mode: VS Code itself must be able to
 * update the workspace settings, otherwise the lock could never be lifted.
 */
export const READONLY_EXCLUDE_PATTERNS: readonly string[] = [
  '**/.vscode/**',
  '**/*.code-workspace'
];

export function withPatterns(
  existing: Patterns | undefined,
  patterns: readonly string[]
): Patterns {
  const result: Patterns = { ...(existing ?? {}) };

  for (const pattern of patterns) {
    result[pattern] = true;
  }

  return result;
}

/** Removes Envhue's patterns. Returns undefined when nothing is left. */
export function withoutPatterns(
  existing: Patterns | undefined,
  patterns: readonly string[]
): Patterns | undefined {
  const result: Patterns = { ...(existing ?? {}) };

  for (const pattern of patterns) {
    if (result[pattern] === true) {
      delete result[pattern];
    }
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

/** True when the include patterns contain every Envhue lock pattern. */
export function isLockApplied(include: Patterns | undefined): boolean {
  return READONLY_INCLUDE_PATTERNS.every((pattern) => include?.[pattern] === true);
}
