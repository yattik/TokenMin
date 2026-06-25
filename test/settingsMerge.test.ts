import * as assert from 'assert';
import { parse } from 'jsonc-parser';
import { mergeExclusions } from '../src/apply/settingsMerge';
import { ExclusionPayload } from '../src/recommendations/types';
import { ApplyHistory, ApplyTransaction, HistoryStore, newTransactionId } from '../src/apply/types';

const payload = (search: string[] = [], files: string[] = []): ExclusionPayload => ({
  searchExclude: search,
  filesExclude: files,
});

describe('mergeExclusions', () => {
  it('creates settings from empty input', () => {
    const result = mergeExclusions('', payload(['**/node_modules'], ['**/node_modules']));
    assert.strictEqual(result.changed, true);
    const parsed = parse(result.newText);
    assert.strictEqual(parsed['search.exclude']['**/node_modules'], true);
    assert.strictEqual(parsed['files.exclude']['**/node_modules'], true);
  });

  it('merges without clobbering existing settings or exclusions', () => {
    const existing = JSON.stringify(
      {
        'editor.tabSize': 2,
        'search.exclude': { '**/.cache': true },
      },
      null,
      2,
    );
    const result = mergeExclusions(existing, payload(['**/dist']));
    const parsed = parse(result.newText);
    assert.strictEqual(parsed['editor.tabSize'], 2);
    assert.strictEqual(parsed['search.exclude']['**/.cache'], true);
    assert.strictEqual(parsed['search.exclude']['**/dist'], true);
    assert.deepStrictEqual(result.addedSearchExclude, ['**/dist']);
  });

  it('is idempotent — re-running adds nothing', () => {
    const first = mergeExclusions('{}', payload(['**/node_modules'], ['**/node_modules']));
    const second = mergeExclusions(first.newText, payload(['**/node_modules'], ['**/node_modules']));
    assert.strictEqual(second.changed, false);
    assert.strictEqual(second.newText, first.newText);
    assert.deepStrictEqual(second.addedSearchExclude, []);
    assert.deepStrictEqual(second.addedFilesExclude, []);
  });

  it('preserves comments in JSONC settings', () => {
    const jsonc = '{\n  // keep my notes\n  "editor.tabSize": 4\n}\n';
    const result = mergeExclusions(jsonc, payload(['**/dist']));
    assert.ok(result.newText.includes('// keep my notes'), 'comment should be preserved');
    assert.strictEqual(parse(result.newText)['editor.tabSize'], 4);
    assert.strictEqual(parse(result.newText)['search.exclude']['**/dist'], true);
  });

  it('reports no change for an empty payload', () => {
    const result = mergeExclusions('{ "a": 1 }', payload());
    assert.strictEqual(result.changed, false);
    assert.strictEqual(result.newText, '{ "a": 1 }');
  });

  it('only adds the globs that are not already present', () => {
    const existing = JSON.stringify({ 'search.exclude': { '**/node_modules': true } });
    const result = mergeExclusions(existing, payload(['**/node_modules', '**/dist']));
    assert.deepStrictEqual(result.addedSearchExclude, ['**/dist']);
  });
});

/** In-memory HistoryStore standing in for vscode.Memento. */
class MemStore implements HistoryStore {
  private data = new Map<string, unknown>();
  get<T>(key: string, defaultValue: T): T {
    return this.data.has(key) ? (this.data.get(key) as T) : defaultValue;
  }
  async update(key: string, value: unknown): Promise<void> {
    this.data.set(key, value);
  }
}

function tx(id: string): ApplyTransaction {
  return { id, timestamp: 1, rootFsPath: '/repo', changes: [] };
}

describe('ApplyHistory', () => {
  it('records and returns the latest transaction', async () => {
    const history = new ApplyHistory(new MemStore());
    assert.strictEqual(history.latest(), undefined);
    await history.record(tx('a'));
    await history.record(tx('b'));
    assert.strictEqual(history.latest()?.id, 'b');
    assert.strictEqual(history.all().length, 2);
  });

  it('removes a transaction by id (so repeated undo steps back)', async () => {
    const history = new ApplyHistory(new MemStore());
    await history.record(tx('a'));
    await history.record(tx('b'));
    await history.remove('b');
    assert.strictEqual(history.latest()?.id, 'a');
  });

  it('caps the history to 25 transactions', async () => {
    const history = new ApplyHistory(new MemStore());
    for (let i = 0; i < 30; i++) {
      await history.record(tx(`t${i}`));
    }
    assert.strictEqual(history.all().length, 25);
    assert.strictEqual(history.latest()?.id, 't29');
    assert.strictEqual(history.all()[0].id, 't5');
  });

  it('clears all history', async () => {
    const history = new ApplyHistory(new MemStore());
    await history.record(tx('a'));
    await history.clear();
    assert.strictEqual(history.latest(), undefined);
  });

  it('generates unique ids within the same millisecond', () => {
    const ids = new Set([newTransactionId(1000), newTransactionId(1000), newTransactionId(1000)]);
    assert.strictEqual(ids.size, 3);
  });
});
