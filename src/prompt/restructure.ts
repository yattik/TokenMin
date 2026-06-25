/**
 * Pure prompt-restructuring logic. Turns a vague Copilot Chat request into a
 * focused engineering prompt with explicit intent, constraints, relevant
 * files/symbols, acceptance criteria and verification steps.
 *
 * This is the deterministic core (no `vscode`/`node`), so it is unit-testable
 * and works offline. The panel may optionally run a small model pass on top, but
 * always falls back to this output.
 *
 * Honesty note: the token figures are estimates (~4 chars/token). A restructured
 * prompt is usually longer up front, but a clearer prompt typically avoids
 * clarification round-trips — the net effect we estimate below. Actual Copilot
 * billing is not exposed to extensions.
 */
import { estimateTokens } from '../model/chunking';

/** Coarse classification of what the user is asking for. */
export type TaskType = 'bug' | 'feature' | 'refactor' | 'test' | 'docs' | 'general';

/** Optional repo context the panel can supply to ground the restructured prompt. */
export interface PromptContext {
  repoName?: string;
  languages?: string[];
  /** Candidate relevant files (e.g. from the knowledge graph). */
  files?: string[];
  /** Candidate relevant symbols (e.g. from the knowledge graph). */
  symbols?: string[];
}

/** The structured form of a prompt. */
export interface RestructuredPrompt {
  taskType: TaskType;
  intent: string;
  constraints: string[];
  relevantContext: string[];
  acceptanceCriteria: string[];
  verification: string[];
}

/** Estimated token + clarity impact of restructuring. */
export interface PromptComparison {
  originalTokens: number;
  restructuredTokens: number;
  /** 0–100 heuristic clarity score for the original prompt. */
  originalClarity: number;
  /** 0–100 heuristic clarity score for the restructured prompt. */
  restructuredClarity: number;
  /** Estimated clarification round-trips avoided by the clearer prompt. */
  estimatedRoundTripsSaved: number;
  /** Estimated net tokens saved (avoided round-trips minus restructuring overhead). */
  estimatedTokensSaved: number;
}

const TASK_KEYWORDS: ReadonlyArray<{ type: TaskType; words: RegExp }> = [
  { type: 'bug', words: /\b(bug|fix|error|crash|broken|fails?|failing|exception|regression|wrong)\b/i },
  { type: 'test', words: /\b(test|tests|spec|specs|coverage|unit test|integration test)\b/i },
  { type: 'refactor', words: /\b(refactor|clean ?up|rename|restructure|extract|simplify|deduplicate|tidy)\b/i },
  { type: 'docs', words: /\b(document|docs|readme|comment|jsdoc|docstring|explain)\b/i },
  { type: 'feature', words: /\b(add|implement|create|build|introduce|support|feature|new)\b/i },
];

/** Classify the prompt into a task type via keyword precedence. */
export function classifyTask(raw: string): TaskType {
  for (const { type, words } of TASK_KEYWORDS) {
    if (words.test(raw)) {
      return type;
    }
  }
  return 'general';
}

/** Extract file-like tokens (e.g. `src/foo.ts`, `bar.py`). */
export function extractFiles(raw: string): string[] {
  const matches = raw.match(/\b[\w./-]+\.[a-zA-Z]{1,6}\b/g) ?? [];
  return unique(matches.filter((m) => /\.[a-zA-Z]{1,6}$/.test(m) && !/^\d+\.\d+$/.test(m)));
}

