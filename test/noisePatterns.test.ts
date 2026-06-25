import * as assert from 'assert';
import {
  baseName,
  extName,
  isBinaryPath,
  isLockfile,
  matchNoiseDir,
} from '../src/core/noisePatterns';

describe('noise patterns', () => {
  it('classifies known noise directories with tiers', () => {
    assert.strictEqual(matchNoiseDir('node_modules')?.tier, 'high');
    assert.strictEqual(matchNoiseDir('dist')?.tier, 'medium');
    assert.strictEqual(matchNoiseDir('vendor')?.tier, 'low');
    assert.strictEqual(matchNoiseDir('src'), undefined);
  });

  it('recognizes lockfiles', () => {
    assert.ok(isLockfile('package-lock.json'));
    assert.ok(isLockfile('Cargo.lock'));
    assert.ok(isLockfile('go.sum'));
    assert.strictEqual(isLockfile('package.json'), false);
  });

  it('detects binary extensions', () => {
    assert.ok(isBinaryPath('assets/logo.png'));
    assert.ok(isBinaryPath('bin/app.exe'));
    assert.strictEqual(isBinaryPath('src/index.ts'), false);
    assert.strictEqual(isBinaryPath('icon.svg'), false); // svg is text
  });

  it('extracts extension and base name with forward slashes', () => {
    assert.strictEqual(extName('a/b/c.TS'), '.ts');
    assert.strictEqual(extName('Makefile'), '');
    assert.strictEqual(extName('.gitignore'), '');
    assert.strictEqual(baseName('a/b/c.ts'), 'c.ts');
    assert.strictEqual(baseName('file'), 'file');
  });
});
