import * as assert from 'assert';
import {
  classifyTask,
  clarityScore,
  comparePrompts,
  extractFiles,
  extractSymbols,
  formatRestructuredPrompt,
  restructurePrompt,
} from '../src/prompt/restructure';

describe('prompt restructuring: classification & extraction', () => {
  it('classifies task types by keyword precedence', () => {
    assert.strictEqual(classifyTask('the login crashes, fix it'), 'bug');
    assert.strictEqual(classifyTask('add a logout button'), 'feature');
    assert.strictEqual(classifyTask('refactor the parser'), 'refactor');
    assert.strictEqual(classifyTask('write tests for the cache'), 'test');
    assert.strictEqual(classifyTask('document the API'), 'docs');
    assert.strictEqual(classifyTask('look into this'), 'general');
  });

  it('extracts file-like tokens', () => {
    assert.deepStrictEqual(extractFiles('update src/auth/login.ts and config.json'), [
      'src/auth/login.ts',
      'config.json',
    ]);
    assert.deepStrictEqual(extractFiles('the value is 3.14'), []);
  });

  it('extracts backticked and CamelCase symbols', () => {
    const symbols = extractSymbols('call `handleLogin` inside the AuthService class');
    assert.ok(symbols.includes('handleLogin'));
    assert.ok(symbols.includes('AuthService'));
  });
});

describe('prompt restructuring: restructure & format', () => {
  it('produces all sections for a vague bug prompt', () => {
    const rp = restructurePrompt('the login is broken, fix it');
    assert.strictEqual(rp.taskType, 'bug');
    assert.ok(rp.intent.length > 0);
    assert.ok(rp.constraints.length > 0);
    assert.ok(rp.acceptanceCriteria.length > 0);
    assert.ok(rp.verification.length > 0);
  });

  it('is deterministic for the same input', () => {
    const a = restructurePrompt('add a logout button to the navbar');
    const b = restructurePrompt('add a logout button to the navbar');
    assert.deepStrictEqual(a, b);
  });

  it('merges context files/symbols into relevant context', () => {
    const rp = restructurePrompt('fix the bug', { files: ['src/a.ts'], symbols: ['Foo'], languages: ['TypeScript'] });
    const joined = rp.relevantContext.join('\n');
    assert.ok(joined.includes('src/a.ts'));
    assert.ok(joined.includes('Foo'));
    assert.ok(joined.includes('TypeScript'));
  });

  it('suggests the knowledge graph when no files/symbols are present', () => {
    const rp = restructurePrompt('make it faster');
    assert.ok(rp.relevantContext.some((c) => /knowledge graph/i.test(c)));
  });

  it('formats markdown with the expected headings', () => {
    const md = formatRestructuredPrompt(restructurePrompt('fix the login bug'));
    assert.ok(md.includes('## Task'));
    assert.ok(md.includes('### Constraints'));
    assert.ok(md.includes('### Relevant context'));
    assert.ok(md.includes('### Acceptance criteria'));
    assert.ok(md.includes('### Verification'));
  });
});

describe('prompt restructuring: comparison', () => {
  it('scores a vague prompt lower than its restructured form', () => {
    const raw = 'fix it';
    const md = formatRestructuredPrompt(restructurePrompt(raw));
    const cmp = comparePrompts(raw, md);
    assert.ok(cmp.restructuredClarity > cmp.originalClarity);
    assert.ok(cmp.restructuredTokens > cmp.originalTokens);
  });

  it('estimates more round-trips saved for vaguer prompts', () => {
    const vague = comparePrompts('fix it', formatRestructuredPrompt(restructurePrompt('fix it')));
    assert.strictEqual(vague.estimatedRoundTripsSaved, 2);
  });

  it('clarityScore is bounded 0..100', () => {
    assert.strictEqual(clarityScore(''), 0);
    assert.ok(clarityScore('x'.repeat(500)) <= 100);
  });
});
