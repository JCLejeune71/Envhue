import * as vscode from 'vscode';
import { EnvironmentService } from '../services/environmentService';
import { isCurrentEnvironment } from '../services/uriService';
import { editEnvironment } from './environmentEditor';
import { createEnvironmentQuickPickItems } from './environmentQuickPick';
import { configureEnvironmentSetup } from './environmentSetup';

export async function addEnvironment(
  service: EnvironmentService,
): Promise<void> {
  
  const environment = await editEnvironment();

  if (!environment) {
    return;
  }

  const setup = await configureEnvironmentSetup(environment);

  if (setup !== undefined) {
    environment.setup = setup;
  }

  await service.add(environment);

  void vscode.window.showInformationMessage(
    `Environment "${environment.name}" added.`
  );
}

export async function manageEnvironments(
  service: EnvironmentService,
  context: vscode.ExtensionContext
): Promise<void> {
  while (true) {
    const environments = service.getAll();

    const action = await vscode.window.showQuickPick(
      [
        { label: '$(add) Add environment', value: 'add' },
        { label: '$(edit) Edit an environment', value: 'edit' },
        { label: '$(trash) Delete an environment', value: 'delete' },
        { label: '$(close) Close', value: 'close' }
      ],
      {
        title: `Envhue — Environment Manager`,
        placeHolder: 'Choose an action'
      }
    );

    if (!action || action.value === 'close') {
      return;
    }

    if (action.value === 'add') {
      continue;
    }

    if (environments.length === 0) {
      void vscode.window.showInformationMessage('There are no environments to manage.');
      continue;
    }

    const items = await createEnvironmentQuickPickItems(context, environments);

    const selected = await vscode.window.showQuickPick(items, {
      title: action.value === 'edit'
        ? 'Select an environment to edit'
        : 'Select an environment to delete'
    });

    if (!selected) {
      continue;
    }

    if (action.value === 'edit') {
      const updated = await editEnvironment(selected.environment);

      if (updated) {
        const setup = await configureEnvironmentSetup(updated);

        if (setup !== undefined) {
          updated.setup = setup;
        }

        await service.update(updated);

        void vscode.window.showInformationMessage(
          `Environment "${updated.name}" updated.`
        );
      }

      continue;
    }

    // Protection: do not delete an environment that is currently open.
    const isOpen = vscode.workspace.workspaceFolders?.some((folder) =>
      isCurrentEnvironment(folder.uri, selected.environment)
    );

    if (isOpen) {
      void vscode.window.showWarningMessage(
        `Cannot delete "${selected.environment.name}" because it is currently open in VS Code.`
      );
      continue;
    }

    const confirmation = await vscode.window.showWarningMessage(
      `Delete "${selected.environment.name}" (${selected.environment.type})?`,
      {
        modal: true,
        detail: 'Only the Envhue registration is removed. Your project files are not deleted.'
      },
      'Delete Environment'
    );

    if (confirmation !== 'Delete Environment') {
      continue;
    }

    try {
      await service.remove(selected.environment.id);

      void vscode.window.showInformationMessage(
        `Environment "${selected.environment.name}" deleted.`
      );
    } catch (error) {
      void vscode.window.showErrorMessage(
        `Unable to delete environment: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }
}
