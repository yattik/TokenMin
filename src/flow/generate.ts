/**
 * Editor-side bridge to the pure generators and the optional model pass.
 * Builds the {@link GeneratorContext} from the analysis/config, runs the
 * consent-gated Copilot tailoring pass, and produces the artifact files.
 */
import * as path from 'path';
import * as vscode from 'vscode';
import { RepoAnalysis } from './analyzeRepo';
import { GeneratedFile } from '../apply/types';
import { GeneratorContext } from '../generators/types';
import { buildArtifacts } from '../generators';
import { AgentGenOptions, DEFAULT_PLAN_MODEL } from '../generators/agents';
import { VsCodeDirReader } from '../fs/vscodeDirReader';
import { isManifestPath } from '../analyzer/stack';
import { createModelInvoker } from '../model/modelClient';
import { buildBoundedInput, buildTailorPrompt } from '../model/promptBuilder';
import { tailorInstructions } from '../model/tailor';
import { RawModelSources } from '../model/types';
import { logLine } from '../util/output';

export function buildGeneratorContext(analysis: RepoAnalysis, tailoredInstructions?: string): GeneratorContext {
  const repoName = path.basename(analysis.root.fsPath) || 'repo';
  const hasContributingDoc = analysis.walk.files.some((f) => /(^|\/)CONTRIBUTING\.md$/i.test(f.relativePath));
  return {
    repoName,
    structure: analysis.structure,
    stack: analysis.stack,
    hasArchitectureDoc: analysis.current.hasArchitectureDoc,
    hasContributingDoc,
    tailoredInstructions,
  };
}

export function generateArtifacts(analysis: RepoAnalysis, tailoredInstructions?: string): GeneratedFile[] {
  const ctx = buildGeneratorContext(analysis, tailoredInstructions);
  const implementModel = vscode.workspace.getConfiguration('tokenmin').get<string>('modelFamilyPreference', 'gpt-4o');
  const options: AgentGenOptions = { planModel: DEFAULT_PLAN_MODEL, implementModel };
  return buildArtifacts(ctx, analysis.plan, options);
}

/**
 * Optional, consent-gated tailoring pass. Returns tailored instruction body, or
 * `undefined` to fall back to deterministic templates. Never throws.
 */
export async function runModelTailoringIfConsented(analysis: RepoAnalysis): Promise<string | undefined> {
  const generatesInstructions = analysis.plan.recommendations.some((r) => r.kind === 'instructions');
  if (!generatesInstructions) {
    return undefined; // nothing to tailor
  }

  const consent = await vscode.window.showInformationMessage(
    'Tailor the instructions to this repo with Copilot?',
    {
      modal: true,
      detail:
        'This sends a bounded summary (top-level layout + a few key manifests + README excerpt) to a ' +
        'Copilot model and uses your Copilot quota. Choosing "Use templates" keeps everything ' +
        'deterministic and offline to your Copilot plan.',
    },
    'Use Copilot',
    'Use Templates',
  );
  if (consent !== 'Use Copilot') {
    return undefined;
  }

  const family = vscode.workspace.getConfiguration('tokenmin').get<string>('modelFamilyPreference', 'gpt-4o');

  return vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'Token Optimizer: tailoring with Copilot…' },
    async () => {
      const invoker = await createModelInvoker(family);
      const sources = await gatherSources(analysis);
      const input = buildBoundedInput(sources);
      const prompt = buildTailorPrompt(input, invoker?.maxInputTokens);
      const result = await tailorInstructions(invoker, prompt);

      if (result.ok) {
        logLine(`Instructions tailored with ${result.modelName ?? 'a Copilot model'}.`);
        return result.text;
      }
      void vscode.window.showInformationMessage(
        `Token Optimizer: using deterministic templates (${describeReason(result.reason)}).`,
      );
      return undefined;
    },
  );
}

function describeReason(reason?: string): string {
  switch (reason) {
    case 'no-model':
      return 'no Copilot model available';
    case 'no-consent':
      return 'model permission was declined';
    case 'empty':
      return 'the model returned no content';
    case 'cancelled':
      return 'cancelled';
    default:
      return 'the model pass failed';
  }
}

async function gatherSources(analysis: RepoAnalysis): Promise<RawModelSources> {
  const reader = new VsCodeDirReader(analysis.root);
  const files = analysis.walk.files.map((f) => f.relativePath);

  // Prefer root-level manifests, then nearest others.
  const manifestPaths = files
    .filter(isManifestPath)
    .sort((a, b) => depth(a) - depth(b) || a.localeCompare(b))
    .slice(0, 4);

  const manifests: Record<string, string> = {};
  await Promise.all(
    manifestPaths.map(async (p) => {
      const content = await reader.readTextFile(p);
      if (content) {
        manifests[p] = content;
      }
    }),
  );

  const readmePath = files
    .filter((f) => /(^|\/)readme(\.md|\.txt)?$/i.test(f))
    .sort((a, b) => depth(a) - depth(b))[0];
  const readme = readmePath ? await reader.readTextFile(readmePath) : undefined;

  return {
    repoName: path.basename(analysis.root.fsPath) || 'repo',
    layout: analysis.stack.layout,
    primaryLanguages: analysis.stack.primaryLanguages,
    topLevelDirs: analysis.structure.topLevelDirs.filter((d) => d.name !== '.').map((d) => d.name),
    modules: analysis.stack.modules.map((m) => ({ path: m.path, tech: m.tech })),
    manifests,
    readme: readme ?? undefined,
  };
}

function depth(p: string): number {
  return p.split('/').length;
}
