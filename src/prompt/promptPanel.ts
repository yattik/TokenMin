/**
 * The "Optimize Prompt" webview: a practical prompt-restructuring workflow.
 *
 * VS Code extensions cannot intercept or rewrite Copilot Chat messages in
 * flight, so this panel takes a vague prompt, restructures it deterministically
 * (with an optional small-model refinement), shows the estimated token/clarity
 * impact, and lets the user copy the focused prompt into Copilot Chat.
 */
import * as vscode from 'vscode';
import {
  comparePrompts,
  formatRestructuredPrompt,
  PromptContext,
  restructurePrompt,
} from './restructure';
import { createModelInvoker } from '../model/modelClient';
import { brandCssVars, brandComponentStyles, brandLightSurfaceVars } from '../util/theme';

export class PromptPanel {
  private static current: PromptPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];

  private constructor(private readonly context: PromptContext) {
    this.panel = vscode.window.createWebviewPanel(
      'tokenmin.optimizePrompt',
      'Optimize Prompt',
      vscode.ViewColumn.Active,
      { enableScripts: true, retainContextWhenHidden: true },
    );
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.panel.webview.onDidReceiveMessage((msg) => this.onMessage(msg), null, this.disposables);
    this.render();
  }

  static show(context: PromptContext = {}): void {
    if (PromptPanel.current) {
      PromptPanel.current.panel.reveal(vscode.ViewColumn.Active);
      return;
    }
    PromptPanel.current = new PromptPanel(context);
  }

  private render(): void {
    const nonce = makeNonce();
    const csp =
      `default-src 'none'; style-src ${this.panel.webview.cspSource} 'nonce-${nonce}'; ` +
      `script-src 'nonce-${nonce}';`;
    this.panel.webview.html = html(nonce, csp);
  }

  private async onMessage(msg: {
    type?: string;
    raw?: string;
    refine?: boolean;
    text?: string;
  }): Promise<void> {
    if (msg?.type === 'optimize') {
      await this.optimize(msg.raw ?? '', Boolean(msg.refine));
      return;
    }
    if (msg?.type === 'copy' && typeof msg.text === 'string') {
      await vscode.env.clipboard.writeText(msg.text);
      void vscode.window.setStatusBarMessage('$(clippy) Optimized prompt copied — paste it into Copilot Chat.', 4000);
    }
  }

  private async optimize(raw: string, refine: boolean): Promise<void> {
    const trimmed = raw.trim();
    if (!trimmed) {
      await this.post({ type: 'result', error: 'Enter a prompt to optimize.' });
      return;
    }
    const structured = restructurePrompt(trimmed, this.context);
    let formatted = formatRestructuredPrompt(structured);
    let refined = false;

    if (refine) {
      const improved = await this.refineWithModel(trimmed, formatted).catch(() => undefined);
      if (improved && improved.trim()) {
        formatted = improved.trim();
        refined = true;
      }
    }

    const comparison = comparePrompts(trimmed, formatted);
    await this.post({ type: 'result', formatted, comparison, taskType: structured.taskType, refined });
  }

  /** Optional small-model refinement; falls back to the deterministic output. */
  private async refineWithModel(raw: string, deterministic: string): Promise<string | undefined> {
    const family = vscode.workspace.getConfiguration('tokenmin').get<string>('modelFamilyPreference', 'gpt-4o');
    const invoker = await createModelInvoker(family);
    if (!invoker) {
      return undefined;
    }
    const system =
      'You refine software engineering prompts for a coding agent. Given a vague request and a draft ' +
      'restructured prompt, return ONLY an improved prompt in markdown with sections: Task, Constraints, ' +
      'Relevant context, Acceptance criteria, Verification. Be concise and specific. Do not invent files or APIs.';
    const user = `Original request:\n${raw}\n\nDraft restructured prompt:\n${deterministic}\n\nReturn the improved prompt now.`;
    return invoker.invoke({ system, user });
  }

  private post(message: unknown): Thenable<boolean> {
    return this.panel.webview.postMessage(message);
  }

  private dispose(): void {
    PromptPanel.current = undefined;
    this.panel.dispose();
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
  }
}

