/**
 * Apply pipeline: preview proposed file changes as diffs, require explicit
 * approval, optionally create a new branch, then write the approved changes.
 * Idempotent — no-op changes are filtered out before anything is shown.
 */
import * as vscode from 'vscode';
import { PreviewContentProvider } from './diffPreview';
import { createBranch, suggestBranchName } from './git';
import { ApplyHistory, newTransactionId } from './types';

export interface FileChange {
  uri: vscode.Uri;
  relativePath: string;
  oldContent: string;
  newContent: string;
  isNew: boolean;
}

export interface ApplyOptions {
  /** Offer to create a new branch before writing. */
  offerBranch: boolean;
}

export interface ApplyResult {
  applied: boolean;
  reason?: 'no-changes' | 'cancelled';
  appliedFiles: string[];
  branch?: string;
}

export class ApplyService {
  constructor(
    private readonly preview: PreviewContentProvider,
    private readonly history: ApplyHistory,
  ) {}

  async previewAndApply(root: vscode.Uri, changes: FileChange[], options: ApplyOptions): Promise<ApplyResult> {
    const effective = changes.filter((c) => c.oldContent !== c.newContent);
    if (effective.length === 0) {
      void vscode.window.showInformationMessage(
        'Token Optimizer: nothing to apply — your repo is already up to date with these recommendations.',
      );
      return { applied: false, reason: 'no-changes', appliedFiles: [] };
    }

    await this.showDiffs(effective);

    const buttons = options.offerBranch ? ['Apply', 'Apply to New Branch'] : ['Apply'];
    const choice = await vscode.window.showInformationMessage(
      `Apply ${effective.length} change${effective.length === 1 ? '' : 's'}?`,
      {
        modal: true,
        detail:
          effective.map((c) => `${c.isNew ? 'create' : 'update'}  ${c.relativePath}`).join('\n') +
          '\n\nReview the diff tabs first. Nothing has been written yet.',
      },
      ...buttons,
    );

    if (choice !== 'Apply' && choice !== 'Apply to New Branch') {
      return { applied: false, reason: 'cancelled', appliedFiles: [] };
    }

    let branch: string | undefined;
    if (choice === 'Apply to New Branch') {
      const name = suggestBranchName();
      const result = await createBranch(root.fsPath, name);
      if (!result.ok) {
        const proceed = await vscode.window.showWarningMessage(
          `Could not create branch (${result.error}). Apply to the current branch instead?`,
          { modal: true },
          'Apply Here',
        );
        if (proceed !== 'Apply Here') {
          return { applied: false, reason: 'cancelled', appliedFiles: [] };
        }
      } else {
        branch = result.branch;
      }
    }

    const appliedFiles = await this.writeChanges(effective);

    await this.history.record({
      id: newTransactionId(),
      timestamp: Date.now(),
      rootFsPath: root.fsPath,
      branch,
      changes: effective.map((c) => ({
        relativePath: c.relativePath,
        oldContent: c.oldContent,
        newContent: c.newContent,
        isNew: c.isNew,
      })),
    });

    void vscode.window
      .showInformationMessage(
        `Token Optimizer: applied ${appliedFiles.length} change${appliedFiles.length === 1 ? '' : 's'}` +
          (branch ? ` on branch ${branch}.` : '.'),
        'Undo',
      )
      .then((c) => {
        if (c === 'Undo') {
          void this.undoLast();
        }
      });
    return { applied: true, appliedFiles, branch };
  }

  private async showDiffs(changes: FileChange[]): Promise<void> {
    this.preview.clear();
    for (const change of changes) {
      const left = change.isNew
        ? this.preview.set(change.relativePath, 'before', '')
        : change.uri;
      const right = this.preview.set(change.relativePath, 'after', change.newContent);
      const title = `${change.relativePath} (${change.isNew ? 'new' : 'proposed'})`;
      await vscode.commands.executeCommand('vscode.diff', left, right, title, { preview: false });
    }
  }

  private async writeChanges(changes: FileChange[]): Promise<string[]> {
    const written: string[] = [];
    for (const change of changes) {
      const data = Buffer.from(change.newContent, 'utf8');
      await vscode.workspace.fs.writeFile(change.uri, data);
      written.push(change.relativePath);
    }
    return written;
  }

  private async readText(uri: vscode.Uri): Promise<{ text: string; exists: boolean }> {
    try {
      const data = await vscode.workspace.fs.readFile(uri);
      return { text: Buffer.from(data).toString('utf8'), exists: true };
    } catch {
      return { text: '', exists: false };
    }
  }

  /**
   * Revert the most recent apply: restore prior content for modified files and
   * send created files to the OS trash. Shows diffs + a modal first, flags files
   * changed since the apply, and pops the transaction so repeated undo steps back.
   */
  async undoLast(): Promise<void> {
    const tx = this.history.latest();
    if (!tx) {
      void vscode.window.showInformationMessage('Token Optimizer: there are no applied changes to undo.');
      return;
    }
    const rootUri = vscode.Uri.file(tx.rootFsPath);

    const actions = await Promise.all(
      tx.changes.map(async (ch) => {
        const uri = vscode.Uri.joinPath(rootUri, ...ch.relativePath.split('/'));
        const current = await this.readText(uri);
        return {
          uri,
          relativePath: ch.relativePath,
          kind: ch.isNew ? ('delete' as const) : ('restore' as const),
          target: ch.oldContent,
          conflict: current.exists && current.text !== ch.newContent,
        };
      }),
    );

    // Preview restores as diffs (current -> prior content).
    this.preview.clear();
    for (const a of actions) {
      if (a.kind === 'restore') {
        const right = this.preview.set(a.relativePath, 'after', a.target);
        await vscode.commands.executeCommand('vscode.diff', a.uri, right, `Undo ${a.relativePath}`, { preview: false });
      }
    }

    const conflicts = actions.filter((a) => a.conflict).map((a) => a.relativePath);
    const detail =
      actions.map((a) => `${a.kind === 'delete' ? 'delete ' : 'restore'}  ${a.relativePath}`).join('\n') +
      (conflicts.length ? `\n\n\u26a0 Modified since apply — later edits will be lost:\n${conflicts.join('\n')}` : '') +
      '\n\nReview the diff tabs first. Nothing is reverted yet.';

    const choice = await vscode.window.showWarningMessage(
      `Undo ${actions.length} change${actions.length === 1 ? '' : 's'} from the last Token Optimizer apply?`,
      { modal: true, detail },
      'Undo',
    );
    if (choice !== 'Undo') {
      return;
    }

    let reverted = 0;
    for (const a of actions) {
      try {
        if (a.kind === 'delete') {
          await vscode.workspace.fs.delete(a.uri, { useTrash: true });
        } else {
          await vscode.workspace.fs.writeFile(a.uri, Buffer.from(a.target, 'utf8'));
        }
        reverted++;
      } catch {
        // file already gone or locked; skip
      }
    }
    await this.history.remove(tx.id);
    void vscode.window.showInformationMessage(
      `Token Optimizer: reverted ${reverted} change${reverted === 1 ? '' : 's'}.`,
    );
  }
}
