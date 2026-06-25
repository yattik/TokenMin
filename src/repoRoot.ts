/**
 * Repo-root resolution — pure decision logic (no `vscode` import).
 *
 * The thin editor-facing wrapper lives in `repoRootPicker.ts`; this module only
 * decides *what* should happen given the set of open workspace folders, so it
 * can be unit-tested for the single-folder, multi-root, and none-open cases.
 */

/** Minimal description of a workspace folder, decoupled from `vscode.Uri`. */
export interface WorkspaceFolderInfo {
  name: string;
  /** Filesystem path of the folder root. */
  fsPath: string;
}

/** The action the editor wrapper should take to obtain a repo root. */
export type RootResolution =
  | { kind: 'single'; root: WorkspaceFolderInfo }
  | { kind: 'pick'; candidates: WorkspaceFolderInfo[] }
  | { kind: 'none' };

/**
 * Decide how to resolve the repo root from the currently open workspace folders.
 *
 * - No folders open -> `none` (wrapper should offer an open-folder dialog).
 * - Exactly one folder -> `single` (auto-selected).
 * - Multiple folders -> `pick` (wrapper should prompt the user).
 */
export function planRootResolution(folders: readonly WorkspaceFolderInfo[]): RootResolution {
  if (folders.length === 0) {
    return { kind: 'none' };
  }
  if (folders.length === 1) {
    return { kind: 'single', root: folders[0] };
  }
  return { kind: 'pick', candidates: folders.slice() };
}
