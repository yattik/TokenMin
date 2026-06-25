/**
 * Pure derivation of which Copilot-relevant artifacts already exist, from the
 * walked file list. The flow layer combines this with `search.exclude` /
 * `files.exclude` read from `vscode` config to form a full {@link CurrentSettings}.
 */
import { baseName } from '../core/noisePatterns';

export interface ArtifactPresence {
  hasCopilotInstructions: boolean;
  scopedInstructionFiles: string[];
  agentFiles: string[];
  toolSetFiles: string[];
  hasArchitectureDoc: boolean;
  promptFiles: string[];
}

export function deriveArtifacts(files: readonly string[]): ArtifactPresence {
  const scopedInstructionFiles: string[] = [];
  const agentFiles: string[] = [];
  const toolSetFiles: string[] = [];
  const promptFiles: string[] = [];
  let hasCopilotInstructions = false;
  let hasArchitectureDoc = false;

  for (const file of files) {
    const name = baseName(file);
    if (file === '.github/copilot-instructions.md') {
      hasCopilotInstructions = true;
    } else if (name.endsWith('.instructions.md')) {
      scopedInstructionFiles.push(file);
    } else if (name.endsWith('.agent.md')) {
      agentFiles.push(file);
    } else if (name.endsWith('.prompt.md')) {
      promptFiles.push(file);
    } else if (name.endsWith('.toolsets.jsonc') || name.endsWith('.toolsets.json')) {
      toolSetFiles.push(file);
    }
    if (name === 'ARCHITECTURE.md') {
      hasArchitectureDoc = true;
    }
  }

  return {
    hasCopilotInstructions,
    scopedInstructionFiles: scopedInstructionFiles.sort(),
    agentFiles: agentFiles.sort(),
    toolSetFiles: toolSetFiles.sort(),
    hasArchitectureDoc,
    promptFiles: promptFiles.sort(),
  };
}
