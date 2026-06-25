import * as assert from 'assert';
import { buildScorecard, estimateUsageFromChatExport, TYPICAL_TOOL_COUNT } from '../src/report/scorecard';
import { renderReportHtml } from '../src/report/reportHtml';
import { OptimizationPlan } from '../src/recommendations/types';
import { GeneratedFile } from '../src/apply/types';

function plan(scoreBefore: number, scoreAfter: number): OptimizationPlan {
  const criteria = [
    { id: 'exclusions', label: 'Noisy paths excluded', weight: 30, satisfied: false, detail: 'x' },
    { id: 'instructions', label: 'Repo instructions present', weight: 20, satisfied: false, detail: 'y' },
  ];
  return {
    recommendations: [
      {
        id: 'exclusion',
        kind: 'exclusion',
        title: 't',
        detail: 'd',
        priority: 'high',
        exclusions: { searchExclude: ['**/node_modules', '**/dist'], filesExclude: ['**/node_modules'] },
      },
    ],
    score: { score: scoreBefore, criteria },
    projectedScore: { score: scoreAfter, criteria: criteria.map((c) => ({ ...c, satisfied: true })) },
  };
}

const generated: GeneratedFile[] = [
  { relativePath: '.github/copilot-instructions.md', content: '# Instructions\n- short\n' },
];

describe('buildScorecard', () => {
  it('computes before/after scores and delta', () => {
    const card = buildScorecard({
      plan: plan(40, 90),
      indexSource: 'local',
      consideredFiles: 120,
      gitignoredDirs: 3,
      generatedFiles: generated,
    });
    assert.strictEqual(card.scoreBefore, 40);
    assert.strictEqual(card.scoreAfter, 90);
    assert.strictEqual(card.scoreDelta, 50);
  });

  it('counts unique exclusion globs and measures instruction tokens', () => {
    const card = buildScorecard({
      plan: plan(40, 90),
      indexSource: 'github-remote',
      consideredFiles: 120,
      gitignoredDirs: 3,
      generatedFiles: generated,
    });
    // Unique of {**/node_modules, **/dist, **/node_modules} = 2.
    assert.strictEqual(card.noisyPathsExcluded, 2);
    assert.strictEqual(card.instructionFiles.length, 1);
    assert.ok(card.footprint.instructionTokens > 0);
    assert.strictEqual(card.footprint.typicalToolCount, TYPICAL_TOOL_COUNT);
    assert.ok(card.footprint.leanToolCount > 0 && card.footprint.leanToolCount < TYPICAL_TOOL_COUNT);
  });
});

describe('estimateUsageFromChatExport', () => {
  it('counts message-shaped fields and sums tokens', () => {
    const data = {
      requests: [
        { message: { text: 'a'.repeat(40) }, response: 'b'.repeat(80) },
        { message: { text: 'c'.repeat(4) } },
      ],
    };
    const usage = estimateUsageFromChatExport(data);
    assert.ok(usage.messages >= 2);
    assert.ok(usage.estimatedTokens > 0);
    assert.ok(usage.largestMessageTokens >= 20);
  });

  it('falls back to summing all strings when no message fields exist', () => {
    const usage = estimateUsageFromChatExport({ a: 'x'.repeat(40), b: { c: 'y'.repeat(40) } });
    assert.strictEqual(usage.messages, 0);
    assert.ok(usage.estimatedTokens > 0);
  });

  it('handles empty/invalid input gracefully', () => {
    assert.deepStrictEqual(estimateUsageFromChatExport(null), {
      messages: 0,
      estimatedTokens: 0,
      largestMessageTokens: 0,
    });
  });
});

describe('renderReportHtml', () => {
  it('produces a CSP-protected document with the scores and a nonce', () => {
    const card = buildScorecard({
      plan: plan(40, 90),
      indexSource: 'local',
      consideredFiles: 120,
      gitignoredDirs: 3,
      generatedFiles: generated,
    });
    const html = renderReportHtml(card, { nonce: 'NONCE123', cspSource: 'vscode-resource:' });
    assert.match(html, /Content-Security-Policy/);
    assert.match(html, /nonce-NONCE123/);
    assert.match(html, /40<span/);
    assert.match(html, /90<span/);
    assert.match(html, /data-deeplink="buildIndex"/);
    assert.match(html, /data-action="importChat"/);
  });

  it('escapes HTML in criterion details', () => {
    const card = buildScorecard({
      plan: {
        recommendations: [],
        score: { score: 0, criteria: [{ id: 'x', label: '<script>', weight: 10, satisfied: false, detail: '<b>' }] },
        projectedScore: { score: 0, criteria: [{ id: 'x', label: '<script>', weight: 10, satisfied: false, detail: '<b>' }] },
      },
      indexSource: 'local',
      consideredFiles: 0,
      gitignoredDirs: 0,
      generatedFiles: [],
    });
    const html = renderReportHtml(card, { nonce: 'N', cspSource: 'x' });
    assert.ok(!html.includes('<script>N'));
    assert.match(html, /&lt;script&gt;/);
  });
});
