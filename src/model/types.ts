/**
 * Pure types for the optional model-assisted tailoring pass. The network call
 * is abstracted behind {@link ModelInvoker} so the orchestration and fallback
 * can be unit-tested with a mock.
 */

export interface ModelPrompt {
  system: string;
  user: string;
}

export interface ModelInvoker {
  /** Send a single prompt and return the model's text response. */
  invoke(prompt: ModelPrompt): Promise<string>;
  /** Per-model input token budget, if known (e.g. GPT-4o ~ 64K). */
  readonly maxInputTokens?: number;
  /** Display name of the selected model. */
  readonly modelName?: string;
}

/** Raw, untrimmed sources the flow gathers for the model. */
export interface RawModelSources {
  repoName: string;
  layout: 'single' | 'monorepo' | 'unknown';
  primaryLanguages: string[];
  topLevelDirs: string[];
  modules: Array<{ path: string; tech: string[] }>;
  /** path -> content for a few key manifests. */
  manifests: Record<string, string>;
  /** README contents, if present. */
  readme?: string;
}

/** Char limits applied per-source before assembling the prompt. */
export interface BoundLimits {
  maxManifestChars: number;
  maxReadmeChars: number;
  maxTreeEntries: number;
  maxManifests: number;
}

export const DEFAULT_BOUND_LIMITS: BoundLimits = {
  maxManifestChars: 2000,
  maxReadmeChars: 3000,
  maxTreeEntries: 30,
  maxManifests: 4,
};

/** Trimmed, bounded representation that goes into the prompt. */
export interface BoundedRepoInput {
  repoName: string;
  summary: string;
  tree: string;
  manifestsExcerpt: string;
  readmeExcerpt: string;
}

export type TailorReason = 'no-model' | 'no-consent' | 'error' | 'empty' | 'cancelled';

export interface TailorResult {
  ok: boolean;
  /** Tailored markdown body (Conventions section) when ok. */
  text?: string;
  usedModel: boolean;
  reason?: TailorReason;
  modelName?: string;
}
