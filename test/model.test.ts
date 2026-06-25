import * as assert from 'assert';
import { clampToChars, clampToTokens, estimateTokens } from '../src/model/chunking';
import { buildBoundedInput, buildTailorPrompt } from '../src/model/promptBuilder';
import { tailorInstructions } from '../src/model/tailor';
import { ModelInvoker, ModelPrompt, RawModelSources } from '../src/model/types';

function sources(partial: Partial<RawModelSources> = {}): RawModelSources {
  return {
    repoName: 'widget',
    layout: 'single',
    primaryLanguages: ['TypeScript'],
    topLevelDirs: ['src', 'test'],
    modules: [],
    manifests: { 'package.json': '{"name":"widget"}' },
    readme: '# Widget\nDoes things.',
    ...partial,
  };
}

describe('chunking', () => {
  it('estimates ~4 chars per token', () => {
    assert.strictEqual(estimateTokens('abcd'), 1);
    assert.strictEqual(estimateTokens('abcde'), 2);
  });

  it('clamps to a token budget with a marker', () => {
    const text = 'x'.repeat(100);
    const clamped = clampToTokens(text, 5); // 20 chars
    assert.ok(clamped.length <= 20);
    assert.match(clamped, /truncated/);
  });

  it('returns text unchanged when within budget', () => {
    assert.strictEqual(clampToChars('hello', 10), 'hello');
  });
});

describe('buildBoundedInput', () => {
  it('trims manifests and README to the configured limits', () => {
    const input = buildBoundedInput(
      sources({ manifests: { 'package.json': 'A'.repeat(5000) }, readme: 'B'.repeat(5000) }),
      { maxManifestChars: 100, maxReadmeChars: 50, maxTreeEntries: 10, maxManifests: 4 },
    );
    assert.ok(input.manifestsExcerpt.length < 300);
    assert.ok(input.readmeExcerpt.length <= 60);
    assert.match(input.summary, /widget/);
  });

  it('renders the tree from top-level dirs and modules', () => {
    const input = buildBoundedInput(
      sources({ topLevelDirs: ['apps'], modules: [{ path: 'apps/web', tech: ['nextjs'] }] }),
    );
    assert.match(input.tree, /apps\//);
    assert.match(input.tree, /apps\/web\//);
  });
});

describe('buildTailorPrompt', () => {
  it('includes the layout, manifests, and README sections', () => {
    const prompt = buildTailorPrompt(buildBoundedInput(sources()));
    assert.match(prompt.user, /Top-level layout/);
    assert.match(prompt.user, /Key manifests/);
    assert.match(prompt.user, /README excerpt/);
    assert.match(prompt.system, /bullet list/i);
  });

  it('clamps the user message to the model input budget', () => {
    const big = buildBoundedInput(
      sources({ readme: 'B'.repeat(100000) }),
      { maxManifestChars: 100000, maxReadmeChars: 100000, maxTreeEntries: 10, maxManifests: 4 },
    );
    const prompt = buildTailorPrompt(big, 1000); // ~4000 char budget minus reserve
    assert.ok(estimateTokens(prompt.user) <= 1000);
  });
});

describe('tailorInstructions (fallback orchestration)', () => {
  const prompt: ModelPrompt = { system: 's', user: 'u' };

  it('falls back when no model is available', async () => {
    const result = await tailorInstructions(undefined, prompt);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.usedModel, false);
    assert.strictEqual(result.reason, 'no-model');
  });

  it('returns tailored text on success and keeps it lean', async () => {
    const invoker: ModelInvoker = {
      modelName: 'mock',
      async invoke() {
        return '  - Use strict types.\n- Keep modules small.  ';
      },
    };
    const result = await tailorInstructions(invoker, prompt);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.usedModel, true);
    assert.match(result.text!, /Use strict types/);
    assert.strictEqual(result.text, result.text!.trim());
  });

  it('falls back on empty model output', async () => {
    const invoker: ModelInvoker = { async invoke() { return '   '; } };
    const result = await tailorInstructions(invoker, prompt);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'empty');
  });

  it('classifies a permission error as no-consent', async () => {
    const invoker: ModelInvoker = {
      async invoke() {
        throw new Error('User did not grant permission / consent');
      },
    };
    const result = await tailorInstructions(invoker, prompt);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'no-consent');
  });

  it('classifies a generic error as error', async () => {
    const invoker: ModelInvoker = {
      async invoke() {
        throw new Error('network blew up');
      },
    };
    const result = await tailorInstructions(invoker, prompt);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'error');
  });
});
