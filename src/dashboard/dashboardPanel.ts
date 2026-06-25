/**
 * The unified Token Optimizer panel. Owns the graph model and runs index /
 * impact / search / trace directly so the UI updates immediately on completion
 * instead of delegating to a separate GraphPanel that the dashboard cannot see.
 */
import * as vscode from 'vscode';
import { renderDashboardHtml } from './dashboardHtml';
import { GraphService } from '../knowledgeGraph/service';
import { GraphProjectInfo, GraphViewModel, ImpactReport } from '../knowledgeGraph/types';
import { emptyModel } from '../knowledgeGraph/graphModel';
import { GraphUiPanel } from '../knowledgeGraph/graphUiPanel';
import { rowsToHtml } from '../knowledgeGraph/graphPanel';

export class DashboardPanel {
  private static current: DashboardPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];
  private model: GraphViewModel;
  private impact: ImpactReport | undefined;
  private projects: GraphProjectInfo[] = [];
  private busy = false;
  private root: vscode.Uri | undefined;

  private constructor(private readonly service: GraphService) {
    this.root = vscode.workspace.workspaceFolders?.[0]?.uri;
    this.model = emptyModel(this.root ? basename(this.root.fsPath) : 'repo', 'Not indexed yet.');
    this.panel = vscode.window.createWebviewPanel(
      'tokenmin.dashboard',
      'Token Optimizer',
      vscode.ViewColumn.Active,
      { enableScripts: true, retainContextWhenHidden: true },
    );
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.panel.webview.onDidReceiveMessage((msg) => this.onMessage(msg), null, this.disposables);
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      this.root = vscode.workspace.workspaceFolders?.[0]?.uri;
    }, null, this.disposables);
    void this.refresh();
  }

  static show(service: GraphService): void {
    if (DashboardPanel.current) {
      DashboardPanel.current.panel.reveal(vscode.ViewColumn.Active);
      void DashboardPanel.current.refresh();
      return;
    }
    DashboardPanel.current = new DashboardPanel(service);
  }

  private async refresh(): Promise<void> {
    // Paint immediately with whatever state we already have so the panel is
    // never a blank (black) webview while the knowledge-graph runtime is being
    // located and queried — those calls can spawn a CLI and take seconds.
    await this.render();
    if (this.root) {
      this.model = await this.service.getViewModel(this.root).catch(
        () => emptyModel(basename(this.root!.fsPath), 'Could not read the graph.'),
      );
    }
    this.projects = await this.service.listProjects(this.root).catch(() => []);
    await this.render();
  }

  private async render(): Promise<void> {
    const nonce = makeNonce();
    const folder = this.root;
    const info = await this.service.locate().catch(() => undefined);
    const mcpConfigured = folder
      ? await fileExists(vscode.Uri.joinPath(folder, '.vscode', 'mcp.json'))
      : false;
    const agentsConfigured = folder
      ? await fileExists(vscode.Uri.joinPath(folder, '.github', 'agents', 'graph-plan.agent.md'))
      : false;
    try {
      this.panel.webview.html = renderDashboardHtml(
        {
          cache: this.service.cacheStats(),
          runtimeInstalled: Boolean(info),
          runtimeSource: info?.source,
          projectName: folder ? basename(folder.fsPath) : undefined,
          mcpConfigured,
          agentsConfigured,
          model: this.model,
          impact: this.impact,
          projects: this.projects,
          busy: this.busy,
        },
        { nonce, cspSource: this.panel.webview.cspSource },
      );
    } catch (err) {
      this.panel.webview.html = fallbackHtml(err instanceof Error ? err.message : String(err));
    }
  }

  private async onMessage(msg: {
    type?: string;
    command?: string;
    query?: string;
    file?: string;
  }): Promise<void> {
    switch (msg?.type) {
      case 'index':
        await this.runIndex();
        return;
      case 'impact':
        await this.runImpact();
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
      case 'openProject':
        if (msg.file) {
          await this.openProject(msg.file);
        }
        return;
      case 'openUi':
        await this.runOpenUi();
        return;
      case 'openSettings':
        await vscode.commands.executeCommand('workbench.action.openSettings', 'tokenmin');
        return;
      case 'command':
        if (msg.command) {
          await vscode.commands.executeCommand(msg.command);
          await this.render();
        }
        return;
    }
  }

  private async runIndex(): Promise<void> {
    if (!this.root) {
      void vscode.window.showWarningMessage('Open a folder before indexing.');
      return;
    }
    this.busy = true;
    await this.render();
    try {
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Token Optimizer: indexing knowledge graph\u2026' },
        async (progress) => this.service.ensureRuntime((m) => progress.report({ message: m })).then(() =>
          this.service.index(this.root!, (m) => progress.report({ message: m })),
        ),
      );
    } catch (err) {
      void vscode.window.showErrorMessage(
        `Token Optimizer: indexing failed \u2014 ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      this.busy = false;
    }
    await this.refresh();
  }

  private async runImpact(): Promise<void> {
    if (!this.root) { return; }
    this.busy = true;
    await this.render();
    try {
      this.impact = await this.service.getImpact(this.root);
    } catch {
      this.impact = undefined;
    } finally {
      this.busy = false;
    }
    await this.render();
  }

  private async runQuery(kind: 'search' | 'trace', query: string): Promise<void> {
    if (!this.root || !query.trim()) { return; }
    this.busy = true;
    await this.render();
    try {
      const result =
        kind === 'search'
          ? await this.service.searchGraph(this.root, query)
          : await this.service.tracePath(this.root, query);
      await this.panel.webview.postMessage({
        type: 'results',
        html: rowsToHtml(result.rows, result.comparison, result.fromCache),
      });
    } catch {
      await this.panel.webview.postMessage({ type: 'results', html: '<span class="muted">Query failed.</span>' });
    } finally {
      this.busy = false;
      await this.render();
    }
  }

  private async runOpenUi(): Promise<void> {
    const enabled = vscode.workspace
      .getConfiguration('tokenmin')
      .get<boolean>('features.graph3dVisualization', true);
    if (!enabled) {
      void vscode.window.showInformationMessage(
        '3D graph visualization is off. Enable it in Settings (tokenmin.features.graph3dVisualization).',
      );
      return;
    }
    this.busy = true;
    await this.render();
    try {
      const port = vscode.workspace.getConfiguration('tokenmin').get<number>('knowledgeGraph.uiPort', 9749);
      const localUrl = await this.service.startGraphUi(port, (m) => void m);
      const externalUri = await vscode.env.asExternalUri(vscode.Uri.parse(localUrl));
      GraphUiPanel.show(externalUri);
    } catch (err) {
      void vscode.window.showErrorMessage(
        `Token Optimizer: 3D UI failed \u2014 ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      this.busy = false;
      await this.render();
    }
  }

  /** Open another knowledge-graph instance's repo folder in a new window. */
  private async openProject(path: string): Promise<void> {
    const uri = vscode.Uri.file(path);
    if (this.root && uri.fsPath === this.root.fsPath) {
      void vscode.window.showInformationMessage('That knowledge graph is the current workspace.');
      return;
    }
    await vscode.commands.executeCommand('vscode.openFolder', uri, { forceNewWindow: true });
  }

  private async openFile(file: string): Promise<void> {
    const uri =
      /^[a-zA-Z]:[\\/]/.test(file)
        ? vscode.Uri.file(file)
        : vscode.Uri.joinPath(this.root ?? vscode.workspace.workspaceFolders![0].uri, ...file.split(/[\\/]/));
    try {
      const doc = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(doc, { preview: true });
    } catch {
      void vscode.window.showWarningMessage(`Could not open ${file}.`);
    }
  }

  private dispose(): void {
    DashboardPanel.current = undefined;
    this.panel.dispose();
    for (const d of this.disposables) { d.dispose(); }
    this.disposables = [];
  }
}

function basename(p: string): string {
  const parts = p.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] || p;
}

async function fileExists(uri: vscode.Uri): Promise<boolean> {
  try { await vscode.workspace.fs.stat(uri); return true; } catch { return false; }
}

function makeNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < 32; i++) { out += chars.charAt(Math.floor(Math.random() * chars.length)); }
  return out;
}

/** Minimal, dependency-free HTML so the panel is never a blank webview. */
function fallbackHtml(message: string): string {
  const safe = message.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="font-family: var(--vscode-font-family, sans-serif); padding: 1rem;">
  <h2>Token Optimizer</h2>
  <p>The dashboard could not render its full view. You can still use the commands from the Command Palette.</p>
  <p style="opacity:0.7;font-size:0.85rem;">Details: ${safe}</p>
</body></html>`;
}
