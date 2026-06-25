import * as assert from 'assert';
import { buildImpactReport, buildViewModel, emptyModel } from '../src/knowledgeGraph/graphModel';

describe('knowledgeGraph graphModel', () => {
  it('produces an empty, not-indexed model with a notice', () => {
    const m = emptyModel('repo', 'nope');
    assert.strictEqual(m.indexed, false);
    assert.strictEqual(m.notice, 'nope');
    assert.strictEqual(m.nodes.length, 0);
    assert.strictEqual(m.summary.nodes, 0);
  });

  it('builds nodes, edges, hotspots and routes from architecture json', () => {
    const arch = {
      languages: ['TypeScript', { name: 'Go' }],
      packages: [
        { name: 'api', files: 12, imports: ['core'] },
        { name: 'core', files: 30 },
      ],
      routes: [{ method: 'GET', path: '/health', handler: 'health', file: 'api/health.ts' }],
      hotspots: [{ name: 'pkg.core.Process', degree: 14, file: 'core/process.ts' }],
      counts: { nodes: 42, edges: 50, functions: 100, classes: 8 },
    };
    const m = buildViewModel('repo', arch);

    assert.strictEqual(m.indexed, true);
    assert.deepStrictEqual(m.summary.languages, ['TypeScript', 'Go']);
    assert.strictEqual(m.summary.functions, 100);
    assert.strictEqual(m.summary.classes, 8);
    assert.strictEqual(m.summary.routes, 1);

    const ids = m.nodes.map((n) => n.id);
    assert.ok(ids.includes('pkg:api'));
    assert.ok(ids.includes('pkg:core'));
    // hotspot becomes a node too
    assert.ok(ids.some((id) => id.startsWith('hot:')));

    // dependency edge api -> core is present and its target exists
    const edge = m.edges.find((e) => e.from === 'pkg:api' && e.to === 'pkg:core');
    assert.ok(edge, 'expected api -> core import edge');
    assert.strictEqual(edge!.kind, 'imports');

    assert.strictEqual(m.routes[0].path, '/health');
    assert.strictEqual(m.hotspots[0].degree, 14);
  });

  it('unwraps payloads nested under result/data', () => {
    const wrapped = { result: { languages: ['Rust'], packages: [{ name: 'crate' }] } };
    const m = buildViewModel('repo', wrapped);
    assert.deepStrictEqual(m.summary.languages, ['Rust']);
    assert.ok(m.nodes.some((n) => n.label === 'crate'));
  });

  it('degrades to a notice on unknown shapes without throwing', () => {
    const m = buildViewModel('repo', { totally: 'unexpected' });
    assert.strictEqual(m.indexed, false);
    assert.ok(m.notice && m.notice.length > 0);
  });

  it('builds a useful model from codebase-memory-mcp v0.8 architecture output', () => {
    const m = buildViewModel('repo', {
      project: 'D-hackathon-sample-repo',
      total_nodes: 44,
      total_edges: 51,
      node_labels: [
        { label: 'File', count: 10 },
        { label: 'Function', count: 4 },
        { label: 'Class', count: 2 },
      ],
      languages: ['JavaScript', 'Python'],
    });

    assert.strictEqual(m.indexed, true);
    assert.strictEqual(m.summary.nodes, 44);
    assert.strictEqual(m.summary.edges, 51);
    assert.strictEqual(m.summary.functions, 4);
    assert.strictEqual(m.summary.classes, 2);
    assert.ok(m.nodes.some((n) => n.id === 'label:Function' && n.kind === 'cluster'));
  });

  it('builds an impact report with normalized risk and sorted blast radius', () => {
    const report = buildImpactReport({
      changedFiles: 3,
      symbols: [
        { name: 'a', risk: 'LOW', dependents: 1, file: 'a.ts' },
        { name: 'b', risk: 'critical', blastRadius: 9 },
        { name: 'c', severity: 'med', callers: 4 },
      ],
    });
    assert.strictEqual(report.changedFiles, 3);
    assert.strictEqual(report.symbols[0].name, 'b'); // highest blast radius first
    assert.strictEqual(report.symbols[0].risk, 'high');
    assert.strictEqual(report.symbols[2].risk, 'low');
    assert.strictEqual(report.symbols.find((s) => s.name === 'c')!.risk, 'medium');
  });

  it('builds impact from codebase-memory-mcp v0.8 detect_changes output', () => {
    const report = buildImpactReport({
      changed_files: ['src/users.js'],
      changed_count: 1,
      impacted_symbols: [
        { name: 'src/users.js', label: 'Module', file: 'src/users.js' },
        { name: 'getUser', label: 'Function', file: 'src/users.js' },
      ],
    });

    assert.strictEqual(report.changedFiles, 1);
    assert.strictEqual(report.symbols.length, 2);
    assert.strictEqual(report.symbols[1].name, 'getUser');
    assert.strictEqual(report.symbols[1].risk, 'unknown');
  });

  it('impact report notes when nothing is affected', () => {
    const report = buildImpactReport({ symbols: [] });
    assert.strictEqual(report.symbols.length, 0);
    assert.ok(report.notice);
  });
});
