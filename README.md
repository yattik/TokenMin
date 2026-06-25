# Copilot Token-Efficiency Optimizer (TokenMin)

TokenMin is a VS Code extension that reduces wasted Copilot agent context by
making a repository easier to retrieve from, reason about, and operate on. It
combines repo analysis, prompt restructuring, local codebase-memory indexing,
estimated token comparisons, and reviewable optimization artifacts in one
workflow.

It does **not** replace Copilot, send background work to Copilot, or drive the
agent loop. TokenMin prepares better context surfaces for Copilot and gives the
developer explicit control over every repo mutation.

## What TokenMin Does Precisely

TokenMin has four practical jobs:

1. **Analyze the repository**: walk the repo, detect stack/layout, identify noisy
   paths, inspect existing VS Code/Copilot configuration, and score how ready the
   repo is for efficient agent work.
2. **Generate reviewable optimization artifacts**: propose `.vscode/settings.json`
   exclusions, `.github/copilot-instructions.md`, scoped instructions, focused
   Plan/Implement agents, and `ARCHITECTURE.md` where useful.
3. **Provide knowledge-graph context**: install and manage `codebase-memory-mcp`,
   index the repo into a local knowledge graph, configure Copilot MCP access, and
   open the codebase-memory 3D UI directly inside VS Code.
4. **Improve prompts before they reach Copilot**: restructure vague requests into
   focused prompts with intent, constraints, likely files/symbols, acceptance
   criteria, and verification steps.

All estimates are transparent. TokenMin uses file-size and prompt-size heuristics
to compare workflows, because real Copilot billing and exact prompt telemetry are
not exposed to extensions.

## Updated Feature Set

| Feature | What it does | Why it matters |
| --- | --- | --- |
| Repo analysis dashboard | Shows repo readiness, runtime status, cache stats, and core actions. | Gives teams one place to inspect and run the optimization workflow. |
| Reviewable optimize flow | Generates recommendations, opens diff previews, and applies only approved changes. | Keeps repo mutations explicit and reversible. |
| Noise exclusion recommendations | Finds dependency folders, build outputs, caches, generated files, and lockfiles that usually hurt retrieval. | Reduces irrelevant search results and file reads. |
| Copilot instruction generation | Creates concise always-on and scoped instructions with detected stack/layout guidance. | Gives agents useful rules without bloating every prompt. |
| Plan/Implement agents | Generates focused custom agents for read-only planning and scoped implementation. | Separates exploration from editing and trims tool metadata. |
| Knowledge graph runtime | Manages `codebase-memory-mcp`, indexes the repo, and configures MCP access for Copilot. | Lets agents query code structure before reading broad file areas. |
| Embedded 3D codebase-memory UI | Opens the codebase-memory visualizer directly from the TokenMin dashboard. | Makes the indexed codebase inspectable without switching tools. |
| Prompt optimizer | Turns vague prompts into structured Copilot-ready requests. | Improves first-shot accuracy and reduces clarification loops. |
| Query cache | Caches repeated graph queries per repo/query and invalidates them when the graph changes. | Avoids paying repeated context cost for the same lookup. |
| Token-comparison reports | Generates estimate reports for file-read vs graph-query workflows and multi-turn sessions. | Provides directional evidence for demos and decision-making. |

## Selling Point

TokenMin's selling point is simple: **it turns Copilot from a broad repo browser
into a better-targeted codebase operator**.

Instead of asking an agent to rediscover project structure every turn, TokenMin
sets up compact instructions, focused tools, scoped agents, clean search surfaces,
and a local codebase memory. The practical promise is fewer wasted reads, cleaner
prompts, faster orientation, and more predictable agent sessions.

For a demo or pitch, frame it as:

> TokenMin reduces the context tax of agentic coding. It does not make Copilot
> smarter by magic; it gives Copilot less irrelevant material and better local
> maps, so the same model can spend more of its budget on the actual task.

## Local Codebase Memory For Agents

TokenMin's knowledge graph feature creates a local memory base from the current
repository and exposes it to Copilot agents through MCP. The memory is local to
the developer machine: TokenMin manages the `codebase-memory-mcp` runtime in VS
Code global storage, indexes the selected repo, and writes MCP/agent files that
tell Copilot how to query the graph before reading broad file areas.

