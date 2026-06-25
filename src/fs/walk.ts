/**
 * Pure repo walker. Traverses a {@link DirReader}, honoring nested `.gitignore`
 * and pruning known noise directories, bounded by a file cap. No `vscode`
 * import, so the full traversal (including gitignore respect) is unit-testable
 * with an in-memory reader.
 */
import { DirChild, DirReader, FileEntry, PrunedDir, WalkOptions, WalkResult } from './types';
import { GitignoreRule, combineRules, isIgnored, parseGitignore } from '../core/gitignore';
import { matchNoiseDir } from '../core/noisePatterns';

function joinRel(base: string, name: string): string {
  return base ? `${base}/${name}` : name;
}

export async function walk(reader: DirReader, options: WalkOptions): Promise<WalkResult> {
  const respectGitignore = options.respectGitignore !== false;
  const pruneNoise = options.pruneNoise !== false;
  const cap = options.cap;

  const files: FileEntry[] = [];
  const prunedDirs: PrunedDir[] = [];
  let truncated = false;

  async function visit(dirRel: string, inherited: GitignoreRule[]): Promise<void> {
    if (truncated) {
      return;
    }

    let children: DirChild[];
    try {
      children = await reader.readDir(dirRel);
    } catch {
      return; // unreadable directory; skip gracefully
    }

    let rules = inherited;
    if (respectGitignore) {
      const giText = await reader.readTextFile(joinRel(dirRel, '.gitignore'));
      if (giText) {
        rules = combineRules(inherited, parseGitignore(giText, dirRel));
      }
    }

    // Deterministic order: directories and files sorted by name.
    const sorted = [...children].sort((a, b) => a.name.localeCompare(b.name));

    for (const child of sorted) {
      if (truncated) {
        return;
      }
      const childRel = joinRel(dirRel, child.name);

      if (child.isDirectory) {
        if (child.name === '.git') {
          continue; // never relevant; prune silently
        }
        const ignored = respectGitignore && isIgnored(childRel, true, rules);
        const noise = pruneNoise ? matchNoiseDir(child.name) : undefined;
        if (noise) {
          prunedDirs.push({ relativePath: childRel, dirName: child.name, reason: 'noise', gitignored: ignored });
          continue;
        }
        if (ignored) {
          prunedDirs.push({ relativePath: childRel, dirName: child.name, reason: 'gitignore', gitignored: true });
          continue;
        }
        await visit(childRel, rules);
      } else {
        if (respectGitignore && isIgnored(childRel, false, rules)) {
          continue;
        }
        if (files.length >= cap) {
          truncated = true;
          return;
        }
        files.push({ relativePath: childRel, size: child.size, isDirectory: false });
      }
    }
  }

  await visit('', []);
  return { files, prunedDirs, truncated, cap };
}
