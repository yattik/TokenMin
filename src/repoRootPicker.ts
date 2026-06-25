/**
 * Editor-facing wrapper around the pure root-resolution logic in `repoRoot.ts`.
 * This module owns all `vscode` interaction (quick picks, open dialogs).
 */
import * as vscode from 'vscode';
import { planRootResolution, WorkspaceFolderInfo } from './repoRoot';

/** Read the open workspace folders as plain {@link WorkspaceFolderInfo}. */
export function currentWorkspaceFolders(): WorkspaceFolderInfo[] {
  return (vscode.workspace.workspaceFolders ?? []).map((f) => ({
    name: f.name,
    fsPath: f.uri.fsPath,
  }));
}

/**
 * Resolve the repo root the user wants to analyze.
 *
 * Returns the chosen folder Uri, or `undefined` if the user cancelled or no
 * folder could be resolved.
 */
export async function resolveRepoRoot(): Promise<vscode.Uri | undefined> {
  const folders = currentWorkspaceFolders();
  const resolution = planRootResolution(folders);

  switch (resolution.kind) {
    case 'single':
      return vscode.Uri.file(resolution.root.fsPath);

    case 'pick': {
      const picked = await vscode.window.showQuickPick(
        resolution.candidates.map((c) => ({
          label: c.name,
          description: c.fsPath,
          folder: c,
        })),
        {
          title: 'Token Optimizer: select the repo root to analyze',
          placeHolder: 'Choose a workspace folder',
          ignoreFocusOut: true,
        },
      );
      return picked ? vscode.Uri.file(picked.folder.fsPath) : undefined;
    }

    case 'none': {
      // Modal so it can't be missed (the Welcome page typically has no folder
      // open, which otherwise makes the command look like it did nothing).
      const choice = await vscode.window.showWarningMessage(
        'Token Optimizer needs a folder to analyze.',
        {
          modal: true,
          detail: 'No folder is currently open. Choose a repository folder to analyze for Copilot token efficiency.',
        },
        'Choose Folder…',
      );
      if (choice !== 'Choose Folder…') {
        return undefined;
      }
      const picked = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: 'Analyze this folder',
        title: 'Select a repo root to analyze',
      });
      return picked && picked.length > 0 ? picked[0] : undefined;
    }
  }
}
