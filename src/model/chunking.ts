/**
 * Pure, dependency-free token estimation and clamping. Token counts are
 * approximated (~4 chars/token) — good enough to keep prompts within a model's
 * maxInputTokens without pulling in a tokenizer.
 */

const CHARS_PER_TOKEN = 4;

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/** Truncate text to fit within a token budget, appending a marker if cut. */
export function clampToTokens(text: string, maxTokens: number): string {
  const maxChars = Math.max(0, maxTokens * CHARS_PER_TOKEN);
  if (text.length <= maxChars) {
    return text;
  }
  const marker = '\n…(truncated)';
  const keep = Math.max(0, maxChars - marker.length);
  return text.slice(0, keep) + marker;
}

/** Truncate to a character budget, appending a marker if cut. */
export function clampToChars(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }
  const marker = '\n…(truncated)';
  const keep = Math.max(0, maxChars - marker.length);
  return text.slice(0, keep) + marker;
}
