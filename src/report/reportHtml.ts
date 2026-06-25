/**
 * Pure HTML rendering for the efficiency report webview. Kept free of `vscode`
 * (the panel passes in the nonce and CSP source) so the markup is testable.
 */
import { Scorecard } from './scorecard';
import { UsageEstimate } from './scorecard';
import { ScoreCriterion } from '../recommendations/types';
import { brandComponentStyles, brandCssVars } from '../util/theme';

export interface RenderOptions {
  nonce: string;
  cspSource: string;
  usage?: UsageEstimate;
}

export function renderReportHtml(card: Scorecard, opts: RenderOptions): string {
  const csp =
    `default-src 'none'; style-src ${opts.cspSource} 'nonce-${opts.nonce}'; ` +
    `script-src 'nonce-${opts.nonce}';`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="${csp}" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<style nonce="${opts.nonce}">${brandCssVars()}${brandComponentStyles()}${styles()}</style>
<title>Token Efficiency Report</title>
</head>
<body>
  <div class="sh-brand"><span class="dot"></span>Token Optimizer</div>
  <div class="sh-bar"></div>
  <h1>Copilot Token-Efficiency Report</h1>

  <section class="score-row">
    ${scoreCard('Now', card.scoreBefore)}
    <div class="arrow">→</div>
    ${scoreCard('After apply', card.scoreAfter, card.scoreDelta)}
  </section>

  <h2>Criteria</h2>
  <table class="criteria">
    <thead><tr><th>Lever</th><th>Weight</th><th>Now</th><th>After</th></tr></thead>
    <tbody>
      ${card.criteria.map((c, i) => criterionRow(c, card.projectedCriteria[i])).join('\n')}
    </tbody>
  </table>

  <h2>Estimated context footprint</h2>
  <ul class="metrics">
    <li>Source files considered (after pruning): <b>${card.footprint.consideredFiles}</b></li>
    <li>Noise directories to exclude: <b>${card.footprint.noiseDirsExcluded}</b></li>
    <li>Directories already excluded by .gitignore: <b>${card.footprint.gitignoredDirs}</b></li>
    <li>Instruction tokens loaded per request (est.): <b>${card.footprint.instructionTokens}</b></li>
    <li>Agent tools: <b>${card.footprint.leanToolCount}</b> lean vs ~<b>${card.footprint.typicalToolCount}</b> typical</li>
  </ul>

  <h2>Instruction sizes</h2>
  ${instructionTable(card)}

  <h2>Semantic index</h2>
  <p>${indexDescription(card.indexSource)}</p>

  <h2>Deep links</h2>
  <p class="muted">Some links depend on your installed Copilot version; if a link does nothing, the
  command is not available in this build.</p>
  <div class="links">
    <button data-deeplink="buildIndex">Build semantic index</button>
    <button data-deeplink="debugLogs">Agent debug logs (Summary)</button>
    <button data-deeplink="cacheExplorer">Cache Explorer</button>
    <button data-deeplink="costControl">Per-session cost control</button>
  </div>

  <h2>Measure real usage (optional)</h2>
  <p class="muted">Precise live token metering isn't exposed to extensions. Import an exported chat
  JSON for a proxy estimate of message volume and tokens.</p>
  <div class="links">
    <button data-action="importChat">Import chat export…</button>
  </div>
  ${usageSection(opts.usage)}

  <script nonce="${opts.nonce}">${script()}</script>
</body>
</html>`;
}

function scoreCard(label: string, value: number, delta?: number): string {
  const deltaHtml =
    delta !== undefined && delta !== 0
      ? `<span class="delta ${delta > 0 ? 'up' : 'down'}">${delta > 0 ? '+' : ''}${delta}</span>`
      : '';
  return `<div class="score"><div class="score-label">${escapeHtml(label)}</div>
    <div class="score-value">${value}<span class="score-max">/100</span> ${deltaHtml}</div></div>`;
}

function criterionRow(now: ScoreCriterion, after?: ScoreCriterion): string {
  const afterMark = after?.satisfied ? '✓' : '✗';
  return `<tr>
    <td>${escapeHtml(now.label)}<div class="muted small">${escapeHtml(now.detail)}</div></td>
    <td>${now.weight}</td>
    <td class="${now.satisfied ? 'ok' : 'no'}">${now.satisfied ? '✓' : '✗'}</td>
    <td class="${after?.satisfied ? 'ok' : 'no'}">${afterMark}</td>
  </tr>`;
}

function instructionTable(card: Scorecard): string {
  if (card.instructionFiles.length === 0) {
    return '<p class="muted">No instruction files generated in this run.</p>';
  }
  const rows = card.instructionFiles
    .map(
      (f) => `<tr><td>${escapeHtml(f.path)}</td><td>${f.chars}</td><td>${f.tokens}</td>
      <td class="${f.warn ? 'no' : 'ok'}">${f.warn ? 'large' : 'lean'}</td></tr>`,
    )
    .join('\n');
  return `<table class="criteria"><thead><tr><th>File</th><th>Chars</th><th>Tokens (est.)</th><th>Size</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function usageSection(usage?: UsageEstimate): string {
  if (!usage) {
    return '<div id="usage"></div>';
  }
  return `<div id="usage"><ul class="metrics">
    <li>Messages: <b>${usage.messages}</b></li>
    <li>Estimated tokens: <b>${usage.estimatedTokens}</b></li>
    <li>Largest message (tokens): <b>${usage.largestMessageTokens}</b></li>
  </ul></div>`;
}

function indexDescription(source: Scorecard['indexSource']): string {
  switch (source) {
    case 'github-remote':
      return 'A GitHub remote was found — Copilot can use a remote semantic index. Keep it pushed and fresh.';
    case 'local':
      return 'No GitHub remote found — Copilot relies on a local semantic index. Build it for accurate retrieval.';
    default:
      return 'No git remote detected — initialize/push for a remote index, or build the local index.';
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function styles(): string {
  return `
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground);
      padding: 0 1.5rem 2rem; line-height: 1.5; }
    h1 { font-size: 1.3rem; } h2 { font-size: 1.05rem; margin-top: 1.6rem; }
    .muted { color: var(--vscode-descriptionForeground); }
    .small { font-size: 0.85em; }
    .score-row { display: flex; align-items: center; gap: 1rem; margin: 1rem 0; }
    .score { background: var(--vscode-editorWidget-background);
      border: 1px solid var(--vscode-widget-border); border-radius: 6px; padding: 0.8rem 1.2rem; }
    .score-label { font-size: 0.8rem; color: var(--vscode-descriptionForeground); }
    .score-value { font-size: 1.8rem; font-weight: 600; }
    .score-max { font-size: 0.9rem; color: var(--vscode-descriptionForeground); }
    .arrow { font-size: 1.5rem; color: var(--vscode-descriptionForeground); }
    .delta.up { color: var(--vscode-testing-iconPassed, #3fb950); font-size: 1rem; }
    .delta.down { color: var(--vscode-testing-iconFailed, #f85149); font-size: 1rem; }
    table.criteria { border-collapse: collapse; width: 100%; margin-top: 0.5rem; }
    table.criteria th, table.criteria td { border: 1px solid var(--vscode-widget-border);
      padding: 0.4rem 0.6rem; text-align: left; vertical-align: top; }
    .ok { color: var(--vscode-testing-iconPassed, #3fb950); }
    .no { color: var(--vscode-testing-iconFailed, #f85149); }
    ul.metrics { margin: 0.4rem 0; }
    .links { display: flex; flex-wrap: wrap; gap: 0.5rem; }
    button { background: var(--vscode-button-background); color: var(--vscode-button-foreground);
      border: none; padding: 0.45rem 0.8rem; border-radius: 4px; cursor: pointer; }
    button:hover { background: var(--vscode-button-hoverBackground); }
  `;
}

function script(): string {
  return `
    const vscode = acquireVsCodeApi();
    for (const btn of document.querySelectorAll('[data-deeplink]')) {
      btn.addEventListener('click', () => vscode.postMessage({ type: 'deeplink', id: btn.dataset.deeplink }));
    }
    for (const btn of document.querySelectorAll('[data-action="importChat"]')) {
      btn.addEventListener('click', () => vscode.postMessage({ type: 'importChat' }));
    }
  `;
}
