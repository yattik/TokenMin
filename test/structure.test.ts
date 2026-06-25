import * as assert from 'assert';
import { analyzeStructure } from '../src/analyzer/structure';
import { WalkResult } from '../src/fs/types';

function makeWalk(partial: Partial<WalkResult>): WalkResult {
  return {
    files: [],
    prunedDirs: [],
    truncated: false,
    cap: 1000,
    ...partial,
  };
}

describe('analyzeStructure', () => {
  it('summarizes counts, sizes, and top-level directories', () => {
    const analysis = analyzeStructure(
      makeWalk({
        files: [
          { relativePath: 'src/a.ts', size: 100, isDirectory: false },
          { relativePath: 'src/b.ts', size: 200, isDirectory: false },
          { relativePath: 'README.md', size: 50, isDirectory: false },
        ],
      }),
    );
    assert.strictEqual(analysis.totalFiles, 3);
    assert.strictEqual(analysis.totalSize, 350);
    assert.strictEqual(analysis.topLevelDirs[0].name, 'src');
    assert.strictEqual(analysis.topLevelDirs[0].fileCount, 2);
    const root = analysis.topLevelDirs.find((d) => d.name === '.');
    assert.strictEqual(root?.fileCount, 1);
  });

  it('reports pruned noise dirs with gitignore status', () => {
    const analysis = analyzeStructure(
      makeWalk({
        files: [{ relativePath: 'src/a.ts', size: 1, isDirectory: false }],
        prunedDirs: [
          { relativePath: 'node_modules', dirName: 'node_modules', reason: 'noise', gitignored: true },
          { relativePath: 'dist', dirName: 'dist', reason: 'noise', gitignored: false },
          { relativePath: 'secret', dirName: 'secret', reason: 'gitignore', gitignored: true },
        ],
      }),
    );
    const names = analysis.noisyDirs.map((d) => d.name);
    assert.ok(names.includes('node_modules'));
    assert.ok(names.includes('dist'));
    assert.ok(!names.includes('secret')); // gitignore-only prune isn't "noise"

    const nm = analysis.noisyDirs.find((d) => d.name === 'node_modules')!;
    assert.strictEqual(nm.pruned, true);
    assert.strictEqual(nm.gitignored, true);
    assert.strictEqual(analysis.gitignoredDirCount, 1);
    // high-tier noise should sort before medium-tier.
    assert.strictEqual(analysis.noisyDirs[0].name, 'node_modules');
  });

  it('detects noise discovered via file path prefixes (not pruned)', () => {
    const analysis = analyzeStructure(
      makeWalk({
        files: [
          { relativePath: 'packages/web/dist/bundle.js', size: 10, isDirectory: false },
          { relativePath: 'packages/web/src/i.ts', size: 10, isDirectory: false },
        ],
      }),
    );
    const dist = analysis.noisyDirs.find((d) => d.relativePath === 'packages/web/dist');
    assert.ok(dist);
    assert.strictEqual(dist!.fileCount, 1);
    assert.strictEqual(dist!.pruned, false);
  });

  it('flags large files, binaries, and lockfiles', () => {
    const analysis = analyzeStructure(
      makeWalk({
        files: [
          { relativePath: 'big.bin', size: 2 * 1024 * 1024, isDirectory: false },
          { relativePath: 'small.ts', size: 10, isDirectory: false },
          { relativePath: 'logo.png', size: 100, isDirectory: false },
          { relativePath: 'package-lock.json', size: 100, isDirectory: false },
        ],
      }),
    );
    assert.strictEqual(analysis.largeFiles.length, 1);
    assert.strictEqual(analysis.largeFiles[0].relativePath, 'big.bin');
    assert.strictEqual(analysis.binaryFileCount, 2); // big.bin + logo.png
    assert.deepStrictEqual(analysis.lockfiles, ['package-lock.json']);
  });

  it('honors a custom large-file threshold', () => {
    const analysis = analyzeStructure(
      makeWalk({ files: [{ relativePath: 'a.ts', size: 1000, isDirectory: false }] }),
      { largeFileThreshold: 500 },
    );
    assert.strictEqual(analysis.largeFiles.length, 1);
  });
});