### How The Memory Is Built

```mermaid
flowchart LR
  Repo[Workspace repository]
  TokenMin[TokenMin GraphService]
  Runtime[Managed codebase-memory-mcp runtime]
  Memory[(Local codebase memory)]
  MCP[.vscode/mcp.json]
  Agents[Graph-aware Copilot agents]
  UI[Embedded 3D codebase-memory UI]

  Repo -->|repo_path| TokenMin
  TokenMin -->|ensure runtime| Runtime
  Runtime -->|index_repository| Memory
  TokenMin -->|merge server entry| MCP
  TokenMin -->|generate guidance| Agents
  Runtime -->|start UI server| UI
  Memory -->|architecture, symbols, traces, changes| UI
```

### What The Memory Contains

The local memory is a structural map of the repo rather than a full prompt dump.
Agents query it for compact facts, then read only the specific files or snippets
needed for the task.

```mermaid
flowchart TB
  Memory[(Local codebase memory)]

  Memory --> Project[Project]
  Project --> Packages[Packages and modules]
  Project --> Files[Files]
  Project --> Symbols[Symbols]
  Project --> Routes[Routes and entry points]
  Project --> Hotspots[Hotspots]

  Symbols --> Functions[Functions]
  Symbols --> Classes[Classes]
  Symbols --> Exports[Exports]

  Symbols --> Relations[Relationships]
  Files --> Relations
  Packages --> Relations

  Relations --> Calls[Call links]
  Relations --> Imports[Import links]
  Relations --> Ownership[File/module ownership]
  Relations --> Impact[Change impact]

  Memory --> QueryCache[TokenMin query cache]
  QueryCache --> CachedSearch[Cached search_graph results]
  QueryCache --> CachedTrace[Cached trace_path results]
```

### How An Agent Uses It

The generated graph-aware agents and instructions steer Copilot toward graph
queries first. The intended flow is: inspect architecture, locate symbols, trace
relationships, then open exact files only after the graph has narrowed the work.

```mermaid
sequenceDiagram
  participant User
  participant Copilot as Copilot graph agent
  participant MCP as codebase-memory MCP server
  participant Memory as Local codebase memory
  participant Files as Targeted repo files

  User->>Copilot: Ask for a code change or investigation
  Copilot->>MCP: get_architecture(project)
  MCP->>Memory: Read packages, hotspots, languages, entry points
  Memory-->>MCP: Compact architecture summary
  MCP-->>Copilot: Relevant repo map

  Copilot->>MCP: search_graph(symbol or pattern)
  MCP->>Memory: Find matching symbols and files
  Memory-->>MCP: Symbol/file candidates
  MCP-->>Copilot: Ranked graph results

  Copilot->>MCP: trace_path(symbol, direction)
  MCP->>Memory: Resolve callers, callees, related paths
  Memory-->>MCP: Relationship trace
  MCP-->>Copilot: Impact-aware context

  Copilot->>Files: Read or edit only the narrowed files
  Copilot->>MCP: detect_changes(project)
  MCP->>Memory: Compare diff against graph
  Memory-->>Copilot: Affected symbols and blast radius
```

### Why This Helps

Without local codebase memory, an agent often discovers context by searching and
reading groups of files repeatedly. With TokenMin, the graph answers structural
questions in compact responses: where a symbol lives, what calls it, what it
calls, which files are likely affected, and whether a change touched a known
hotspot. The agent still reads source code when needed, but it starts from a
smaller and more relevant set of files.

## Main Optimize Flow

The main command is **Token Optimizer: Analyze & Optimize Repo**
(`tokenmin.analyzeAndOptimize`). It runs a guided pipeline:

```mermaid
flowchart LR
  A[Pick repo root] --> B[Walk files]
  B --> C[Detect stack and layout]
  C --> D[Build recommendations]
  D --> E[Score current repo]
  E --> F{Use optional Copilot tailoring?}
  F -->|No| G[Generate deterministic artifacts]
  F -->|Yes| H[Send bounded summary to Copilot]
  H --> G
  G --> I[Show scorecard report]
  I --> J[Preview diffs]
  J --> K{User approves?}
  K -->|No| L[Write nothing]
  K -->|Yes| M[Apply idempotent changes]
```