function html(nonce: string, csp: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="${csp}" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<style nonce="${nonce}">${brandCssVars()}${brandLightSurfaceVars()}${brandComponentStyles()}${styles()}</style>
<title>Optimize Prompt</title>
</head>
<body>
  <div class="sh-brand"><span class="dot"></span>Token Optimizer</div>
  <div class="sh-bar"></div>
  <h1>Optimize Prompt</h1>
  <p class="muted small">Rewrite a vague request into a focused engineering prompt, then copy it into Copilot Chat.
  Token/clarity figures are estimates; VS Code extensions can't intercept Copilot Chat or read real billing.</p>

  <label class="lbl" for="raw">Your prompt</label>
  <textarea id="raw" rows="5" placeholder="e.g. the login is broken, fix it"></textarea>

  <div class="row">
    <button class="sh" id="go">Optimize prompt</button>
    <label class="check"><input type="checkbox" id="refine" /> Refine with Copilot model (uses quota)</label>
  </div>

  <div id="impact" class="impact" hidden></div>

  <label class="lbl" for="out" id="outLbl" hidden>Optimized prompt</label>
  <textarea id="out" rows="14" hidden readonly></textarea>
  <div class="row" id="outActions" hidden>
    <button class="sh-accent" id="copy">Copy for Copilot Chat</button>
  </div>

  <script nonce="${nonce}">${script()}</script>
</body>
</html>`;
}

function styles(): string {
  return `
  body { font-family: var(--vscode-font-family, "Segoe UI", system-ui, sans-serif); color: var(--sh-text);
    background: var(--sh-surface-2); margin: 0; padding: 0 1.1rem 2rem; }
  .muted { color: var(--sh-muted); }
  .small { font-size: 0.8rem; }
  .lbl { display: block; font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--sh-muted);
    margin: 0.9rem 0 0.3rem; }
  textarea { width: 100%; box-sizing: border-box; font-family: var(--vscode-editor-font-family, monospace);
    font-size: 0.85rem; border: 1px solid var(--sh-border); border-radius: 8px; padding: 0.6rem 0.7rem;
    background: var(--sh-surface); color: var(--sh-text); resize: vertical; box-shadow: var(--sh-shadow); }
  .row { display: flex; align-items: center; gap: 0.8rem; margin-top: 0.6rem; flex-wrap: wrap; }
  .check { font-size: 0.8rem; color: var(--sh-muted); }
  .impact { display: flex; flex-wrap: wrap; gap: 0.6rem; margin-top: 1rem; }
  .pill { background: var(--sh-surface); border: 1px solid var(--sh-border); border-radius: 10px; padding: 0.5rem 0.8rem;
    box-shadow: var(--sh-shadow); }
  .pill b { color: var(--sh-petrol); font-size: 1.1rem; }
  .pill.win b { color: var(--sh-orange); }
  .pill .k { display: block; font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--sh-muted); }
  .err { color: var(--sh-magenta); font-size: 0.85rem; margin-top: 0.6rem; }
  .tag { display: inline-block; font-size: 0.66rem; text-transform: uppercase; letter-spacing: 0.05em;
    background: rgba(0,153,153,0.1); color: var(--sh-petrol); padding: 0.12rem 0.45rem; border-radius: 999px; }`;
}

function script(): string {
  return `
  const vscode = acquireVsCodeApi();
  const raw = document.getElementById('raw');
  const out = document.getElementById('out');
  const outLbl = document.getElementById('outLbl');
  const outActions = document.getElementById('outActions');
  const impact = document.getElementById('impact');
  document.getElementById('go').addEventListener('click', () => {
    vscode.postMessage({ type: 'optimize', raw: raw.value, refine: document.getElementById('refine').checked });
  });
  document.getElementById('copy').addEventListener('click', () => {
    vscode.postMessage({ type: 'copy', text: out.value });
  });
  window.addEventListener('message', (e) => {
    const m = e.data;
    if (m.type !== 'result') return;
    if (m.error) { impact.hidden = false; impact.innerHTML = '<span class="err">' + m.error + '</span>'; return; }
    out.value = m.formatted;
    out.hidden = false; outLbl.hidden = false; outActions.hidden = false;
    const c = m.comparison;
    const saved = c.estimatedTokensSaved;
    impact.hidden = false;
    impact.innerHTML =
      pill('Task', m.taskType + (m.refined ? ' · model-refined' : '')) +
      pill('Clarity', c.originalClarity + ' → ' + c.restructuredClarity) +
      pill('Prompt tokens', c.originalTokens + ' → ' + c.restructuredTokens) +
      pill('Round-trips saved (est.)', String(c.estimatedRoundTripsSaved)) +
      pill('Net tokens saved (est.)', (saved >= 0 ? '+' : '') + saved, saved > 0);
  });
  function pill(k, v, win) {
    return '<div class="pill' + (win ? ' win' : '') + '"><span class="k">' + k + '</span><b>' + v + '</b></div>';
  }`;
}

function makeNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < 32; i++) {
    out += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return out;
}
