/**
 * Pure scorecard model for the efficiency report. Computes before/after score
 * deltas and honest proxy metrics (no live token metering is exposed by other
 * extensions, so we use counts + estimates). Also includes a defensive
 * estimator for an optionally-imported chat export. No `vscode` import.
 */
import { IndexSource } from '../analyzer/types';
import { OptimizationPlan, ScoreCriterion } from '../recommendations/types';
import { GeneratedFile } from '../apply/types';
import { estimateTokens } from '../model/chunking';
import { checkInstructionSize } from '../generators/instructions';
import { IMPLEMENT_TOOLS, PLAN_TOOLS } from '../generators/agents';

/**
 * Proxy for a "typical" unscoped agent tool count, for an honest comparison
 * against the lean set. Copilot agent mode commonly exposes ~25 tools.
 */
export const TYPICAL_TOOL_COUNT = 25;

export interface InstructionSize {
  path: string;
  chars: number;
  tokens: number;
  warn: boolean;
}

export interface ContextFootprint {
  /** Source files the agent may consider (after pruning noise + gitignore). */
  consideredFiles: number;
  /** Noise directories the recommendation will exclude. */
  noiseDirsExcluded: number;
  /** Directories already excluded by .gitignore. */
  gitignoredDirs: number;
  /** Estimated tokens across instruction files (loaded each request). */
  instructionTokens: number;
  /** Distinct tools in the lean agent sets. */
  leanToolCount: number;
  /** Proxy for an unscoped tool count. */
  typicalToolCount: number;
}

export interface Scorecard {
  scoreBefore: number;
  scoreAfter: number;
  scoreDelta: number;
  criteria: ScoreCriterion[];
  projectedCriteria: ScoreCriterion[];
  indexSource: IndexSource;
  noisyPathsExcluded: number;
  instructionFiles: InstructionSize[];
  footprint: ContextFootprint;
}

export interface ScorecardInput {
  plan: OptimizationPlan;
  indexSource: IndexSource;
  consideredFiles: number;
  gitignoredDirs: number;
  generatedFiles: readonly GeneratedFile[];
}

export function buildScorecard(input: ScorecardInput): Scorecard {
  const exclusion = input.plan.recommendations.find((r) => r.kind === 'exclusion');
  const noisyPathsExcluded = exclusion?.exclusions
    ? new Set([...exclusion.exclusions.searchExclude, ...exclusion.exclusions.filesExclude]).size
    : 0;

  const instructionFiles = input.generatedFiles
    .filter((f) => f.relativePath.endsWith('.instructions.md') || f.relativePath.endsWith('copilot-instructions.md'))
    .map((f): InstructionSize => ({
      path: f.relativePath,
      chars: f.content.length,
      tokens: estimateTokens(f.content),
      warn: checkInstructionSize(f) !== undefined,
    }));

  const instructionTokens = instructionFiles.reduce((sum, f) => sum + f.tokens, 0);
  const leanToolCount = new Set([...PLAN_TOOLS, ...IMPLEMENT_TOOLS]).size;

  const scoreBefore = input.plan.score.score;
  const scoreAfter = input.plan.projectedScore.score;

  return {
    scoreBefore,
    scoreAfter,
    scoreDelta: scoreAfter - scoreBefore,
    criteria: input.plan.score.criteria,
    projectedCriteria: input.plan.projectedScore.criteria,
    indexSource: input.indexSource,
    noisyPathsExcluded,
    instructionFiles,
    footprint: {
      consideredFiles: input.consideredFiles,
      noiseDirsExcluded: noisyPathsExcluded,
      gitignoredDirs: input.gitignoredDirs,
      instructionTokens,
      leanToolCount,
      typicalToolCount: TYPICAL_TOOL_COUNT,
    },
  };
}

// ── Optional chat-export usage estimate (defensive; format is not standardized) ─

export interface UsageEstimate {
  messages: number;
  estimatedTokens: number;
  largestMessageTokens: number;
}

const MESSAGE_TEXT_KEYS = new Set(['content', 'text', 'message', 'value', 'response', 'prompt']);

/**
 * Estimate token usage from an arbitrary chat-export object. Chat export shapes
 * vary, so this traverses the structure, treats string fields that look like
 * message bodies as messages, and sums estimated tokens. Honest proxy only.
 */
export function estimateUsageFromChatExport(data: unknown): UsageEstimate {
  let messages = 0;
  let estimatedTokens = 0;
  let largestMessageTokens = 0;
  let anyStringTokens = 0;

  const visit = (node: unknown): void => {
    if (typeof node === 'string') {
      anyStringTokens += estimateTokens(node);
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) {
        visit(item);
      }
      return;
    }
    if (node && typeof node === 'object') {
      const obj = node as Record<string, unknown>;
      for (const key of Object.keys(obj)) {
        const val = obj[key];
        if (typeof val === 'string' && MESSAGE_TEXT_KEYS.has(key.toLowerCase())) {
          const tokens = estimateTokens(val);
          messages++;
          estimatedTokens += tokens;
          largestMessageTokens = Math.max(largestMessageTokens, tokens);
        } else {
          visit(val);
        }
      }
    }
  };

  visit(data);

  // Fall back to all-strings sum when no message-shaped fields were found.
  if (messages === 0) {
    estimatedTokens = anyStringTokens;
  }

  return { messages, estimatedTokens, largestMessageTokens };
}
