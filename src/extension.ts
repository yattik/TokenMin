/**
 * Extension entry point. Registers commands and the diff-preview provider,
 * and orchestrates analyze → recommend → [optional Copilot pass] → report →
 * preview → apply.
 */
import * as vscode from 'vscode';
import { resolveRepoRoot } from './repoRootPicker';
import { getOutputChannel, logHeading, logLine } from './util/output';
import { analyzeRepo, RepoAnalysis } from './flow/analyzeRepo';
import { formatPlan, formatStackReport, formatStructureReport } from './report/textReport';
import { PreviewContentProvider } from './apply/diffPreview';
import { ApplyService, FileChange } from './apply/applyService';
import { buildSettingsChange, buildGeneratedFileChanges } from './flow/changes';
import { generateArtifacts, runModelTailoringIfConsented } from './flow/generate';
import { GeneratedFile, ApplyHistory } from './apply/types';
import { buildScorecard, Scorecard } from './report/scorecard';
import { ReportPanel } from './report/reportWebview';
import { registerKnowledgeGraphCommands, getGraphService } from './knowledgeGraph/commands';
import { DashboardPanel } from './dashboard/dashboardPanel';
import { PromptPanel } from './prompt/promptPanel';

let previewProvider: PreviewContentProvider;
let applyService: ApplyService;
let lastScorecard: Scorecard | undefined;

export function activate(context: vscode.ExtensionContext): void {
  previewProvider = new PreviewContentProvider();
  applyService = new ApplyService(previewProvider, new ApplyHistory(context.workspaceState));

  // Persistent entry point: a status-bar button that is always available, even
  // after the walkthrough or report panel is closed. It opens the feature-control
  // dashboard.
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBar.text = '$(rocket) Token Optimizer';
  statusBar.tooltip = 'Open the Token Optimizer dashboard (features, knowledge graph, token tracking)';
  statusBar.command = 'tokenmin.openDashboard';
  statusBar.show();

  context.subscriptions.push(
    previewProvider,
    statusBar,
    vscode.workspace.registerTextDocumentContentProvider(PreviewContentProvider.scheme, previewProvider),
    vscode.commands.registerCommand('tokenmin.openDashboard', () =>
      runSafely('Open Dashboard', () => DashboardPanel.show(getGraphService(context))),
    ),
    vscode.commands.registerCommand('tokenmin.optimizePrompt', () => runSafely('Optimize Prompt', openOptimizePrompt)),
    vscode.commands.registerCommand('tokenmin.analyzeAndOptimize', () => runSafely('Analyze & Optimize', () => runAnalyze(true))),
    vscode.commands.registerCommand('tokenmin.analyzeOnly', () => runSafely('Analyze', () => runAnalyze(false))),
    vscode.commands.registerCommand('tokenmin.showReport', () => runSafely('Show Report', showReport)),
    vscode.commands.registerCommand('tokenmin.undoLast', () => runSafely('Undo', () => applyService.undoLast())),
    ...registerKnowledgeGraphCommands(context, applyService),
  );
}

export function deactivate(): void {
  // disposables handled via context.subscriptions
}

/**
 * Run a command body, surfacing any failure to the user instead of failing
 * silently (a swallowed error otherwise looks like "the button does nothing").
 */
async function runSafely(label: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logHeading(`${label} failed`);
    logLine(message);
    if (err instanceof Error && err.stack) {
      logLine(err.stack);
    }
    const choice = await vscode.window.showErrorMessage(
      `Token Optimizer: ${label} failed — ${message}`,
      'Show Logs',
    );
    if (choice === 'Show Logs') {
      getOutputChannel().show(true);
    }
  }
}

async function runAnalyze(withApply: boolean): Promise<void> {
  // Immediate acknowledgement so the click is never ambiguous, even before any
  // picker/dialog appears.
  vscode.window.setStatusBarMessage('$(rocket) Token Optimizer: starting…', 4000);
  logLine(`[${new Date().toISOString()}] ${withApply ? 'Analyze & Optimize' : 'Analyze'} invoked.`);

  const root = await resolveRepoRoot();
  if (!root) {
    return;
  }
  const channel = getOutputChannel();
  channel.show(true);
  logHeading('Repo root');
  logLine(root.fsPath);

  const analysis = await analyzeRepo(root);
  printReport(analysis);

  // Optional, consent-gated model pass (only when applying).
  const tailored = withApply ? await runModelTailoringIfConsented(analysis) : undefined;
  const generated = generateArtifacts(analysis, tailored);

  lastScorecard = buildScorecard({
    plan: analysis.plan,
    indexSource: analysis.stack.indexSource,
    consideredFiles: analysis.structure.totalFiles,
    gitignoredDirs: analysis.structure.gitignoredDirCount,
    generatedFiles: generated,
  });
  ReportPanel.show(lastScorecard);

  if (!withApply) {
    return;
  }
  await applyChanges(root, analysis, generated);
}

function printReport(analysis: RepoAnalysis): void {
  logHeading('Stack & layout');
  logLine(formatStackReport(analysis.stack));
  logHeading('Structure analysis');
  logLine(formatStructureReport(analysis.structure));
  logHeading('Recommendations & score');
  logLine(formatPlan(analysis.plan));
}

async function applyChanges(root: vscode.Uri, analysis: RepoAnalysis, generated: GeneratedFile[]): Promise<void> {
  const changes: FileChange[] = [];

  const exclusion = analysis.plan.recommendations.find((r) => r.kind === 'exclusion');
  if (exclusion?.exclusions) {
    const settingsChange = await buildSettingsChange(root, exclusion.exclusions);
    if (settingsChange) {
      changes.push(settingsChange);
    }
  }

  changes.push(...(await buildGeneratedFileChanges(root, generated)));

  const offerBranch = vscode.workspace.getConfiguration('tokenmin').get<boolean>('applyToNewBranch', false);
  await applyService.previewAndApply(root, changes, { offerBranch });
}

function showReport(): void {
  if (lastScorecard) {
    ReportPanel.show(lastScorecard);
  } else {
    void vscode.window.showInformationMessage('Run "Analyze & Optimize Repo" first to generate a report.');
  }
}

/** Open the Optimize Prompt panel, honoring the dashboard toggle. */
function openOptimizePrompt(): void {
  const enabled = vscode.workspace.getConfiguration('tokenmin').get<boolean>('features.promptRestructuring', true);
  if (!enabled) {
    void vscode.window.showInformationMessage(
      'Prompt Restructuring is turned off. Enable it in the Token Optimizer dashboard.',
    );
    return;
  }
  const folder = vscode.workspace.workspaceFolders?.[0];
  const repoName = folder ? folder.uri.fsPath.split(/[\\/]/).filter(Boolean).pop() : undefined;
  PromptPanel.show({ repoName });
}
