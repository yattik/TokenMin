import * as assert from 'assert';
import { renderGraphHtml } from '../src/knowledgeGraph/graphHtml';
import { buildViewModel } from '../src/knowledgeGraph/graphModel';
import { GraphViewModel, ImpactReport } from '../src/knowledgeGraph/types';

function model(): GraphViewModel {
  return buildViewModel('widget', {
    languages: ['TypeScript'],
    packages: [{ name: 'api', files: 5, imports: ['core'] }, { name: 'core', files: 9 }],
    routes: [{ method: 'GET', path: '/ping', handler: 'ping', file: 'api/ping.ts' }],
    hotspots: [{ name: 'core.Run', degree: 7, file: 'core/run.ts' }],
    counts: { nodes: 10, edges: 12, functions: 20, classes: 3 },
  });
}

describe('knowledgeGraph graphHtml', () => {
  it('renders a CSP meta tag bound to the nonce and cspSource', () => {
    const html = renderGraphHtml(model(), { nonce: 'NONCE123', cspSource: 'vscode-resource:' });
    assert.ok(html.includes("Content-Security-Policy"));
    assert.ok(html.includes("script-src 'nonce-NONCE123'"));
    assert.ok(html.includes('vscode-resource:'));
    // scripts must carry the nonce
    assert.ok(html.includes('<script nonce="NONCE123">'));
  });

  it('embeds the serialized model and summary cards', () => {
    const html = renderGraphHtml(model(), { nonce: 'n', cspSource: 'x' });
    assert.ok(html.includes('id="data"'));
    assert.ok(html.includes('"projectName":"widget"'));
    assert.ok(html.includes('>Packages<'));
    assert.ok(html.includes('>Routes<'));
    assert.ok(html.includes('Re-index')); // indexed model => re-index label
  });

  it('escapes < in the embedded payload to avoid breaking out of the script', () => {
    const m = buildViewModel('<x>', { packages: [{ name: '<b>evil</b>' }], languages: ['TS'] });
    const html = renderGraphHtml(m, { nonce: 'n', cspSource: 'x' });
    assert.ok(!html.includes('<b>evil</b>'));
    assert.ok(html.includes('\\u003c'));
  });

  it('renders the impact table when an impact report is supplied', () => {
    const impact: ImpactReport = {
      changedFiles: 2,
      symbols: [{ name: 'Foo', risk: 'high', blastRadius: 5, file: 'foo.ts' }],
    };
    const html = renderGraphHtml(model(), { nonce: 'n', cspSource: 'x', impact });
    assert.ok(html.includes('Blast radius'));
    assert.ok(html.includes('Foo'));
    assert.ok(html.includes('class="risk high"'));
  });

  it('shows an index button when the repo is not indexed', () => {
    const html = renderGraphHtml(
      { projectName: 'r', indexed: false, summary: { nodes: 0, edges: 0, packages: 0, routes: 0, functions: 0, classes: 0, languages: [] }, nodes: [], edges: [], hotspots: [], routes: [], notice: 'x' },
      { nonce: 'n', cspSource: 'x' },
    );
    assert.ok(html.includes('Index repo'));
    assert.ok(html.includes('class="notice"'));
  });
});
