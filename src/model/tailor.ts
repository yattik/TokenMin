/**
 * Pure orchestration of the tailoring pass with graceful degradation. Takes a
 * {@link ModelInvoker} (real or mock) and never throws — any failure returns a
 * result that tells the caller to fall back to deterministic templates.
 */
import { clampToTokens } from './chunking';
import { ModelInvoker, ModelPrompt, TailorResult } from './types';

/** Keep tailored output lean — instructions are loaded on every request. */
const MAX_OUTPUT_TOKENS = 350;

export async function tailorInstructions(
  invoker: ModelInvoker | undefined,
  prompt: ModelPrompt,
): Promise<TailorResult> {
  if (!invoker) {
    return { ok: false, usedModel: false, reason: 'no-model' };
  }

  let raw: string;
  try {
    raw = await invoker.invoke(prompt);
  } catch (err) {
    return { ok: false, usedModel: true, reason: classifyError(err), modelName: invoker.modelName };
  }

  const text = raw.trim();
  if (!text) {
    return { ok: false, usedModel: true, reason: 'empty', modelName: invoker.modelName };
  }

  return {
    ok: true,
    usedModel: true,
    text: clampToTokens(text, MAX_OUTPUT_TOKENS),
    modelName: invoker.modelName,
  };
}

function classifyError(err: unknown): 'no-consent' | 'cancelled' | 'error' {
  const message = (err instanceof Error ? err.message : String(err)).toLowerCase();
  if (message.includes('consent') || message.includes('permission') || message.includes('not allowed')) {
    return 'no-consent';
  }
  if (message.includes('cancel')) {
    return 'cancelled';
  }
  return 'error';
}
