# Token usage report — graph-implement vs. baseline

_Generated: 2026-06-25T08:48:53.351Z_

Estimated prompt tokens for sample coding tasks completed two ways: a baseline agent that reads broad context (every file in the target folders) versus the `graph-implement` agent that queries the knowledge graph first and reads only the most relevant file. Counts use a ~4-chars/token heuristic — estimates only; actual Copilot billing is not exposed to extensions.

| Task | Files | Baseline tokens | graph-implement tokens | Saved | Reduction |
| --- | ---: | ---: | ---: | ---: | ---: |
| Add validation to the prompt restructuring flow | 7 | 7,530 | 2,998 | 4,532 | 60% |
| Tune the knowledge-graph query cache invalidation | 12 | 24,128 | 3,554 | 20,574 | 85% |
| Add a new metric to the efficiency scorecard | 5 | 5,866 | 2,128 | 3,738 | 64% |
| **Total** | 24 | **37,524** | **8,680** | **28,844** | **77%** |

## Per-task detail

### Add validation to the prompt restructuring flow

- Key file the graph-implement agent reads: `src/prompt/restructure.ts`
- Baseline (read 7 files): 7,530 tokens
- graph-implement (graph index 156 + key file 2,842): 2,998 tokens
- Saved: 4,532 tokens (60% reduction)

### Tune the knowledge-graph query cache invalidation

- Key file the graph-implement agent reads: `src/knowledgeGraph/service.ts`
- Baseline (read 12 files): 24,128 tokens
- graph-implement (graph index 339 + key file 3,215): 3,554 tokens
- Saved: 20,574 tokens (85% reduction)

### Add a new metric to the efficiency scorecard

- Key file the graph-implement agent reads: `src/report/reportHtml.ts`
- Baseline (read 5 files): 5,866 tokens
- graph-implement (graph index 101 + key file 2,027): 2,128 tokens
- Saved: 3,738 tokens (64% reduction)

