import * as os from 'os';
import * as vscode from 'vscode';
import { looksLikeProduction, productionEnvironmentFor } from '../models/prodDetection';
import { EnvironmentService } from '../services/environmentService';

const IGNORED_KEY = 'envhue.ignoredProductionHints';
const announced = new Set<string>();

function locationOf(uri: vscode.Uri): string | undefined {
  if (uri.scheme === 'file') {
    return uri.fsPath;
  }

  return uri.scheme === 'vscode-remote' ? uri.toString() : undefined;
}

/**
 * When the open folder is not registered but looks like production (host,
 * folder or name with the word "prod"), offers to register it as PROD.
 * Once per window, and never again for a folder the user dismissed.
 */
export async function suggestProductionRegistration(
  context: vscode.ExtensionContext,
  service: EnvironmentService,
  onRegistered: () => Promise<void>
): Promise<void> {
  const enabled = vscode.workspace
    .getConfiguration('envhue')
    .get<boolean>('detectProduction', true);

  const folder = vscode.workspace.workspaceFolders?.[0];
  const location = folder ? locationOf(folder.uri) : undefined;

  if (!enabled || !folder || !location) {
    return;
  }

  const key = folder.uri.toString();
  const ignored = context.globalState.get<string[]>(IGNORED_KEY, []);

  if (
    announced.has(key) ||
    ignored.includes(key) ||
    !looksLikeProduction(location, os.homedir())
  ) {
    return;
  }

  announced.add(key);

  const choice = await vscode.window.showWarningMessage(
    `This folder looks like production but is not registered in Envhue (${folder.name}).`,
    'Register as PROD',
    'Register as Read-Only PROD',
    'Not This Folder'
  );

  if (choice === 'Not This Folder') {
    await context.globalState.update(IGNORED_KEY, [...ignored, key].slice(-200));
    return;
  }

  if (!choice) {
    return;
  }

  const environment = productionEnvironmentFor(
    location,
    os.homedir(),
    choice === 'Register as Read-Only PROD'
  );

  if (!environment) {
    return;
  }

  await service.add(environment);
  await onRegistered();

  void vscode.window.showInformationMessage(
    `"${environment.name}" registered as PROD. Use "Manage Environments" to adjust it.`
  );
}
