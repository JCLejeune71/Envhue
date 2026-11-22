import * as vscode from 'vscode';
import { looksMutating } from '../models/terminalGuard';
import { log } from '../services/log';
import { isLocked } from '../services/readOnlyService';
import { EnvironmentService } from '../services/environmentService';
import { findCurrentEnvironment } from '../services/uriService';

// Shell integration API (VS Code 1.93+). It is not in the typings this
// extension is built against, so it is declared here and detected at runtime:
// on an older VS Code, or with shell integration off, nothing happens.
interface ShellExecutionStart {
  terminal: vscode.Terminal;
  execution: { commandLine: { value: string }; cwd?: vscode.Uri };
}

type StartEvent = (listener: (event: ShellExecutionStart) => void) => vscode.Disposable;

const MIN_GAP_MS = 10_000;

/**
 * Warns when a command that looks like it changes something starts in a
 * terminal of a locked environment. Read-only mode does not cover the
 * terminal, and this cannot stop the command: it only says so.
 */
export function registerTerminalAlert(
  context: vscode.ExtensionContext,
  service: EnvironmentService
): void {
  const onStart = (vscode.window as unknown as { onDidStartTerminalShellExecution?: StartEvent })
    .onDidStartTerminalShellExecution;

  if (!onStart) {
    log('terminal alert: shell integration events are not available in this VS Code');
    return;
  }

  let lastAlert = 0;

  context.subscriptions.push(
    onStart.call(vscode.window, (event) => {
      try {
        if (
            !vscode.workspace.getConfiguration('envhue').get<boolean>('terminalAlert', true)
        ) {
          return;
        }

        const commandLine = event.execution.commandLine.value;

        if (!looksMutating(commandLine)) {
          return;
        }

        const match = findCurrentEnvironment(
          vscode.workspace.workspaceFolders,
          service.getAll()
        );

        if (!match || !isLocked(match.environment)) {
          return;
        }

        const cwd = event.execution.cwd;

        // A terminal working outside the environment's folder is not concerned.
        if (cwd && !cwd.toString().startsWith(match.folder.uri.toString())) {
          return;
        }

        log(`terminal alert: "${commandLine}" in locked "${match.environment.name}"`);

        if (Date.now() - lastAlert < MIN_GAP_MS) {
          return;
        }

        lastAlert = Date.now();

        void vscode.window.showWarningMessage(
          `"${match.environment.name}" is read-only, but the terminal is not: ` +
          `this command may change things (${commandLine.slice(0, 80)}). Envhue cannot stop it.`
        );
      } catch (error) {
        log(`terminal alert: ${error instanceof Error ? error.message : String(error)}`);
      }
    })
  );
}
