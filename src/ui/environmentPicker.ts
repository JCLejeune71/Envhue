import * as vscode from 'vscode';
import { describeTarget } from '../models/describe';
import { Environment } from '../models/environment';
import { groupByClient } from '../models/groups';
import { EnvironmentService } from '../services/environmentService';
import { log } from '../services/log';
import {
  buildEnvironmentUri,
  findCurrentEnvironment,
  isCurrentEnvironment,
  isDevContainerUri
} from '../services/uriService';
import { createEnvironmentQuickPickItems } from './environmentQuickPick';
import { applyEnvironmentSetup } from './environmentSetup';

// Colors are applied by the activation logic (see extension.ts). This marker
// only exists so that the setup prompt (extensions / profile reminder) is
// shown after an environment is opened from the picker, not at every launch.
interface PendingSetup {
  environmentId: string;
  createdAt: number;
  /** Dev Container: the folder opens locally first, then reopens in the container. */
  reopenInContainer?: boolean;
  maxAgeMs?: number;
}

const PENDING_KEY = 'envhue.pendingSetup';
const PENDING_MAX_AGE_MS = 2 * 60 * 1000;
// Building a container can take a while before the window comes back.
const PENDING_CONTAINER_MAX_AGE_MS = 15 * 60 * 1000;
const REOPEN_COMMAND = 'remote-containers.reopenInContainer';

type PickerItem = vscode.QuickPickItem & {
  environment?: Environment;
  action?: 'add' | 'colors';
};

export async function selectEnvironment(
  context: vscode.ExtensionContext,
  service: EnvironmentService
): Promise<void> {
  const environments = service.getAll();

  // Favorites first, then alphabetical order.
  const sorted = environments
    .slice()
    .sort(
      (a, b) =>
        Number(b.favorite) - Number(a.favorite) ||
        a.name.localeCompare(b.name)
    );

  const environmentItems: PickerItem[] =
    await createEnvironmentQuickPickItems(context, sorted);

  const current = findCurrentEnvironment(
    vscode.workspace.workspaceFolders,
    environments
  );

  for (const item of environmentItems) {
    if (item.environment && item.environment.id === current?.environment.id) {
      item.description = `${item.description} · current`;
    }
  }

  // Pro: environments grouped under their client.
  let listed: PickerItem[] = environmentItems;

  if (environments.some((item) => item.client)) {
    const byId = new Map(
      environmentItems.map((item) => [item.environment?.id, item] as const)
    );

    listed = groupByClient(environments).flatMap((group) => [
      { label: group.client || 'No client', kind: vscode.QuickPickItemKind.Separator },
      ...group.environments.flatMap((environment) => byId.get(environment.id) ?? [])
    ]);
  }

  const items: PickerItem[] = [
    ...listed,
    ...(current
      ? [{
          label: '$(symbol-color) Change Colors of the Current Environment',
          description: current.environment.name,
          action: 'colors' as const
        }]
      : []),
    {
      label: '$(plus) Add Environment',
      description: 'Create a new development environment',
      action: 'add'
    }
  ];

  const selected = await vscode.window.showQuickPick(items, {
    title: 'Envhue — Select Environment',
    placeHolder: 'Search environments or add a new one',
    matchOnDescription: true,
    matchOnDetail: true
  });

  if (!selected) {
    return;
  }

  if (selected.action === 'add') {
    await vscode.commands.executeCommand('envhue.addEnvironment');
    return;
  }

  if (selected.action === 'colors') {
    await vscode.commands.executeCommand('envhue.editColors');
    return;
  }

  if (!selected.environment) {
    return;
  }

  await openEnvironment(context, selected.environment);
}