Additional commands:

- **Token Optimizer: Open Dashboard** (`tokenmin.openDashboard`)
- **Token Optimizer: Optimize Prompt for Copilot** (`tokenmin.optimizePrompt`)
- **Token Optimizer: Analyze Repo (report only)** (`tokenmin.analyzeOnly`)
- **Token Optimizer: Show Efficiency Report** (`tokenmin.showReport`)
- **Token Optimizer: Undo Last Applied Changes** (`tokenmin.undoLast`)
- **Token Optimizer: Setup Knowledge Graph** (`tokenmin.setupKnowledgeGraph`)
- **Token Optimizer: Open Knowledge Graph & Analysis** (`tokenmin.openKnowledgeGraph`)
- **Token Optimizer: Configure Copilot to Use Knowledge Graph** (`tokenmin.configureCopilotMcp`)
- **Token Optimizer: Knowledge Graph Status** (`tokenmin.knowledgeGraphStatus`)

## Optimizations Applied For Copilot Agent Mode

### 1. Exclude Low-Signal Paths

TokenMin recommends `search.exclude` and `files.exclude` entries for directories
and files that are usually harmful to agent context quality:

- Dependency folders: `node_modules`, `bower_components`, `Pods`
- Virtual environments and caches: `.venv`, `venv`, `__pycache__`, `.pytest_cache`
- Framework/build caches: `.next`, `.nuxt`, `.svelte-kit`, `.turbo`, `.gradle`
- Build output: `dist`, `build`, `out`, `target`, `coverage`
- Lockfiles in balanced/aggressive modes: `package-lock.json`, `pnpm-lock.yaml`,
  `yarn.lock`, `Cargo.lock`, and similar files

This reduces search results, file listings, and indexed context that would
otherwise distract the agent. Paths already excluded by `.gitignore` are skipped
because Copilot already honors `.gitignore`; adding them again would be noisy and
less honest.

### 2. Add Concise Always-On Instructions

If `.github/copilot-instructions.md` is missing, TokenMin can generate a short
repo-specific file with:

- Detected stack and language information
- Top-level layout or monorepo modules
- Project conventions inferred from the stack
- Test/build hints
- A reminder to prefer local, targeted reads over broad searches

The generator has size guardrails so the instructions remain useful instead of
becoming another large context blob.

### 3. Add Scoped Instructions

For polyglot projects or monorepos, TokenMin can generate scoped instruction
files under `.github/instructions/*.instructions.md` with `applyTo` globs. This
lets Copilot load guidance only when it matches the file being edited.

Example idea:

```md
---
applyTo: "packages/api/**/*.ts"
---

Use the API package conventions and run the API test target before finishing.
```

Scoped guidance is cheaper than putting every convention into one always-loaded
instruction file.

### 4. Add An Architecture Map

For larger repos, TokenMin can generate or recommend an `ARCHITECTURE.md` file.
The purpose is not to document every class. It gives agents and humans a short
map of where things live so they can start in the right place.

### 5. Split Planning From Implementation

TokenMin can add two Copilot custom agents:

- `.github/agents/plan.agent.md`: read-only, reasoning-oriented, used to explore
  and produce a concrete plan.
- `.github/agents/implement.agent.md`: edit/run oriented, used to execute an
  approved plan with a cheaper model preference.

This reduces waste because expensive reasoning is used briefly for planning,
while implementation can run with a more economical model and a focused tool set.

### 6. Trim Tool Definitions

Agent mode includes tool definitions in requests. More tools means more tokens,
and broad tools can produce large outputs. TokenMin generates lean tool sets so
each agent gets only what it needs.

Plan tools are read-oriented. Implement tools include editing and command-running
tools. The report compares the lean tool count against a typical broader agent
tool surface.

### 7. Check Semantic Index Health

TokenMin detects whether the repo appears to have a GitHub remote. A GitHub
remote usually means Copilot can use a remote semantic index. Without one,
Copilot may rely on local indexing or have weaker retrieval. The report includes
index-related guidance and deep links where available.