/** Extract likely symbol names: backticked tokens and CamelCase identifiers. */
export function extractSymbols(raw: string): string[] {
  const backticked = [...raw.matchAll(/`([^`]+)`/g)].map((m) => m[1].trim());
  const camel = raw.match(/\b[A-Z][a-z0-9]+(?:[A-Z][a-z0-9]+)+\b/g) ?? [];
  return unique([...backticked, ...camel].filter((s) => s.length > 1 && !s.includes(' ')));
}

/** Extract explicit constraint clauses (must/should/don't/without/never). */
function extractConstraintClauses(raw: string): string[] {
  const clauses: string[] = [];
  const re = /\b(must|should|don'?t|do not|never|without|avoid|keep|ensure)\b[^.;\n]*/gi;
  for (const m of raw.matchAll(re)) {
    const clause = m[0].trim().replace(/\s+/g, ' ');
    if (clause.length > 3) {
      clauses.push(capitalize(clause));
    }
  }
  return unique(clauses).slice(0, 6);
}

const DEFAULT_CONSTRAINTS: Record<TaskType, string[]> = {
  bug: ['Make the smallest change that fixes the root cause; do not refactor unrelated code.'],
  feature: ['Add only what is requested; avoid speculative abstractions or unrelated changes.'],
  refactor: ['Preserve existing behavior and public APIs; keep the diff reviewable.'],
  test: ['Cover the described behavior and key edge cases; do not change production code unless required.'],
  docs: ['Be accurate and concise; do not invent behavior that the code does not have.'],
  general: ['Make minimal, scoped changes; preserve existing conventions and formatting.'],
};

const DEFAULT_ACCEPTANCE: Record<TaskType, string[]> = {
  bug: ['The reported failure no longer reproduces.', 'A regression test covers the fix.'],
  feature: ['The new behavior works for the described case.', 'Edge cases and error paths are handled.'],
  refactor: ['Behavior is unchanged.', 'Existing tests still pass.'],
  test: ['New tests fail before the fix/feature and pass after.', 'Tests are deterministic and isolated.'],
  docs: ['The documentation matches the current code behavior.', 'Examples (if any) run as written.'],
  general: ['The requested change is implemented and self-consistent.', 'No existing functionality is broken.'],
};

const DEFAULT_VERIFICATION: Record<TaskType, string[]> = {
  bug: ['Run the test suite.', 'Reproduce the original scenario and confirm it is fixed.'],
  feature: ['Run the test suite.', 'Exercise the new behavior manually for the described case.'],
  refactor: ['Run the test suite and type-check.', 'Diff against the previous behavior to confirm parity.'],
  test: ['Run the new tests in isolation and as part of the suite.'],
  docs: ['Re-read the docs against the code.', 'Run any documented commands/examples.'],
  general: ['Run the build/test suite.', 'Manually verify the described outcome.'],
};

/**
 * Restructure a raw prompt into explicit sections. Deterministic: the same input
 * always yields the same output.
 */
export function restructurePrompt(raw: string, context: PromptContext = {}): RestructuredPrompt {
  const trimmed = raw.trim();
  const taskType = classifyTask(trimmed);

  const intent = buildIntent(trimmed, taskType);

  const constraints = unique([
    ...extractConstraintClauses(trimmed),
    ...DEFAULT_CONSTRAINTS[taskType],
  ]);

  const files = unique([...(context.files ?? []), ...extractFiles(trimmed)]);
  const symbols = unique([...(context.symbols ?? []), ...extractSymbols(trimmed)]);
  const relevantContext: string[] = [];
  if (files.length) {
    relevantContext.push(`Files: ${files.slice(0, 12).join(', ')}`);
  }
  if (symbols.length) {
    relevantContext.push(`Symbols: ${symbols.slice(0, 12).join(', ')}`);
  }
  if (!files.length && !symbols.length) {
    relevantContext.push(
      'Use the knowledge graph (get_architecture → search_graph → trace_path) to locate the relevant files and symbols before reading them.',
    );
  }
  if (context.languages?.length) {
    relevantContext.push(`Primary languages: ${context.languages.slice(0, 5).join(', ')}.`);
  }

  return {
    taskType,
    intent,
    constraints,
    relevantContext,
    acceptanceCriteria: DEFAULT_ACCEPTANCE[taskType],
    verification: DEFAULT_VERIFICATION[taskType],
  };
}

function buildIntent(raw: string, taskType: TaskType): string {
  if (!raw) {
    return 'Describe the desired change.';
  }
  const firstSentence = raw.split(/(?<=[.!?])\s/)[0].trim() || raw;
  const lead: Record<TaskType, string> = {
    bug: 'Fix',
    feature: 'Implement',
    refactor: 'Refactor',
    test: 'Add tests for',
    docs: 'Document',
    general: 'Address',
  };
  // If the user already phrased an imperative, keep their wording; otherwise add a lead verb.
  const startsWithVerb = /^(fix|add|implement|create|build|refactor|rename|test|document|update|remove|support)\b/i.test(
    firstSentence,
  );
  const body = startsWithVerb ? firstSentence : `${lead[taskType]} ${lowerFirst(firstSentence)}`;
  return ensureSentence(body);
}

/** Render a {@link RestructuredPrompt} as markdown for pasting into Copilot Chat. */
export function formatRestructuredPrompt(rp: RestructuredPrompt): string {
  const lines: string[] = [];
  lines.push(`## Task (${rp.taskType})`);
  lines.push(rp.intent);
  lines.push('');
  lines.push('### Constraints');
  for (const c of rp.constraints) {
    lines.push(`- ${c}`);
  }
  lines.push('');
  lines.push('### Relevant context');
  for (const c of rp.relevantContext) {
    lines.push(`- ${c}`);
  }
  lines.push('');
  lines.push('### Acceptance criteria');
  for (const a of rp.acceptanceCriteria) {
    lines.push(`- ${a}`);
  }
  lines.push('');
  lines.push('### Verification');
  for (const v of rp.verification) {
    lines.push(`- ${v}`);
  }
  return lines.join('\n');
}

