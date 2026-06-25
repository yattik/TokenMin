/**
 * Pure HTML rendering for the unified Token Optimizer panel.
 *
 * Two outer tabs: "Overview" (status + actions) and "Knowledge Graph"
 * (the full graph visualization + search). Feature toggles are intentionally
 * absent here — they live in VS Code Settings (`tokenmin.features.*`).
 *
 * Kept free of `vscode` so the markup is unit-testable.
 * Light-first Siemens Healthineers styling.
 */
import { CacheStats } from '../knowledgeGraph/queryCache';
import { GraphViewModel, ImpactReport } from '../knowledgeGraph/types';
import { renderGraphSection, graphSectionStyles, graphSectionScriptBody } from '../knowledgeGraph/graphHtml';
import { brandCssVars, brandComponentStyles, brandLightSurfaceVars } from '../util/theme';

export interface DashboardData {
  cache: CacheStats;
  runtimeInstalled: boolean;
  runtimeSource?: string;
  projectName?: string;
  mcpConfigured: boolean;
  agentsConfigured: boolean;
  model: GraphViewModel;
  impact?: ImpactReport;
  busy: boolean;
}

export interface DashboardRenderOptions {
  nonce: string;
  cspSource: string;
}

export function renderDashboardHtml(data: DashboardData, opts: DashboardRenderOptions): string {
  const csp =
    `default-src 'none'; style-src ${opts.cspSource} 'nonce-${opts.nonce}'; ` +
    `script-src 'nonce-${opts.nonce}';`;

  const graphSection = renderGraphSection(data.model, {
    impact: data.impact,
    busy: data.busy,
    runtimeSource: data.runtimeSource,
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="${csp}" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<style nonce="${opts.nonce}">${brandCssVars()}${brandLightSurfaceVars()}${brandComponentStyles()}${graphSectionStyles()}${dashboardStyles()}</style>
<title>Token Optimizer</title>
</head>
<body>
  <div class="sh-brand"><span class="dot"></span>Siemens Healthineers · TokenMin</div>
  <div class="sh-bar"></div>

  <nav class="outer-tabs" role="tablist">
    <button class="outer-tab active" data-outer="overview">Overview</button>
    <button class="outer-tab" data-outer="graph">Knowledge Graph${data.busy ? ' <span class="spin">working\u2026</span>' : (data.model.indexed ? ' <span class="indexed-dot"></span>' : '')}</button>
  </nav>

  <!-- Overview tab -->
  <div class="outer-panel" data-outer-panel="overview">
    <div class="status-bar">
      <span class="rt ${data.runtimeInstalled ? 'ok' : 'off'}">
        <span class="dot-sm"></span>
        ${data.runtimeInstalled ? 'Runtime ready' : 'Runtime not installed \u2014 click Index to set up'}
        ${data.projectName ? ` \u00b7 <b>${escapeHtml(data.projectName)}</b>` : ''}
      </span>
    </div>

    ${mcpChecklist(data)}

    <h2>Actions</h2>
    <div class="action-grid">
      <button class="act-primary" data-action="index">
        <span class="act-icon">\u2b21</span>
        <span class="act-body">
          <b>${data.model.indexed ? 'Re-index Repo' : 'Index Repo into Graph'}</b>
          <span class="act-sub">Build the local knowledge graph for Copilot</span>
        </span>
      </button>
      <button class="act-primary" data-command="tokenmin.configureCopilotMcp">
        <span class="act-icon">\u2699</span>
        <span class="act-body">
          <b>Configure Copilot to Use Graph</b>
          <span class="act-sub">Write .vscode/mcp.json + agent files</span>
        </span>
      </button>
      <button class="act-accent" data-command="tokenmin.optimizePrompt">
        <span class="act-icon">\u2736</span>
        <span class="act-body">
          <b>Optimize Prompt</b>
          <span class="act-sub">Restructure a vague request for Copilot</span>
        </span>
      </button>
      <button class="act-ghost" data-action="openSettings">
        <span class="act-icon">\u2630</span>
        <span class="act-body">
          <b>Feature settings</b>
          <span class="act-sub">Toggle features in VS Code Settings</span>
        </span>
      </button>
    </div>

    <div class="cache-row muted small">
      Query cache <span class="badge">estimates</span>:
      <b>${data.cache.hits}</b> hits \u00b7 <b>${data.cache.misses}</b> misses \u00b7 hit rate <b>${hitRate(data.cache)}</b>
      \u2014 repeated queries cost ~0 new tokens.
    </div>
  </div>

  <!-- Knowledge Graph tab -->
  <div class="outer-panel hidden" data-outer-panel="graph">
    ${graphSection}
  </div>

  <script nonce="${opts.nonce}">${outerScript()}${graphSectionScriptBody()}</script>
</body>
</html>`;
}

function mcpChecklist(data: DashboardData): string {
  const steps: Array<{ ok: boolean; label: string; tip?: string }> = [
    {
      ok: data.runtimeInstalled,
      label: 'Graph runtime installed',
      tip: 'Click "Index Repo into Graph" \u2014 it installs the runtime automatically on first use.',
    },
    {
      ok: data.mcpConfigured,
      label: '.vscode/mcp.json configured',
      tip: 'Click "Configure Copilot to Use Graph" to write the MCP server entry.',
    },
    {
      ok: data.agentsConfigured,
      label: '.github graph agents written',
      tip: 'Click "Configure Copilot to Use Graph" to write the agent files.',
    },
  ];

  const rows = steps
    .map(
      (s) =>
        `<div class="step ${s.ok ? 'done' : 'todo'}">
          <span class="step-dot"></span>
          <span>${s.label}${!s.ok && s.tip ? ` \u2014 <em>${escapeHtml(s.tip)}</em>` : ''}</span>
        </div>`,
    )
    .join('');

  const allDone = steps.every((s) => s.ok);
  const tip = allDone
    ? `<div class="tip">
        <b>MCP server running but no tool calls?</b><br>
        Start the <code>codebase-memory</code> server in the VS Code MCP panel (click \u25b6 if it shows "stopped"),
        then select the <code>graph-plan</code> or <code>graph-implement</code> <b>agent</b>
        in the Copilot Chat toolbar. Regular chat doesn\u2019t auto-invoke MCP tools even when the server is running.
      </div>`
    : '';

  return `<div class="mcp-block"><div class="mcp-head">Copilot setup</div>${rows}${tip}</div>`;
}

function hitRate(cache: CacheStats): string {
  const total = cache.hits + cache.misses;
  return total === 0 ? '\u2014' : `${Math.round((cache.hits / total) * 100)}%`;
}

function dashboardStyles(): string {
  return `
  body { font-family: var(--vscode-font-family,"Segoe UI",system-ui,sans-serif);
    color: var(--sh-text); background: var(--sh-surface-2); margin: 0; padding: 0 1rem 2rem; }
  .sh-brand { font-size: 0.68rem; }
  h2 { font-size: 0.73rem; text-transform: uppercase; letter-spacing: 0.07em; color: var(--sh-muted);
    margin: 1.1rem 0 0.45rem; }
  .muted { color: var(--sh-muted); }
  .small { font-size: 0.78rem; }
  em { color: var(--sh-muted); font-style: normal; }
  .badge { font-size: 0.6rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--sh-violet);
    background: rgba(100,25,70,0.08); padding: 0.08rem 0.32rem; border-radius: 999px; vertical-align: middle; }
  .spin { font-size: 0.65rem; color: var(--sh-muted); font-weight: 400; }
  .outer-tabs { display: flex; gap: 0; margin: 0.5rem 0 0; border-bottom: 2px solid var(--sh-petrol); }
  .outer-tab { background: transparent; color: var(--sh-muted); border: none; padding: 0.42rem 0.9rem;
    border-radius: 5px 5px 0 0; cursor: pointer; font-size: 0.88rem; font-family: inherit; }
  .outer-tab:hover { color: var(--sh-petrol); }
  .outer-tab.active { background: var(--sh-petrol); color: #fff; }
  .outer-panel { padding-top: 0.7rem; }
  .outer-panel.hidden { display: none; }
  .indexed-dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%;
    background: var(--sh-petrol); margin-left: 0.25rem; vertical-align: middle; }
  .status-bar { font-size: 0.8rem; color: var(--sh-muted); }
  .rt .dot-sm { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 0.3rem; }
  .rt.ok .dot-sm { background: var(--sh-petrol); }
  .rt.off .dot-sm { background: var(--sh-orange); }
  .mcp-block { background: var(--sh-surface); border: 1px solid var(--sh-border); border-radius: 8px;
    padding: 0.6rem 0.8rem; margin: 0.7rem 0 0; box-shadow: var(--sh-shadow); font-size: 0.82rem; }
  .mcp-head { font-size: 0.67rem; text-transform: uppercase; letter-spacing: 0.07em;
    color: var(--sh-muted); margin-bottom: 0.38rem; }
  .step { display: flex; align-items: baseline; gap: 0.38rem; margin: 0.16rem 0; }
  .step-dot { width: 7px; height: 7px; border-radius: 50%; flex: 0 0 auto; margin-top: 3px; }
  .step.done .step-dot { background: var(--sh-petrol); }
  .step.todo .step-dot { background: transparent; border: 1.5px solid #b0bec5; }
  .step.done { color: var(--sh-text); }
  .step.todo { color: var(--sh-muted); }
  .tip { margin-top: 0.5rem; background: rgba(0,153,153,0.07); border-left: 3px solid var(--sh-petrol);
    border-radius: 0 5px 5px 0; padding: 0.42rem 0.6rem; font-size: 0.79rem; line-height: 1.55; }
  .tip code { background: rgba(0,153,153,0.11); padding: 0.04rem 0.26rem; border-radius: 3px; font-size: 0.78rem; }
  .action-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.45rem; margin: 0 0 0.7rem; }
  .action-grid button { display: flex; align-items: center; gap: 0.55rem; padding: 0.6rem 0.75rem;
    border-radius: 8px; text-align: left; cursor: pointer; box-shadow: var(--sh-shadow); border: none;
    font-family: inherit; }
  .act-primary { background: var(--sh-petrol); color: #fff; }
  .act-primary:hover { background: var(--sh-petrol-light); }
  .act-accent { background: var(--sh-orange); color: #fff; }
  .act-accent:hover { filter: brightness(1.07); }
  .act-ghost { background: var(--sh-surface); color: var(--sh-petrol);
    border: 1.5px solid var(--sh-petrol) !important; }
  .act-ghost:hover { background: var(--sh-surface-3); }
  .act-icon { font-size: 1.05rem; flex: 0 0 auto; opacity: 0.82; }
  .act-body { display: flex; flex-direction: column; gap: 0.03rem; }
  .act-body b { font-size: 0.84rem; font-weight: 600; }
  .act-sub { font-size: 0.71rem; opacity: 0.76; }
  .cache-row { margin-top: 0.25rem; line-height: 1.8; }
  /* graph section */
  .gr-top { display: flex; justify-content: space-between; align-items: flex-end; gap: 1rem;
    flex-wrap: wrap; margin-bottom: 0.5rem; }
  .gr-title { font-size: 1rem; font-weight: 700; color: var(--sh-petrol); }
  .gr-actions { display: flex; gap: 0.4rem; flex-wrap: wrap; }
  .notice { background: rgba(236,102,2,0.08); border: 1px solid var(--sh-orange);
    border-radius: 6px; padding: 0.4rem 0.6rem; margin: 0.4rem 0; font-size: 0.85rem; }`;
}

function outerScript(): string {
  return `
  const vscode = acquireVsCodeApi();
  for (const tab of document.querySelectorAll('.outer-tab')) {
    tab.addEventListener('click', () => {
      for (const t of document.querySelectorAll('.outer-tab')) t.classList.remove('active');
      tab.classList.add('active');
      const name = tab.dataset.outer;
      for (const p of document.querySelectorAll('.outer-panel')) {
        p.classList.toggle('hidden', p.dataset.outerPanel !== name);
      }
      if (name === 'graph') layout();
    });
  }
  for (const btn of document.querySelectorAll('[data-command]')) {
    btn.addEventListener('click', () =>
      vscode.postMessage({ type: 'command', command: btn.getAttribute('data-command') }));
  }
  for (const btn of document.querySelectorAll('[data-action]')) {
    btn.addEventListener('click', () => {
      const a = btn.dataset.action;
      if (a === 'openSettings') { vscode.postMessage({ type: 'openSettings' }); return; }
      if (a === 'index') { vscode.postMessage({ type: 'index' }); return; }
      if (a === 'impact') { vscode.postMessage({ type: 'impact' }); return; }
      if (a === 'openUi') { vscode.postMessage({ type: 'openUi' }); return; }
      if (a === 'search' || a === 'trace') {
        const q = (document.getElementById('q') || {}).value || '';
        vscode.postMessage({ type: a, query: q }); return;
      }
    });
  }
  document.body.addEventListener('click', (e) => {
    const el = e.target.closest('[data-open]');
    if (el) { e.preventDefault(); vscode.postMessage({ type: 'openFile', file: el.dataset.open }); }
  });
  window.addEventListener('message', (event) => {
    const msg = event.data || {};
    if (msg.type === 'results') {
      const box = document.getElementById('results');
      if (box) { box.innerHTML = msg.html || '<span class="muted">No results.</span>'; }
    }
  });`;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
