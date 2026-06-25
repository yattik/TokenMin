/**
 * Pure aggregator: given the generator context and the recommendation plan,
 * produce exactly the artifact files the plan calls for. Keeps generation
 * decoupled from `vscode` and easy to test.
 */
import { GeneratedFile } from '../apply/types';
import { OptimizationPlan } from '../recommendations/types';
import { GeneratorContext } from './types';
import { buildArchitectureDoc } from './architecture';
import { buildCopilotInstructions, buildScopedInstructions } from './instructions';
import {
  AgentGenOptions,
  buildImplementAgent,
  buildPlanAgent,
  buildPlanPrompt,
  buildToolSet,
} from './agents';

export function buildArtifacts(
  ctx: GeneratorContext,
  plan: OptimizationPlan,
  options: AgentGenOptions = {},
): GeneratedFile[] {
  const kinds = new Set(plan.recommendations.map((r) => r.kind));
  const files: GeneratedFile[] = [];

  if (kinds.has('instructions')) {
    files.push(buildCopilotInstructions(ctx));
  }
  if (kinds.has('architecture-doc')) {
    files.push(buildArchitectureDoc(ctx));
  }
  if (kinds.has('scoped-instructions')) {
    files.push(...buildScopedInstructions(ctx));
  }
  if (kinds.has('plan-implement-agents')) {
    files.push(buildPlanAgent(ctx, options), buildImplementAgent(ctx, options), buildPlanPrompt(ctx));
  }
  if (kinds.has('tool-trimming')) {
    files.push(buildToolSet());
  }

  return files;
}
