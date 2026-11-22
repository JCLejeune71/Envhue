import { sameValue } from '../models/equal';
import { log } from './log';
import * as vscode from 'vscode';
import {
  buildColorCustomizations,
  mergeColorCustomizations,
  removeManagedKeys
} from '../models/colors';
import { Environment } from '../models/environment';
import { buildWindowTitle, isManagedWindowTitle } from '../models/windowTitle';

type ColorMap = Record<string, unknown>;

function workspaceColors(folderUri: vscode.Uri): ColorMap | undefined {
  return vscode.workspace
    .getConfiguration('workbench', folderUri)
    .inspect<ColorMap>('colorCustomizations')?.workspaceValue;
}

function workspaceTitle(folderUri: vscode.Uri): string | undefined {
  return vscode.workspace
    .getConfiguration('window', folderUri)
    .inspect<string>('title')?.workspaceValue;
}

/**
 * Writes the environment identity (colors and window title) into the
 * workspace settings. Existing unrelated customizations are preserved, and
 * nothing is written when the settings are already up to date. `readOnly`
 * only affects the window title, which then carries a READ-ONLY reminder.
 */
export async function applyEnvironmentColors(
  folderUri: vscode.Uri,
  environment: Environment,
  readOnly = false
): Promise<void> {
  const settings = vscode.workspace.getConfiguration('envhue');
  const tintBackgrounds = settings.get<boolean>('tintBackgrounds', true);
  const titlePrefix = settings.get<boolean>('windowTitlePrefix', true);

  const existing = workspaceColors(folderUri);
  const merged = mergeColorCustomizations(
    existing,
    buildColorCustomizations(environment.colors, { tintBackgrounds })
  );

  if (!sameValue(existing ?? {}, merged)) {
    log('colors: writing workbench.colorCustomizations');
    await vscode.workspace
      .getConfiguration('workbench', folderUri)
      .update('colorCustomizations', merged, vscode.ConfigurationTarget.Workspace);
  }

  const currentTitle = workspaceTitle(folderUri);
  const windowConfig = vscode.workspace.getConfiguration('window', folderUri);

  if (titlePrefix) {
    const wanted = buildWindowTitle(environment, readOnly);

    if (currentTitle !== wanted) {
      log(`colors: writing window.title ${wanted}`);
      await windowConfig.update('title', wanted, vscode.ConfigurationTarget.Workspace);
    }
  } else if (isManagedWindowTitle(currentTitle)) {
    await windowConfig.update('title', undefined, vscode.ConfigurationTarget.Workspace);
  }
}

/** Removes only the keys written by Envhue. */
export async function resetEnvironmentColors(
  folderUri: vscode.Uri
): Promise<void> {
  const existing = workspaceColors(folderUri);

  if (existing) {
    const remaining = removeManagedKeys(existing);

    await vscode.workspace
      .getConfiguration('workbench', folderUri)
      .update(
        'colorCustomizations',
        Object.keys(remaining).length > 0 ? remaining : undefined,
        vscode.ConfigurationTarget.Workspace
      );
  }

  if (isManagedWindowTitle(workspaceTitle(folderUri))) {
    await vscode.workspace
      .getConfiguration('window', folderUri)
      .update('title', undefined, vscode.ConfigurationTarget.Workspace);
  }
}
