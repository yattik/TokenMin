import * as assert from 'assert';
import { parse } from 'jsonc-parser';
import {
  MCP_SERVER_ID,
  buildGraphAgents,
  buildMcpConfig,
  buildMcpServerEntry,
  mcpConfigHasServer,
  mergeMcpConfigText,
} from '../src/knowledgeGraph/copilotIntegration';

describe('copilotIntegration: mcp.json', () => {
  it('builds a stdio server entry for the managed binary', () => {
    const entry = buildMcpServerEntry('/managed/bin/codebase-memory-mcp');
    assert.strictEqual(entry.type, 'stdio');
    assert.strictEqual(entry.command, '/managed/bin/codebase-memory-mcp');
    assert.deepStrictEqual(entry.args, []);
  });

  it('produces a valid standalone config', () => {
    const text = buildMcpConfig('/bin/cmm');
    const parsed = parse(text) as { servers: Record<string, { command: string }> };
    assert.strictEqual(parsed.servers[MCP_SERVER_ID].command, '/bin/cmm');
    assert.ok(mcpConfigHasServer(text));
  });

  it('merges into an existing config without dropping other servers', () => {
    const existing = JSON.stringify({ servers: { other: { type: 'stdio', command: 'x', args: [] } } }, null, 2);
    const merged = mergeMcpConfigText(existing, '/bin/cmm');
    const parsed = parse(merged) as { servers: Record<string, { command: string }> };
    assert.strictEqual(parsed.servers.other.command, 'x');
    assert.strictEqual(parsed.servers[MCP_SERVER_ID].command, '/bin/cmm');
  });

  it('is idempotent and parseable on re-merge', () => {
    const once = mergeMcpConfigText('', '/bin/cmm');
    const twice = mergeMcpConfigText(once, '/bin/cmm');
    assert.strictEqual(once, twice);
  });

  it('reports false when the managed server is absent', () => {
    assert.strictEqual(mcpConfigHasServer(''), false);
    assert.strictEqual(mcpConfigHasServer('{"servers":{"other":{}}}'), false);
  });
});

describe('copilotIntegration: graph agents', () => {
  it('emits agent, prompt and instruction files under .github', () => {
    const files = buildGraphAgents();
    const paths = files.map((f) => f.relativePath).sort();
    assert.deepStrictEqual(paths, [
      '.github/agents/graph-implement.agent.md',
      '.github/agents/graph-plan.agent.md',
      '.github/instructions/knowledge-graph.instructions.md',
      '.github/prompts/graph-investigate.prompt.md',
    ]);
  });

  it('steers the model toward graph tools and the managed server id', () => {
    const files = buildGraphAgents();
    for (const file of files) {
      assert.ok(file.content.includes(MCP_SERVER_ID), `${file.relativePath} references the server id`);
      assert.ok(/get_architecture/.test(file.content), `${file.relativePath} mentions graph tools`);
    }
  });

  it('marks every file with valid frontmatter', () => {
    for (const file of buildGraphAgents()) {
      assert.ok(file.content.startsWith('---\n'), `${file.relativePath} starts with frontmatter`);
    }
  });
});
