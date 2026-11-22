import * as fs from 'fs/promises';
import * as path from 'path';
import { cleanSettingsText } from '../models/settingsCleanup';
import { Environment } from '../models/environment';

export interface ResetReport {
  cleaned: string[];
  untouched: string[];
  manual: Array<{ name: string; reason: string }>;
}

/**
 * Removes Envhue's colors, window title and read-only lock from the
 * .vscode/settings.json of a folder that is not open in this window.
 * Only files without comments are rewritten.
 */
export async function resetClosedFolder(
  environment: Environment,
  report: ResetReport
): Promise<void> {
  if (environment.connection !== 'local' && environment.connection !== 'devcontainer') {
    report.manual.push({
      name: environment.name,
      reason: 'remote folder: open it and run "Reset Colors and Read-Only Lock"'
    });
    return;
  }

  const file = path.join(environment.path, '.vscode', 'settings.json');
  let text: string;

  try {
    text = await fs.readFile(file, 'utf8');
  } catch {
    report.untouched.push(environment.name);
    return;
  }

  const result = cleanSettingsText(text);

  if (result.status === 'untouched') {
    report.untouched.push(environment.name);
  } else if (result.status === 'manual') {
    report.manual.push({ name: environment.name, reason: result.reason });
  } else {
    await fs.writeFile(file, result.text, 'utf8');
    report.cleaned.push(environment.name);
  }
}
