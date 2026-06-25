/**
 * Pure HTML rendering for the unified Token Optimizer panel.
 *
 * A single "Overview" tab (status + actions). The "Knowledge Graph" entry is a
 * direct shortcut that opens the codebase-memory 3D UI instead of an in-panel
 * graph. Feature toggles live in VS Code Settings (`tokenmin.features.*`).
 *
 * Kept free of `vscode` so the markup is unit-testable.
 * Light-first Token Optimizer styling.
 */
import { CacheStats } from '../knowledgeGraph/queryCache';
import { GraphProjectInfo, GraphViewModel, ImpactReport } from '../knowledgeGraph/types';
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
  /** All knowledge-graph instances the MCP server tracks (`list_projects`). */
  projects: GraphProjectInfo[];
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

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="${csp}" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<style nonce="${opts.nonce}">${brandCssVars()}${brandLightSurfaceVars()}${brandComponentStyles()}${dashboardStyles()}</style>
<title>Token Optimizer</title>
</head>
<body>
  <div class="sh-brand"><span class="dot"></span>Token Optimizer</div>
  <div class="sh-bar"></div>

  <nav class="outer-tabs" role="tablist">
    <button class="outer-tab active" data-outer="overview">Overview</button>
    <button class="outer-tab kg-open" data-action="openUi" title="Open the codebase-memory 3D graph UI">Knowledge Graph 3D \u2197${data.busy ? ' <span class="spin">working\u2026</span>' : (data.model.indexed ? ' <span class="indexed-dot"></span>' : '')}</button>
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
      <button class="act-accent" data-command="tokenmin.trackEnterpriseCopilotUsage">
        <span class="act-icon">\u25c8</span>
        <span class="act-body">
          <b>Track Enterprise Usage</b>
          <span class="act-sub">Fetch official GitHub Copilot metrics reports</span>
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

    ${renderProjects(data.projects)}

    <div class="cache-row muted small">
      Query cache <span class="badge">estimates</span>:
      <b>${data.cache.hits}</b> hits \u00b7 <b>${data.cache.misses}</b> misses \u00b7 hit rate <b>${hitRate(data.cache)}</b>
      \u2014 repeated queries cost ~0 new tokens. Enterprise reports are official aggregates; Copilot billing is not exposed to extensions.
    </div>
  </div>

  <script nonce="${opts.nonce}">${outerScript()}</script>
</body>
</html>`;
}

function hitRate(cache: CacheStats): string {
  const total = cache.hits + cache.misses;
  return total === 0 ? '\u2014' : `${Math.round((cache.hits / total) * 100)}%`;
}

/** The list of every knowledge-graph instance the MCP server tracks. */
function renderProjects(projects: GraphProjectInfo[]): string {
  if (projects.length === 0) {
    return `
    <h2>Knowledge graphs</h2>
    <div class="kg-empty muted small">
      No knowledge graphs yet. Index a repository to create one \u2014 every indexed repo
      becomes a graph the <code>codebase-memory</code> MCP server can query.
    </div>`;
  }
  const rows = projects
    .map((p) => {
      const meta = [
        p.symbols !== undefined ? `${p.symbols.toLocaleString()} symbols` : undefined,
        p.files !== undefined ? `${p.files.toLocaleString()} files` : undefined,
        p.indexedAt ? `indexed ${escapeHtml(p.indexedAt)}` : undefined,
      ]
        .filter(Boolean)
        .join(' \u00b7 ');
      const path = p.rootPath ? escapeHtml(p.rootPath) : '';
      const open = p.rootPath ? ` data-open-project="${escapeHtml(p.rootPath)}"` : '';
      return `
      <li class="kg-item${p.current ? ' current' : ''}"${open} title="${path}">
        <span class="kg-name">${escapeHtml(p.name)}${p.current ? ' <span class="kg-here">this repo</span>' : ''}</span>
        ${meta ? `<span class="kg-meta">${meta}</span>` : ''}
        ${path ? `<span class="kg-path">${path}</span>` : ''}
      </li>`;
    })
    .join('');
  return `
    <h2>Knowledge graphs <span class="badge">${projects.length}</span></h2>
    <ul class="kg-list">${rows}</ul>`;
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
  .outer-tab.kg-open { color: var(--sh-petrol); }
  .outer-tab.kg-open:hover { background: var(--sh-surface-3); }
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
  .kg-empty { background: var(--sh-surface); border: 1px solid var(--sh-border); border-radius: 8px;
    padding: 0.55rem 0.75rem; line-height: 1.5; }
  .kg-empty code { background: rgba(0,153,153,0.11); padding: 0.04rem 0.26rem; border-radius: 3px; }
  .kg-list { list-style: none; margin: 0 0 0.7rem; padding: 0; display: flex; flex-direction: column; gap: 0.35rem; }
  .kg-item { display: flex; flex-direction: column; gap: 0.12rem; background: var(--sh-surface);
    border: 1px solid var(--sh-border); border-left: 3px solid transparent; border-radius: 8px;
    padding: 0.45rem 0.7rem; box-shadow: var(--sh-shadow); cursor: pointer; }
  .kg-item:hover { background: var(--sh-surface-3); }
  .kg-item.current { border-left-color: var(--sh-petrol); }
  .kg-name { font-size: 0.85rem; font-weight: 600; color: var(--sh-text); }
  .kg-here { font-size: 0.6rem; text-transform: uppercase; letter-spacing: 0.05em; color: #fff;
    background: var(--sh-petrol); padding: 0.05rem 0.34rem; border-radius: 999px; vertical-align: middle; }
  .kg-meta { font-size: 0.72rem; color: var(--sh-muted); }
  .kg-path { font-size: 0.68rem; color: var(--sh-muted); font-family: var(--vscode-editor-font-family, monospace);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }`;
}

function outerScript(): string {
  return `
  const vscode = acquireVsCodeApi();
  for (const tab of document.querySelectorAll('.outer-tab[data-outer]')) {
    tab.addEventListener('click', () => {
      for (const t of document.querySelectorAll('.outer-tab[data-outer]')) t.classList.remove('active');
      tab.classList.add('active');
      const name = tab.dataset.outer;
      for (const p of document.querySelectorAll('.outer-panel')) {
        p.classList.toggle('hidden', p.dataset.outerPanel !== name);
      }
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
      if (a === 'openUi') { vscode.postMessage({ type: 'openUi' }); return; }
    });
  }
  document.body.addEventListener('click', (e) => {
    const el = e.target.closest('[data-open]');
    if (el) { e.preventDefault(); vscode.postMessage({ type: 'openFile', file: el.dataset.open }); }
    const proj = e.target.closest('[data-open-project]');
    if (proj) { e.preventDefault(); vscode.postMessage({ type: 'openProject', file: proj.dataset.openProject }); }
  });`;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
