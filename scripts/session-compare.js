// @ts-check
/**
 * Long prompt-session comparison (runs OUTSIDE the extension).
 *
 * Where token-workflow-compare.js measures a single task, this models full
 * multi-turn coding sessions and shows how token cost ACCUMULATES across many
 * prompts for two agents:
 *
 *   - "Default Copilot agent": has no persistent map of the repo, so on every
 *     turn it re-reads the broad context of the feature area to locate the
 *     relevant code. Each turn re-pays the full folder read.
 *   - "graph-implement agent": queries the local knowledge graph once (compact
 *     index), reuses it on later turns via the query cache (0 new tokens), and
 *     reads only the specific file each turn needs — keeping already-read files
 *     in context instead of re-reading them.
 *
 * Both agents pay the same per-turn conversation overhead (the running
 * transcript the API resends each turn), so the difference reflects context
 * RETRIEVAL only. Token counts use the same ~4-chars/token heuristic the
 * extension uses (src/model/chunking.ts). Estimates only — actual Copilot
 * billing is not exposed to extensions.
 *
 * Usage:
 *   node scripts/session-compare.js
 *
 * Output:
 *   - per-session summary + a turn-by-turn table for the longest session
 *   - session-comparison-report.md  (human-readable) at the repo root
 *   - session-comparison-report.json (machine-readable) at the repo root
 */
'use strict';

const fs = require('fs');
const path = require('path');
const {
  REPO_ROOT,
  SRC_DIR,
  estimateTokens,
  collectTsFiles,
  exportedSymbols,
  buildGraphContext,
} = require('./token-workflow-compare');

/** Conversation overhead resent each turn (user prompt + assistant reply), same for both agents. */
const TURN_OVERHEAD = 220;

/**
 * Long sessions. Each is a realistic stream of related prompts over a feature
 * area; every turn names a keyword that points at the file the work touches.
 */
const SESSIONS = [
  {
    id: 'knowledge-graph-hardening',
    title: 'Knowledge-graph hardening session',
    folders: ['knowledgeGraph'],
    turns: [
      'cache', 'runtime', 'download', 'service', 'index', 'platform',
      'graphModel', 'commands', 'cache', 'runtime', 'graphHtml', 'service',
    ],
  },
  {
    id: 'prompt-optimizer-feature',
    title: 'Prompt optimizer feature session',
    folders: ['prompt', 'model'],
    turns: ['restructure', 'classify', 'chunking', 'promptBuilder', 'restructure', 'tailor', 'format', 'restructure'],
  },
  {
    id: 'report-redesign',
    title: 'Efficiency report redesign session',
    folders: ['report'],
    turns: ['scorecard', 'reportHtml', 'deepLinks', 'textReport', 'scorecard', 'reportHtml'],
  },
];

/** Load every file in the feature folders with its content + token count. */
function loadFeatureFiles(folders) {
  return folders
    .flatMap((folder) => collectTsFiles(path.join(SRC_DIR, folder)))
    .map((p) => {
      const content = fs.readFileSync(p, 'utf8');
      return { path: p, content, tokens: estimateTokens(content), symbols: exportedSymbols(content) };
    });
}

/** Pick the file in the set that best matches a keyword. */
function bestMatch(files, keyword) {
  const k = keyword.toLowerCase();
  return (
    files
      .map((f) => ({
        f,
        score:
          (path.basename(f.path).toLowerCase().includes(k) ? 100 : 0) +
          (f.content.toLowerCase().match(new RegExp(k, 'g')) || []).length,
      }))
      .sort((a, b) => b.score - a.score)[0]?.f ?? files[0]
  );
}

/** Simulate one long session and return cumulative token usage per agent. */
function runSession(session) {
  const files = loadFeatureFiles(session.folders);
  const broadTokens = files.reduce((sum, f) => sum + f.tokens, 0);
  const graphIndexTokens = estimateTokens(buildGraphContext(files));

  /** @type {Array<{turn:number,keyword:string,file:string,defaultTurn:number,graphTurn:number,defaultCum:number,graphCum:number}>} */
  const rows = [];
  const readFiles = new Set();
  let readTokens = 0; // unique target-file tokens accumulated by the graph agent
  let defaultCum = 0;
  let graphCum = 0;

  session.turns.forEach((keyword, i) => {
    const transcript = i * TURN_OVERHEAD; // grows identically for both agents
    const target = bestMatch(files, keyword);

    // Default agent: re-reads the whole feature area every turn.
    const defaultTurn = broadTokens + transcript;

    // graph-implement: compact graph index (cached after turn 1) + only the
    // files seen so far (each read once).
    if (target && !readFiles.has(target.path)) {
      readFiles.add(target.path);
      readTokens += target.tokens;
    }
    const graphTurn = graphIndexTokens + readTokens + transcript;

    defaultCum += defaultTurn;
    graphCum += graphTurn;
    rows.push({
      turn: i + 1,
      keyword,
      file: target ? path.relative(REPO_ROOT, target.path).replace(/\\/g, '/') : '(none)',
      defaultTurn,
      graphTurn,
      defaultCum,
      graphCum,
    });
  });

  const saved = Math.max(0, defaultCum - graphCum);
  const reductionPercent = defaultCum > 0 ? Math.round((saved / defaultCum) * 100) : 0;
  return {
    id: session.id,
    title: session.title,
    turns: session.turns.length,
    filesInArea: files.length,
    broadTokens,
    graphIndexTokens,
    defaultTotal: defaultCum,
    graphTotal: graphCum,
    saved,
    reductionPercent,
    rows,
  };
}