### 8. Show An Efficiency Scorecard

The scorecard gives a 0-100 score, a projected after-apply score, and proxy
metrics such as:

- Source files considered after pruning
- Noisy paths excluded
- Directories already handled by `.gitignore`
- Estimated instruction tokens
- Lean versus typical tool count
- Semantic index source

Precise live Copilot token metering is not exposed to extensions, so TokenMin is
honest: it uses measurable proxies and links to Copilot's own cost/debug tools.

## Architecture Overview

TokenMin separates pure analysis code from VS Code integration. That keeps most
of the system unit-testable without launching an editor host.

```mermaid
flowchart TB
  subgraph VSCode[VS Code-facing layer]
    EXT[extension.ts]
    ROOT[repoRootPicker.ts]
    VFS[fs/vscodeDirReader.ts]
    APPLY[apply/applyService.ts]
    MODEL[model/modelClient.ts]
    WEB[report/reportWebview.ts]
    FLOW[flow/* orchestration]
  end

  subgraph Pure[Pure deterministic core]
    WALK[fs/walk.ts]
    CORE[core/gitignore.ts + noisePatterns.ts]
    ANALYZER[analyzer/*]
    PIPE[pipeline.ts]
    RECS[recommendations/*]
    GEN[generators/*]
    MERGE[apply/settingsMerge.ts]
    SCORE[report/scorecard.ts + reportHtml.ts]
  end

  EXT --> FLOW
  FLOW --> ROOT
  FLOW --> VFS
  VFS --> WALK
  WALK --> CORE
  WALK --> PIPE
  PIPE --> ANALYZER
  PIPE --> RECS
  RECS --> GEN
  GEN --> APPLY
  RECS --> SCORE
  SCORE --> WEB
  MODEL --> FLOW
```

## Main Runtime Flow

At runtime, `src/extension.ts` registers commands, owns the status bar entry,
and calls `runAnalyze()`. The orchestration then delegates to smaller modules:

```mermaid
sequenceDiagram
  participant User
  participant Extension as extension.ts
  participant Flow as flow/analyzeRepo.ts
  participant Pipeline as pipeline.ts
  participant Generator as generators/*
  participant Report as report/*
  participant Apply as apply/*

  User->>Extension: Run Analyze & Optimize
  Extension->>Flow: Resolve root and analyze repo
  Flow->>Pipeline: walk + manifests + settings
  Pipeline->>Pipeline: structure + stack + recommendations
  Pipeline-->>Flow: RepoAnalysis
  Flow-->>Extension: Analysis result
  Extension->>Generator: Build recommended artifacts
  Extension->>Report: Build and show scorecard
  Extension->>Apply: Build file changes
  Apply->>User: Show diff previews
  User->>Apply: Approve or cancel
  Apply-->>User: Write approved files or no-op
```

## Key Modules

| Area | Files | Responsibility |
| --- | --- | --- |
| Extension entry | `src/extension.ts` | Registers commands, status bar, report panel, and apply flow. |
| Repo root | `src/repoRoot.ts`, `src/repoRootPicker.ts` | Resolves which workspace folder to analyze. |
| Walking | `src/fs/walk.ts`, `src/fs/vscodeDirReader.ts` | Traverses files with a `DirReader` abstraction and respects `.gitignore`. |
| Noise rules | `src/core/noisePatterns.ts` | Defines dependency/build/cache/lockfile patterns and risk tiers. |
| Analysis | `src/analyzer/structure.ts`, `src/analyzer/stack.ts` | Summarizes repo size/noise and detects stack/layout/index source. |
| Pipeline | `src/pipeline.ts` | Pure end-to-end analysis coordinator. |
| Recommendations | `src/recommendations/engine.ts` | Builds optimization recommendations and before/after scores. |
| Generators | `src/generators/*` | Produces Copilot instructions, scoped instructions, agents, tool sets, prompts, and architecture docs. |
| Model tailoring | `src/model/*` | Builds bounded prompts and optionally asks Copilot to tailor instructions after consent. |
| Apply | `src/apply/*` | Preserves settings formatting, shows diffs, applies approved changes, and records undo history. |
| Report | `src/report/*` | Renders the scorecard webview and text reports. |

