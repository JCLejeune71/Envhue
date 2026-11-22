import * as vscode from 'vscode';

let channel: vscode.OutputChannel | undefined;

function getChannel(): vscode.OutputChannel {
  channel ??= vscode.window.createOutputChannel('Envhue');
  return channel;
}

/** Writes a timestamped line to the "Envhue" output channel. */
export function log(message: string): void {
  getChannel().appendLine(`${new Date().toISOString()}  ${message}`);
}

export function showLog(): void {
  getChannel().show(true);
}
