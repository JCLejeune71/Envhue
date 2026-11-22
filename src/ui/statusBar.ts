import * as vscode from 'vscode';
import { describeConnection } from '../models/describe';
import { EnvironmentService } from '../services/environmentService';
import { getUnlockDeadline, isLocked } from '../services/readOnlyService';
import { findCurrentEnvironment } from '../services/uriService';

export interface EnvironmentStatusBar {
  item: vscode.StatusBarItem;
  update: () => void;
}

export function createStatusBar(
  context: vscode.ExtensionContext,
  service: EnvironmentService
): EnvironmentStatusBar {
  const item = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100
  );

  item.command = 'envhue.selectEnvironment';

  // Second item: a persistent reminder of the read-only state.
  const lockItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    99
  );
  lockItem.command = 'envhue.toggleReadOnly';

  const update = (): void => {
    const match = findCurrentEnvironment(
      vscode.workspace.workspaceFolders,
      service.getAll()
    );

    if (match) {
      const { environment } = match;

      item.text = `$(${environment.type === 'PROD' ? 'warning' : 'layers'}) ${environment.name}`;
      item.tooltip =
        `${environment.name}\n` +
        `${environment.client || 'No client'} · ${environment.type}\n` +
        `${describeConnection(environment)}\n` +
        `${environment.path}\n\n` +
        'Click to switch environment or change its colors';

      // The status bar itself is painted with the accent color, so the item
      // uses the dedicated warning/error backgrounds for sensitive types.
      item.backgroundColor =
        environment.type === 'PROD'
          ? new vscode.ThemeColor('statusBarItem.errorBackground')
          : environment.type === 'PREPROD'
            ? new vscode.ThemeColor('statusBarItem.warningBackground')
            : undefined;

      const locked = isLocked(environment);

      if (locked) {
        lockItem.text = '$(lock) READ-ONLY';
        lockItem.tooltip =
          'Files are locked in the editor and Explorer (the terminal is not).\nClick to unlock for this session.';
        lockItem.backgroundColor = new vscode.ThemeColor(
          'statusBarItem.warningBackground'
        );
        lockItem.show();
      } else if (environment.readOnly || getUnlockDeadline(environment.id) !== undefined) {
        const deadline = getUnlockDeadline(environment.id);
        const left = deadline === undefined
          ? ''
          : ` · ${Math.max(1, Math.ceil((deadline - Date.now()) / 60000))} min`;

        lockItem.text = `$(unlock) UNLOCKED${left}`;
        lockItem.tooltip = deadline === undefined
          ? 'This environment is configured as read-only but is unlocked for this session.\nClick to lock it again.'
          : 'Unlocked for a limited time: it locks itself again when the time is up.\nClick to lock it now.';
        lockItem.backgroundColor = new vscode.ThemeColor(
          'statusBarItem.errorBackground'
        );
        lockItem.show();
      } else {
        lockItem.hide();
      }
    } else {
      item.text = '$(layers) Envhue';
      item.tooltip = 'Click to select an environment';
      item.backgroundColor = undefined;
      lockItem.hide();
    }

    item.show();
  };

  context.subscriptions.push(
    item,
    lockItem,
    vscode.workspace.onDidChangeWorkspaceFolders(update),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('envhue.environments')) {
        update();
      }
    })
  );

  update();

  return { item, update };
}
