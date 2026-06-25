# TokenMin — Hackathon Demo Checklist

A 5‑minute walkthrough of the Token Optimizer story. Estimates are clearly
labeled; TokenMin never claims access to real Copilot billing tokens.

## 0. Setup (once)
- Open this repo in VS Code with the extension running (F5 / installed VSIX).
- A status‑bar button **🚀 Token Optimizer** is always visible (bottom‑right).

## 1. Open the dashboard (feature‑control UI)
- Click **🚀 Token Optimizer** (or run `Token Optimizer: Open Dashboard`).
- The light, Siemens Healthineers–themed dashboard opens with five toggles:
  - Knowledge Graph Context
  - Knowledge Graph Query Caching
  - Prompt Restructuring
  - Token Comparison Tracking
  - 3D Knowledge Graph Visualization
- Toggle one off and on — it persists under `tokenmin.features.*`
  (Settings → search “tokenmin features”). Disabled features grey out their
  related action buttons.

## 2. Index the repo into the knowledge graph
- Dashboard → **Setup Knowledge Graph** (first time installs the managed
  codebase-memory-mcp runtime into extension global storage — no manual install).
- Dashboard → **Index Repo into Graph**.
- Verify: the Knowledge Graph panel opens with node/edge/package counts.
  Under the hood `list_projects` now lists this repo and `get_architecture`
  populates the summary.

## 3. Configure Copilot to use the graph
- Dashboard → **Configure Copilot to Use Graph**.
- Review the diff preview, then apply. It writes:
  - `.vscode/mcp.json` registering the `codebase-memory` MCP server.
  - `.github/agents/graph-plan.agent.md`, `graph-implement.agent.md`
  - `.github/instructions/knowledge-graph.instructions.md`
  - `.github/prompts/graph-investigate.prompt.md`
- These steer Copilot agents to query the graph in this order **before** broad
  file reads: `get_architecture → search_graph → trace_path → detect_changes →
  get_code_snippet / search_code`.

## 4. Agent knowledge‑graph flow + token comparison + cache hit
- Open the Knowledge Graph panel (**Open Knowledge Graph + 3D**).
- Run **search_graph** (e.g. `.*Service.*`) and **trace_path** (e.g. a function
  name). Each result shows a token comparison:
  *graph result ~N tokens vs reading the matched files ~M tokens, saved ~K (P%).*
- Click **Analyze diff impact** to run `detect_changes`.
- Re‑run the **same** search — the result is now badged
  **⚡ Served from cache** (~0 new tokens). The dashboard’s **Token tracking**
  cards show hits / misses / hit‑rate climbing.
- Edit a file and re‑run impact; the changed `detect_changes` signature
  invalidates the cache so the next query is fresh again.

## 5. Prompt restructuring
- Dashboard → **Optimize Prompt** (or `Token Optimizer: Optimize Prompt`).
- Enter a vague prompt, e.g. `the login is broken, fix it`.
- Click **Optimize prompt**. Output is a focused engineering prompt with
  Task / Constraints / Relevant context / Acceptance criteria / Verification.
- The impact pills show clarity (e.g. 30 → 90), prompt tokens, estimated
  round‑trips saved, and estimated net tokens saved.
- Click **Copy for Copilot Chat** and paste it into Copilot Chat.
- (Optional) tick **Refine with Copilot model** to add a small‑model pass;
  it falls back to the deterministic output if no model is available.

## 6. 3D graph inside VS Code
- Knowledge Graph panel → **Open 3D graph UI**.
- The codebase-memory-mcp 3D UI loads in an **embedded VS Code webview**
  (via `asExternalUri`), not an external browser. “Open in browser ↗” is a
  secondary fallback.

## 7. Theme consistency
- Dashboard, Optimize Prompt, Knowledge Graph, 3D wrapper, and the Efficiency
  Report all share the Siemens Healthineers palette (petrol/orange/magenta‑violet)
  and a light‑first surface.

## What is actually verified
- `npm run compile` — type‑check + bundle: OK.
- `npm run test:unit` — pure‑module unit tests incl. graph query cache, prompt
  restructuring, dashboard features/HTML, light theme, MCP/agent generation: OK.
- `npm run verify:bundle` — bundled extension activates and registers commands: OK.

## Honest limitations (VS Code / Copilot APIs)
- Extensions **cannot** intercept or rewrite Copilot Chat messages in flight, so
  prompt restructuring is a copy‑paste workflow, not an interceptor.
- Extensions **cannot** read real Copilot billing/token accounting; every token
  figure here is an estimate (~4 chars/token).
- Copilot’s use of the graph depends on the user starting the `codebase-memory`
  MCP server and selecting the graph agents in Copilot Chat.
