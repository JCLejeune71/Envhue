import type { Environment } from './environment';

// Pure helpers (no "vscode" import) so they can be unit-tested.

export function environmentLabel(
  environment: Pick<Environment, 'name' | 'type'>
): string {
  return environment.type === 'CUSTOM' ? environment.name : environment.type;
}

/**
 * Window title template: "[PROD] file - folder - Visual Studio Code", or
 * "[PROD · READ-ONLY] ..." while the environment is locked, so the reminder
 * is also visible in the taskbar and window switcher.
 */
export function buildWindowTitle(
  environment: Pick<Environment, 'name' | 'type'>,
  readOnly = false
): string {
  const label = environmentLabel(environment) + (readOnly ? ' · READ-ONLY' : '');

  return (
    '[' + label + '] ' +
    '${activeEditorShort}${separator}${rootName}${separator}${appName}'
  );
}

/** True when the value looks like a title previously written by Envhue. */
export function isManagedWindowTitle(value: unknown): boolean {
  return typeof value === 'string' &&
    /^\[[^\]]+\] \$\{activeEditorShort\}/.test(value);
}
