import * as vscode from 'vscode';
import { EnvironmentService } from './services/environmentService';
import {
  applyEnvironmentColors,
  resetEnvironmentColors
} from './services/colorService';
import { describeConnection } from './models/describe';
import {
  applyLockState,
  hasUnlockDeadlines,
  isLocked,
  setSessionLock,
  setUnlockDeadline,
  shouldAnnounceLock
} from './services/readOnlyService';
  import { syncCurrentWorkspace } from './services/workspaceSync';
import { ENVIRONMENT_TYPES, Environment } from './models/environment';
import { askColors, editEnvironment, editLocation } from './ui/environmentEditor';
import { EnvironmentPanel } from './ui/panel';
import { findCurrentEnvironment } from './services/uriService';
import { addEnvironment, manageEnvironments } from './ui/environmentManager';
import { applyPendingSetup, openEnvironment, selectEnvironment } from './ui/environmentPicker';
import { importProjects } from './ui/importer';
import { suggestProductionRegistration } from './ui/productionHint';
import { ResetReport, resetClosedFolder } from './services/resetAllService';
import { isCurrentEnvironment } from './services/uriService';
import { createStatusBar } from './ui/statusBar';
import { log, showLog } from './services/log';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  try {
    const service = new EnvironmentService();
    const statusBar = createStatusBar(context, service);
    const panel = new EnvironmentPanel(service);
    const updateUi = (): void => {
      statusBar.update();
      panel.refresh();
    };

    // Lock changes go through here so that a pending automatic re-lock never
    // outlives a manual change.
    const relockTimers = new Map<string, ReturnType<typeof setTimeout>>();

    const clearRelock = (id: string): void => {
      const timer = relockTimers.get(id);

      if (timer) {
        clearTimeout(timer);
      }

      relockTimers.delete(id);
      setUnlockDeadline(id, undefined);
    };

    const changeSessionLock = (id: string, locked: boolean): void => {
      clearRelock(id);
      setSessionLock(id, locked);
    };

    // Pro: an unlock that ends by itself.
    const relock = async (id: string): Promise<void> => {
      clearRelock(id);
      setSessionLock(id, true);

      const match = findCurrentEnvironment(
        vscode.workspace.workspaceFolders,
        service.getAll()
      );

      if (match && match.environment.id === id) {
        try {
          await applyLockState(match.folder.uri, true);
          await applyEnvironmentColors(match.folder.uri, match.environment, true);
          log(`unlock: "${match.environment.name}" locked again (time is up)`);

          void vscode.window.showInformationMessage(
            `"${match.environment.name}" is read-only again: the unlock time is over.`
          );
        } catch (error) {
          log(`unlock: could not lock again (${errorMessage(error)})`);
        }
      }

      updateUi();
    };

    const scheduleRelock = (id: string, minutes: number): void => {
      clearRelock(id);
      setUnlockDeadline(id, Date.now() + minutes * 60_000);
      relockTimers.set(id, setTimeout(() => void relock(id), minutes * 60_000));
    };

    // Keeps the "min left" counters current while a temporary unlock runs.
    const ticker = setInterval(() => {
      if (hasUnlockDeadlines()) {
        updateUi();
      }
    }, 30_000);

    context.subscriptions.push(
      {
        dispose: () => {
          clearInterval(ticker);
          relockTimers.forEach((timer) => clearTimeout(timer));
        }
      },
      vscode.window.createTreeView('envhue.panel', {
        treeDataProvider: panel,
        showCollapseAll: false
      })
    );

    // Applies a change to the environment of the open folder, from the panel.
    const updateCurrent = async (
      change: (environment: Environment) => Environment | undefined | Promise<Environment | undefined>
    ): Promise<void> => {
      const match = findCurrentEnvironment(
        vscode.workspace.workspaceFolders,
        service.getAll()
      );

      if (!match) {
        void vscode.window.showInformationMessage(
          'This workspace is not registered in Envhue. Open an environment first.'
        );
        return;
      }

      const updated = await change(match.environment);

      if (!updated) {
        return;
      }

      try {
        // Saving triggers the refresh that re-applies colors, title and lock.
        await service.update(updated);
        updateUi();
      } catch (error) {
        void vscode.window.showErrorMessage(
          `Envhue could not save the change: ${errorMessage(error)}`
        );
      }
    };

    // Saves an edit of the current environment. When its location changed, the
    // open folder no longer matches it: the old folder is cleaned (colors,
    // title, lock) and Envhue offers to open the environment at its new place.
    const changeCurrent = async (
      edit: (environment: Environment) => Promise<Environment | undefined>
    ): Promise<void> => {
      const match = findCurrentEnvironment(
        vscode.workspace.workspaceFolders,
        service.getAll()
      );

      if (!match) {
        void vscode.window.showInformationMessage(
          'This workspace is not registered in Envhue. Open an environment first.'
        );
        return;
      }

      const edited = await edit(match.environment);

      if (!edited) {
        return;
      }

      changeSessionLock(edited.id, edited.readOnly);

      try {
        await service.update(edited);
        updateUi();
      } catch (error) {
        void vscode.window.showErrorMessage(
          `Envhue could not save the environment: ${errorMessage(error)}`
        );
        return;
      }

      const stillOpen = findCurrentEnvironment(
        vscode.workspace.workspaceFolders,
        service.getAll()
      );

      if (stillOpen) {
        void vscode.window.showInformationMessage(`"${edited.name}" updated.`);
        return;
      }

      try {
        await resetEnvironmentColors(match.folder.uri);
        await applyLockState(match.folder.uri, false);
      } catch (error) {
        log(`cleanup of the previous folder failed: ${errorMessage(error)}`);
      }

      updateUi();

      const choice = await vscode.window.showInformationMessage(
        `"${edited.name}" updated. Its location changed, so this folder is no longer part of it.`,
        'Open Environment'
      );

      if (choice === 'Open Environment') {
        await openEnvironment(context, edited);
        updateUi();
      }
    };

    const autoApply = (): boolean =>
      vscode.workspace
        .getConfiguration('envhue')
        .get<boolean>('autoApplyColors', true);

    // Applies the identity of the registered environment matching the open
    // workspace. Runs at startup and whenever Envhue's settings change.
    // Runs are serialized and coalesced: a change that arrives while one is
    // in progress triggers a single extra run instead of overlapping ones.
    let inFlight: Promise<void> | undefined;
    let again = false;

    const refresh = (): Promise<void> => {
      if (inFlight) {
        again = true;
        return inFlight;
      }

      inFlight = (async () => {
        do {
          again = false;
          await runRefresh();
        } while (again);
      })().finally(() => {
        inFlight = undefined;
      });

      return inFlight;
    };

    const runRefresh = async (): Promise<void> => {
      const started = Date.now();
      log('refresh: start');

      try {
        const match = await syncCurrentWorkspace(service, {
          applyColors: autoApply()
        });

        if (!match) {
          void suggestProductionRegistration(context, service, refresh)
            .catch((error: unknown) =>
              console.error('[Envhue] Production hint error:', error)
            );
        }

        if (
          match &&
          isLocked(match.environment) &&
          shouldAnnounceLock(match.environment.id)
        ) {
          void vscode.window
            .showWarningMessage(
              `"${match.environment.name}" is open in read-only mode.`,
              'Unlock for This Session'
            )
            .then((choice) => {
              if (choice === 'Unlock for This Session') {
                void vscode.commands.executeCommand('envhue.toggleReadOnly');
              }
            });
        }
      } catch (error) {
        console.error('[Envhue] Could not synchronize the workspace:', error);
        log(`refresh: FAILED ${errorMessage(error)}`);
        void vscode.window.showWarningMessage(
          `Envhue could not fully apply this environment: ${errorMessage(error)}`
        );
      }

      updateUi();
      log(`refresh: done in ${Date.now() - started} ms`);
    };

    context.subscriptions.push(
      vscode.commands.registerCommand('envhue.showLog', () => showLog()),

      vscode.commands.registerCommand('envhue.selectEnvironment', async () => {
        await selectEnvironment(context, service);
        updateUi();
      }),

      vscode.commands.registerCommand('envhue.manageEnvironments', async () => {
        await manageEnvironments(service, context);
        updateUi();
      }),

      vscode.commands.registerCommand('envhue.addEnvironment', async () => {
        await addEnvironment(service);
        updateUi();
      }),

      vscode.commands.registerCommand('envhue.importProjects', async () => {
        try {
          await importProjects(context, service);
        } catch (error) {
          void vscode.window.showErrorMessage(
            `Envhue could not import the projects: ${errorMessage(error)}`
          );
        }
        updateUi();
      }),

      vscode.commands.registerCommand('envhue.showCurrentEnvironment', () => {
        const match = findCurrentEnvironment(
          vscode.workspace.workspaceFolders,
          service.getAll()
        );

        void vscode.window.showInformationMessage(
          match
            ? `${match.environment.name} · ${match.environment.type} · ` +
              `${describeConnection(match.environment)}` +
              (isLocked(match.environment) ? ' · read-only' : '')
            : 'This workspace is not registered in Envhue.'
        );
      }),

      vscode.commands.registerCommand('envhue.applyColors', async () => {
        try {
          const match = await syncCurrentWorkspace(service, { applyColors: true });
          updateUi();

          void vscode.window.showInformationMessage(
            match
              ? `Envhue colors applied for "${match.environment.name}".`
              : 'This workspace is not registered in Envhue.'
          );
        } catch (error) {
          void vscode.window.showErrorMessage(
            `Envhue could not apply the colors: ${errorMessage(error)}`
          );
        }
      }),

      vscode.commands.registerCommand('envhue.editColors', async () => {
        const match = findCurrentEnvironment(
          vscode.workspace.workspaceFolders,
          service.getAll()
        );

        if (!match) {
          void vscode.window.showInformationMessage(
            'This workspace is not registered in Envhue. Open an environment first.'
          );
          return;
        }

        const colors = await askColors(match.environment, match.environment.type);

        if (!colors) {
          return;
        }

        const updated = { ...match.environment, colors };

        try {
          await service.update(updated);
          await applyEnvironmentColors(match.folder.uri, updated, isLocked(updated));
          updateUi();

          void vscode.window.showInformationMessage(
            `Colors updated for "${updated.name}".`
          );
        } catch (error) {
          void vscode.window.showErrorMessage(
            `Envhue could not update the colors: ${errorMessage(error)}`
          );
        }
      }),

      vscode.commands.registerCommand('envhue.panel.open', async (id: unknown) => {
        const environment = service.getAll().find((item) => item.id === id);

        if (environment) {
          await openEnvironment(context, environment);
          updateUi();
        }
      }),

      vscode.commands.registerCommand('envhue.editCurrentEnvironment', () =>
        changeCurrent(editEnvironment)
      ),

      vscode.commands.registerCommand('envhue.panel.editLocation', () =>
        changeCurrent(editLocation)
      ),

      vscode.commands.registerCommand('envhue.panel.rename', () =>
        updateCurrent(async (environment) => {
          const name = await vscode.window.showInputBox({
            title: 'Envhue',
            prompt: 'Environment name',
            value: environment.name,
            ignoreFocusOut: true,
            validateInput: (value) => (value.trim() ? undefined : 'The name cannot be empty.')
          });

          return name?.trim() ? { ...environment, name: name.trim() } : undefined;
        })
      ),

      vscode.commands.registerCommand('envhue.panel.setClient', () =>
        updateCurrent(async (environment) => {
          const client = await vscode.window.showInputBox({
            title: 'Envhue',
            prompt: 'Client or project name (empty to clear)',
            value: environment.client ?? '',
            ignoreFocusOut: true
          });

          return client === undefined
            ? undefined
            : { ...environment, client: client.trim() || undefined };
        })
      ),

      vscode.commands.registerCommand('envhue.panel.setType', () =>
        updateCurrent(async (environment) => {
          const picked = await vscode.window.showQuickPick(
            ENVIRONMENT_TYPES.map((value) => ({
              label: value,
              description: value === environment.type ? 'current' : '',
              value
            })).sort(
              (a, b) =>
                Number(b.value === environment.type) - Number(a.value === environment.type)
            ),
            { title: 'Environment type', placeHolder: 'Select the environment category' }
          );

          return picked && picked.value !== environment.type
            ? { ...environment, type: picked.value }
            : undefined;
        })
      ),

      vscode.commands.registerCommand('envhue.panel.toggleConfirmation', () =>
        updateCurrent((environment) => {
          if (environment.type === 'PROD') {
            void vscode.window.showInformationMessage(
              'PROD environments always ask for confirmation.'
            );
            return undefined;
          }

          return { ...environment, requireConfirmation: !environment.requireConfirmation };
        })
      ),

      vscode.commands.registerCommand('envhue.panel.toggleReadOnlyDefault', () =>
        updateCurrent(async (environment) => {
          const next = !environment.readOnly;

          if (!next && environment.type === 'PROD') {
            const choice = await vscode.window.showWarningMessage(
              `Stop opening "${environment.name}" (PROD) in read-only mode?`,
              { modal: true, detail: 'The files will be unlocked now and stay editable every time it is opened.' },
              'Turn Off Read-Only'
            );

            if (choice !== 'Turn Off Read-Only') {
              return undefined;
            }
          }

          changeSessionLock(environment.id, next);
          return { ...environment, readOnly: next };
        })
      ),

      vscode.commands.registerCommand('envhue.panel.toggleFavorite', () =>
        updateCurrent((environment) => ({ ...environment, favorite: !environment.favorite }))
      ),

      vscode.commands.registerCommand('envhue.toggleReadOnly', async () => {
        const match = findCurrentEnvironment(
          vscode.workspace.workspaceFolders,
          service.getAll()
        );

        if (!match) {
          void vscode.window.showInformationMessage(
            'This workspace is not registered in Envhue. Open an environment first.'
          );
          return;
        }

        const { environment, folder } = match;
        const wasLocked = isLocked(environment);
        const sensitive = environment.type === 'PROD' || environment.readOnly;

        if (wasLocked && sensitive) {
          const choice = await vscode.window.showWarningMessage(
            `Unlock "${environment.name}" (${environment.type}) for editing?`,
            {
              modal: true,
              detail:
                'The lock comes back the next time this environment is opened. ' +
                'Envhue can lock it again at any time.'
            },
            'Unlock for This Session'
          );

          if (choice !== 'Unlock for This Session') {
            return;
          }
        }

        // Pro: choose how long the unlock lasts.
        let unlockMinutes: number | undefined;

        if (wasLocked ) {
          const duration = await vscode.window.showQuickPick(
            [
              { label: '5 minutes', minutes: 5 },
              { label: '15 minutes', minutes: 15 },
              { label: '1 hour', minutes: 60 },
              { label: 'Until this window is closed', minutes: undefined }
            ],
            {
              title: `Envhue — Unlock "${environment.name}" for how long?`,
              placeHolder: 'It locks itself again when the time is up',
              ignoreFocusOut: true
            }
          );

          if (!duration) {
            return;
          }

          unlockMinutes = duration.minutes;
        }

        changeSessionLock(environment.id, !wasLocked);

        try {
          await applyLockState(folder.uri, !wasLocked);
          await applyEnvironmentColors(folder.uri, environment, !wasLocked);

          if (wasLocked && unlockMinutes !== undefined) {
            scheduleRelock(environment.id, unlockMinutes);
          }

          updateUi();

          void vscode.window.showInformationMessage(
            wasLocked
              ? unlockMinutes !== undefined
                ? `"${environment.name}" is unlocked for ${unlockMinutes} minutes.`
                : `"${environment.name}" is unlocked for this session.`
              : `"${environment.name}" is now read-only.`
          );
        } catch (error) {
          changeSessionLock(environment.id, wasLocked);
          updateUi();

          void vscode.window.showErrorMessage(
            `Envhue could not change the read-only mode: ${errorMessage(error)}`
          );
        }
      }),

      vscode.commands.registerCommand('envhue.resetAllColors', async () => {
        const environments = service.getAll();

        if (environments.length === 0) {
          void vscode.window.showInformationMessage('There are no environments registered.');
          return;
        }

        const confirmation = await vscode.window.showWarningMessage(
          `Remove Envhue's colors, window title and read-only lock from ${environments.length} environment(s)?`,
          {
            modal: true,
            detail:
              'Only what Envhue wrote is removed from each .vscode/settings.json. ' +
              'Your environments stay registered. Remote folders and files with comments are listed afterwards.'
          },
          'Reset All'
        );

        if (confirmation !== 'Reset All') {
          return;
        }

        const report: ResetReport = { cleaned: [], untouched: [], manual: [] };

        for (const environment of environments) {
          try {
            const openFolder = vscode.workspace.workspaceFolders?.find((folder) =>
              isCurrentEnvironment(folder.uri, environment)
            );

            if (openFolder) {
              await resetEnvironmentColors(openFolder.uri);
              await applyLockState(openFolder.uri, false);
              changeSessionLock(environment.id, false);
              report.cleaned.push(environment.name);
            } else {
              await resetClosedFolder(environment, report);
            }
          } catch (error) {
            report.manual.push({ name: environment.name, reason: errorMessage(error) });
          }
        }

        updateUi();

        const details = report.manual.map((item) => `${item.name}: ${item.reason}`);
        const summary =
          `Envhue settings removed from ${report.cleaned.length} environment(s)` +
          (report.manual.length ? `; ${report.manual.length} need attention (${details.join('; ')})` : '') +
          '.';

        const choice = await (report.manual.length
          ? vscode.window.showWarningMessage(summary, 'Disable Automatic Colors')
          : vscode.window.showInformationMessage(summary, 'Disable Automatic Colors'));

        if (choice === 'Disable Automatic Colors') {
          await vscode.workspace
            .getConfiguration('envhue')
            .update('autoApplyColors', false, vscode.ConfigurationTarget.Global);
        }
      }),

      vscode.commands.registerCommand('envhue.resetColors', async () => {
        const folder = vscode.workspace.workspaceFolders?.[0];

        if (!folder) {
          void vscode.window.showInformationMessage('No folder is open.');
          return;
        }

        try {
          await resetEnvironmentColors(folder.uri);
          await applyLockState(folder.uri, false);

          const current = findCurrentEnvironment(
            vscode.workspace.workspaceFolders,
            service.getAll()
          );

          if (current) {
            changeSessionLock(current.environment.id, false);
          }

          updateUi();
        } catch (error) {
          void vscode.window.showErrorMessage(
            `Envhue could not reset the colors: ${errorMessage(error)}`
          );
          return;
        }

        const registered = findCurrentEnvironment(
          vscode.workspace.workspaceFolders,
          service.getAll()
        );

        if (registered && autoApply()) {
          const choice = await vscode.window.showInformationMessage(
            'Envhue colors and read-only lock removed. They will be applied again the next ' +
            'time this environment is opened, unless automatic colors are disabled.',
            'Disable Automatic Colors'
          );

          if (choice === 'Disable Automatic Colors') {
            await vscode.workspace
              .getConfiguration('envhue')
              .update('autoApplyColors', false, vscode.ConfigurationTarget.Global);
          }
        } else {
          void vscode.window.showInformationMessage('Envhue colors removed.');
        }
      }),

      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration('envhue')) {
          void refresh();
        }
      }),

      vscode.workspace.onDidChangeWorkspaceFolders(() => {
        void refresh();
      })
    );

    await refresh();

    try {
      await applyPendingSetup(context, service);
    } catch (error) {
      console.error('[Envhue] Pending setup error:', error);
    }

    const showOnStartup = vscode.workspace
      .getConfiguration('envhue')
      .get<boolean>('showOnStartup', false);

    if (showOnStartup) {
      await selectEnvironment(context, service );
      updateUi();
    }
  } catch (error) {
    console.error('[Envhue] Activation failed:', error);

    void vscode.window.showErrorMessage(
      `Envhue activation failed: ${errorMessage(error)}`
    );
  }
}

export function deactivate(): void {
  // Subscriptions are disposed automatically.
}
