/**
 * Pure end-to-end analysis pipeline: structure + stack + recommendation plan.
 * Decoupled from `vscode` so the whole orchestration can be integration-tested
 * with an in-memory walk. The editor flow supplies the walk + manifests + current
 * settings; this module assembles the deterministic result.
 */
import { WalkResult } from './fs/types';
import { analyzeStructure } from './analyzer/structure';
import { detectStack } from './analyzer/stack';
import { StackAnalysis, StructureAnalysis } from './analyzer/types';
import { buildPlan } from './recommendations/engine';
import { Aggressiveness, CurrentSettings, OptimizationPlan } from './recommendations/types';

export interface PipelineInput {
  walk: WalkResult;
  manifests: Record<string, string>;
  gitConfig?: string;
  current: CurrentSettings;
  aggressiveness: Aggressiveness;
  largeFileThreshold?: number;
}

export interface PipelineResult {
  structure: StructureAnalysis;
  stack: StackAnalysis;
  plan: OptimizationPlan;
}

export function analyzePipeline(input: PipelineInput): PipelineResult {
  const filePaths = input.walk.files.map((f) => f.relativePath);
  const structure = analyzeStructure(input.walk, { largeFileThreshold: input.largeFileThreshold });
  const stack = detectStack({ files: filePaths, manifests: input.manifests, gitConfig: input.gitConfig });
  const plan = buildPlan({ structure, stack, current: input.current, aggressiveness: input.aggressiveness });
  return { structure, stack, plan };
}
