/**
 * A pragmatic, dependency-free `.gitignore` matcher (pure, no `vscode`).
 *
 * Supports the common subset used in practice: comments, blank lines,
 * negation (`!`), directory-only rules (trailing `/`), base/anchored rules
 * (leading or embedded `/`), and `*`, `**`, `?` wildcards. Rules are evaluated
 * in order with last-match-wins semantics, matching git's behavior closely
 * enough for excludability analysis.
 */

export interface GitignoreRule {
  /** Original pattern text (for debugging/inspection). */
  source: string;
  negated: boolean;
  dirOnly: boolean;
  /** Compiled regex tested against a root-relative, forward-slash path. */
  regex: RegExp;
  /** Directory (root-relative) the owning `.gitignore` lives in; '' for root. */
  base: string;
}

function escapeRegexChar(ch: string): string {
  return /[.+^${}()|[\]\\]/.test(ch) ? '\\' + ch : ch;
}

/** Convert a gitignore glob body (no leading `!`, no trailing `/`) to regex. */
function globToRegexBody(pattern: string): string {
  let out = '';
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === '*') {
      if (pattern[i + 1] === '*') {
        // `**`
        i++;
        if (pattern[i + 1] === '/') {
          out += '(?:.*/)?';
          i++;
        } else {
          out += '.*';
        }
      } else {
        out += '[^/]*';
      }
    } else if (ch === '?') {
      out += '[^/]';
    } else {
      out += escapeRegexChar(ch);
    }
  }
  return out;
}

/** Parse the text of a single `.gitignore` into ordered rules. */
export function parseGitignore(content: string, base = ''): GitignoreRule[] {
  const rules: GitignoreRule[] = [];
  for (const rawLine of content.split(/\r?\n/)) {
    let line = rawLine.replace(/\s+$/, ''); // trim trailing whitespace
    if (line === '' || line.startsWith('#')) {
      continue;
    }
    let negated = false;
    if (line.startsWith('!')) {
      negated = true;
      line = line.slice(1);
    }
    // unescape leading "\#" / "\!"
    if (line.startsWith('\\#') || line.startsWith('\\!')) {
      line = line.slice(1);
    }
    let dirOnly = false;
    if (line.endsWith('/')) {
      dirOnly = true;
      line = line.slice(0, -1);
    }
    if (line === '') {
      continue;
    }

    const hasInteriorSlash = line.replace(/\/$/, '').includes('/');
    const anchored = line.startsWith('/') || hasInteriorSlash;
    const body = globToRegexBody(line.replace(/^\//, ''));

    const basePart = base ? escapeRegexBase(base) + '/' : '';
    const prefix = anchored ? '^' + basePart : '^' + basePart + '(?:.*/)?';
    // Allow matching the entry itself and anything beneath it.
    const regex = new RegExp(prefix + body + '(?:/.*)?$');

    rules.push({ source: rawLine, negated, dirOnly, regex, base });
  }
  return rules;
}

function escapeRegexBase(base: string): string {
  return base
    .split('')
    .map((c) => escapeRegexChar(c))
    .join('');
}

/** Combine multiple rule sets (e.g. nested `.gitignore`) preserving order. */
export function combineRules(...sets: GitignoreRule[][]): GitignoreRule[] {
  return ([] as GitignoreRule[]).concat(...sets);
}

/**
 * Decide whether a root-relative path is ignored. Last matching rule wins;
 * a negated rule re-includes. Directory-only rules apply to directories.
 */
export function isIgnored(relativePath: string, isDir: boolean, rules: readonly GitignoreRule[]): boolean {
  const path = relativePath.replace(/^\/+/, '').replace(/\/+$/, '');
  let ignored = false;
  for (const rule of rules) {
    if (rule.dirOnly && !isDir) {
      // A directory-only rule can still ignore a *file* if one of its ancestor
      // directories matches. Approximate by testing ancestor segments.
      if (!ancestorMatches(path, rule)) {
        continue;
      }
    }
    if (rule.regex.test(path)) {
      ignored = !rule.negated;
    }
  }
  return ignored;
}

function ancestorMatches(path: string, rule: GitignoreRule): boolean {
  const segments = path.split('/');
  let prefix = '';
  for (let i = 0; i < segments.length - 1; i++) {
    prefix = prefix ? prefix + '/' + segments[i] : segments[i];
    if (rule.regex.test(prefix)) {
      return true;
    }
  }
  return false;
}