## Recommendation Engine

The deterministic engine turns repo facts into concrete recommendations.

```mermaid
flowchart LR
  Walk[WalkResult] --> Structure[StructureAnalysis]
  Files[File paths + manifests] --> Stack[StackAnalysis]
  Settings[Current VS Code/Copilot artifacts] --> Plan[OptimizationPlan]
  Structure --> Plan
  Stack --> Plan
  Plan --> Recommendations[Recommendations]
  Plan --> Score[Current score]
  Plan --> Projected[Projected score]
```

Recommendation priority is based on practical token impact:

- **High**: missing exclusions or always-on instructions.
- **Medium**: architecture docs, scoped instructions, custom agents, lean tool
  sets, or missing index setup.
- **Low**: workflow habits such as plan/implement sessions and context
  compaction.

## Safety Model

TokenMin is designed to be reviewable and repeatable.

```mermaid
flowchart TD
  A[Generate proposed changes] --> B[Filter no-op changes]
  B --> C{Any changes left?}
  C -->|No| D[Show already optimized message]
  C -->|Yes| E[Open diff previews]
  E --> F{User approves?}
  F -->|No| G[Cancel without writing]
  F -->|Yes| H{Apply to new branch enabled?}
  H -->|Yes| I[Offer branch creation]
  H -->|No| J[Write files]
  I --> J
  J --> K[Record apply history for undo]
```

Safety properties:

- Preview before apply is mandatory.
- Re-running is idempotent.
- Existing JSONC settings comments and formatting are preserved.
- `.gitignore` exclusions are respected instead of duplicated.
- Optional model tailoring is consent-gated and bounded.
- Applying to a new branch can be offered with `tokenmin.applyToNewBranch`.

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `tokenmin.features.knowledgeGraphContext` | `true` | Enables local knowledge-graph context and MCP configuration for Copilot graph tools. |
| `tokenmin.features.queryCaching` | `true` | Caches repeated graph queries per repo/query and invalidates when the graph changes. |
| `tokenmin.features.promptRestructuring` | `true` | Enables the prompt optimizer workflow. |
| `tokenmin.features.tokenTracking` | `true` | Shows estimated token comparisons for prompt, graph, cache, and report workflows. |
| `tokenmin.features.graph3dVisualization` | `true` | Enables the embedded codebase-memory 3D UI webview. |
| `tokenmin.exclusionAggressiveness` | `balanced` | Controls exclusion tiers: `conservative`, `balanced`, or `aggressive`. |
| `tokenmin.modelFamilyPreference` | `gpt-4o` | Preferred Copilot model family for optional tailoring and the implement agent template. |
| `tokenmin.applyToNewBranch` | `false` | Offers to create a branch before applying changes. |
| `tokenmin.maxFilesScanned` | `20000` | Caps the file walk for large repositories. |
| `tokenmin.knowledgeGraph.binaryPath` | empty | Optional absolute path to a manually installed `codebase-memory-mcp` binary. |
| `tokenmin.knowledgeGraph.uiPort` | `9749` | Port used when starting the embedded codebase-memory 3D UI. |

## Getting Started On A New System

Follow these steps to clone, build, and run TokenMin from scratch on a fresh
machine.

### 1. Prerequisites

