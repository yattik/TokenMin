/**
 * Best-effort deep links. Command ids for indexing / debug logs / cost controls
 * vary by Copilot version, so we run the first available candidate and fall back
 * to an honest informational message.
 */
import * as vscode from 'vscode';

const CANDIDATES: Record<string, { commands: string[]; fallback: string }> = {
  buildIndex: {
    commands: [
      'github.copilot.buildLocalWorkspaceIndex',
      'github.copilot.chat.buildLocalWorkspaceIndex',
      'workbench.action.semanticSearch.buildIndex',
    ],
    fallback:
      'Build the semantic index from the Copilot chat status / settings. This command was not found in your build.',
  },
  debugLogs: {
    commands: ['github.copilot.debug.showLogs', 'github.copilot.chat.debug.showLogs'],
    fallback: 'Open the "GitHub Copilot" Output channel to view agent debug logs (Summary).',
  },
  cacheExplorer: {
    commands: ['github.copilot.debug.cacheExplorer', 'github.copilot.chat.debug.cacheExplorer'],
    fallback: 'The Cache Explorer is available in the Copilot debug tools of newer builds.',
  },
  costControl: {
    commands: ['workbench.action.chat.openModelPicker', 'workbench.action.openSettings'],
    fallback: 'Per-session cost controls live in Copilot chat settings.',
  },
};

export async function runDeepLink(id: string): Promise<void> {
  const entry = CANDIDATES[id];
  if (!entry) {
    return;
  }
  const available = new Set(await vscode.commands.getCommands(true));
  for (const cmd of entry.commands) {
    if (available.has(cmd)) {
      try {
        if (cmd === 'workbench.action.openSettings') {
          await vscode.commands.executeCommand(cmd, 'chat.agent');
        } else {
          await vscode.commands.executeCommand(cmd);
        }
        return;
      } catch {
        // try the next candidate
      }
    }
  }
  if (id === 'debugLogs') {
    void vscode.commands.executeCommand('workbench.action.output.toggleOutput');
  }
  void vscode.window.showInformationMessage(`Token Optimizer: ${entry.fallback}`);
}
