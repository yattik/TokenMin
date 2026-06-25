// @ts-check
/**
 * Standalone token-usage comparison workflow (runs OUTSIDE the extension).
 *
 * It simulates a Copilot agent completing a few sample coding tasks two ways and
 * estimates the prompt tokens each path would consume:
 *
 *   1. Baseline ("no graph"): the agent has no map of the repo, so it pulls
 *      broad context — it reads every file under the task's target folder(s)
 *      before it can act.
 *   2. graph-implement agent: the agent first queries the local knowledge graph,
 *      which returns a compact index (file path + exported symbols per file),
 *      then reads only the single best-matching file.
 *
 * Token counts use the same ~4-chars/token heuristic the extension uses
 * (see src/model/chunking.ts) so the numbers line up with the in-editor report.
 *
 * Usage:
 *   node scripts/token-workflow-compare.js
 *
 * Output:
 *   - a comparison table printed to the console
 *   - token-usage-report.md  (human-readable) at the repo root
 *   - token-usage-report.json (machine-readable) at the repo root
 */
'use strict';

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const SRC_DIR = path.join(REPO_ROOT, 'src');
const CHARS_PER_TOKEN = 4;

/** Approximate prompt tokens for a string (~4 chars/token). */
function estimateTokens(text) {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Sample tasks. Each names a realistic change and the folder(s) an agent would
 * scan for context, plus a keyword used to pick the single most relevant file.
 */
const SAMPLE_TASKS = [
  {
    id: 'validate-prompt',
    title: 'Add validation to the prompt restructuring flow',
    folders: ['prompt', 'model'],
    keyword: 'restructure',
  },
  {
    id: 'graph-query-cache',
    title: 'Tune the knowledge-graph query cache invalidation',
    folders: ['knowledgeGraph'],
    keyword: 'cache',
  },
  {
    id: 'report-scorecard',
    title: 'Add a new metric to the efficiency scorecard',
    folders: ['report'],
    keyword: 'scorecard',
  },
];

/** Recursively collect *.ts files under a directory. */
function collectTsFiles(dir) {
  /** @type {string[]} */
  const out = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectTsFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
}

/** Extract exported top-level symbol names from TypeScript source. */
function exportedSymbols(source) {
  const re = /export\s+(?:async\s+)?(?:function|const|class|interface|type|enum)\s+([A-Za-z0-9_]+)/g;
  /** @type {string[]} */
  const names = [];
  let m;
  while ((m = re.exec(source)) !== null) {
    names.push(m[1]);
  }
  return names;
}

/**
 * Build the compact graph "context" a graph-implement agent would receive: one
 * line per file listing its path and exported symbols. This is what replaces
 * reading every file in full.
 */
function buildGraphContext(files) {
  return files
    .map((f) => {
      const rel = path.relative(REPO_ROOT, f.path).replace(/\\/g, '/');
      const syms = f.symbols.length ? f.symbols.join(', ') : '(no exports)';
      return `${rel} :: ${syms}`;
    })
    .join('\n');
}

/** Run one sample task and return its token estimates. */
function runTask(task) {
  const files = task.folders
    .flatMap((folder) => collectTsFiles(path.join(SRC_DIR, folder)))
    .map((p) => {
      const content = fs.readFileSync(p, 'utf8');
      return { path: p, content, symbols: exportedSymbols(content) };
    });

  // Baseline: the agent reads every file in the target folders.
  const baselineTokens = files.reduce((sum, f) => sum + estimateTokens(f.content), 0);

  // graph-implement: compact graph index + read only the best-matching file.
  const graphContext = buildGraphContext(files);
  const graphContextTokens = estimateTokens(graphContext);

  const keyword = task.keyword.toLowerCase();
  const best =
    files
      .map((f) => ({
        f,
        score: (f.content.toLowerCase().match(new RegExp(keyword, 'g')) || []).length,
      }))
      .sort((a, b) => b.score - a.score)[0]?.f ?? files[0];
  const bestFileTokens = best ? estimateTokens(best.content) : 0;
  const graphTokens = graphContextTokens + bestFileTokens;

  const saved = Math.max(0, baselineTokens - graphTokens);
  const reductionPercent = baselineTokens > 0 ? Math.round((saved / baselineTokens) * 100) : 0;

  return {
    id: task.id,
    title: task.title,
    filesScanned: files.length,
    keyFile: best ? path.relative(REPO_ROOT, best.path).replace(/\\/g, '/') : '(none)',
    baselineTokens,
    graphContextTokens,
    bestFileTokens,
    graphTokens,
    saved,
    reductionPercent,
  };
}

function formatNumber(n) {
  return n.toLocaleString('en-US');
}

function buildMarkdown(results, totals) {
  const lines = [];
  lines.push('# Token usage report — graph-implement vs. baseline');
  lines.push('');
  lines.push(`_Generated: ${new Date().toISOString()}_`);
  lines.push('');
  lines.push(
    'Estimated prompt tokens for sample coding tasks completed two ways: a baseline ' +
      'agent that reads broad context (every file in the target folders) versus the ' +
      '`graph-implement` agent that queries the knowledge graph first and reads only the ' +
      'most relevant file. Counts use a ~4-chars/token heuristic — estimates only; actual ' +
      'Copilot billing is not exposed to extensions.',
  );
  lines.push('');
  lines.push('| Task | Files | Baseline tokens | graph-implement tokens | Saved | Reduction |');
  lines.push('| --- | ---: | ---: | ---: | ---: | ---: |');
  for (const r of results) {
    lines.push(
      `| ${r.title} | ${r.filesScanned} | ${formatNumber(r.baselineTokens)} | ` +
        `${formatNumber(r.graphTokens)} | ${formatNumber(r.saved)} | ${r.reductionPercent}% |`,
    );
  }
  lines.push(
    `| **Total** | ${totals.filesScanned} | **${formatNumber(totals.baselineTokens)}** | ` +
      `**${formatNumber(totals.graphTokens)}** | **${formatNumber(totals.saved)}** | **${totals.reductionPercent}%** |`,
  );
  lines.push('');
  lines.push('## Per-task detail');
  lines.push('');
  for (const r of results) {
    lines.push(`### ${r.title}`);
    lines.push('');
    lines.push(`- Key file the graph-implement agent reads: \`${r.keyFile}\``);
    lines.push(`- Baseline (read ${r.filesScanned} files): ${formatNumber(r.baselineTokens)} tokens`);
    lines.push(
      `- graph-implement (graph index ${formatNumber(r.graphContextTokens)} + key file ` +
        `${formatNumber(r.bestFileTokens)}): ${formatNumber(r.graphTokens)} tokens`,
    );
    lines.push(`- Saved: ${formatNumber(r.saved)} tokens (${r.reductionPercent}% reduction)`);
    lines.push('');
  }
  return lines.join('\n');
}

function main() {
  const results = SAMPLE_TASKS.map(runTask);
  const totals = results.reduce(
    (acc, r) => {
      acc.filesScanned += r.filesScanned;
      acc.baselineTokens += r.baselineTokens;
      acc.graphTokens += r.graphTokens;
      acc.saved += r.saved;
      return acc;
    },
    { filesScanned: 0, baselineTokens: 0, graphTokens: 0, saved: 0 },
  );
  totals.reductionPercent =
    totals.baselineTokens > 0 ? Math.round((totals.saved / totals.baselineTokens) * 100) : 0;

  // Console summary.
  console.log('\nToken usage — graph-implement agent vs. baseline (broad file reads)\n');
  const pad = (s, n) => String(s).padEnd(n);
  const padNum = (s, n) => String(s).padStart(n);
  console.log(pad('Task', 46) + padNum('Baseline', 11) + padNum('Graph', 11) + padNum('Saved', 11) + padNum('Cut', 6));
  console.log('-'.repeat(85));
  for (const r of results) {
    console.log(
      pad(r.title.slice(0, 45), 46) +
        padNum(formatNumber(r.baselineTokens), 11) +
        padNum(formatNumber(r.graphTokens), 11) +
        padNum(formatNumber(r.saved), 11) +
        padNum(`${r.reductionPercent}%`, 6),
    );
  }
  console.log('-'.repeat(85));
  console.log(
    pad('TOTAL', 46) +
      padNum(formatNumber(totals.baselineTokens), 11) +
      padNum(formatNumber(totals.graphTokens), 11) +
      padNum(formatNumber(totals.saved), 11) +
      padNum(`${totals.reductionPercent}%`, 6),
  );

  const md = buildMarkdown(results, totals);
  const mdPath = path.join(REPO_ROOT, 'token-usage-report.md');
  const jsonPath = path.join(REPO_ROOT, 'token-usage-report.json');
  fs.writeFileSync(mdPath, md + '\n', 'utf8');
  fs.writeFileSync(
    jsonPath,
    JSON.stringify({ generatedAt: new Date().toISOString(), totals, tasks: results }, null, 2) + '\n',
    'utf8',
  );

  console.log(`\nWrote ${path.relative(REPO_ROOT, mdPath)} and ${path.relative(REPO_ROOT, jsonPath)}\n`);
}

if (require.main === module) {
  main();
}

module.exports = {
  REPO_ROOT,
  SRC_DIR,
  CHARS_PER_TOKEN,
  estimateTokens,
  collectTsFiles,
  exportedSymbols,
  buildGraphContext,
};