| Tool | Version | Notes |
| --- | --- | --- |
| [Node.js](https://nodejs.org) | **>= 18** | Bundled `npm` is used for all scripts. |
| [Git](https://git-scm.com) | any recent | To clone the repository. |
| [VS Code](https://code.visualstudio.com) | **>= 1.90** | Required to run the extension. |

Verify the toolchain:

```sh
node --version    # should print v18 or newer
npm --version
code --version
```

### 2. Clone The Repository

```sh
git clone https://github.com/yattik/TokenMin.git
cd TokenMin
```

To work on the in-progress branch instead of `main`:

```sh
git checkout knowledge-graph
```

### 3. Install Dependencies

```sh
npm install
```

### 4. Build

```sh
npm run compile        # type-check + bundle to dist/extension.js
```

Use watch mode while developing so the bundle rebuilds on every save:

```sh
npm run watch
```

### 5. Run The Extension In A Dev Window

1. Open the folder in VS Code (`code .`).
2. Press **F5** (Run → Start Debugging) using the **Run Extension** launch
   config. This compiles the extension and opens a second **Extension
   Development Host** window with TokenMin loaded.
3. In that window, open the Command Palette (`Ctrl+Shift+P`) and run a command,
   e.g. **Token Optimizer: Open Dashboard** or
   **Token Optimizer: Analyze Repo (report only)**.

### 6. Run The Tests

```sh
npm test               # unit + integration tests, no editor host required
```

### 7. Optional Token-Comparison Reports

These scripts run outside the editor and regenerate the estimate reports at the
repo root:

```sh
npm run compare:tokens     # token-usage-report.{md,json}
npm run compare:sessions   # session-comparison-report.{md,json}
```

## Build, Test, And Package

```sh
npm install
npm run compile        # type-check + bundle dist/extension.js
npm test               # unit + integration tests, no editor host required
npm run verify:bundle  # load bundled extension with a mocked vscode API
npm run vsce:package   # produce tokenmin.vsix
```

Install the VSIX through **Extensions -> ... -> Install from VSIX...**, or run:

```sh
code --install-extension tokenmin.vsix
```

## How To Use

1. Install or launch the extension.
2. Open the repository you want to optimize.
3. Run **Token Optimizer: Analyze Repo (report only)** to inspect the score and
   recommendations without writing files.
4. Run **Token Optimizer: Analyze & Optimize Repo** when ready to preview and
   apply changes.
5. Review every diff tab before approving.
6. Reopen the latest report with **Token Optimizer: Show Efficiency Report**.

## What Can Be Built On Top

TokenMin already has a clean split between VS Code adapters and pure engines,
which makes it a good base for additional features.

### 1. Live Chat Participant

Add a Copilot chat participant such as `@tokenmin` that can answer questions
about the current score, explain recommendations, or generate a plan without
opening the full optimize flow.

Possible commands:

- `@tokenmin explain score`
- `@tokenmin why exclude dist`
- `@tokenmin optimize plan only`

### 2. Language Model Tool

Expose TokenMin's deterministic analyzer as a Language Model Tool. Copilot could
call it during an agent session to retrieve a compact repo summary instead of
performing repeated broad searches.

### 3. Real Usage Importers

The scorecard already supports defensive chat-export estimation. This can grow
into importers for multiple export formats, trend charts, and before/after
comparisons across sessions.

### 4. Workspace Policy Packs

Teams could define policy packs for preferred exclusions, instruction limits,
allowed tools, and model choices. TokenMin would compare a repo against the pack
and generate compliant artifacts.

### 5. Monorepo-Aware Optimization

The stack detector already identifies modules. Future work could generate module
scorecards, package-specific prompts, and per-package tool sets.

### 6. CI Check Mode

Add a non-interactive command that fails CI when instruction files get too large,
generated folders are not excluded, or required agent files drift from policy.

### 7. Deeper Index Diagnostics

The current report detects likely index source. A future version could surface
index age, stale files, local-vs-remote status, and specific remediation steps.

### 8. Safer Artifact Merging

Generated Markdown files are currently replaced when approved. Future merging
could preserve user-authored sections with markers, similar to how settings JSONC
is merged format-safely today.

### 9. Cost Simulation

TokenMin could estimate the token impact of a proposed tool set, instruction
file, or exclusion change before applying it, then compare multiple strategies.

### 10. Organization Dashboard

For many repos, TokenMin could export normalized scorecards and aggregate them
into a dashboard showing which repos are ready for efficient Copilot agent use.

## Limitations

- Precise live Copilot token metering is not exposed to extensions.
- Some report deep links depend on the installed Copilot version.
- The optional Copilot tailoring pass uses the user's Copilot quota and only runs
  after explicit consent.
- TokenMin optimizes the repository environment for Copilot agent mode; it does
  not control Copilot's internal planning, retrieval, or model routing.

## License

MIT - see the `LICENSE` file.