/** 0–100 heuristic clarity score for a prompt body. */
export function clarityScore(text: string): number {
  const t = text.trim();
  if (!t) {
    return 0;
  }
  let score = 15;
  if (t.length > 60) {
    score += 15;
  }
  if (t.length > 200) {
    score += 10;
  }
  if (extractFiles(t).length > 0 || extractSymbols(t).length > 0) {
    score += 20;
  }
  if (/\b(must|should|don'?t|do not|never|without|avoid|ensure|keep)\b/i.test(t)) {
    score += 15;
  }
  if (/\b(so that|expect|acceptance|verify|verification|test|criteria)\b/i.test(t)) {
    score += 15;
  }
  if (/^(##|###)\s/m.test(t)) {
    score += 10;
  }
  return Math.min(100, score);
}

/** Estimated tokens spent on one clarification round-trip (question + answer). */
const ROUND_TRIP_TOKENS = 350;

/** Compare an original prompt against its restructured form. */
export function comparePrompts(raw: string, formatted: string): PromptComparison {
  const originalTokens = estimateTokens(raw);
  const restructuredTokens = estimateTokens(formatted);
  const originalClarity = clarityScore(raw);
  const restructuredClarity = clarityScore(formatted);

  let estimatedRoundTripsSaved = 0;
  if (originalClarity < 40) {
    estimatedRoundTripsSaved = 2;
  } else if (originalClarity < 70) {
    estimatedRoundTripsSaved = 1;
  }

  const overhead = Math.max(0, restructuredTokens - originalTokens);
  const estimatedTokensSaved = estimatedRoundTripsSaved * ROUND_TRIP_TOKENS - overhead;

  return {
    originalTokens,
    restructuredTokens,
    originalClarity,
    restructuredClarity,
    estimatedRoundTripsSaved,
    estimatedTokensSaved,
  };
}

// ── small string helpers ────────────────────────────────────────────────────

function unique(items: string[]): string[] {
  return [...new Set(items.map((i) => i.trim()).filter(Boolean))];
}

function capitalize(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}

function lowerFirst(s: string): string {
  return s.length ? s[0].toLowerCase() + s.slice(1) : s;
}

function ensureSentence(s: string): string {
  const trimmed = s.trim();
  if (!trimmed) {
    return trimmed;
  }
  return /[.!?]$/.test(trimmed) ? capitalize(trimmed) : `${capitalize(trimmed)}.`;
}