export async function openEnvironment(
  context: vscode.ExtensionContext,
  environment: Environment
): Promise<void> {
  if (environment.requireConfirmation || environment.type === 'PROD') {
    const target = describeTarget(environment);
    const detail = environment.readOnly
      ? `${target}\n\nOpens in read-only mode. You can unlock it for the session afterwards.`
      : target;

    const confirmation = await vscode.window.showWarningMessage(
      `You are about to open "${environment.name}" (${environment.type}).`,
      { modal: true, detail },
      'Open Environment'
    );

    if (confirmation !== 'Open Environment') {
      return;
    }
  }

  let uri: vscode.Uri;

  try {
    uri = buildEnvironmentUri(environment);
  } catch (error) {
    void vscode.window.showErrorMessage(
      error instanceof Error ? error.message : String(error)
    );
    return;
  }

  const alreadyOpen = vscode.workspace.workspaceFolders?.some((folder) =>
    isCurrentEnvironment(folder.uri, environment)
  );

  if (alreadyOpen) {
    const insideContainer = vscode.workspace.workspaceFolders?.some((folder) =>
      isDevContainerUri(folder.uri)
    );

    if (environment.connection === 'devcontainer' && !insideContainer) {
      const choice = await vscode.window.showInformationMessage(
        `"${environment.name}" is open locally, not in its dev container.`,
        'Reopen in Container'
      );

      if (choice === 'Reopen in Container') {
        await reopenInContainer();
      }
      return;
    }

    void vscode.window.showInformationMessage(
      `"${environment.name}" is already open in this window.`
    );
    return;
  }

  const hasSetup = environment.setup && environment.setup.mode !== 'none';
  const isContainer = environment.connection === 'devcontainer';

  if (hasSetup || isContainer) {
    const pending: PendingSetup = {
      environmentId: environment.id,
      createdAt: Date.now(),
      reopenInContainer: isContainer,
      maxAgeMs: isContainer ? PENDING_CONTAINER_MAX_AGE_MS : PENDING_MAX_AGE_MS
    };
    await context.globalState.update(PENDING_KEY, pending);
  }

  const settings = vscode.workspace.getConfiguration('envhue');

  // A remote target (SSH, WSL, Dev Container) can fail to connect: after a
  // cancelled password prompt, for example, VS Code replaces the window with
  // an empty one. Opening it in a new window leaves this window, and the work
  // in it, untouched.
  const forceNewWindow =
    settings.get<boolean>('openInNewWindow', false) ||
    (environment.connection !== 'local' &&
      settings.get<boolean>('openRemoteInNewWindow', true));

  log(
    `open: "${environment.name}" (${environment.connection}) ` +
    `${uri.toString()} newWindow=${forceNewWindow}`
  );

  try {
    await vscode.commands.executeCommand('vscode.openFolder', uri, { forceNewWindow });
  } catch (error) {
    log(`open: FAILED ${error instanceof Error ? error.message : String(error)}`);
    await context.globalState.update(PENDING_KEY, undefined);

    void vscode.window.showErrorMessage(
      `Unable to open environment: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

async function reopenInContainer(): Promise<void> {
  try {
    await vscode.commands.executeCommand(REOPEN_COMMAND);
  } catch {
    void vscode.window.showWarningMessage(
      'Envhue could not reopen this folder in its container. ' +
      'Install the "Dev Containers" extension, or run "Dev Containers: Reopen in Container".'
    );
  }
}

/**
 * Finishes what the picker started once the target window is up: reopens a
 * Dev Container environment in its container, then runs the setup prompt.
 */
export async function applyPendingSetup(
  context: vscode.ExtensionContext,
  service: EnvironmentService
): Promise<void> {
  const pending = context.globalState.get<PendingSetup>(PENDING_KEY);

  if (!pending) {
    return;
  }

  const valid =
    typeof pending === 'object' &&
    typeof pending.environmentId === 'string' &&
    typeof pending.createdAt === 'number' &&
    Date.now() - pending.createdAt <= (pending.maxAgeMs ?? PENDING_MAX_AGE_MS);

  if (!valid) {
    await context.globalState.update(PENDING_KEY, undefined);
    return;
  }

  const match = findCurrentEnvironment(
    vscode.workspace.workspaceFolders,
    service.getAll()
  );

  // Not the window of the requested environment (yet): keep the marker.
  if (!match || match.environment.id !== pending.environmentId) {
    return;
  }

  const inContainer = vscode.workspace.workspaceFolders?.some((folder) =>
    isDevContainerUri(folder.uri)
  );

  // Local window of a Dev Container environment: reopen it in the container.
  // The marker is kept (without the reopen flag) so the setup runs there.
  if (
    pending.reopenInContainer &&
    match.environment.connection === 'devcontainer' &&
    !inContainer
  ) {
    const hasSetup = match.environment.setup && match.environment.setup.mode !== 'none';

    await context.globalState.update(
      PENDING_KEY,
      hasSetup ? { ...pending, reopenInContainer: false } : undefined
    );
    await reopenInContainer();
    return;
  }

  await context.globalState.update(PENDING_KEY, undefined);
  await applyEnvironmentSetup(match.environment);
}
