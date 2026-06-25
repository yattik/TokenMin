import * as assert from 'assert';
import { buildExclusionGlobs, buildPlan, computeScore, RecommendationInput } from '../src/recommendations/engine';
import { StackAnalysis, StructureAnalysis, NoisyDir } from '../src/analyzer/types';
import { CurrentSettings } from '../src/recommendations/types';

function noisy(name: string, tier: NoisyDir['tier'], gitignored = false): NoisyDir {
  return { relativePath: name, name, reason: 'x', tier, fileCount: 1, totalSize: 1, pruned: true, gitignored };
}

function structure(partial: Partial<StructureAnalysis> = {}): StructureAnalysis {
  return {
    totalFiles: 100,
    totalSize: 1000,
    truncated: false,
    topLevelDirs: [],
    noisyDirs: [],
    largeFiles: [],
    binaryFileCount: 0,
    binaryExtensions: [],
    lockfiles: [],
    gitignoredDirCount: 0,
    ...partial,
  };
}

function stack(partial: Partial<StackAnalysis> = {}): StackAnalysis {
  return {
    tech: [],
    layout: 'single',
    modules: [],
    indexSource: 'local',
    primaryLanguages: ['TypeScript'],
    ...partial,
  };
}

function settings(partial: Partial<CurrentSettings> = {}): CurrentSettings {
  return {
    searchExclude: {},
    filesExclude: {},
    hasCopilotInstructions: false,
    scopedInstructionFiles: [],
    agentFiles: [],
    toolSetFiles: [],
    hasArchitectureDoc: false,
    promptFiles: [],
    ...partial,
  };
}

function input(partial: Partial<RecommendationInput> = {}): RecommendationInput {
  return {
    structure: structure(),
    stack: stack(),
    current: settings(),
    aggressiveness: 'balanced',
    ...partial,
  };
}

describe('buildExclusionGlobs', () => {
  it('excludes un-gitignored noisy dirs and hides high-tier from the explorer', () => {
    const ex = buildExclusionGlobs(
      input({ structure: structure({ noisyDirs: [noisy('node_modules', 'high'), noisy('dist', 'medium')] }) }),
    );
    assert.ok(ex.searchExclude.includes('**/node_modules'));
    assert.ok(ex.searchExclude.includes('**/dist'));
    assert.ok(ex.filesExclude.includes('**/node_modules'));
    assert.ok(!ex.filesExclude.includes('**/dist')); // medium tier: search only
  });

  it('skips dirs already excluded by .gitignore', () => {
    const ex = buildExclusionGlobs(
      input({ structure: structure({ noisyDirs: [noisy('node_modules', 'high', true)] }) }),
    );
    assert.deepStrictEqual(ex.searchExclude, []);
    assert.deepStrictEqual(ex.filesExclude, []);
  });

  it('is idempotent against existing settings', () => {
    const ex = buildExclusionGlobs(
      input({
        structure: structure({ noisyDirs: [noisy('node_modules', 'high')] }),
        current: settings({ searchExclude: { '**/node_modules': true }, filesExclude: { '**/node_modules': true } }),
      }),
    );
    assert.deepStrictEqual(ex.searchExclude, []);
    assert.deepStrictEqual(ex.filesExclude, []);
  });

  it('respects aggressiveness tiers and adds lockfiles/binaries when aggressive', () => {
    const struct = structure({
      noisyDirs: [noisy('node_modules', 'high'), noisy('dist', 'medium'), noisy('vendor', 'low')],
      lockfiles: ['package-lock.json', 'packages/web/package-lock.json'],
      binaryExtensions: ['.png'],
    });
    const conservative = buildExclusionGlobs(input({ structure: struct, aggressiveness: 'conservative' }));
    assert.deepStrictEqual(conservative.searchExclude, ['**/node_modules']);

    const balanced = buildExclusionGlobs(input({ structure: struct, aggressiveness: 'balanced' }));
    assert.ok(balanced.searchExclude.includes('**/dist'));
    assert.ok(balanced.searchExclude.includes('**/package-lock.json'));
    assert.ok(!balanced.searchExclude.includes('**/vendor'));
    assert.ok(!balanced.searchExclude.includes('**/*.png'));

    const aggressive = buildExclusionGlobs(input({ structure: struct, aggressiveness: 'aggressive' }));
    assert.ok(aggressive.searchExclude.includes('**/vendor'));
    assert.ok(aggressive.searchExclude.includes('**/*.png'));
  });
});

describe('buildPlan', () => {
  it('recommends instructions when missing and not when present', () => {
    const missing = buildPlan(input());
    assert.ok(missing.recommendations.some((r) => r.kind === 'instructions'));

    const present = buildPlan(input({ current: settings({ hasCopilotInstructions: true }) }));
    assert.ok(!present.recommendations.some((r) => r.kind === 'instructions'));
  });

  it('orders recommendations by priority (high first)', () => {
    const plan = buildPlan(input({ structure: structure({ noisyDirs: [noisy('node_modules', 'high')] }) }));
    const priorities = plan.recommendations.map((r) => r.priority);
    const firstLow = priorities.indexOf('low');
    const lastHigh = priorities.lastIndexOf('high');
    assert.ok(firstLow === -1 || lastHigh < firstLow);
  });

  it('scores an unoptimized repo low and projects a higher score', () => {
    const plan = buildPlan(input({ structure: structure({ noisyDirs: [noisy('node_modules', 'high')] }) }));
    assert.ok(plan.score.score < 50, `expected low score, got ${plan.score.score}`);
    assert.ok(plan.projectedScore.score > plan.score.score);
  });

  it('scores a well-optimized repo high with no exclusion globs', () => {
    const plan = buildPlan(
      input({
        structure: structure({ noisyDirs: [noisy('node_modules', 'high', true)] }),
        stack: stack({ indexSource: 'github-remote' }),
        current: settings({
          hasCopilotInstructions: true,
          hasArchitectureDoc: true,
          agentFiles: ['.github/agents/plan.agent.md'],
          toolSetFiles: ['.github/lean.toolsets.jsonc'],
        }),
      }),
    );
    assert.ok(plan.score.score >= 90, `expected high score, got ${plan.score.score}`);
    assert.ok(!plan.recommendations.some((r) => r.kind === 'exclusion'));
  });
});

describe('computeScore', () => {
  it('counts existing exclusions as satisfying the exclusions criterion', () => {
    const score = computeScore(
      input({
        structure: structure({ noisyDirs: [noisy('node_modules', 'high')] }),
        current: settings({ searchExclude: { '**/node_modules': true } }),
      }),
    );
    const crit = score.criteria.find((c) => c.id === 'exclusions')!;
    assert.strictEqual(crit.satisfied, true);
  });
});
