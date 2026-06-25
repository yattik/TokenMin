/**
 * A file the extension proposes to create or overwrite. Pure (no `vscode`) so
 * generators can be unit-tested; the flow layer converts these to apply changes.
 */
export interface GeneratedFile {
  /** Root-relative path with forward slashes. */
  relativePath: string;
  /** Full proposed file content. */
  content: string;
}

// ── Apply history (for undo) ────────────────────────────────────────────────

/** Minimal persistence surface — `vscode.Memento` (workspaceState) satisfies this. */
export interface HistoryStore {
  get<T>(key: string, defaultValue: T): T;
  update(key: string, value: unknown): Thenable<void> | Promise<void>;
}

/** A single file's before/after state within an apply. */
export interface RecordedChange {
  relativePath: string;
  /** Content before the apply ('' when the file was newly created). */
  oldContent: string;
  /** Content the tool wrote. */
  newContent: string;
  /** True if the tool created the file (undo => delete). */
  isNew: boolean;
}

/** One "apply" operation that can be undone as a unit. */
export interface ApplyTransaction {
  id: string;
  timestamp: number;
  rootFsPath: string;
  branch?: string;
  changes: RecordedChange[];
}

const HISTORY_KEY = 'tokenmin.applyHistory';
const MAX_TRANSACTIONS = 25;

/**
 * Persistent stack of apply transactions. Pure (depends only on
 * {@link HistoryStore}) so the stack semantics are unit-testable.
 */
export class ApplyHistory {
  constructor(private readonly store: HistoryStore) {}

  all(): ApplyTransaction[] {
    return this.store.get<ApplyTransaction[]>(HISTORY_KEY, []);
  }

  latest(): ApplyTransaction | undefined {
    const list = this.all();
    return list.length > 0 ? list[list.length - 1] : undefined;
  }

  async record(tx: ApplyTransaction): Promise<void> {
    const list = this.all();
    list.push(tx);
    while (list.length > MAX_TRANSACTIONS) {
      list.shift();
    }
    await this.store.update(HISTORY_KEY, list);
  }

  async remove(id: string): Promise<void> {
    const list = this.all().filter((t) => t.id !== id);
    await this.store.update(HISTORY_KEY, list);
  }

  async clear(): Promise<void> {
    await this.store.update(HISTORY_KEY, []);
  }
}

let txCounter = 0;

/** Build a transaction id that stays unique even within the same millisecond. */
export function newTransactionId(now = Date.now()): string {
  txCounter = (txCounter + 1) % 100000;
  return `${now}-${txCounter}`;
}
