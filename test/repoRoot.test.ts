import * as assert from 'assert';
import { planRootResolution, WorkspaceFolderInfo } from '../src/repoRoot';

const folder = (name: string, fsPath: string): WorkspaceFolderInfo => ({ name, fsPath });

describe('planRootResolution', () => {
  it('returns none when no folders are open', () => {
    const result = planRootResolution([]);
    assert.strictEqual(result.kind, 'none');
  });

  it('auto-selects the single folder', () => {
    const only = folder('proj', '/home/user/proj');
    const result = planRootResolution([only]);
    assert.strictEqual(result.kind, 'single');
    if (result.kind === 'single') {
      assert.deepStrictEqual(result.root, only);
    }
  });

  it('asks the user to pick when multiple folders are open', () => {
    const a = folder('a', '/repos/a');
    const b = folder('b', '/repos/b');
    const result = planRootResolution([a, b]);
    assert.strictEqual(result.kind, 'pick');
    if (result.kind === 'pick') {
      assert.strictEqual(result.candidates.length, 2);
      assert.deepStrictEqual(result.candidates, [a, b]);
    }
  });

  it('does not mutate the input array for the pick case', () => {
    const input = [folder('a', '/a'), folder('b', '/b')];
    const result = planRootResolution(input);
    if (result.kind === 'pick') {
      result.candidates.push(folder('c', '/c'));
      assert.strictEqual(input.length, 2, 'input must not be mutated');
    }
  });
});
