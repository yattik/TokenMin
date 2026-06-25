/**
 * Virtual-document provider that serves proposed file contents so the apply
 * pipeline can show real diff editors before anything is written to disk.
 */
import * as vscode from 'vscode';

export class PreviewContentProvider implements vscode.TextDocumentContentProvider {
  static readonly scheme = 'tokenmin-preview';

  private readonly contents = new Map<string, string>();
  private readonly emitter = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this.emitter.event;

  provideTextDocumentContent(uri: vscode.Uri): string {
    return this.contents.get(uri.toString()) ?? '';
  }

  /** Register content for a virtual uri and return that uri. */
  set(label: string, kind: 'before' | 'after', content: string): vscode.Uri {
    const uri = vscode.Uri.from({
      scheme: PreviewContentProvider.scheme,
      path: `/${kind}/${label}`,
      query: `${kind}-${this.contents.size}`,
    });
    this.contents.set(uri.toString(), content);
    this.emitter.fire(uri);
    return uri;
  }

  clear(): void {
    this.contents.clear();
  }

  dispose(): void {
    this.emitter.dispose();
  }
}
