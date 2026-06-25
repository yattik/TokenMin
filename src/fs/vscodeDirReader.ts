/**
 * `vscode`-backed {@link DirReader}. The only host-specific part of the walk;
 * all traversal logic lives in the pure `walk.ts`.
 */
import * as vscode from 'vscode';
import { DirChild, DirReader } from './types';

export class VsCodeDirReader implements DirReader {
  constructor(private readonly root: vscode.Uri) {}

  private toUri(relativePath: string): vscode.Uri {
    if (!relativePath) {
      return this.root;
    }
    return vscode.Uri.joinPath(this.root, ...relativePath.split('/'));
  }

  async readDir(relativePath: string): Promise<DirChild[]> {
    const dirUri = this.toUri(relativePath);
    const entries = await vscode.workspace.fs.readDirectory(dirUri);

    const children = await Promise.all(
      entries.map(async ([name, type]): Promise<DirChild | undefined> => {
        // Skip symlinks to avoid cycles and walking outside the repo.
        if ((type & vscode.FileType.SymbolicLink) !== 0) {
          return undefined;
        }
        const isDirectory = (type & vscode.FileType.Directory) !== 0;
        let size = 0;
        if (!isDirectory) {
          try {
            const stat = await vscode.workspace.fs.stat(vscode.Uri.joinPath(dirUri, name));
            size = stat.size;
          } catch {
            size = 0;
          }
        }
        return { name, isDirectory, size };
      }),
    );

    return children.filter((c): c is DirChild => c !== undefined);
  }

  async readTextFile(relativePath: string): Promise<string | undefined> {
    try {
      const data = await vscode.workspace.fs.readFile(this.toUri(relativePath));
      return Buffer.from(data).toString('utf8');
    } catch {
      return undefined;
    }
  }
}
