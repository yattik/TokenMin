/**
 * Pure text rendering of an analysis for the output channel. Kept free of
 * `vscode` so the formatting is unit-testable.
 */
import { StackAnalysis, StructureAnalysis } from '../analyzer/types';
import { EfficiencyScore, OptimizationPlan, Recommendation } from '../recommendations/types';
import { formatBytes, padEnd, pluralize } from '../util/format';

export function formatScore(score: EfficiencyScore): string {
  const lines: string[] = [];
  lines.push(`Efficiency score: ${score.score}/100`);
  for (const c of score.criteria) {
    const mark = c.satisfied ? '✓' : '✗';
    lines.push(`  ${mark} ${padEnd(c.label, 26)} (${c.weight}) — ${c.detail}`);
  }
  return lines.join('\n');
}

export function formatPlan(plan: OptimizationPlan): string {
  const lines: string[] = [];
  lines.push(formatScore(plan.score));
  lines.push('');
  lines.push(`Projected score after applying recommendations: ${plan.projectedScore.score}/100`);
  lines.push('');
  lines.push(`Recommendations (${plan.recommendations.length}):`);
  let i = 1;
  for (const rec of plan.recommendations) {
    lines.push(`  ${i}. [${rec.priority.toUpperCase()}] ${rec.title}`);
    lines.push(`     ${rec.detail}`);
    appendExclusionDetail(lines, rec);
    i++;
  }
  return lines.join('\n');
}

function appendExclusionDetail(lines: string[], rec: Recommendation): void {
  if (rec.kind !== 'exclusion' || !rec.exclusions) {
    return;
  }
  if (rec.exclusions.searchExclude.length > 0) {
    lines.push(`     search.exclude += ${rec.exclusions.searchExclude.join(', ')}`);
  }
  if (rec.exclusions.filesExclude.length > 0) {
    lines.push(`     files.exclude  += ${rec.exclusions.filesExclude.join(', ')}`);
  }
}

export function formatStackReport(stack: StackAnalysis): string {
  const lines: string[] = [];
  lines.push(`Layout: ${stack.layout}`);
  lines.push(
    `Primary languages: ${stack.primaryLanguages.length ? stack.primaryLanguages.slice(0, 6).join(', ') : '(none detected)'}`,
  );
  const tech = stack.tech.map((t) => t.name);
  lines.push(`Detected stack: ${tech.length ? tech.join(', ') : '(none detected)'}`);

  const indexLabel =
    stack.indexSource === 'github-remote'
      ? `GitHub remote index (${stack.remoteUrl ?? 'origin'})`
      : stack.indexSource === 'local'
        ? 'local index (no GitHub remote found)'
        : 'unknown (no git remote)';
  lines.push(`Semantic index source: ${indexLabel}`);

  if (stack.layout === 'monorepo' && stack.modules.length > 0) {
    lines.push('');
    lines.push(`Modules (${stack.modules.length}):`);
    for (const mod of stack.modules.slice(0, 25)) {
      const label = mod.name ? `${mod.path} (${mod.name})` : mod.path;
      lines.push(`  ${padEnd(label, 40)} ${mod.tech.join(', ')}`);
    }
    if (stack.modules.length > 25) {
      lines.push(`  … and ${stack.modules.length - 25} more`);
    }
  }
  return lines.join('\n');
}

export function formatStructureReport(analysis: StructureAnalysis): string {
  const lines: string[] = [];

  lines.push(
    `Files analyzed: ${analysis.totalFiles.toLocaleString()} (${formatBytes(analysis.totalSize)})` +
      (analysis.truncated ? '  [truncated at file cap]' : ''),
  );
  lines.push(`Directories excluded by .gitignore: ${analysis.gitignoredDirCount}`);
  lines.push('');

  lines.push('Top-level directories:');
  if (analysis.topLevelDirs.length === 0) {
    lines.push('  (none)');
  } else {
    for (const dir of analysis.topLevelDirs) {
      lines.push(`  ${padEnd(dir.name, 24)} ${padEnd(pluralize(dir.fileCount, 'file'), 14)} ${formatBytes(dir.totalSize)}`);
    }
  }
  lines.push('');

  lines.push(`Noisy / generated directories (${analysis.noisyDirs.length}):`);
  if (analysis.noisyDirs.length === 0) {
    lines.push('  (none detected)');
  } else {
    for (const dir of analysis.noisyDirs) {
      const tags: string[] = [`${dir.tier}`, dir.reason];
      if (dir.gitignored) {
        tags.push('already in .gitignore');
      }
      if (dir.pruned) {
        tags.push('pruned');
      }
      const count = dir.pruned ? '' : `  ${pluralize(dir.fileCount, 'file')}`;
      lines.push(`  ${padEnd(dir.relativePath, 32)} [${tags.join(', ')}]${count}`);
    }
  }
  lines.push('');

  if (analysis.largeFiles.length > 0) {
    lines.push(`Largest files (top ${analysis.largeFiles.length}):`);
    for (const file of analysis.largeFiles) {
      lines.push(`  ${padEnd(formatBytes(file.size), 10)} ${file.relativePath}`);
    }
    lines.push('');
  }

  lines.push(`Binary files: ${analysis.binaryFileCount}`);
  lines.push(`Lockfiles: ${analysis.lockfiles.length === 0 ? '(none)' : analysis.lockfiles.join(', ')}`);

  return lines.join('\n');
}
