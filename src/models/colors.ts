import type { EnvironmentColors } from './environment';

// Pure color helpers: this module must not import "vscode" so that it can be
// unit-tested with plain Node.

interface RGB {
  r: number;
  g: number;
  b: number;
}

export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9A-Fa-f]{6}$/.test(value);
}

/**
 * Lenient parser for colors typed or pasted by a user. Accepts "#RRGGBB",
 * "RRGGBB" and "#RGB", ignoring spaces, quotes and invisible characters
 * (non-breaking or zero-width spaces are common in copy-pasted values), and
 * the full-width "＃". Returns "#RRGGBB" (case preserved) or undefined.
 */
export function parseHexInput(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const cleaned = value
    .replace(/[\s​-‍⁠﻿"']/g, '')
    .replace(/^[#＃]/, '');

  if (/^[0-9A-Fa-f]{3}$/.test(cleaned)) {
    return '#' + cleaned.split('').map((digit) => digit + digit).join('');
  }

  if (/^[0-9A-Fa-f]{6}$/.test(cleaned)) {
    return '#' + cleaned;
  }

  return undefined;
}

function parseHex(hex: string): RGB {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16)
  };
}

function toHex({ r, g, b }: RGB): string {
  const part = (value: number): string =>
    Math.max(0, Math.min(255, Math.round(value)))
      .toString(16)
      .padStart(2, '0');

  return `#${part(r)}${part(g)}${part(b)}`.toUpperCase();
}

/** Multiplies every channel by `factor` (0 = black, 1 = unchanged). */
export function scaleColor(hex: string, factor: number): string {
  const { r, g, b } = parseHex(hex);
  return toHex({ r: r * factor, g: g * factor, b: b * factor });
}

export function relativeLuminance(hex: string): number {
  const channel = (value: number): number => {
    const v = value / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const { r, g, b } = parseHex(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [light, dark] = la >= lb ? [la, lb] : [lb, la];
  return (light + 0.05) / (dark + 0.05);
}

/** Returns black or white, whichever is the most readable on `background`. */
export function readableTextColor(background: string): '#000000' | '#FFFFFF' {
  return contrastRatio(background, '#000000') >= contrastRatio(background, '#FFFFFF')
    ? '#000000'
    : '#FFFFFF';
}

/** Builds a full palette from a single accent color. */
export function deriveColors(accent: string): EnvironmentColors {
  return {
    accent,
    background: scaleColor(accent, 0.24),
    sidebar: scaleColor(accent, 0.19),
    text: readableTextColor(accent)
  };
}

export interface ColorOptions {
  /** Also tint the editor, side bar, panel and terminal backgrounds. */
  tintBackgrounds: boolean;
}

/**
 * Every workbench color key that Envhue writes. Only these keys are ever
 * touched, so the user's other customizations are preserved.
 */
export const MANAGED_COLOR_KEYS: readonly string[] = [
  'titleBar.activeBackground',
  'titleBar.activeForeground',
  'titleBar.inactiveBackground',
  'titleBar.inactiveForeground',
  'activityBar.background',
  'activityBar.foreground',
  'activityBar.inactiveForeground',
  'statusBar.background',
  'statusBar.foreground',
  'tab.activeBorderTop',
  'editor.background',
  'editor.foreground',
  'sideBar.background',
  'sideBar.foreground',
  'panel.background',
  'terminal.background'
];

export function buildColorCustomizations(
  colors: EnvironmentColors,
  options: ColorOptions
): Record<string, string> {
  const result: Record<string, string> = {
    'titleBar.activeBackground': colors.accent,
    'titleBar.activeForeground': colors.text,
    'titleBar.inactiveBackground': colors.accent,
    'titleBar.inactiveForeground': `${colors.text}CC`,

    'activityBar.background': colors.accent,
    'activityBar.foreground': colors.text,
    'activityBar.inactiveForeground': `${colors.text}AA`,

    'statusBar.background': colors.accent,
    'statusBar.foreground': colors.text,

    'tab.activeBorderTop': colors.accent
  };

  if (options.tintBackgrounds) {
    result['editor.background'] = colors.background;
    result['editor.foreground'] = readableTextColor(colors.background);
    result['sideBar.background'] = colors.sidebar;
    result['sideBar.foreground'] = readableTextColor(colors.sidebar);
    result['panel.background'] = colors.background;
    result['terminal.background'] = colors.background;
  }

  return result;
}

export function removeManagedKeys(
  existing: Record<string, unknown> | undefined
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...(existing ?? {}) };

  for (const key of MANAGED_COLOR_KEYS) {
    delete result[key];
  }

  return result;
}

/**
 * Merges Envhue colors into the existing customizations: unrelated keys
 * (including per-theme blocks such as "[Monokai]") are kept, and any
 * previously managed key is replaced.
 */
export function mergeColorCustomizations(
  existing: Record<string, unknown> | undefined,
  ours: Record<string, string>
): Record<string, unknown> {
  return { ...removeManagedKeys(existing), ...ours };
}
