/**
 * Deterministic structure / noise / size analysis (pure).
 *
 * Consumes a {@link WalkResult} (however it was produced) and derives the
 * facts the recommendation engine needs. Fully testable with synthetic input.
 */
import { WalkResult } from '../fs/types';
import { baseName, extName, isBinaryPath, isLockfile, matchNoiseDir, NoiseTier } from '../core/noisePatterns';
import {
  DEFAULT_LARGE_FILE_THRESHOLD,
  DirSummary,
  LargeFile,
  NoisyDir,
  StructureAnalysis,
} from './types';

const MAX_LARGE_FILES = 20;
const MAX_TOP_DIRS = 15;

export interface StructureOptions {
  largeFileThreshold?: number;
}

const TIER_ORDER: Record<NoiseTier, number> = { high: 0, medium: 1, low: 2 };

export function analyzeStructure(walk: WalkResult, options: StructureOptions = {}): StructureAnalysis {
  const largeThreshold = options.largeFileThreshold ?? DEFAULT_LARGE_FILE_THRESHOLD;

  let totalSize = 0;
  let binaryFileCount = 0;
  const binaryExtensions = new Set<string>();
  const lockfiles: string[] = [];
  const largeCandidates: LargeFile[] = [];
  const topDirs = new Map<string, DirSummary>();

  // Aggregate noise discovered via file prefixes (dirs the walker descended).
  const noiseByPath = new Map<string, NoisyDir>();

  for (const file of walk.files) {
    totalSize += file.size;

    const name = baseName(file.relativePath);
    if (isBinaryPath(file.relativePath)) {
      binaryFileCount++;
      binaryExtensions.add(extName(file.relativePath));
    }
    if (isLockfile(name)) {
      lockfiles.push(file.relativePath);
    }
    if (file.size > largeThreshold) {
      largeCandidates.push({ relativePath: file.relativePath, size: file.size });
    }

    // Top-level directory grouping.
    const slash = file.relativePath.indexOf('/');
    const topName = slash === -1 ? '.' : file.relativePath.slice(0, slash);
    const dir = topDirs.get(topName) ?? { name: topName, fileCount: 0, totalSize: 0 };
    dir.fileCount++;
    dir.totalSize += file.size;
    topDirs.set(topName, dir);

    // Noise via ancestor segments (covers non-pruned noise dirs).
    accumulateNoiseFromPath(file.relativePath, file.size, noiseByPath);
  }

  // Noise discovered by the walker pruning (dirs not descended).
  for (const pruned of walk.prunedDirs) {
    if (pruned.reason !== 'noise') {
      continue;
    }
    const pattern = matchNoiseDir(pruned.dirName);
    if (!pattern) {
      continue;
    }
    const existing = noiseByPath.get(pruned.relativePath);
    if (existing) {
      existing.pruned = true;
      existing.gitignored = existing.gitignored || pruned.gitignored;
    } else {
      noiseByPath.set(pruned.relativePath, {
        relativePath: pruned.relativePath,
        name: pruned.dirName,
        reason: pattern.reason,
        tier: pattern.tier,
        fileCount: 0,
        totalSize: 0,
        pruned: true,
        gitignored: pruned.gitignored,
      });
    }
  }

  const noisyDirs = [...noiseByPath.values()].sort(
    (a, b) =>
      TIER_ORDER[a.tier] - TIER_ORDER[b.tier] ||
      b.fileCount - a.fileCount ||
      a.relativePath.localeCompare(b.relativePath),
  );

  const topLevelDirs = [...topDirs.values()]
    .sort((a, b) => b.fileCount - a.fileCount || a.name.localeCompare(b.name))
    .slice(0, MAX_TOP_DIRS);

  const largeFiles = largeCandidates.sort((a, b) => b.size - a.size).slice(0, MAX_LARGE_FILES);

  const gitignoredDirCount = walk.prunedDirs.filter((d) => d.reason === 'gitignore').length;

  return {
    totalFiles: walk.files.length,
    totalSize,
    truncated: walk.truncated,
    topLevelDirs,
    noisyDirs,
    largeFiles,
    binaryFileCount,
    binaryExtensions: [...binaryExtensions].sort(),
    lockfiles: lockfiles.sort(),
    gitignoredDirCount,
  };
}

/** Add a file's size to any ancestor directory that matches a noise pattern. */
function accumulateNoiseFromPath(path: string, size: number, into: Map<string, NoisyDir>): void {
  const segments = path.split('/');
  let prefix = '';
  // Exclude the final segment (the file itself).
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i];
    prefix = prefix ? `${prefix}/${seg}` : seg;
    const pattern = matchNoiseDir(seg);
    if (!pattern) {
      continue;
    }
    const existing = into.get(prefix);
    if (existing) {
      existing.fileCount++;
      existing.totalSize += size;
    } else {
      into.set(prefix, {
        relativePath: prefix,
        name: seg,
        reason: pattern.reason,
        tier: pattern.tier,
        fileCount: 1,
        totalSize: size,
        pruned: false,
        gitignored: false,
      });
    }
  }
}
