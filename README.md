# Copilot Token-Efficiency Optimizer (TokenMin)

A VS Code extension that analyzes a repository and applies the token-reduction
levers for **Copilot agent mode** — exclusions, concise scoped instructions,
lean tool sets, plan/implement custom agents, and healthy indexing — so the
agent works **more accurately at lower AI-credit cost**.

It produces the *configuration and repo-structure artifacts* that Copilot agent
mode consumes. It does not drive Copilot's agent loop.

## What it does

Behind one command (`Token Optimizer: Analyze & Optimize Repo`) it runs a
reviewable flow:

```
Analyze (deterministic) → Recommend + score → [optional Copilot pass]
   → Preview diffs → Apply (idempotent) → Efficiency report
```

### The levers

- **Exclusions** — merges `search.exclude` / `files.exclude` globs for
  generated/dependency directories and lockfiles (skips paths already handled by
  `.gitignore`, which Copilot already honors).
- **Instructions** — a concise `.github/copilot-instructions.md` seeded by the
  detected stack, plus scoped `*.instructions.md` with correct `applyTo` globs,
  and an `ARCHITECTURE.md` skeleton. Kept short by design (with a size guardrail).
- **Agents & tools** — `.github/agents/plan.agent.md` (reasoning model, read-only
  tools) and `implement.agent.md` (cheaper model), a lean `*.toolsets.jsonc`, and
  a `plan.prompt.md`. Restricting tools cuts tool-definition and tool-output tokens.
- **Indexing** — detects whether a GitHub remote semantic index is available and
  links to building/refreshing the index.

### Efficiency score & report

A 0–100 score with reasons, a projected after-apply score, and a scorecard
webview with proxy footprint metrics, instruction sizes, lean-vs-typical tool
count, and deep links to Copilot's indexing / debug-log / cost tools. You can
optionally import an exported chat JSON for a proxy usage estimate.

## Safety

- **Preview before apply** is mandatory — every change is shown as a diff and
  requires explicit approval. Nothing is auto-applied.
- **Idempotent** — re-running on an optimized repo makes no changes.
- **Never clobbers** — settings are merged (comments/formatting preserved).
- **Optional "apply to a new branch"** to isolate changes.
- The **optional Copilot pass** is consent-gated, user-initiated, and **uses your
  Copilot quota**. The deterministic core works fully without it.

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `tokenmin.exclusionAggressiveness` | `balanced` | `conservative` \| `balanced` \| `aggressive` exclusion globs. |
| `tokenmin.modelFamilyPreference` | `gpt-4o` | Preferred Copilot model family for the optional pass (with fallback). |
| `tokenmin.applyToNewBranch` | `false` | Offer to create a branch before applying. |
| `tokenmin.maxFilesScanned` | `20000` | Safety cap on files walked during analysis. |

## Commands

- **Token Optimizer: Analyze & Optimize Repo** — the full guided flow.
- **Token Optimizer: Analyze Repo (report only)** — analysis + report, no apply.
- **Token Optimizer: Show Efficiency Report** — reopen the last report.

## Build & install (internal / personal use)

This v1 is distributed as a VSIX (no Marketplace publishing).

```sh
npm install
npm run compile     # type-check + bundle
npm test            # unit + integration tests (no editor host required)
npm run vsce:package   # produces tokenmin.vsix
```

Install the VSIX: **Extensions → … → Install from VSIX…**, or
`code --install-extension tokenmin.vsix`.

## Architecture

The deterministic core is decoupled from the `vscode` API so it is fully
unit-testable without a real file system or editor host:

- **Pure** (no `vscode`): `core/` (gitignore, noise), `fs/walk.ts` (over a
  `DirReader` abstraction), `analyzer/` (structure, stack), `recommendations/`
  (engine + score), `generators/`, `model/` (prompt building + fallback),
  `apply/settingsMerge.ts`, `report/scorecard.ts` + `reportHtml.ts`, `pipeline.ts`.
- **Editor-facing** (thin `vscode` wrappers): `extension.ts`, `repoRootPicker.ts`,
  `fs/vscodeDirReader.ts`, `apply/applyService.ts`, `model/modelClient.ts`,
  `report/reportWebview.ts`, and the `flow/` orchestration.

## Limitations

Precise live token metering from Copilot is not exposed to extensions, so the
report uses honest proxy metrics (counts + estimates) and deep links to
Copilot's own indexing, debug-log, and cost tools. Some deep links depend on the
installed Copilot version.

## Future (not in v1)

- A live Language Model Tool / chat participant.
- BYOK for pinning a specific model.
- Marketplace publishing.

## License

MIT — see the `LICENSE` file.
