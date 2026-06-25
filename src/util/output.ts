/**
 * Shared output channel used to surface progress and confirmations to the user.
 */
import * as vscode from 'vscode';

let channel: vscode.OutputChannel | undefined;

export function getOutputChannel(): vscode.OutputChannel {
  if (!channel) {
    channel = vscode.window.createOutputChannel('Token Optimizer');
  }
  return channel;
}

export function logLine(message = ''): void {
  getOutputChannel().appendLine(message);
}

export function logHeading(title: string): void {
  const ch = getOutputChannel();
  ch.appendLine('');
  ch.appendLine(`── ${title} ${'─'.repeat(Math.max(0, 50 - title.length))}`);
}

export function disposeOutput(): void {
  channel?.dispose();
  channel = undefined;
}
