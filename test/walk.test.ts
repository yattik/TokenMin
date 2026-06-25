import * as assert from 'assert';
import { walk } from '../src/fs/walk';
import { MemReader } from './helpers/memReader';

describe('walk', () => {
  it('prunes known noise directories without descending', async () => {
    const reader = new MemReader([
      { path: 'src/index.ts', size: 100 },
      { path: 'node_modules/left-pad/index.js', size: 50 },
      { path: 'dist/bundle.js', size: 200 },
    ]);
    const result = await walk(reader, { cap: 1000 });

    const filePaths = result.files.map((f) => f.relativePath);
    assert.deepStrictEqual(filePaths, ['src/index.ts']);

    const prunedNames = result.prunedDirs.map((d) => d.dirName).sort();
    assert.deepStrictEqual(prunedNames, ['dist', 'node_modules']);
    assert.ok(result.prunedDirs.every((d) => d.reason === 'noise'));
  });

  it('respects .gitignore (root and nested)', async () => {
    const reader = new MemReader([
      { path: '.gitignore', content: '*.log\nsecret/' },
      { path: 'app.ts', size: 10 },
      { path: 'debug.log', size: 10 },
      { path: 'secret/key.txt', size: 10 },
      { path: 'pkg/.gitignore', content: 'local.json' },
      { path: 'pkg/main.ts', size: 10 },
      { path: 'pkg/local.json', size: 10 },
    ]);
    const result = await walk(reader, { cap: 1000 });

    const filePaths = result.files.map((f) => f.relativePath).sort();
    assert.deepStrictEqual(filePaths, ['.gitignore', 'app.ts', 'pkg/.gitignore', 'pkg/main.ts']);

    const giPruned = result.prunedDirs.find((d) => d.dirName === 'secret');
    assert.ok(giPruned);
    assert.strictEqual(giPruned!.reason, 'gitignore');
  });

  it('marks a gitignored noise dir as both noise and gitignored', async () => {
    const reader = new MemReader([
      { path: '.gitignore', content: 'node_modules/' },
      { path: 'node_modules/x/i.js', size: 1 },
      { path: 'index.ts', size: 1 },
    ]);
    const result = await walk(reader, { cap: 1000 });
    const nm = result.prunedDirs.find((d) => d.dirName === 'node_modules');
    assert.ok(nm);
    assert.strictEqual(nm!.reason, 'noise');
    assert.strictEqual(nm!.gitignored, true);
  });

  it('truncates at the file cap', async () => {
    const specs = Array.from({ length: 10 }, (_, i) => ({ path: `f${i}.ts`, size: 1 }));
    const reader = new MemReader(specs);
    const result = await walk(reader, { cap: 5 });
    assert.strictEqual(result.files.length, 5);
    assert.strictEqual(result.truncated, true);
  });

  it('descends into noise dirs when pruneNoise is disabled', async () => {
    const reader = new MemReader([
      { path: 'dist/bundle.js', size: 5 },
      { path: 'src/i.ts', size: 5 },
    ]);
    const result = await walk(reader, { cap: 1000, pruneNoise: false });
    const filePaths = result.files.map((f) => f.relativePath).sort();
    assert.deepStrictEqual(filePaths, ['dist/bundle.js', 'src/i.ts']);
    assert.strictEqual(result.prunedDirs.length, 0);
  });
});
