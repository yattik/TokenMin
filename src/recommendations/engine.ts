/**
 * Deterministic recommendation engine + efficiency scorer (pure, no `vscode`).
 *
 * Turns the structure + stack analysis and the current settings into a
 * prioritized, idempotent set of recommendations and a 0–100 score with
 * reasons. Re-running on an already-optimized repo yields no exclusion globs
 * and a high score.
 */
import { NoiseTier } from '../core/noisePatterns';
import { StackAnalysis, StructureAnalysis } from '../analyzer/types';
import {
  Aggressiveness,
  CurrentSettings,
  EfficiencyScore,
  ExclusionPayload,
  OptimizationPlan,
  Recommendation,
  ScoreCriterion,
} from './types';

export interface RecommendationInput {
  structure: StructureAnalysis;
  stack: StackAnalysis;
  current: CurrentSettings;
  aggressiveness: Aggressiveness;
}

const TIERS_BY_AGGRESSIVENESS: Record<Aggressiveness, NoiseTier[]> = {
  conservative: ['high'],
  balanced: ['high', 'medium'],
  aggressive: ['high', 'medium', 'low'],
};

/** Repos smaller than this don't warrant an ARCHITECTURE.md recommendation. */
const ARCHITECTURE_MIN_FILES = 40;

export function buildPlan(input: RecommendationInput): OptimizationPlan {
  const recommendations = buildRecommendations(input);
  const score = computeScore(input);
  const satisfiedByPlan = new Set(recommendations.map((r) => CRITERION_FOR_KIND[r.kind]).filter(Boolean) as string[]);
  const projectedScore = projectScore(score, satisfiedByPlan);
  return { recommendations, score, projectedScore };
}

// ── Recommendations ─────────────────────────────────────────────────────────

export function buildRecommendations(input: RecommendationInput): Recommendation[] {
  const recs: Recommendation[] = [];

  const exclusions = buildExclusionGlobs(input);
  if (exclusions.searchExclude.length > 0 || exclusions.filesExclude.length > 0) {
    const count = new Set([...exclusions.searchExclude, ...exclusions.filesExclude]).size;
    recs.push({
      id: 'exclusion',
      kind: 'exclusion',
      title: `Exclude ${count} noisy path${count === 1 ? '' : 's'} from Copilot's view`,
      detail:
        'Generated/dependency directories and lockfiles inflate search-match snippets and ' +
        'indexed context. Adding them to search.exclude / files.exclude removes them from ' +
        "the agent's search and file surface (gitignored paths are already excluded and are skipped here).",
      priority: 'high',
      exclusions,
    });
  }

  if (!input.current.hasCopilotInstructions) {
    recs.push({
      id: 'instructions',
      kind: 'instructions',
      title: 'Add a concise .github/copilot-instructions.md',
      detail:
        'A short, repo-specific instructions file front-loads the stack and conventions so the ' +
        'agent spends fewer turns (and tokens) rediscovering them. Keep it lean by design.',
      priority: 'high',
    });
  }

  const bigEnough = input.structure.totalFiles >= ARCHITECTURE_MIN_FILES;
  if (!input.current.hasArchitectureDoc && (bigEnough || input.stack.layout === 'monorepo')) {
    recs.push({
      id: 'architecture-doc',
      kind: 'architecture-doc',
      title: 'Add an ARCHITECTURE.md the instructions can reference',
      detail:
        'A single map of the codebase lets instructions stay short while still pointing the agent ' +
        'at the right area, reducing exploratory searches.',
      priority: 'medium',
    });
  }

  const wantsScoped = input.stack.layout === 'monorepo' || input.stack.primaryLanguages.length >= 2;
  if (wantsScoped && input.current.scopedInstructionFiles.length === 0) {
    recs.push({
      id: 'scoped-instructions',
      kind: 'scoped-instructions',
      title: 'Add scoped *.instructions.md with applyTo globs',
      detail:
        'Scoping guidance to the files it applies to (per module/language) means the agent only ' +
        'loads relevant instructions instead of one large always-on file.',
      priority: 'medium',
    });
  }

  if (input.current.agentFiles.length === 0) {
    recs.push({
      id: 'plan-implement-agents',
      kind: 'plan-implement-agents',
      title: 'Add Plan (reasoning, read-only) and Implement (cheaper) custom agents',
      detail:
        'Splitting planning from implementation lets you use an expensive reasoning model briefly ' +
        'for the plan and a cheaper model for edits, and restricts each to the tools it needs.',
      priority: 'medium',
    });
  }

  if (input.current.toolSetFiles.length === 0 || input.current.agentFiles.length === 0) {
    recs.push({
      id: 'tool-trimming',
      kind: 'tool-trimming',
      title: 'Define a lean tool set for agents',
      detail:
        'Every enabled tool adds its definition to each request, and broad tools (like terminal) ' +
        'produce large outputs. Restricting agents to the tools they need cuts both.',
      priority: 'medium',
    });
  }

  recs.push(buildIndexingRecommendation(input.stack));

  recs.push({
    id: 'compaction',
    kind: 'compaction',
    title: 'Adopt plan→implement and periodic context compaction',
    detail:
      'Long agent histories dominate cost. Start fresh sessions per task, use the Plan/Implement ' +
      'split, and compact context when a thread grows long.',
    priority: 'low',
  });

  return recs.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
}

