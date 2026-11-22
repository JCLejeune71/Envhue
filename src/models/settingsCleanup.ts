import { isDeepStrictEqual } from 'util';
import { removeManagedKeys } from './colors';
import {
  READONLY_EXCLUDE_PATTERNS,
  READONLY_INCLUDE_PATTERNS,
  withoutPatterns
} from './readOnly';
import { stripJsonc } from './projectImport';
import { isManagedWindowTitle } from './windowTitle';

// Pure module (no "vscode" import) so that it can be unit-tested.

type Settings = Record<string, unknown>;

const TOUCHED_KEYS = [
  'workbench.colorCustomizations',
  'window.title',
  'files.readonlyInclude',
  'files.readonlyExclude'
] as const;

function isObject(value: unknown): value is Settings {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** Removes everything Envhue writes from a settings object. */
export function cleanSettings(settings: Settings): {
  settings: Settings;
  changed: boolean;
} {
  const result: Settings = { ...settings };

  const colors = result['workbench.colorCustomizations'];
  if (isObject(colors)) {
    const remaining = removeManagedKeys(colors);

    if (Object.keys(remaining).length > 0) {
      result['workbench.colorCustomizations'] = remaining;
    } else {
      delete result['workbench.colorCustomizations'];
    }
  }

  if (isManagedWindowTitle(result['window.title'])) {
    delete result['window.title'];
  }

  const patterns: Array<[string, readonly string[]]> = [
    ['files.readonlyInclude', READONLY_INCLUDE_PATTERNS],
    ['files.readonlyExclude', READONLY_EXCLUDE_PATTERNS]
  ];

  for (const [key, managed] of patterns) {
    const value = result[key];

    if (isObject(value)) {
      const remaining = withoutPatterns(value, managed);

      if (remaining) {
        result[key] = remaining;
      } else {
        delete result[key];
      }
    }
  }

  return { settings: result, changed: !isDeepStrictEqual(settings, result) };
}

export type FileCleanup =
  | { status: 'untouched' }
  | { status: 'cleaned'; text: string }
  | { status: 'manual'; reason: string };

function detectIndent(text: string): string | number {
  const match = /^([ \t]+)"/m.exec(text);

  if (!match) {
    return 2;
  }

  return match[1].includes('\t') ? '\t' : match[1].length;
}

/**
 * Cleans the text of a settings.json. Files with comments are never
 * rewritten (that would lose the comments): they are reported instead.
 */
export function cleanSettingsText(text: string): FileCleanup {
  if (!TOUCHED_KEYS.some((key) => text.includes(`"${key}"`))) {
    return { status: 'untouched' };
  }

  const plain = text.replace(/^\uFEFF/, '');
  let parsed: unknown;

  try {
    parsed = JSON.parse(plain);
  } catch {
    // Comments or trailing commas: only a problem if there is something to do.
    let lenient: unknown;

    try {
      lenient = JSON.parse(stripJsonc(plain));
    } catch {
      return { status: 'manual', reason: 'settings.json could not be read' };
    }

    return isObject(lenient) && cleanSettings(lenient).changed
      ? { status: 'manual', reason: 'settings.json contains comments' }
      : { status: 'untouched' };
  }

  if (!isObject(parsed)) {
    return { status: 'untouched' };
  }

  const { settings, changed } = cleanSettings(parsed);

  return changed
    ? {
        status: 'cleaned',
        text: `${JSON.stringify(settings, undefined, detectIndent(plain))}\n`
      }
    : { status: 'untouched' };
}
