/**
 * Pure helpers for driving the codebase-memory-mcp CLI: build argv, and parse
 * the JSON the binary prints on stdout. The MCP output shape varies by version,
 * so parsing is defensive — it probes several plausible field names and never
 * throws on unexpected data (returns a partial model with a notice instead).
 *
 * No `node`/`vscode` imports — fully unit-testable.
 */
import { GraphTool } from './types';

/** Build the argv for `codebase-memory-mcp cli <tool> '<json>'`. */
export function buildCliArgs(tool: GraphTool, payload: Record<string, unknown> = {}): string[] {
  return ['cli', tool, JSON.stringify(payload)];
}

/**
 * Parse CLI stdout into a JSON object. The binary reserves stdout for JSON, but
 * some commands emit a leading banner; we extract the first balanced JSON value.
 * Returns `undefined` when nothing parseable is present.
 */
export function parseCliJson(stdout: string): unknown {
  const trimmed = stdout.trim();
  if (!trimmed) {
    return undefined;
  }
  // Fast path: the whole output is JSON.
  try {
    return JSON.parse(trimmed);
  } catch {
    // Fall through to scanning for the first JSON object/array.
  }
  const start = firstJsonStart(trimmed);
  if (start === -1) {
    return undefined;
  }
  const slice = extractBalanced(trimmed, start);
  if (slice === undefined) {
    return undefined;
  }
  try {
    return JSON.parse(slice);
  } catch {
    return undefined;
  }
}

function firstJsonStart(text: string): number {
  const obj = text.indexOf('{');
  const arr = text.indexOf('[');
  if (obj === -1) {
    return arr;
  }
  if (arr === -1) {
    return obj;
  }
  return Math.min(obj, arr);
}

/** Extract a balanced {...} or [...] starting at `start`, respecting strings. */
function extractBalanced(text: string, start: number): string | undefined {
  const open = text[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inStr = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inStr = false;
      }
      continue;
    }
    if (ch === '"') {
      inStr = true;
    } else if (ch === open) {
      depth++;
    } else if (ch === close) {
      depth--;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }
  return undefined;
}

// ── Small typed accessors over the loose CLI JSON ───────────────────────────

/** Read a record (object) at `key`, or `{}`. */
export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** Read an array at `key` from a record, trying several aliases. */
export function pickArray(obj: Record<string, unknown>, ...keys: string[]): unknown[] {
  for (const key of keys) {
    const v = obj[key];
    if (Array.isArray(v)) {
      return v;
    }
  }
  return [];
}

/** Read a string, trying several aliases. */
export function pickString(obj: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === 'string' && v.length > 0) {
      return v;
    }
  }
  return undefined;
}

/** Read a finite number, trying several aliases. */
export function pickNumber(obj: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === 'number' && Number.isFinite(v)) {
      return v;
    }
  }
  return undefined;
}
