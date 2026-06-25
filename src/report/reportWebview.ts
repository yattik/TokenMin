/**
 * The efficiency-report webview panel. Renders the scorecard, wires deep-link
 * buttons, and supports importing a chat export for a proxy usage estimate.
 */
import * as vscode from 'vscode';
import { renderReportHtml } from './reportHtml';
import { Scorecard, estimateUsageFromChatExport, UsageEstimate } from './scorecard';
import { runDeepLink } from './deepLinks';

export class ReportPanel {
  private static current: ReportPanel | undefined;

  private readonly panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];
  private usage: UsageEstimate | undefined;

  private constructor(private card: Scorecard) {
    this.panel = vscode.window.createWebviewPanel(
      'tokenmin.report',
      'Token Efficiency Report',
      vscode.ViewColumn.Active,
      { enableScripts: true, retainContextWhenHidden: true },
    );
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.panel.webview.onDidReceiveMessage((msg) => this.onMessage(msg), null, this.disposables);
    this.render();
  }

  static show(card: Scorecard): void {
    if (ReportPanel.current) {
      ReportPanel.current.card = card;
      ReportPanel.current.usage = undefined;
      ReportPanel.current.panel.reveal(vscode.ViewColumn.Active);
      ReportPanel.current.render();
      return;
    }
    ReportPanel.current = new ReportPanel(card);
  }

  private render(): void {
    const nonce = makeNonce();
    this.panel.webview.html = renderReportHtml(this.card, {
      nonce,
      cspSource: this.panel.webview.cspSource,
      usage: this.usage,
    });
  }

  private async onMessage(msg: { type?: string; id?: string }): Promise<void> {
    if (msg?.type === 'deeplink' && msg.id) {
      await runDeepLink(msg.id);
    } else if (msg?.type === 'importChat') {
      await this.importChat();
    }
  }

  private async importChat(): Promise<void> {
    const picked = await vscode.window.showOpenDialog({
      canSelectMany: false,
      filters: { 'Chat export': ['json'] },
      openLabel: 'Estimate usage',
      title: 'Select an exported chat JSON',
    });
    if (!picked || picked.length === 0) {
      return;
    }
    try {
      const bytes = await vscode.workspace.fs.readFile(picked[0]);
      const data = JSON.parse(Buffer.from(bytes).toString('utf8'));
      this.usage = estimateUsageFromChatExport(data);
      this.render();
    } catch (err) {
      void vscode.window.showWarningMessage(
        `Token Optimizer: could not parse chat export (${err instanceof Error ? err.message : String(err)}).`,
      );
    }
  }

  private dispose(): void {
    ReportPanel.current = undefined;
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
