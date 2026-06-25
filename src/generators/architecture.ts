/**
 * Pure generator for an ARCHITECTURE.md skeleton seeded by the analysis. It is
 * intentionally a helpful starting point (TODOs the user/model fill in), so the
 * instructions file can stay short while still pointing the agent at the map.
 */
import { GeneratedFile } from '../apply/types';
import { GeneratorContext, testCommandFor } from './types';

export const ARCHITECTURE_PATH = 'ARCHITECTURE.md';

export function buildArchitectureDoc(ctx: GeneratorContext): GeneratedFile {
  const { stack, structure } = ctx;
  const lines: string[] = [];

  lines.push(`# Architecture: ${ctx.repoName}`);
  lines.push('');
  lines.push('> Generated skeleton — fill in the TODOs. Keep it current; the agent uses it to');
  lines.push('> navigate instead of doing broad searches.');
  lines.push('');

  lines.push('## Overview');
  const langs = stack.primaryLanguages.slice(0, 3).join(', ') || 'mixed';
  lines.push(`Primarily ${langs}; ${stack.layout === 'monorepo' ? 'a monorepo' : 'a single project'}.`);
  lines.push('TODO: one paragraph on what this codebase does.');
  lines.push('');

  if (stack.layout === 'monorepo' && stack.modules.length > 0) {
    lines.push('## Modules');
    for (const mod of stack.modules.slice(0, 20)) {
      lines.push(`- \`${mod.path}\`${mod.name ? ` (${mod.name})` : ''}: TODO — responsibility.`);
    }
  } else {
    lines.push('## Top-level layout');
    const dirs = structure.topLevelDirs.filter((d) => d.name !== '.').slice(0, 12);
    if (dirs.length === 0) {
      lines.push('- TODO — describe the layout.');
    } else {
      for (const dir of dirs) {
        lines.push(`- \`${dir.name}/\`: TODO — what lives here.`);
      }
    }
  }
  lines.push('');

  lines.push('## Build & test');
  const testCmd = testCommandFor(stack);
  lines.push(`- Test: ${testCmd ? `\`${testCmd}\`` : 'TODO'}`);
  lines.push('- Build: TODO');
  lines.push('- Run locally: TODO');
  lines.push('');

  lines.push('## Key entry points');
  lines.push('- TODO — list the few files a newcomer (or the agent) should read first.');
  lines.push('');

  return { relativePath: ARCHITECTURE_PATH, content: lines.join('\n') + '\n' };
}
