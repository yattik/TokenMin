/**
 * The Knowledge Graph webview panel: visualization + analysis. Renders the
 * pure {@link renderGraphHtml} markup and bridges its messages to the
 * {@link GraphService} (index, refresh, impact, search/trace, open file).
 */
import * as vscode from 'vscode';
import { renderGraphHtml } from './graphHtml';
import { GraphService, SearchRow, TokenComparison } from './service';
import { GraphViewModel, ImpactReport } from './types';
import { GraphUiPanel } from './graphUiPanel';

export class GraphPanel {
  private static current: GraphPanel | undefined;

  private readonly panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];
  private model: GraphViewModel;
  private impact: ImpactReport | undefined;
  private busy = false;

  private constructor(
    private readonly root: vscode.Uri,
    private readonly service: GraphService,
    initial: GraphViewModel,
  ) {
    this.model = initial;
    this.panel = vscode.window.createWebviewPanel(
      'tokenmin.knowledgeGraph',
      'Knowledge Graph',
      vscode.ViewColumn.Active,
      { enableScripts: true, retainContextWhenHidden: true },
    );
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.panel.webview.onDidReceiveMessage((msg) => this.onMessage(msg), null, this.disposables);
    this.render();
  }

  static show(root: vscode.Uri, service: GraphService, initial: GraphViewModel): void {
    if (GraphPanel.current) {
      GraphPanel.current.model = initial;
      GraphPanel.current.impact = undefined;
      GraphPanel.current.panel.reveal(vscode.ViewColumn.Active);
      GraphPanel.current.render();
      return;
    }
    GraphPanel.current = new GraphPanel(root, service, initial);
  }

  private async runtimeSource(): Promise<string | undefined> {
    const info = await this.service.locate();
    return info?.source;
  }

  private render(source?: string): void {
    const nonce = makeNonce();
    this.panel.webview.html = renderGraphHtml(this.model, {
      nonce,
      cspSource: this.panel.webview.cspSource,
      impact: this.impact,
      busy: this.busy,
      runtimeSource: source,
    });
  }

  private async refresh(): Promise<void> {
    this.model = await this.service.getViewModel(this.root);
    this.render(await this.runtimeSource());
  }

  private async withBusy<T>(title: string, fn: () => Promise<T>): Promise<T | undefined> {
    this.busy = true;
    this.render();
    try {
      return await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title },
        async () => fn(),
      );
    } catch (err) {
      void vscode.window.showErrorMessage(
        `Knowledge Graph: ${err instanceof Error ? err.message : String(err)}`,
      );
      return undefined;
    } finally {
      this.busy = false;
    }
  }

  private async onMessage(msg: { type?: string; query?: string; file?: string }): Promise<void> {
    switch (msg?.type) {
      case 'reindex':
        await this.withBusy('Token Optimizer: indexing knowledge graph…', () =>
          this.service.index(this.root, (m) => void m),
        );
        await this.refresh();
        return;
      case 'impact':
        await this.withBusy('Token Optimizer: analyzing diff impact…', async () => {
          this.impact = await this.service.getImpact(this.root);
        });
        this.render(await this.runtimeSource());
        return;
      case 'search':
        await this.runQuery('search', msg.query ?? '');
        return;
      case 'trace':
        await this.runQuery('trace', msg.query ?? '');
        return;
      case 'openFile':
        if (msg.file) {
          await this.openFile(msg.file);
        }
        return;
      case 'openUi':
        if (!vscode.workspace.getConfiguration('tokenmin').get<boolean>('features.graph3dVisualization', true)) {
          void vscode.window.showInformationMessage(
            '3D Knowledge Graph Visualization is turned off. Enable it in the Token Optimizer dashboard.',
          );
          return;
        }
        await this.withBusy('Token Optimizer: opening 3D graph UI…', async () => {
          const port = vscode.workspace.getConfiguration('tokenmin').get<number>('knowledgeGraph.uiPort', 9749);
          const localUrl = await this.service.startGraphUi(port, (m) => void m);
          const externalUri = await vscode.env.asExternalUri(vscode.Uri.parse(localUrl));
          GraphUiPanel.show(externalUri);
        });
        return;
    }
  }

  private async runQuery(kind: 'search' | 'trace', query: string): Promise<void> {
    const result = await this.withBusy(
      kind === 'search' ? 'Token Optimizer: search_graph…' : 'Token Optimizer: trace_path…',
      () => (kind === 'search' ? this.service.searchGraph(this.root, query) : this.service.tracePath(this.root, query)),
    );
    await this.panel.webview.postMessage({
      type: 'results',
      html: rowsToHtml(result?.rows ?? [], result?.comparison, result?.fromCache ?? false),
    });
  }

  private async openFile(file: string): Promise<void> {
    const uri = file.includes(':') && /^[a-zA-Z]:[\\/]/.test(file)
      ? vscode.Uri.file(file)
      : vscode.Uri.joinPath(this.root, ...file.split(/[\\/]/));
    try {
      const doc = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(doc, { preview: true });
    } catch {
      void vscode.window.showWarningMessage(`Could not open ${file}.`);
    }
  }

  private dispose(): void {
    GraphPanel.current = undefined;
    this.panel.dispose();
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
  }
}

/** Exported for use by the unified DashboardPanel. */
export function rowsToHtml(rows: SearchRow[], comparison?: TokenComparison, fromCache = false): string {
  const cacheHtml = fromCache
    ? '<p class="muted small">⚡ Served from cache — repeated query, no fresh graph call (~0 new tokens).</p>'
    : '';
  const comparisonHtml = comparison ? comparisonToHtml(comparison) : '';
  if (rows.length === 0) {
    return `${cacheHtml}${comparisonHtml}<span class="muted">No results. Try a broader pattern, e.g. .*Name.*</span>`;
  }
  const items = rows
    .map((r) => {
      const file = r.file
        ? ` <a href="#" data-open="${escapeAttr(r.file)}">${escapeHtml(r.file)}</a>`
        : '';
      const detail = r.detail ? ` <span class="muted small">(${escapeHtml(r.detail)})</span>` : '';
      return `<li><code>${escapeHtml(r.name)}</code>${detail}${file}</li>`;
    })
    .join('');
  return `${cacheHtml}${comparisonHtml}<ul>${items}</ul>`;
}

function comparisonToHtml(comparison: TokenComparison): string {
  if (comparison.fileReadTokens === 0) {
    return '<p class="muted small">Token comparison: graph result estimated, but no matching files were available for a file-read baseline.</p>';
  }
  return `<p class="muted small">Token comparison: graph result ~<b>${comparison.graphTokens}</b> tokens vs reading ${comparison.filesRead} matched file(s) ~<b>${comparison.fileReadTokens}</b> tokens. Saved ~<b>${comparison.savedTokens}</b> tokens (${comparison.reductionPercent}%).</p>`;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escapeAttr(text: string): string {
  return escapeHtml(text).replace(/'/g, '&#39;');
}

function makeNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < 32; i++) {
    out += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return out;
}
