import * as assert from 'assert';
import { buildCliArgs, parseCliJson, asRecord, pickArray, pickNumber, pickString } from '../src/knowledgeGraph/cli';

describe('knowledgeGraph cli', () => {
  it('builds cli argv with a JSON payload', () => {
    const args = buildCliArgs('index_repository', { repo_path: '/x/y' });
    assert.deepStrictEqual(args, ['cli', 'index_repository', '{"repo_path":"/x/y"}']);
  });

  it('defaults to an empty payload object', () => {
    assert.deepStrictEqual(buildCliArgs('list_projects'), ['cli', 'list_projects', '{}']);
  });

  it('parses clean JSON output', () => {
    assert.deepStrictEqual(parseCliJson('{"status":"indexed"}'), { status: 'indexed' });
    assert.deepStrictEqual(parseCliJson('[1,2,3]'), [1, 2, 3]);
  });

  it('extracts a JSON object preceded by a banner line', () => {
    const out = 'codebase-memory-mcp v0.8.1\nINFO ready\n{"nodes": 5, "edges": 9}\n';
    assert.deepStrictEqual(parseCliJson(out), { nodes: 5, edges: 9 });
  });

  it('handles nested braces and strings while scanning past a banner', () => {
    const out = 'INFO ready\n{"a":{"b":"}{"},"c":[1,{"d":2}]}';
    assert.deepStrictEqual(parseCliJson(out), { a: { b: '}{' }, c: [1, { d: 2 }] });
  });

  it('returns undefined for empty or unparseable output', () => {
    assert.strictEqual(parseCliJson(''), undefined);
    assert.strictEqual(parseCliJson('no json here'), undefined);
  });

  it('typed accessors read aliases defensively', () => {
    const rec = asRecord({ name: 'x', files: 7, deps: ['a', 'b'] });
    assert.strictEqual(pickString(rec, 'label', 'name'), 'x');
    assert.strictEqual(pickNumber(rec, 'size', 'files'), 7);
    assert.deepStrictEqual(pickArray(rec, 'imports', 'deps'), ['a', 'b']);
    assert.strictEqual(pickString(asRecord(null), 'name'), undefined);
    assert.deepStrictEqual(pickArray(rec, 'missing'), []);
  });
});
