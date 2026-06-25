/**
 * Pure helpers that wire the codebase-memory-mcp knowledge graph into Copilot.
 *
 * Two concerns, both side-effect free so they can be unit-tested:
 *  1. {@link mergeMcpConfigText} produces a format-preserving `.vscode/mcp.json`
 *     that registers the managed graph binary as a stdio MCP server, so the
 *     Copilot agent (and any custom agents) can call its graph tools.
 *  2. {@link buildGraphAgents} emits custom agent / prompt / instruction files
 *     that steer the model to query the graph (architecture → search → trace →
 *     impact) before doing broad, token-hungry file reads.
 */
import { parse, modify, applyEdits, FormattingOptions } from 'jsonc-parser';
import { GeneratedFile } from '../apply/types';

/** Server id used inside `.vscode/mcp.json` and referenced by the agents. */
export const MCP_SERVER_ID = 'codebase-memory';

const FORMATTING: FormattingOptions = { tabSize: 2, insertSpaces: true, eol: '\n' };

/** The stdio server entry the extension registers for the managed binary. */
export function buildMcpServerEntry(binaryPath: string): {
  type: 'stdio';
  command: string;
  args: string[];
} {
  return { type: 'stdio', command: binaryPath, args: [] };
}

/** A standalone, pretty-printed `.vscode/mcp.json` for the managed binary. */
export function buildMcpConfig(binaryPath: string): string {
  return mergeMcpConfigText('', binaryPath);
}

/**
 * Merge the managed graph server into an existing `.vscode/mcp.json` while
 * preserving the user's other servers, comments and formatting. Idempotent.
 */
export function mergeMcpConfigText(existing: string, binaryPath: string): string {
  const source = existing.trim() ? existing : '{}';
  const entry = buildMcpServerEntry(binaryPath);
  const edits = modify(source, ['servers', MCP_SERVER_ID], entry, { formattingOptions: FORMATTING });
  const merged = applyEdits(source, edits);
  // Normalize a trailing newline for tidy diffs.
  return merged.endsWith('\n') ? merged : `${merged}\n`;
}

/** True when the given `.vscode/mcp.json` already registers the managed server. */
export function mcpConfigHasServer(existing: string): boolean {
  if (!existing.trim()) {
    return false;
  }
  const parsed = parse(existing) as { servers?: Record<string, unknown> } | undefined;
  return Boolean(parsed?.servers && Object.prototype.hasOwnProperty.call(parsed.servers, MCP_SERVER_ID));
}

/**
 * Custom agent + prompt + instruction files that make Copilot prefer the
 * knowledge graph. Paths follow VS Code's `.github/` customization layout.
 */
export function buildGraphAgents(): GeneratedFile[] {
  return [
    { relativePath: '.github/instructions/knowledge-graph.instructions.md', content: instructionsFile() },
    { relativePath: '.github/agents/graph-plan.agent.md', content: planAgentFile() },
    { relativePath: '.github/agents/graph-implement.agent.md', content: implementAgentFile() },
    { relativePath: '.github/prompts/graph-investigate.prompt.md', content: investigatePromptFile() },
  ];
}

const TOOLS_LINE =
  'get_architecture, search_graph, trace_path, detect_changes, get_code_snippet, search_code, query_graph';

function workflowBody(): string {
  return `## Use the knowledge graph first

This repository is indexed by the \`${MCP_SERVER_ID}\` MCP server (codebase-memory-mcp).
Prefer its graph tools over reading many files — they return the same structural
facts for a fraction of the tokens.

Recommended order before touching code:

1. \`get_architecture\` — packages, hotspots, languages, entry points.
2. \`search_graph\` — locate symbols by name/regex (callers, callees, degree).
3. \`trace_path\` — find how two symbols connect.
4. \`detect_changes\` — for a diff, list the impacted symbols.
5. \`get_code_snippet\` / \`search_code\` — pull only the exact lines you need.

Only fall back to broad file reads when the graph cannot answer the question.
Available tools: ${TOOLS_LINE}.

> Token note: savings are estimates. Copilot's actual billing is not exposed to
> extensions, so treat reductions as directional, not exact.`;
}

function instructionsFile(): string {
  return `---
description: Prefer the codebase knowledge graph (codebase-memory-mcp) before broad file reads.
applyTo: "**"
---

${workflowBody()}
`;
}

function planAgentFile(): string {
  return `---
name: graph-plan
description: Plan a change by exploring the codebase through the knowledge graph (read-only).
tools: ['${MCP_SERVER_ID}', 'search', 'codebase', 'usages']
---

You are a planning agent. Explore read-only and produce a concrete, step-by-step plan.

${workflowBody()}

Deliver a numbered plan that cites the symbols and files the graph surfaced.
Do not edit files in this mode.
`;
}

function implementAgentFile(): string {
  return `---
name: graph-implement
description: Implement an approved change, using the knowledge graph to scope edits.
tools: ['${MCP_SERVER_ID}', 'search', 'codebase', 'usages', 'editFiles', 'runCommands']
---

You implement approved changes with minimal, scoped edits, then verify them.

${workflowBody()}

Before editing, use \`search_graph\`/\`trace_path\` to find every caller and callee
so the change stays scoped. After editing, run \`detect_changes\` to confirm the
blast radius matches the plan.
`;
}

function investigatePromptFile(): string {
  return `---
mode: agent
description: Investigate a symbol or subsystem using the knowledge graph.
---

Investigate \${input:target:symbol, file, or subsystem} using the \`${MCP_SERVER_ID}\` graph tools.

${workflowBody()}

Report: the relevant symbols, their callers/callees, the connecting paths, and an
estimate of how many file reads the graph saved.
`;
}
