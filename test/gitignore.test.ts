import * as assert from 'assert';
import { isIgnored, parseGitignore, combineRules } from '../src/core/gitignore';

describe('gitignore matcher', () => {
  it('ignores a directory-only rule and its contents', () => {
    const rules = parseGitignore('node_modules/');
    assert.strictEqual(isIgnored('node_modules', true, rules), true);
    assert.strictEqual(isIgnored('node_modules/lib/index.js', false, rules), true);
    assert.strictEqual(isIgnored('src/index.js', false, rules), false);
  });

  it('matches an extension glob at any depth', () => {
    const rules = parseGitignore('*.log');
    assert.strictEqual(isIgnored('a.log', false, rules), true);
    assert.strictEqual(isIgnored('deep/nested/b.log', false, rules), true);
    assert.strictEqual(isIgnored('a.txt', false, rules), false);
  });

  it('anchors a leading-slash rule to the root', () => {
    const rules = parseGitignore('/dist');
    assert.strictEqual(isIgnored('dist', true, rules), true);
    assert.strictEqual(isIgnored('dist/app.js', false, rules), true);
    assert.strictEqual(isIgnored('src/dist', true, rules), false);
  });

  it('matches a bare directory name anywhere', () => {
    const rules = parseGitignore('build/');
    assert.strictEqual(isIgnored('build', true, rules), true);
    assert.strictEqual(isIgnored('packages/web/build', true, rules), true);
    assert.strictEqual(isIgnored('packages/web/build/out.js', false, rules), true);
  });

  it('honors negation with last-match-wins', () => {
    const rules = parseGitignore('*.log\n!keep.log');
    assert.strictEqual(isIgnored('debug.log', false, rules), true);
    assert.strictEqual(isIgnored('keep.log', false, rules), false);
  });

  it('supports ** wildcards', () => {
    const rules = parseGitignore('**/temp');
    assert.strictEqual(isIgnored('temp', true, rules), true);
    assert.strictEqual(isIgnored('a/b/temp', true, rules), true);
  });

  it('skips comments and blank lines', () => {
    const rules = parseGitignore('# a comment\n\n   \nsecret.txt');
    assert.strictEqual(rules.length, 1);
    assert.strictEqual(isIgnored('secret.txt', false, rules), true);
  });

  it('applies nested rules relative to their base directory', () => {
    const root = parseGitignore('*.log');
    const nested = parseGitignore('cache/', 'packages/web');
    const rules = combineRules(root, nested);
    assert.strictEqual(isIgnored('packages/web/cache', true, rules), true);
    assert.strictEqual(isIgnored('packages/web/cache/x', false, rules), true);
    // The nested rule must not leak to siblings.
    assert.strictEqual(isIgnored('packages/api/cache', true, rules), false);
  });
});
