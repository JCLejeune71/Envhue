import * as vscode from 'vscode';
import { applyEnvironmentColors } from './colorService';
import { EnvironmentService } from './environmentService';
import { applyLockState, isLocked } from './readOnlyService';
import { CurrentEnvironment, findCurrentEnvironment } from './uriService';

export interface SyncOptions {
  /** Apply colors and window title (setting "envhue.autoApplyColors"). */
  applyColors: boolean;
}

/**
 * Brings the open workspace in line with the registered environment matching
 * it, whatever the way it was opened (picker, recent list, shortcut).
 *
 * The read-only lock is always synchronized: it is a safety feature, so it
 * does not depend on the automatic colors setting. It is applied first, and a
 * failure on one step never prevents the other.
 */
export async function syncCurrentWorkspace(
  service: EnvironmentService,
  options: SyncOptions
): Promise<CurrentEnvironment | undefined> {
  const match = findCurrentEnvironment(
    vscode.workspace.workspaceFolders,
    service.getAll()
  );

  if (!match) {
    return undefined;
  }

  const { environment, folder } = match;
  const locked = isLocked(environment);
  const errors: unknown[] = [];

  try {
    await applyLockState(folder.uri, locked);
  } catch (error) {
    errors.push(error);
  }

  if (options.applyColors) {
    try {
      await applyEnvironmentColors(folder.uri, environment, locked);
    } catch (error) {
      errors.push(error);
    }
  }

  if (errors.length > 0) {
    throw errors[0];
  }

  return match;
}
