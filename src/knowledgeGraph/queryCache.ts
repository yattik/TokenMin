/**
 * Pure, dependency-free cache for knowledge-graph query results.
 *
 * Scope & safety:
 *  - Entries are keyed by project + tool + normalized arguments, so two repos (or
 *    two different queries) never collide.
 *  - Each project carries a monotonically increasing version. {@link invalidate}
 *    bumps it (after a re-index), and {@link setSignature} bumps it when
 *    detect_changes reports the graph changed. Stale entries are dropped lazily
 *    on the next read, so a cache hit always reflects the current graph.
 *
 * No `vscode`/`node` imports — fully unit-testable and deterministic.
 */

const SEP = '\u0000';

/** Hit/miss accounting, surfaced in the dashboard token tracking. */
export interface CacheStats {
  hits: number;
  misses: number;
  entries: number;
}

interface Entry {
  value: unknown;
  version: string;
}

export class GraphQueryCache {
  private readonly entries = new Map<string, Entry>();
  private readonly versions = new Map<string, string>();
  private readonly signatures = new Map<string, string>();
  private bumpCounter = 0;
  private hits = 0;
  private misses = 0;

  constructor(private readonly maxEntries = 200) {}

  private versionOf(project: string): string {
    return this.versions.get(project) ?? 'v0';
  }

  private bump(project: string): string {
    const next = `v${++this.bumpCounter}`;
    this.versions.set(project, next);
    return next;
  }

  private key(project: string, tool: string, args: string): string {
    return `${project}${SEP}${tool}${SEP}${args}`;
  }

  /** Look up a cached result. Returns `undefined` on a miss or a stale entry. */
  get<T>(project: string, tool: string, args: string): T | undefined {
    const key = this.key(project, tool, args);
    const entry = this.entries.get(key);
    if (entry && entry.version === this.versionOf(project)) {
      this.hits++;
      return entry.value as T;
    }
    if (entry) {
      // Stale: created under an older project version. Drop it.
      this.entries.delete(key);
    }
    this.misses++;
    return undefined;
  }

  /** Store a fresh result under the project's current version. */
  set<T>(project: string, tool: string, args: string, value: T): void {
    const key = this.key(project, tool, args);
    this.entries.set(key, { value, version: this.versionOf(project) });
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) {
        break;
      }
      this.entries.delete(oldest);
    }
  }

  /**
   * Invalidate every entry for a project (e.g. after re-indexing). Subsequent
   * reads for that project miss until the queries are re-run.
   */
  invalidate(project: string): void {
    const prefix = `${project}${SEP}`;
    for (const key of [...this.entries.keys()]) {
      if (key.startsWith(prefix)) {
        this.entries.delete(key);
      }
    }
    this.bump(project);
  }

  /**
   * Record the latest graph signature (e.g. a detect_changes fingerprint). When
   * the signature differs from the last one seen, the project is invalidated.
   * Returns `true` when the signature changed (cache was invalidated).
   */
  setSignature(project: string, signature: string): boolean {
    const prev = this.signatures.get(project);
    this.signatures.set(project, signature);
    if (prev !== undefined && prev !== signature) {
      this.invalidate(project);
      return true;
    }
    return false;
  }

  /** Remove every entry and reset accounting. */
  clear(): void {
    this.entries.clear();
    this.versions.clear();
    this.signatures.clear();
    this.hits = 0;
    this.misses = 0;
  }

  stats(): CacheStats {
    return { hits: this.hits, misses: this.misses, entries: this.entries.size };
  }
}
