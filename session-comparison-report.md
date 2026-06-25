# Long prompt-session comparison — Default Copilot vs. graph-implement

_Generated: 2026-06-25T08:48:46.498Z_

Cumulative estimated prompt tokens across multi-turn coding sessions. The **Default Copilot agent** re-reads the broad feature area on every turn; the **graph-implement agent** queries the knowledge graph once (cached after) and reads only the file each turn needs. Both pay an identical per-turn conversation overhead (220 tokens), so the gap reflects context retrieval. Estimates only (~4 chars/token); actual Copilot billing is not exposed to extensions.

| Session | Turns | Files in area | Default total | graph-implement total | Saved | Reduction |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Knowledge-graph hardening session | 12 | 12 | 304,056 | 168,750 | 135,306 | 45% |
| Prompt optimizer feature session | 8 | 7 | 66,400 | 41,548 | 24,852 | 37% |
| Efficiency report redesign session | 6 | 5 | 38,496 | 27,748 | 10,748 | 28% |
| **Total** | 26 | — | **408,952** | **238,046** | **170,906** | **42%** |

## Turn-by-turn — Knowledge-graph hardening session (12 turns)

| Turn | Prompt focus | File touched | Default (cumulative) | graph-implement (cumulative) |
| ---: | --- | --- | ---: | ---: |
| 1 | cache | `src/knowledgeGraph/queryCache.ts` | 24,128 | 1,310 |
| 2 | runtime | `src/knowledgeGraph/runtime.ts` | 48,476 | 5,883 |
| 3 | download | `src/knowledgeGraph/runtime.ts` | 73,044 | 10,676 |
| 4 | service | `src/knowledgeGraph/service.ts` | 97,832 | 18,904 |
| 5 | index | `src/knowledgeGraph/graphHtml.ts` | 122,840 | 33,358 |
| 6 | platform | `src/knowledgeGraph/platform.ts` | 148,068 | 48,817 |
| 7 | graphModel | `src/knowledgeGraph/graphModel.ts` | 173,516 | 66,840 |
| 8 | commands | `src/knowledgeGraph/commands.ts` | 199,184 | 86,782 |
| 9 | cache | `src/knowledgeGraph/queryCache.ts` | 225,072 | 106,944 |
| 10 | runtime | `src/knowledgeGraph/runtime.ts` | 251,180 | 127,326 |
| 11 | graphHtml | `src/knowledgeGraph/graphHtml.ts` | 277,508 | 147,928 |
| 12 | service | `src/knowledgeGraph/service.ts` | 304,056 | 168,750 |

