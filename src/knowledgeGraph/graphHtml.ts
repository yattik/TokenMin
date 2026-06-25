/**
 * Pure HTML rendering for the Knowledge Graph webview (visualization + analysis
 * panel). Kept free of `vscode` (the panel injects the nonce + CSP source) so
 * the markup and the embedded view-model serialization are unit-testable.
 *
 * The graph is drawn with dependency-free inline SVG + vanilla JS (a simple
 * deterministic layout), so it is CSP-safe under a strict nonce policy.
 */
import { GraphViewModel, ImpactReport } from './types';
import { brandComponentStyles, brandCssVars } from '../util/theme';

export interface GraphRenderOptions {
  nonce: string;
  cspSource: string;
  /** Latest impact report to show in the Analysis panel, if any. */
  impact?: ImpactReport;
  /** True while a background CLI action is running (shows a spinner hint). */
  busy?: boolean;
  /** How the runtime was located, for the footer. */
  runtimeSource?: string;
}

export function renderGraphHtml(model: GraphViewModel, opts: GraphRenderOptions): string {
  const csp =
    `default-src 'none'; style-src ${opts.cspSource} 'nonce-${opts.nonce}'; ` +
    `script-src 'nonce-${opts.nonce}'; img-src ${opts.cspSource} data:;`;

  // Serialize the model for the client layout script. Embedded as JSON in a
  // script tag; escape '<' to avoid breaking out of the element.
  const payload = JSON.stringify({ model, impact: opts.impact ?? null }).replace(/</g, '\\u003c');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="${csp}" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<style nonce="${opts.nonce}">${brandCssVars()}${brandComponentStyles()}${styles()}</style>
<title>Knowledge Graph</title>
</head>
<body>
  <div class="sh-brand"><span class="dot"></span>Token Optimizer</div>
  <div class="sh-bar"></div>
  <header class="top">
    <div>
      <h1>Knowledge Graph${opts.busy ? ' <span class="spin">working…</span>' : ''}</h1>
      <div class="muted small">${escapeHtml(model.projectName)} ·
        ${model.indexed ? 'indexed' : 'not indexed'}${
          model.summary.indexedAt ? ` · ${escapeHtml(model.summary.indexedAt)}` : ''
        }</div>
    </div>
    <div class="actions">
      <button class="sh" data-action="reindex">${model.indexed ? 'Re-index' : 'Index repo'}</button>
      <button class="sh" data-action="impact">Diff impact</button>
      <button class="sh-accent" data-action="openUi">Open 3D UI</button>
    </div>
  </header>

  ${model.notice ? `<div class="notice">${escapeHtml(model.notice)}</div>` : ''}

  <section class="cards">
    ${card('Nodes', model.summary.nodes)}
    ${card('Edges', model.summary.edges)}
    ${card('Packages', model.summary.packages)}
    ${card('Functions', model.summary.functions)}
    ${card('Classes', model.summary.classes)}
    ${card('Routes', model.summary.routes)}
  </section>

  ${model.summary.languages.length ? `<div class="langs">${model.summary.languages
    .slice(0, 16)
    .map((l) => `<span class="chip">${escapeHtml(l)}</span>`)
    .join('')}</div>` : ''}

  <nav class="tabs" role="tablist">
    <button class="tab active" data-tab="graph">Graph</button>
    <button class="tab" data-tab="hotspots">Hotspots</button>
    <button class="tab" data-tab="routes">Routes</button>
    <button class="tab" data-tab="impact">Impact</button>
    <button class="tab" data-tab="search">Search</button>
  </nav>

  <section class="panel" data-panel="graph">
    <div class="toolbar muted small">Click a node to reveal its file. Drag to pan.</div>
    <div id="graph"><svg id="svg" role="img" aria-label="Codebase graph"></svg></div>
  </section>

  <section class="panel hidden" data-panel="hotspots">
    ${hotspotTable(model)}
  </section>

  <section class="panel hidden" data-panel="routes">
    ${routeTable(model)}
  </section>

  <section class="panel hidden" data-panel="impact">
    ${impactSection(opts.impact)}
  </section>

  <section class="panel hidden" data-panel="search">
    <div class="search-row">
      <input id="q" type="text" placeholder="Symbol name or regex, e.g. .*Handler.*" />
      <button class="sh" data-action="search">search_graph</button>
      <button class="sh" data-action="trace">trace_path</button>
    </div>
    <div id="results" class="muted small">Run a query to see graph-backed results (far cheaper than file-by-file search).</div>
  </section>

  <footer class="muted small">
    Powered by an embedded codebase-memory-mcp runtime${
      opts.runtimeSource ? ` (${escapeHtml(opts.runtimeSource)})` : ''
    }. Estimated tokens only — Copilot billing is not exposed to extensions.
  </footer>

  <script type="application/json" id="data" nonce="${opts.nonce}">${payload}</script>
  <script nonce="${opts.nonce}">${script()}</script>
</body>
</html>`;
}

// ── Exported fragments (used by the unified dashboard panel) ────────────────

/**
 * The inner HTML of the Knowledge Graph section — no outer `<html>`/`<head>`/`<body>`.
 * The `nonce` attribute is omitted from the embedded `<script type="application/json">`
 * because the parent document's script nonce already covers the section.
 */
export function renderGraphSection(
  model: GraphViewModel,
  opts: { impact?: ImpactReport; busy?: boolean; runtimeSource?: string },
): string {
  const payload = JSON.stringify({ model, impact: opts.impact ?? null }).replace(/</g, '\\u003c');
  return `
  <div class="gr-top">
    <div>
      <div class="gr-title">Knowledge Graph${opts.busy ? ' <span class="spin">working…</span>' : ''}</div>
      <div class="muted small">${escapeHtml(model.projectName)} ·
        ${model.indexed ? 'indexed' : 'not indexed'}${
          model.summary.indexedAt ? ` · ${escapeHtml(model.summary.indexedAt)}` : ''
        }</div>
    </div>
    <div class="gr-actions">
      <button class="sh" data-action="index">${model.indexed ? 'Re-index' : 'Index repo'}</button>
      <button class="sh" data-action="impact">Diff impact</button>
      <button class="sh-accent" data-action="openUi">Open 3D UI</button>
    </div>
  </div>

  ${model.notice ? `<div class="notice">${escapeHtml(model.notice)}</div>` : ''}

  <section class="cards">
    ${card('Nodes', model.summary.nodes)}
    ${card('Edges', model.summary.edges)}
    ${card('Packages', model.summary.packages)}
    ${card('Functions', model.summary.functions)}
    ${card('Classes', model.summary.classes)}
    ${card('Routes', model.summary.routes)}
  </section>

  ${model.summary.languages.length ? `<div class="langs">${model.summary.languages
    .slice(0, 16)
    .map((l) => `<span class="chip">${escapeHtml(l)}</span>`)
    .join('')}</div>` : ''}

  <nav class="tabs" role="tablist">
    <button class="tab active" data-tab="graph">Graph</button>
    <button class="tab" data-tab="hotspots">Hotspots</button>
    <button class="tab" data-tab="routes">Routes</button>
    <button class="tab" data-tab="impact">Impact</button>
    <button class="tab" data-tab="search">Search</button>
  </nav>

  <section class="panel" data-panel="graph">
    <div class="toolbar muted small">Click a node to reveal its file. Drag to pan.</div>
    <div id="graph"><svg id="svg" role="img" aria-label="Codebase graph"></svg></div>
  </section>

  <section class="panel hidden" data-panel="hotspots">
    ${hotspotTable(model)}
  </section>

  <section class="panel hidden" data-panel="routes">
    ${routeTable(model)}
  </section>

  <section class="panel hidden" data-panel="impact">
    ${impactSection(opts.impact)}
  </section>

  <section class="panel hidden" data-panel="search">
    <div class="search-row">
      <input id="q" type="text" placeholder="Symbol name or regex, e.g. .*Handler.*" />
      <button class="sh" data-action="search">search_graph</button>
      <button class="sh" data-action="trace">trace_path</button>
    </div>
    <div id="results" class="muted small">Run a query to see results with token comparison.</div>
  </section>

  <div class="muted small" style="margin-top:0.8rem">
    Estimated tokens only — Copilot billing is not exposed to extensions.
    ${opts.runtimeSource ? `Runtime: ${escapeHtml(opts.runtimeSource)}.` : ''}
  </div>

  <script type="application/json" id="data">${payload}</script>`;
}

/** CSS for the graph section (safe to embed in a parent `<style>` block). */
export function graphSectionStyles(): string {
  return styles();
}

/**
 * Full client JS for the standalone graph webview (acquires its own vscode API).
 * Do NOT embed this in a parent document that already calls acquireVsCodeApi() —
 * use {@link graphSectionScriptBody} instead.
 */
export function graphSectionScript(): string {
  return script();
}

/**
 * Layout/tab/pan JS body for embedding inside a parent document that already
 * declares `vscode` via `acquireVsCodeApi()` and handles `[data-action]`,
 * `[data-open]`, and `message` events. Calling this avoids the duplicate
 * `const vscode` SyntaxError that would otherwise kill the whole combined script.
 */
export function graphSectionScriptBody(): string {
  return `
    // Graph data (embedded JSON, not executable — CSP-safe)
    const _grData = JSON.parse((document.getElementById('data') || {textContent:'{}'}).textContent || '{}');
    const _grModel = _grData.model || { nodes: [], edges: [] };

    // Inner graph sub-tab switching (.tab / .panel — distinct from outer .outer-tab)
    for (const tab of document.querySelectorAll('.tab')) {
      tab.addEventListener('click', () => {
        for (const t of document.querySelectorAll('.tab')) t.classList.remove('active');
        tab.classList.add('active');
        const name = tab.dataset.tab;
        for (const p of document.querySelectorAll('.panel')) {
          p.classList.toggle('hidden', p.dataset.panel !== name);
        }
        if (name === 'graph') layout();
      });
    }

    function layout() {
      const svg = document.getElementById('svg');
      if (!svg) return;
      const W = svg.clientWidth || 800, H = svg.clientHeight || 460;
      const nodes = _grModel.nodes || [], edges = _grModel.edges || [];
      const cx = W / 2, cy = H / 2, R = Math.min(W, H) / 2 - 40;
      const pos = {};
      nodes.forEach((n, i) => {
        const ang = (2 * Math.PI * i) / Math.max(1, nodes.length);
        const ring = n.kind === 'hotspot' ? R * 0.55 : R;
        pos[n.id] = { x: cx + ring * Math.cos(ang), y: cy + ring * Math.sin(ang) };
      });
      const maxW = nodes.reduce((m, n) => Math.max(m, n.weight || 1), 1);
      let html = '';
      for (const e of edges) {
        const a = pos[e.from], b = pos[e.to];
        if (a && b) html += '<line class="edge" x1="' + a.x + '" y1="' + a.y + '" x2="' + b.x + '" y2="' + b.y + '"/>';
      }
      for (const n of nodes) {
        const p = pos[n.id]; if (!p) continue;
        const r = 4 + 10 * Math.sqrt((n.weight || 1) / maxW);
        const label = (n.label || '').length > 22 ? n.label.slice(0, 21) + '\u2026' : (n.label || '');
        html += '<g class="node ' + n.kind + '" data-id="' + encodeURIComponent(n.id) +
          (n.file ? '" data-open="' + n.file.replace(/"/g, '&quot;') : '') + '">' +
          '<circle cx="' + p.x + '" cy="' + p.y + '" r="' + r.toFixed(1) + '"><title>' +
          (n.label || '').replace(/</g, '&lt;') + '</title></circle>' +
          '<text x="' + (p.x + r + 2) + '" y="' + (p.y + 3) + '">' + label.replace(/</g, '&lt;') + '</text></g>';
      }
      svg.innerHTML = html;
    }

    (function pan() {
      const svg = document.getElementById('svg');
      if (!svg) return;
      let vb = null, dragging = false, sx = 0, sy = 0;
      function ensureVb() {
        if (!vb) vb = { x: 0, y: 0, w: svg.clientWidth || 800, h: svg.clientHeight || 460 };
        svg.setAttribute('viewBox', vb.x + ' ' + vb.y + ' ' + vb.w + ' ' + vb.h);
      }
      svg.addEventListener('mousedown', (e) => { dragging = true; sx = e.clientX; sy = e.clientY; ensureVb(); svg.classList.add('grabbing'); });
      window.addEventListener('mouseup', () => { dragging = false; svg.classList.remove('grabbing'); });
      window.addEventListener('mousemove', (e) => {
        if (!dragging || !vb) return;
        vb.x -= (e.clientX - sx); vb.y -= (e.clientY - sy); sx = e.clientX; sy = e.clientY;
        svg.setAttribute('viewBox', vb.x + ' ' + vb.y + ' ' + vb.w + ' ' + vb.h);
      });
    })();

    layout();
    window.addEventListener('resize', layout);
  `;
}


// ── fragments ───────────────────────────────────────────────────────────────

function card(label: string, value: number): string {
  return `<div class="metric"><div class="metric-value">${value}</div><div class="metric-label">${escapeHtml(
    label,
  )}</div></div>`;
}

function hotspotTable(model: GraphViewModel): string {
  if (model.hotspots.length === 0) {
    return '<p class="muted">No hotspots reported.</p>';
  }
  const rows = model.hotspots
    .map(
      (h) =>
        `<tr><td>${escapeHtml(h.name)}</td><td>${h.degree}</td><td>${
          h.file ? `<a href="#" data-open="${escapeAttr(h.file)}">${escapeHtml(h.file)}</a>` : '<span class="muted">—</span>'
        }</td></tr>`,
    )
    .join('\n');
  return `<table><thead><tr><th>Symbol</th><th>Degree</th><th>File</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function routeTable(model: GraphViewModel): string {
  if (model.routes.length === 0) {
    return '<p class="muted">No routes detected.</p>';
  }
  const rows = model.routes
    .map(
      (r) =>
        `<tr><td>${escapeHtml(r.method ?? '')}</td><td>${escapeHtml(r.path)}</td><td>${escapeHtml(
          r.handler ?? '',
        )}</td><td>${
          r.file ? `<a href="#" data-open="${escapeAttr(r.file)}">${escapeHtml(r.file)}</a>` : '<span class="muted">—</span>'
        }</td></tr>`,
    )
    .join('\n');
  return `<table><thead><tr><th>Method</th><th>Path</th><th>Handler</th><th>File</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function impactSection(impact?: ImpactReport): string {
  if (!impact) {
    return '<p class="muted">Click <b>Analyze diff impact</b> to map your uncommitted changes to affected symbols and blast radius.</p>';
  }
  if (impact.symbols.length === 0) {
    return `<p class="muted">${escapeHtml(impact.notice ?? 'No affected symbols.')}</p>`;
  }
  const rows = impact.symbols
    .map(
      (s) =>
        `<tr><td>${escapeHtml(s.name)}</td><td class="risk ${s.risk}">${s.risk}</td><td>${s.blastRadius}</td><td>${
          s.file ? `<a href="#" data-open="${escapeAttr(s.file)}">${escapeHtml(s.file)}</a>` : '<span class="muted">—</span>'
        }</td></tr>`,
    )
    .join('\n');
  return `<p class="muted small">${impact.changedFiles} changed file(s) · ${impact.symbols.length} affected symbol(s)</p>
    <table><thead><tr><th>Symbol</th><th>Risk</th><th>Blast radius</th><th>File</th></tr></thead><tbody>${rows}</tbody></table>`;
}

// ── styles + client script ──────────────────────────────────────────────────

function styles(): string {
  return `
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground);
      padding: 0 1.2rem 2rem; line-height: 1.5; }
    .top { display: flex; justify-content: space-between; align-items: flex-end; gap: 1rem;
      flex-wrap: wrap; margin-top: 0.8rem; }
    h1 { font-size: 1.25rem; margin: 0; }
    .spin { font-size: 0.7rem; color: var(--vscode-descriptionForeground); font-weight: 400; }
    .muted { color: var(--vscode-descriptionForeground); }
    .small { font-size: 0.85em; }
    .actions { display: flex; gap: 0.4rem; flex-wrap: wrap; }
    button { background: var(--vscode-button-background); color: var(--vscode-button-foreground);
      border: none; padding: 0.4rem 0.7rem; border-radius: 4px; cursor: pointer; font-size: 0.85rem; }
    button:hover { background: var(--vscode-button-hoverBackground); }
    .notice { background: var(--vscode-inputValidation-warningBackground, #3a2d00);
      border: 1px solid var(--vscode-inputValidation-warningBorder, #6b5400);
      padding: 0.5rem 0.7rem; border-radius: 4px; margin: 0.8rem 0; }
    .cards { display: flex; gap: 0.6rem; flex-wrap: wrap; margin: 1rem 0 0.4rem; }
    .metric { background: var(--vscode-editorWidget-background);
      border: 1px solid var(--vscode-widget-border); border-radius: 6px; padding: 0.6rem 0.9rem; min-width: 78px; }
    .metric-value { font-size: 1.5rem; font-weight: 600; }
    .metric-label { font-size: 0.72rem; color: var(--vscode-descriptionForeground); text-transform: uppercase; }
    .langs { margin: 0.4rem 0 0.2rem; display: flex; gap: 0.35rem; flex-wrap: wrap; }
    .chip { background: var(--sh-petrol); color: #fff;
      border-radius: 10px; padding: 0.1rem 0.55rem; font-size: 0.75rem; }
    .tabs { display: flex; gap: 0.3rem; margin: 1rem 0 0.6rem; border-bottom: 2px solid var(--sh-petrol); }
    .tab { background: transparent; color: var(--vscode-foreground); border-radius: 4px 4px 0 0; }
    .tab.active { background: var(--sh-petrol); color: #fff; border: 1px solid var(--sh-petrol); border-bottom: none; }
    .panel.hidden { display: none; }
    .toolbar { margin-bottom: 0.4rem; }
    #graph { border: 1px solid var(--vscode-widget-border); border-radius: 6px; overflow: hidden;
      background: var(--vscode-editor-background); }
    #svg { width: 100%; height: 460px; display: block; cursor: grab; }
    #svg.grabbing { cursor: grabbing; }
    .edge { stroke: var(--vscode-widget-border); stroke-opacity: 0.7; }
    .node circle { stroke: var(--vscode-editor-background); stroke-width: 1.5; cursor: pointer; }
    .node text { fill: var(--vscode-foreground); font-size: 10px; pointer-events: none; }
    .node.hotspot circle { fill: var(--sh-orange); }
    .node.package circle { fill: var(--sh-petrol); }
    .node.cluster circle { fill: var(--sh-magenta); }
    table { border-collapse: collapse; width: 100%; margin-top: 0.3rem; }
    th, td { border: 1px solid var(--vscode-widget-border); padding: 0.35rem 0.55rem; text-align: left; vertical-align: top; font-size: 0.85rem; }
    a { color: var(--vscode-textLink-foreground); text-decoration: none; }
    a:hover { text-decoration: underline; }
    .search-row { display: flex; gap: 0.4rem; margin-bottom: 0.6rem; }
    #q { flex: 1; background: var(--vscode-input-background); color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border, var(--vscode-widget-border)); border-radius: 4px; padding: 0.4rem 0.6rem; }
    .risk.high { color: var(--vscode-testing-iconFailed, #f85149); font-weight: 600; }
    .risk.medium { color: var(--vscode-charts-yellow, #d7a000); }
    .risk.low { color: var(--vscode-testing-iconPassed, #3fb950); }
    footer { margin-top: 1.4rem; border-top: 1px solid var(--vscode-widget-border); padding-top: 0.6rem; }
  `;
}

function script(): string {
  // Deterministic radial layout + minimal pan; no external libs (CSP-safe).
  return `
    const vscode = acquireVsCodeApi();
    const data = JSON.parse(document.getElementById('data').textContent || '{}');
    const model = data.model || { nodes: [], edges: [] };

    function post(type, payload) { vscode.postMessage(Object.assign({ type }, payload || {})); }

    // Tabs
    for (const tab of document.querySelectorAll('.tab')) {
      tab.addEventListener('click', () => {
        for (const t of document.querySelectorAll('.tab')) t.classList.remove('active');
        tab.classList.add('active');
        const name = tab.dataset.tab;
        for (const p of document.querySelectorAll('.panel')) {
          p.classList.toggle('hidden', p.dataset.panel !== name);
        }
        if (name === 'graph') layout();
      });
    }

    // Action buttons
    for (const btn of document.querySelectorAll('[data-action]')) {
      btn.addEventListener('click', () => {
        const a = btn.dataset.action;
        if (a === 'search' || a === 'trace') {
          const q = (document.getElementById('q') || {}).value || '';
          post(a, { query: q });
        } else { post(a); }
      });
    }

    // Open-file links (event delegation)
    document.body.addEventListener('click', (e) => {
      const el = e.target.closest('[data-open]');
      if (el) { e.preventDefault(); post('openFile', { file: el.dataset.open }); }
    });

    function layout() {
      const svg = document.getElementById('svg');
      if (!svg) return;
      const W = svg.clientWidth || 800, H = svg.clientHeight || 460;
      const nodes = model.nodes || [], edges = model.edges || [];
      const cx = W / 2, cy = H / 2, R = Math.min(W, H) / 2 - 40;
      const pos = {};
      nodes.forEach((n, i) => {
        const ang = (2 * Math.PI * i) / Math.max(1, nodes.length);
        const ring = n.kind === 'hotspot' ? R * 0.55 : R;
        pos[n.id] = { x: cx + ring * Math.cos(ang), y: cy + ring * Math.sin(ang) };
      });
      const maxW = nodes.reduce((m, n) => Math.max(m, n.weight || 1), 1);
      let html = '';
      for (const e of edges) {
        const a = pos[e.from], b = pos[e.to];
        if (a && b) html += '<line class="edge" x1="' + a.x + '" y1="' + a.y + '" x2="' + b.x + '" y2="' + b.y + '"/>';
      }
      for (const n of nodes) {
        const p = pos[n.id]; if (!p) continue;
        const r = 4 + 10 * Math.sqrt((n.weight || 1) / maxW);
        const label = (n.label || '').length > 22 ? n.label.slice(0, 21) + '…' : (n.label || '');
        html += '<g class="node ' + n.kind + '" data-id="' + encodeURIComponent(n.id) +
          (n.file ? '" data-open="' + n.file.replace(/"/g, '&quot;') : '') + '">' +
          '<circle cx="' + p.x + '" cy="' + p.y + '" r="' + r.toFixed(1) + '"><title>' +
          (n.label || '').replace(/</g, '&lt;') + '</title></circle>' +
          '<text x="' + (p.x + r + 2) + '" y="' + (p.y + 3) + '">' + label.replace(/</g, '&lt;') + '</text></g>';
      }
      svg.innerHTML = html;
    }

    // Simple pan via viewBox.
    (function pan() {
      const svg = document.getElementById('svg');
      if (!svg) return;
      let vb = null, dragging = false, sx = 0, sy = 0;
      function ensureVb() {
        if (!vb) vb = { x: 0, y: 0, w: svg.clientWidth || 800, h: svg.clientHeight || 460 };
        svg.setAttribute('viewBox', vb.x + ' ' + vb.y + ' ' + vb.w + ' ' + vb.h);
      }
      svg.addEventListener('mousedown', (e) => { dragging = true; sx = e.clientX; sy = e.clientY; ensureVb(); svg.classList.add('grabbing'); });
      window.addEventListener('mouseup', () => { dragging = false; svg.classList.remove('grabbing'); });
      window.addEventListener('mousemove', (e) => {
        if (!dragging || !vb) return;
        vb.x -= (e.clientX - sx); vb.y -= (e.clientY - sy); sx = e.clientX; sy = e.clientY;
        svg.setAttribute('viewBox', vb.x + ' ' + vb.y + ' ' + vb.w + ' ' + vb.h);
      });
    })();

    layout();
    window.addEventListener('resize', layout);

    // Allow the host to push search/trace results into the panel.
    window.addEventListener('message', (event) => {
      const msg = event.data || {};
      if (msg.type === 'results') {
        const box = document.getElementById('results');
        if (box) box.innerHTML = msg.html || '<span class="muted">No results.</span>';
      }
    });
  `;
}

// ── escaping ────────────────────────────────────────────────────────────────

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(text: string): string {
  return escapeHtml(text).replace(/'/g, '&#39;');
}
