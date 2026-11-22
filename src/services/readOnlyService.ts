import { sameValue } from '../models/equal';
import { log } from './log';
import * as vscode from 'vscode';
import { Environment } from '../models/environment';
import {
  READONLY_EXCLUDE_PATTERNS,
  READONLY_INCLUDE_PATTERNS,
  withPatterns,
  withoutPatterns
} from '../models/readOnly';

type Patterns = Record<string, unknown>;
type PatternSetting = 'readonlyInclude' | 'readonlyExclude';

// Session state, kept in memory on purpose: a reloaded or reopened window goes
// back to what the environment is configured for, so a PROD environment
// configured as read-only is locked again after every restart.
const sessionLocks = new Map<string, boolean>();
const announced = new Set<string>();
// When a temporary unlock ends (epoch ms), per environment.
const unlockDeadlines = new Map<string, number>();

export function setUnlockDeadline(environmentId: string, deadline: number | undefined): void {
  if (deadline === undefined) {
    unlockDeadlines.delete(environmentId);
  } else {
    unlockDeadlines.set(environmentId, deadline);
  }
}

export function getUnlockDeadline(environmentId: string): number | undefined {
  return unlockDeadlines.get(environmentId);
}

export function hasUnlockDeadlines(): boolean {
  return unlockDeadlines.size > 0;
}

/** Whether the environment is currently locked (session choice first). */
export function isLocked(environment: Environment): boolean {
  return sessionLocks.get(environment.id) ?? environment.readOnly;
}

/** Lock or unlock an environment for the lifetime of this window. */
export function setSessionLock(environmentId: string, locked: boolean): void {
  sessionLocks.set(environmentId, locked);
}

/** True the first time it is called for an environment in this window. */
export function shouldAnnounceLock(environmentId: string): boolean {
  if (announced.has(environmentId)) {
    return false;
  }

  announced.add(environmentId);
  return true;
}

function workspaceValue(
  folderUri: vscode.Uri,
  setting: PatternSetting
): Patterns | undefined {
  return vscode.workspace
    .getConfiguration('files', folderUri)
    .inspect<Patterns>(setting)?.workspaceValue;
}

async function writeIfChanged(
  folderUri: vscode.Uri,
  setting: PatternSetting,
  current: Patterns | undefined,
  next: Patterns | undefined
): Promise<void> {
  if (sameValue(current, next)) {
    return;
  }

  log(`read-only: writing files.${setting} -> ${JSON.stringify(next ?? null)}`);

  const started = Date.now();

  await vscode.workspace
    .getConfiguration('files', folderUri)
    .update(setting, next, vscode.ConfigurationTarget.Workspace);

  log(`read-only: files.${setting} written in ${Date.now() - started} ms`);
}

/**
 * Writes or removes the read-only lock in the workspace settings, keeping any
 * other pattern the user may have. The settings folder stays writable so the
 * lock can always be lifted from VS Code.
 */
export async function applyLockState(
  folderUri: vscode.Uri,
  locked: boolean
): Promise<void> {
  const include = workspaceValue(folderUri, 'readonlyInclude');
  const exclude = workspaceValue(folderUri, 'readonlyExclude');

  if (locked) {
    // Exclusions first, so the settings file never becomes read-only.
    await writeIfChanged(
      folderUri,
      'readonlyExclude',
      exclude,
      withPatterns(exclude, READONLY_EXCLUDE_PATTERNS)
    );
    await writeIfChanged(
      folderUri,
      'readonlyInclude',
      include,
      withPatterns(include, READONLY_INCLUDE_PATTERNS)
    );
    return;
  }

  // Lift the lock first, then drop the exclusions.
  await writeIfChanged(
    folderUri,
    'readonlyInclude',
    include,
    withoutPatterns(include, READONLY_INCLUDE_PATTERNS)
  );
  await writeIfChanged(
    folderUri,
    'readonlyExclude',
    exclude,
    withoutPatterns(exclude, READONLY_EXCLUDE_PATTERNS)
  );
}
