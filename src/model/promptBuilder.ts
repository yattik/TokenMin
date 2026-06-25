/**
 * Pure prompt construction for the model-assisted tailoring pass. Isolated from
 * the network call so it can be unit-tested deterministically.
 */
import { clampToChars, clampToTokens, estimateTokens } from './chunking';
import { BoundedRepoInput, BoundLimits, DEFAULT_BOUND_LIMITS, ModelPrompt, RawModelSources } from './types';

/** Trim raw sources down to a bounded, prompt-ready representation. */
export function buildBoundedInput(sources: RawModelSources, limits: BoundLimits = DEFAULT_BOUND_LIMITS): BoundedRepoInput {
  const summary =
    `Repo "${sources.repoName}" — ${sources.layout} project; ` +
    `primary languages: ${sources.primaryLanguages.slice(0, 5).join(', ') || 'unknown'}.`;

  const treeLines: string[] = [];
  for (const dir of sources.topLevelDirs.slice(0, limits.maxTreeEntries)) {
    treeLines.push(`- ${dir}/`);
  }
  for (const mod of sources.modules.slice(0, limits.maxTreeEntries)) {
    treeLines.push(`- ${mod.path}/ (${mod.tech.join(', ') || 'module'})`);
  }
  const tree = treeLines.join('\n');

  const manifestParts: string[] = [];
  const manifestEntries = Object.entries(sources.manifests).slice(0, limits.maxManifests);
  for (const [path, content] of manifestEntries) {
    manifestParts.push(`# ${path}\n${clampToChars(content, limits.maxManifestChars)}`);
  }
  const manifestsExcerpt = manifestParts.join('\n\n');

  const readmeExcerpt = sources.readme ? clampToChars(sources.readme, limits.maxReadmeChars) : '';

  return {
    repoName: sources.repoName,
    summary,
    tree,
    manifestsExcerpt,
    readmeExcerpt,
  };
}

const SYSTEM_PROMPT =
  'You write concise GitHub Copilot instruction content. Given facts about a repository, output ' +
  'ONLY a short markdown bullet list (no headings, no preamble) of repo-specific conventions and ' +
  'guidance that would help an AI coding agent work accurately. Be specific and brief — at most 8 ' +
  'bullets. Do not restate the obvious or invent facts you cannot infer from the input.';

/**
 * Build the tailoring prompt, clamping the assembled user message to the model's
 * input budget (if known) so whole-repo input never blows past maxInputTokens.
 */
export function buildTailorPrompt(input: BoundedRepoInput, maxInputTokens?: number): ModelPrompt {
  const sections = [
    input.summary,
    input.tree ? `Top-level layout:\n${input.tree}` : '',
    input.manifestsExcerpt ? `Key manifests:\n${input.manifestsExcerpt}` : '',
    input.readmeExcerpt ? `README excerpt:\n${input.readmeExcerpt}` : '',
    'Write the bullet list of conventions now.',
  ].filter(Boolean);

  let user = sections.join('\n\n');

  if (maxInputTokens && maxInputTokens > 0) {
    // Reserve room for the system prompt and the model's reply.
    const reserve = estimateTokens(SYSTEM_PROMPT) + 512;
    const budget = Math.max(256, maxInputTokens - reserve);
    user = clampToTokens(user, budget);
  }

  return { system: SYSTEM_PROMPT, user };
}