function buildIndexingRecommendation(stack: StackAnalysis): Recommendation {
  if (stack.indexSource === 'github-remote') {
    return {
      id: 'indexing',
      kind: 'indexing',
      title: 'Keep the GitHub remote semantic index fresh',
      detail:
        'This repo has a GitHub remote, so Copilot can use a remote semantic index. Keep it pushed ' +
        'and healthy; verify "Build local index" status if results feel stale.',
      priority: 'low',
    };
  }
  return {
    id: 'indexing',
    kind: 'indexing',
    title: 'Build a healthy semantic index',
    detail:
      stack.indexSource === 'local'
        ? 'No GitHub remote was found, so Copilot relies on a local semantic index. Build it for ' +
          'accurate, low-cost retrieval, and consider pushing to GitHub for a remote index.'
        : 'No git remote was detected. Initialize git / push to GitHub for a remote semantic index, ' +
          'or build the local index for better retrieval.',
    priority: 'medium',
  };
}

const PRIORITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };

// ── Exclusion glob generation (idempotent) ──────────────────────────────────

export function buildExclusionGlobs(input: RecommendationInput): ExclusionPayload {
  const tiers = new Set(TIERS_BY_AGGRESSIVENESS[input.aggressiveness]);
  const search = new GlobSet(input.current.searchExclude);
  const files = new GlobSet(input.current.filesExclude);

  for (const dir of input.structure.noisyDirs) {
    // Skip directories already excluded by .gitignore — Copilot honors it, so
    // adding them yields no benefit (keeps re-runs idempotent and honest).
    if (dir.gitignored) {
      continue;
    }
    if (!tiers.has(dir.tier)) {
      continue;
    }
    const glob = `**/${dir.name}`;
    search.add(glob);
    // High-confidence generated dirs are also hidden from the explorer.
    if (dir.tier === 'high') {
      files.add(glob);
    }
  }

  if (input.aggressiveness !== 'conservative') {
    const lockNames = new Set(input.structure.lockfiles.map(lastSegment));
    for (const name of lockNames) {
      search.add(`**/${name}`);
    }
  }

  if (input.aggressiveness === 'aggressive') {
    for (const ext of input.structure.binaryExtensions) {
      search.add(`**/*${ext}`);
    }
  }

  return { searchExclude: search.added(), filesExclude: files.added() };
}

/** Tracks globs already present so additions are deduplicated/idempotent. */
class GlobSet {
  private existing: Set<string>;
  private newly: string[] = [];
  private seen = new Set<string>();

  constructor(current: Record<string, boolean>) {
    this.existing = new Set(Object.keys(current ?? {}));
  }

  add(glob: string): void {
    if (this.existing.has(glob) || this.seen.has(glob)) {
      return;
    }
    this.seen.add(glob);
    this.newly.push(glob);
  }

  added(): string[] {
    return [...this.newly].sort();
  }
}

function lastSegment(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash === -1 ? path : path.slice(slash + 1);
}

// ── Scoring ─────────────────────────────────────────────────────────────────

