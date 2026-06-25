/**
 * Editor-side analysis orchestration. Reads config, walks the repo via the
 * `vscode` adapter, and produces the deterministic analysis. Pure engines are
 * invoked from here; this file owns the `vscode` interactions (config, progress).
 */
import * as vscode from 'vscode';
import { VsCodeDirReader } from '../fs/vscodeDirReader';
import { walk } from '../fs/walk';
import { isManifestPath } from '../analyzer/stack';
import { deriveArtifacts } from '../recommendations/currentSettings';
import { analyzePipeline } from '../pipeline';
import { WalkResult } from '../fs/types';
import { StackAnalysis, StructureAnalysis } from '../analyzer/types';
import { Aggressiveness, CurrentSettings, OptimizationPlan } from '../recommendations/types';

/** Cap on how many manifest files to read (protects huge monorepos). */
const MAX_MANIFESTS = 300;

export interface RepoAnalysis {
  root: vscode.Uri;
  walk: WalkResult;
  structure: StructureAnalysis;
  stack: StackAnalysis;
  current: CurrentSettings;
  plan: OptimizationPlan;
}

export async function analyzeRepo(root: vscode.Uri): Promise<RepoAnalysis> {
  const config = vscode.workspace.getConfiguration('tokenmin');
  const cap = config.get<number>('maxFilesScanned', 20000);
  const aggressiveness = config.get<Aggressiveness>('exclusionAggressiveness', 'balanced');
  const reader = new VsCodeDirReader(root);

  return vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Token Optimizer: analyzing repository…',
      cancellable: false,
    },
    async (progress) => {
      progress.report({ message: 'walking files…' });
      const walkResult = await walk(reader, { cap });

      progress.report({ message: 'detecting stack…' });
      const manifestPaths = walkResult.files
        .map((f) => f.relativePath)
        .filter(isManifestPath)
        .slice(0, MAX_MANIFESTS);

      const manifests: Record<string, string> = {};
      await Promise.all(
        manifestPaths.map(async (p) => {
          const content = await reader.readTextFile(p);
          if (content !== undefined) {
            manifests[p] = content;
          }
        }),
      );
      const gitConfig = await reader.readTextFile('.git/config');

      const filePaths = walkResult.files.map((f) => f.relativePath);
      const current: CurrentSettings = {
        searchExclude: vscode.workspace.getConfiguration('search', root).get<Record<string, boolean>>('exclude') ?? {},
        filesExclude: vscode.workspace.getConfiguration('files', root).get<Record<string, boolean>>('exclude') ?? {},
        ...deriveArtifacts(filePaths),
      };

      const { structure, stack, plan } = analyzePipeline({
        walk: walkResult,
        manifests,
        gitConfig,
        current,
        aggressiveness,
      });

      return { root, walk: walkResult, structure, stack, current, plan };
    },
  );
}


