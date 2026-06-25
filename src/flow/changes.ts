/**
 * Builds {@link FileChange}s for the apply pipeline by reading current on-disk
 * content. Owns the `vscode` file reads; merge/generation logic stays pure.
 */
import * as vscode from 'vscode';
import { FileChange } from '../apply/applyService';
import { GeneratedFile } from '../apply/types';
import { mergeExclusions } from '../apply/settingsMerge';
import { ExclusionPayload } from '../recommendations/types';

const SETTINGS_PATH = '.vscode/settings.json';

async function readText(uri: vscode.Uri): Promise<{ text: string; exists: boolean }> {
  try {
    const data = await vscode.workspace.fs.readFile(uri);
    return { text: Buffer.from(data).toString('utf8'), exists: true };
  } catch {
    return { text: '', exists: false };
  }
}

function childUri(root: vscode.Uri, relativePath: string): vscode.Uri {
  return vscode.Uri.joinPath(root, ...relativePath.split('/'));
}

/** Build the `.vscode/settings.json` change for exclusion globs, or undefined if no-op. */
export async function buildSettingsChange(
  root: vscode.Uri,
  payload: ExclusionPayload,
): Promise<FileChange | undefined> {
  const uri = childUri(root, SETTINGS_PATH);
  const { text, exists } = await readText(uri);
  const merged = mergeExclusions(text, payload);
  if (!merged.changed) {
    return undefined;
  }
  return {
    uri,
    relativePath: SETTINGS_PATH,
    oldContent: text,
    newContent: merged.newText,
    isNew: !exists,
  };
}

/** Build changes for generated artifact files (instructions, agents, prompts). */
export async function buildGeneratedFileChanges(
  root: vscode.Uri,
  files: readonly GeneratedFile[],
): Promise<FileChange[]> {
  return Promise.all(
    files.map(async (file): Promise<FileChange> => {
      const uri = childUri(root, file.relativePath);
      const { text, exists } = await readText(uri);
      return {
        uri,
        relativePath: file.relativePath,
        oldContent: text,
        newContent: file.content,
        isNew: !exists,
      };
    }),
  );
}
