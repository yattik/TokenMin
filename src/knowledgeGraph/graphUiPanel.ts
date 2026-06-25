/**
 * Embedded 3D knowledge-graph UI panel. Starts the managed codebase-memory-mcp
 * `ui` runtime (installed once into global storage) and hosts its localhost
 * server inside a VS Code webview via an `<iframe>`, so the 3D graph lives
 * directly in the editor instead of an external browser. `asExternalUri` maps
 * the local port so this also works in Remote / Codespaces sessions.
 */
import * as vscode from 'vscode';
import { brandCssVars, brandLightSurfaceVars } from '../util/theme';

export class GraphUiPanel {
  private static current: GraphUiPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];

  private constructor(externalUri: vscode.Uri) {
    this.panel = vscode.window.createWebviewPanel(
      'tokenmin.knowledgeGraphUi',
      'Knowledge Graph 3D',
      vscode.ViewColumn.Active,
      { enableScripts: true, retainContextWhenHidden: true },
    );
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.render(externalUri);
  }

  static show(externalUri: vscode.Uri): void {
    if (GraphUiPanel.current) {
      GraphUiPanel.current.panel.reveal(vscode.ViewColumn.Active);
      GraphUiPanel.current.render(externalUri);
      return;
    }
    GraphUiPanel.current = new GraphUiPanel(externalUri);
  }

  private render(externalUri: vscode.Uri): void {
    const nonce = makeNonce();
    const src = externalUri.toString();
    const frameOrigin = `${externalUri.scheme}://${externalUri.authority}`;
    const csp =
      `default-src 'none'; style-src 'nonce-${nonce}'; ` +
      `frame-src ${frameOrigin} http://localhost:* https://localhost:*; ` +
      `script-src 'nonce-${nonce}';`;

    this.panel.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="${csp}" />
<style nonce="${nonce}">${brandCssVars()}${brandLightSurfaceVars()}
  html, body { height: 100%; margin: 0; }
  body { display: flex; flex-direction: column; background: var(--sh-surface); }
  .sh-bar { height: 4px; background: var(--sh-gradient); }
  .bar { display: flex; align-items: center; justify-content: space-between; gap: 0.6rem;
    padding: 0.45rem 0.8rem; font-family: var(--vscode-font-family); color: var(--sh-text);
    background: var(--sh-surface); border-bottom: 1px solid var(--sh-border); }
  .brand { font-size: 0.72rem; letter-spacing: 0.04em; text-transform: uppercase;
    color: var(--sh-petrol); font-weight: 600; }
  a.open { color: var(--sh-petrol); font-size: 0.8rem; }
  iframe { flex: 1; width: 100%; border: 0; background: #fff; }
</style>
<title>Knowledge Graph 3D</title>
</head>
<body>
  <div class="sh-bar"></div>
  <div class="bar">
    <span class="brand">Token Optimizer · Knowledge Graph 3D</span>
    <a class="open" href="${src}" target="_blank" rel="noreferrer">Open in browser ↗</a>
  </div>
  <iframe src="${src}" title="Codebase knowledge graph"></iframe>
</body>
</html>`;
  }

  private dispose(): void {
    GraphUiPanel.current = undefined;
    this.panel.dispose();
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
  }
}

function makeNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < 32; i++) {
    out += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return out;
}
