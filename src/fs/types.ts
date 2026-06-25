/**
 * File-system abstraction.
 *
 * Pure types only — no `vscode` import — so the walker and analyzer logic can
 * be unit-tested with an in-memory {@link DirReader}, with no real FS or host.
 */

/** A single file discovered while walking a repo. */
export interface FileEntry {
  /** Path relative to the repo root, always using forward slashes. */
  relativePath: string;
  /** Size in bytes. */
  size: number;
  /** Always `false` here — directories are reported via {@link PrunedDir}. */
  isDirectory: boolean;
}

/** Immediate child of a directory, as returned by a {@link DirReader}. */
export interface DirChild {
  name: string;
  isDirectory: boolean;
  size: number;
}

/**
 * Minimal read-only directory access the walker needs. Backed by `workspace.fs`
 * in production and by a plain object in tests.
 */
export interface DirReader {
  /** List immediate children of a root-relative directory ('' is the root). */
  readDir(relativePath: string): Promise<DirChild[]>;
  /** Read a UTF-8 text file, or `undefined` if absent/unreadable. */
  readTextFile(relativePath: string): Promise<string | undefined>;
}

/** A directory the walker deliberately did not descend into. */
export interface PrunedDir {
  /** Root-relative path with forward slashes. */
  relativePath: string;
  /** Base name of the directory (last path segment). */
  dirName: string;
  /** Why it was pruned. */
  reason: 'gitignore' | 'noise';
  /** Whether `.gitignore` also excludes it (true for `gitignore`; maybe for `noise`). */
  gitignored: boolean;
}

export interface WalkOptions {
  /** Maximum number of files to collect before truncating. */
  cap: number;
  /** Honor `.gitignore` files (root + nested). Default true. */
  respectGitignore?: boolean;
  /** Prune known generated/dependency directories. Default true. */
  pruneNoise?: boolean;
}

export interface WalkResult {
  /** Collected files (never directories). */
  files: FileEntry[];
  /** Directories that were intentionally not descended into. */
  prunedDirs: PrunedDir[];
  /** True if the walk hit {@link WalkOptions.cap} and stopped early. */
  truncated: boolean;
  /** The cap that was applied. */
  cap: number;
}
