import * as assert from 'assert';
import { GraphQueryCache } from '../src/knowledgeGraph/queryCache';

describe('GraphQueryCache', () => {
  it('returns undefined on a miss and records the miss', () => {
    const cache = new GraphQueryCache();
    assert.strictEqual(cache.get('proj', 'search_graph', 'Foo'), undefined);
    assert.deepStrictEqual(cache.stats(), { hits: 0, misses: 1, entries: 0 });
  });

  it('serves a stored value and counts the hit', () => {
    const cache = new GraphQueryCache();
    cache.set('proj', 'search_graph', 'Foo', { rows: 3 });
    const hit = cache.get<{ rows: number }>('proj', 'search_graph', 'Foo');
    assert.deepStrictEqual(hit, { rows: 3 });
    assert.strictEqual(cache.stats().hits, 1);
  });

  it('scopes entries by project, tool and argument', () => {
    const cache = new GraphQueryCache();
    cache.set('a', 'search_graph', 'Foo', 1);
    assert.strictEqual(cache.get('b', 'search_graph', 'Foo'), undefined, 'different project misses');
    assert.strictEqual(cache.get('a', 'trace_path', 'Foo'), undefined, 'different tool misses');
    assert.strictEqual(cache.get('a', 'search_graph', 'Bar'), undefined, 'different arg misses');
    assert.strictEqual(cache.get('a', 'search_graph', 'Foo'), 1, 'exact key hits');
  });

  it('invalidate() drops a project\'s entries and they miss afterward', () => {
    const cache = new GraphQueryCache();
    cache.set('proj', 'search_graph', 'Foo', 1);
    cache.invalidate('proj');
    assert.strictEqual(cache.get('proj', 'search_graph', 'Foo'), undefined);
  });

  it('setSignature() invalidates only when the signature changes', () => {
    const cache = new GraphQueryCache();
    cache.set('proj', 'search_graph', 'Foo', 1);

    // First signature: establishes a baseline, does not invalidate.
    assert.strictEqual(cache.setSignature('proj', 'sig-1'), false);
    assert.strictEqual(cache.get('proj', 'search_graph', 'Foo'), 1, 'still cached after baseline');

    // Same signature again: no change, no invalidation.
    assert.strictEqual(cache.setSignature('proj', 'sig-1'), false);
    cache.set('proj', 'search_graph', 'Foo', 2);
    assert.strictEqual(cache.get('proj', 'search_graph', 'Foo'), 2);

    // Changed signature: invalidates the project.
    assert.strictEqual(cache.setSignature('proj', 'sig-2'), true);
    assert.strictEqual(cache.get('proj', 'search_graph', 'Foo'), undefined);
  });

  it('evicts the oldest entry past the capacity', () => {
    const cache = new GraphQueryCache(2);
    cache.set('p', 't', 'a', 1);
    cache.set('p', 't', 'b', 2);
    cache.set('p', 't', 'c', 3); // evicts 'a'
    assert.strictEqual(cache.get('p', 't', 'a'), undefined);
    assert.strictEqual(cache.get('p', 't', 'b'), 2);
    assert.strictEqual(cache.get('p', 't', 'c'), 3);
  });

  it('clear() removes entries and resets accounting', () => {
    const cache = new GraphQueryCache();
    cache.set('p', 't', 'a', 1);
    cache.get('p', 't', 'a');
    cache.clear();
    assert.deepStrictEqual(cache.stats(), { hits: 0, misses: 0, entries: 0 });
  });
});