const CRITERION_FOR_KIND: Partial<Record<Recommendation['kind'], string>> = {
  exclusion: 'exclusions',
  instructions: 'instructions',
  'architecture-doc': 'context-docs',
  'scoped-instructions': 'context-docs',
  'plan-implement-agents': 'agents',
  'tool-trimming': 'tool-scoping',
  indexing: 'index',
};

export function computeScore(input: RecommendationInput): EfficiencyScore {
  const { structure, stack, current } = input;

  const unexcludedNoise = structure.noisyDirs.filter((d) => !d.gitignored && !isExcluded(d.name, current));
  const exclusionsHealthy = unexcludedNoise.length === 0;

  const wantsContextDoc =
    stack.layout === 'monorepo' || structure.totalFiles >= ARCHITECTURE_MIN_FILES || stack.primaryLanguages.length >= 2;
  const hasContextDoc =
    current.hasArchitectureDoc || current.scopedInstructionFiles.length > 0;

  const criteria: ScoreCriterion[] = [
    {
      id: 'exclusions',
      label: 'Noisy paths excluded',
      weight: 30,
      satisfied: exclusionsHealthy,
      detail: exclusionsHealthy
        ? 'No un-excluded generated/dependency directories were found.'
        : `${unexcludedNoise.length} noisy director${unexcludedNoise.length === 1 ? 'y is' : 'ies are'} ` +
          'still visible to the agent.',
    },
    {
      id: 'instructions',
      label: 'Repo instructions present',
      weight: 20,
      satisfied: current.hasCopilotInstructions,
      detail: current.hasCopilotInstructions
        ? '.github/copilot-instructions.md exists.'
        : 'No .github/copilot-instructions.md found.',
    },
    {
      id: 'context-docs',
      label: 'Scoped context docs',
      weight: 10,
      satisfied: !wantsContextDoc || hasContextDoc,
      detail: !wantsContextDoc
        ? 'Repo is small/simple enough not to need extra context docs.'
        : hasContextDoc
          ? 'Architecture doc or scoped instructions present.'
          : 'No ARCHITECTURE.md or scoped instructions for a multi-part repo.',
    },
    {
      id: 'agents',
      label: 'Plan/Implement agents',
      weight: 15,
      satisfied: current.agentFiles.length > 0,
      detail: current.agentFiles.length > 0
        ? `${current.agentFiles.length} custom agent file(s) present.`
        : 'No custom agents (plan/implement split) defined.',
    },
    {
      id: 'tool-scoping',
      label: 'Lean tool scoping',
      weight: 10,
      satisfied: current.toolSetFiles.length > 0 || current.agentFiles.length > 0,
      detail:
        current.toolSetFiles.length > 0 || current.agentFiles.length > 0
          ? 'Tool sets / agent tool restrictions present.'
          : 'No tool-set definitions or agent tool restrictions.',
    },
    {
      id: 'index',
      label: 'Healthy semantic index',
      weight: 15,
      satisfied: stack.indexSource === 'github-remote',
      detail:
        stack.indexSource === 'github-remote'
          ? 'GitHub remote index available.'
          : stack.indexSource === 'local'
            ? 'Local index only (no GitHub remote).'
            : 'No git remote detected.',
    },
  ];

  return finalizeScore(criteria);
}

function isExcluded(dirName: string, current: CurrentSettings): boolean {
  const glob = `**/${dirName}`;
  return Boolean(current.searchExclude?.[glob]) || Boolean(current.filesExclude?.[glob]);
}

function finalizeScore(criteria: ScoreCriterion[]): EfficiencyScore {
  const earned = criteria.reduce((sum, c) => sum + (c.satisfied ? c.weight : 0), 0);
  const total = criteria.reduce((sum, c) => sum + c.weight, 0);
  const score = total === 0 ? 0 : Math.round((earned / total) * 100);
  return { score, criteria };
}

/** Recompute a score assuming the given criteria are now satisfied. */
export function projectScore(base: EfficiencyScore, satisfiedIds: Set<string>): EfficiencyScore {
  const criteria = base.criteria.map((c) =>
    satisfiedIds.has(c.id) ? { ...c, satisfied: true, detail: c.detail } : { ...c },
  );
  return finalizeScore(criteria);
}
