import * as assert from 'assert';
import { walk } from '../src/fs/walk';
import { analyzePipeline } from '../src/pipeline';
import { buildArtifacts } from '../src/generators';
import { buildScorecard } from '../src/report/scorecard';
import { mergeExclusions } from '../src/apply/settingsMerge';
import { CurrentSettings } from '../src/recommendations/types';
import { GeneratorContext } from '../src/generators/types';
import { MemReader } from './helpers/memReader';

const emptySettings: CurrentSettings = {
  searchExclude: {},
  filesExclude: {},
  hasCopilotInstructions: false,
  scopedInstructionFiles: [],
  agentFiles: [],
  toolSetFiles: [],
  hasArchitectureDoc: false,
  promptFiles: [],
};

/** A small but realistic sample repo: TS source, README, node_modules + dist noise. */
function sampleRepo(): MemReader {
  const specs = [
    { path: '.gitignore', content: 'dist/\n' },
    { path: 'package.json', content: JSON.stringify({ name: 'widget', dependencies: { react: '^18' }, devDependencies: { typescript: '^5' } }) },
    { path: 'tsconfig.json', content: '{}' },
    { path: 'README.md', content: '# Widget\nA sample.' },
    { path: 'src/index.ts', content: 'export const x = 1;', size: 100 },
    { path: 'src/app.tsx', content: 'export default () => null;', size: 200 },
    { path: 'src/util.ts', content: 'export const y = 2;', size: 120 },
    { path: 'node_modules/react/index.js', content: 'module.exports = {};', size: 5000 },
    { path: 'node_modules/react/package.json', content: '{}', size: 50 },
    { path: 'dist/bundle.js', content: 'console.log(1)', size: 9000 },
  ];
  return new MemReader(specs);
}

describe('integration: analyze → recommend → generate → score → apply (model pass disabled)', () => {
  it('runs the full deterministic pipeline end to end', async () => {
    const reader = sampleRepo();
    const walkResult = await walk(reader, { cap: 1000 });

    // node_modules + dist pruned; only source + config files remain.
    const filePaths = walkResult.files.map((f) => f.relativePath);
    assert.ok(!filePaths.some((p) => p.startsWith('node_modules')));
    assert.ok(!filePaths.some((p) => p.startsWith('dist')));
    assert.ok(filePaths.includes('src/index.ts'));

    // Read the manifests the editor flow would read.
    const manifests: Record<string, string> = {};
    for (const p of ['package.json', 'tsconfig.json']) {
      const content = await reader.readTextFile(p);
      if (content) manifests[p] = content;
    }

    const { structure, stack, plan } = analyzePipeline({
      walk: walkResult,
      manifests,
      gitConfig: '[remote "origin"]\n\turl = https://github.com/acme/widget.git\n',
      current: emptySettings,
      aggressiveness: 'balanced',
    });

    // Stack detection.
    assert.strictEqual(stack.layout, 'single');
    assert.strictEqual(stack.indexSource, 'github-remote');
    assert.ok(stack.tech.some((t) => t.id === 'react'));

    // node_modules is NOT gitignored here (only dist is) -> should be recommended.
    const exclusion = plan.recommendations.find((r) => r.kind === 'exclusion');
    assert.ok(exclusion?.exclusions?.searchExclude.includes('**/node_modules'));
    // dist is gitignored -> must be skipped.
    assert.ok(!exclusion?.exclusions?.searchExclude.includes('**/dist'));

    // Recommends instructions (none present).
    assert.ok(plan.recommendations.some((r) => r.kind === 'instructions'));

    // Generate artifacts deterministically (no model pass).
    const ctx: GeneratorContext = {
      repoName: 'widget',
      structure,
      stack,
      hasArchitectureDoc: false,
      hasContributingDoc: false,
    };
    const generated = buildArtifacts(ctx, plan);
    const paths = generated.map((f) => f.relativePath);
    assert.ok(paths.includes('.github/copilot-instructions.md'));
    assert.ok(paths.includes('.github/agents/plan.agent.md'));
    assert.ok(paths.includes('.github/agents/implement.agent.md'));

    // Scorecard improves after applying recommendations.
    const card = buildScorecard({
      plan,
      indexSource: stack.indexSource,
      consideredFiles: structure.totalFiles,
      gitignoredDirs: structure.gitignoredDirCount,
      generatedFiles: generated,
    });
    assert.ok(card.scoreAfter > card.scoreBefore, 'score should improve after apply');
    assert.ok(card.noisyPathsExcluded >= 1);

    // Applying exclusions to settings is idempotent.
    const first = mergeExclusions('{}', exclusion!.exclusions!);
    assert.strictEqual(first.changed, true);
    const second = mergeExclusions(first.newText, exclusion!.exclusions!);
    assert.strictEqual(second.changed, false);
  });

  it('produces an empty, no-op plan for an already-optimized repo', async () => {
    const reader = new MemReader([
      { path: '.gitignore', content: 'node_modules/\ndist/\n' },
      { path: '.github/copilot-instructions.md', content: '# Instructions' },
      { path: '.github/agents/plan.agent.md', content: '---\n---\nplan' },
      { path: '.github/tokenmin.toolsets.jsonc', content: '{}' },
      { path: 'ARCHITECTURE.md', content: '# Arch' },
      { path: 'src/index.ts', content: 'export const x = 1;', size: 100 },
      { path: 'node_modules/react/index.js', content: 'x', size: 5000 },
    ]);
    const walkResult = await walk(reader, { cap: 1000 });
    const filePaths = walkResult.files.map((f) => f.relativePath);

    const current: CurrentSettings = {
      searchExclude: {},
      filesExclude: {},
      hasCopilotInstructions: filePaths.includes('.github/copilot-instructions.md'),
      scopedInstructionFiles: [],
      agentFiles: filePaths.filter((p) => p.endsWith('.agent.md')),
      toolSetFiles: filePaths.filter((p) => p.endsWith('.toolsets.jsonc')),
      hasArchitectureDoc: filePaths.includes('ARCHITECTURE.md'),
      promptFiles: [],
    };

    const { plan } = analyzePipeline({
      walk: walkResult,
      manifests: {},
      gitConfig: '[remote "origin"]\n\turl = https://github.com/acme/widget.git\n',
      current,
      aggressiveness: 'balanced',
    });

    // node_modules + dist are gitignored, artifacts exist -> no exclusion/instructions recs.
    assert.ok(!plan.recommendations.some((r) => r.kind === 'exclusion'));
    assert.ok(!plan.recommendations.some((r) => r.kind === 'instructions'));
    assert.ok(plan.score.score >= 90, `expected high score, got ${plan.score.score}`);
  });
});
