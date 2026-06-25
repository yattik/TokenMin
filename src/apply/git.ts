/**
 * Minimal git helpers for the optional "apply to a new branch" flow. Uses the
 * git CLI via child_process (the extension host runs in Node). Best-effort:
 * failures are reported to the caller, never thrown into the apply pipeline.
 */
import { execFile } from 'child_process';
import { promisify } from 'util';

const run = promisify(execFile);

export async function isGitRepo(rootFsPath: string): Promise<boolean> {
  try {
    const { stdout } = await run('git', ['-C', rootFsPath, 'rev-parse', '--is-inside-work-tree']);
    return stdout.trim() === 'true';
  } catch {
    return false;
  }
}

export function suggestBranchName(): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `tokenmin/optimize-${stamp}`;
}

export interface BranchResult {
  ok: boolean;
  branch?: string;
  error?: string;
}

export async function createBranch(rootFsPath: string, branch: string): Promise<BranchResult> {
  if (!(await isGitRepo(rootFsPath))) {
    return { ok: false, error: 'Not a git repository.' };
  }
  try {
    await run('git', ['-C', rootFsPath, 'checkout', '-b', branch]);
    return { ok: true, branch };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
