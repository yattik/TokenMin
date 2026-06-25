/**
 * Recommendation + scoring domain types (pure, no `vscode`).
 */

/** A snapshot of the repo's current Copilot-relevant configuration. */
export interface CurrentSettings {
  /** Existing `search.exclude` globs (workspace + folder merged). */
  searchExclude: Record<string, boolean>;
  /** Existing `files.exclude` globs. */
  filesExclude: Record<string, boolean>;
  /** `.github/copilot-instructions.md` present. */
  hasCopilotInstructions: boolean;
  /** Existing scoped `*.instructions.md` files (root-relative paths). */
  scopedInstructionFiles: string[];
  /** Existing custom agent files (`.github/agents/*.agent.md`). */
  agentFiles: string[];
  /** Existing tool-set definition files (`.github/*.toolsets.jsonc` etc.). */
  toolSetFiles: string[];
  /** A top-level architecture doc is present (ARCHITECTURE.md). */
  hasArchitectureDoc: boolean;
  /** Existing prompt files (`.github/prompts/*.prompt.md`). */
  promptFiles: string[];
}

export type Aggressiveness = 'conservative' | 'balanced' | 'aggressive';

export type RecommendationKind =
  | 'exclusion'
  | 'instructions'
  | 'architecture-doc'
  | 'scoped-instructions'
  | 'plan-implement-agents'
  | 'tool-trimming'
  | 'indexing'
  | 'compaction';

export type Priority = 'high' | 'medium' | 'low';

/** Globs to merge into the two exclusion settings. */
export interface ExclusionPayload {
  searchExclude: string[];
  filesExclude: string[];
}

export interface Recommendation {
  id: string;
  kind: RecommendationKind;
  title: string;
  detail: string;
  priority: Priority;
  /** Concrete exclusion globs, present only for `kind === 'exclusion'`. */
  exclusions?: ExclusionPayload;
}

export interface ScoreCriterion {
  id: string;
  label: string;
  weight: number;
  satisfied: boolean;
  detail: string;
}

export interface EfficiencyScore {
  /** 0–100, weighted sum of satisfied criteria. */
  score: number;
  criteria: ScoreCriterion[];
}

export interface OptimizationPlan {
  recommendations: Recommendation[];
  /** Score as the repo is now. */
  score: EfficiencyScore;
  /** Score projected if every recommendation were applied. */
  projectedScore: EfficiencyScore;
}
