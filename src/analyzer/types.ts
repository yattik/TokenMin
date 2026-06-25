/**
 * Analysis domain types (pure). These describe the deterministic facts the
 * analyzer extracts from a repo walk, consumed by the recommendation engine.
 */
import { NoiseTier } from '../core/noisePatterns';

/** A generated/dependency directory found in the repo. */
export interface NoisyDir {
  /** Root-relative path with forward slashes. */
  relativePath: string;
  /** Base name. */
  name: string;
  reason: string;
  tier: NoiseTier;
  /** Files counted under it (0 when the walker pruned it without descending). */
  fileCount: number;
  /** Total size of counted files, in bytes. */
  totalSize: number;
  /** True if the walker pruned it (so fileCount is a floor, not exact). */
  pruned: boolean;
  /** Already excluded by `.gitignore`. */
  gitignored: boolean;
}

export interface LargeFile {
  relativePath: string;
  size: number;
}

export interface DirSummary {
  /** Top-level directory name, or '.' for files at the repo root. */
  name: string;
  fileCount: number;
  totalSize: number;
}

export interface StructureAnalysis {
  /** Files counted (excludes pruned/ignored). */
  totalFiles: number;
  /** Total size of counted files in bytes. */
  totalSize: number;
  /** Walk hit the file cap. */
  truncated: boolean;
  /** Top-level directories by file count (descending). */
  topLevelDirs: DirSummary[];
  /** Generated/dependency directories, most actionable first. */
  noisyDirs: NoisyDir[];
  /** Largest counted files (descending), capped to a small list. */
  largeFiles: LargeFile[];
  /** Count of counted files with binary extensions. */
  binaryFileCount: number;
  /** Distinct binary extensions found (e.g. ['.png', '.zip']). */
  binaryExtensions: string[];
  /** Lockfile paths found. */
  lockfiles: string[];
  /** Number of directories excluded purely by `.gitignore`. */
  gitignoredDirCount: number;
}

/** Default threshold (bytes) above which a file is "large". */
export const DEFAULT_LARGE_FILE_THRESHOLD = 512 * 1024;

// ── Stack & layout detection ────────────────────────────────────────────────

export type TechCategory = 'language' | 'framework' | 'runtime' | 'build' | 'infra';

export interface DetectedTech {
  /** Stable id, e.g. 'node', 'typescript', 'python', 'react'. */
  id: string;
  /** Display name, e.g. 'Node.js'. */
  name: string;
  category: TechCategory;
  /** Manifest path (root-relative) that triggered detection. */
  source: string;
}

export type LayoutKind = 'single' | 'monorepo' | 'unknown';

export interface ProjectModule {
  /** Root-relative directory of the sub-project ('' for root). */
  path: string;
  /** Name from the manifest, if available. */
  name?: string;
  /** Detected tech ids for this module. */
  tech: string[];
}

export type IndexSource = 'github-remote' | 'local' | 'unknown';

export interface StackAnalysis {
  tech: DetectedTech[];
  layout: LayoutKind;
  /** Sub-projects (populated for monorepos). */
  modules: ProjectModule[];
  /** Where Copilot's semantic index most likely comes from. */
  indexSource: IndexSource;
  /** Origin remote URL, if found. */
  remoteUrl?: string;
  /** Primary languages by prominence (from file-extension histogram). */
  primaryLanguages: string[];
}