function fmt(n) {
  return n.toLocaleString('en-US');
}

function buildMarkdown(results, totals) {
  const lines = [];
  lines.push('# Long prompt-session comparison — Default Copilot vs. graph-implement');
  lines.push('');
  lines.push(`_Generated: ${new Date().toISOString()}_`);
  lines.push('');
  lines.push(
    'Cumulative estimated prompt tokens across multi-turn coding sessions. The ' +
      '**Default Copilot agent** re-reads the broad feature area on every turn; the ' +
      '**graph-implement agent** queries the knowledge graph once (cached after) and reads ' +
      'only the file each turn needs. Both pay an identical per-turn conversation overhead ' +
      `(${TURN_OVERHEAD} tokens), so the gap reflects context retrieval. Estimates only ` +
      '(~4 chars/token); actual Copilot billing is not exposed to extensions.',
  );
  lines.push('');
  lines.push('| Session | Turns | Files in area | Default total | graph-implement total | Saved | Reduction |');
  lines.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const r of results) {
    lines.push(
      `| ${r.title} | ${r.turns} | ${r.filesInArea} | ${fmt(r.defaultTotal)} | ${fmt(r.graphTotal)} | ` +
        `${fmt(r.saved)} | ${r.reductionPercent}% |`,
    );
  }
  lines.push(
    `| **Total** | ${totals.turns} | — | **${fmt(totals.defaultTotal)}** | **${fmt(totals.graphTotal)}** | ` +
      `**${fmt(totals.saved)}** | **${totals.reductionPercent}%** |`,
  );
  lines.push('');

  const longest = results.reduce((a, b) => (b.turns > a.turns ? b : a), results[0]);
  lines.push(`## Turn-by-turn — ${longest.title} (${longest.turns} turns)`);
  lines.push('');
  lines.push('| Turn | Prompt focus | File touched | Default (cumulative) | graph-implement (cumulative) |');
  lines.push('| ---: | --- | --- | ---: | ---: |');
  for (const t of longest.rows) {
    lines.push(`| ${t.turn} | ${t.keyword} | \`${t.file}\` | ${fmt(t.defaultCum)} | ${fmt(t.graphCum)} |`);
  }
  lines.push('');
  return lines.join('\n');
}

function main() {
  const results = SESSIONS.map(runSession);
  const totals = results.reduce(
    (acc, r) => {
      acc.turns += r.turns;
      acc.defaultTotal += r.defaultTotal;
      acc.graphTotal += r.graphTotal;
      acc.saved += r.saved;
      return acc;
    },
    { turns: 0, defaultTotal: 0, graphTotal: 0, saved: 0 },
  );
  totals.reductionPercent =
    totals.defaultTotal > 0 ? Math.round((totals.saved / totals.defaultTotal) * 100) : 0;

  const pad = (s, n) => String(s).padEnd(n);
  const padNum = (s, n) => String(s).padStart(n);
  console.log('\nLong prompt sessions — Default Copilot vs. graph-implement (cumulative tokens)\n');
  console.log(pad('Session', 38) + padNum('Turns', 7) + padNum('Default', 13) + padNum('Graph', 13) + padNum('Saved', 13) + padNum('Cut', 6));
  console.log('-'.repeat(90));
  for (const r of results) {
    console.log(
      pad(r.title.slice(0, 37), 38) +
        padNum(r.turns, 7) +
        padNum(fmt(r.defaultTotal), 13) +
        padNum(fmt(r.graphTotal), 13) +
        padNum(fmt(r.saved), 13) +
        padNum(`${r.reductionPercent}%`, 6),
    );
  }
  console.log('-'.repeat(90));
  console.log(
    pad('TOTAL', 38) +
      padNum(totals.turns, 7) +
      padNum(fmt(totals.defaultTotal), 13) +
      padNum(fmt(totals.graphTotal), 13) +
      padNum(fmt(totals.saved), 13) +
      padNum(`${totals.reductionPercent}%`, 6),
  );

  const md = buildMarkdown(results, totals);
  const mdPath = path.join(REPO_ROOT, 'session-comparison-report.md');
  const jsonPath = path.join(REPO_ROOT, 'session-comparison-report.json');
  fs.writeFileSync(mdPath, md + '\n', 'utf8');
  fs.writeFileSync(
    jsonPath,
    JSON.stringify({ generatedAt: new Date().toISOString(), turnOverhead: TURN_OVERHEAD, totals, sessions: results }, null, 2) + '\n',
    'utf8',
  );
  console.log(`\nWrote ${path.relative(REPO_ROOT, mdPath)} and ${path.relative(REPO_ROOT, jsonPath)}\n`);
}

main();
