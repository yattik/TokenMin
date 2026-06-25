/**
 * Registers the Knowledge Graph commands and builds the managed runtime/service
 * from the extension context. The runtime is installed ONCE into global storage
 * (`context.globalStorageUri`) and reused for every workspace and command.
 */
import * as vscode from 'vscode';
import { resolveRepoRoot } from '../repoRootPicker';
import { getOutputChannel, logHeading, logLine } from '../util/output';
import { GraphRuntime } from './runtime';
import { GraphService } from './service';
import { ApplyService, FileChange } from '../apply/applyService';
import { buildGeneratedFileChanges } from '../flow/changes';
import { buildGraphAgents, mergeMcpConfigText } from './copilotIntegration';
import { DashboardPanel } from '../dashboard/dashboardPanel';

let service: GraphService | undefined;

/** The single shared {@link GraphService}, built from extension global storage. */
export function getGraphService(context: vscode.ExtensionContext): GraphService {
  if (service) {
    return service;
  }
  const override = vscode.workspace
    .getConfiguration('tokenmin')
    .get<string>('knowledgeGraph.binaryPath', '')
    .trim();
  const runtime = new GraphRuntime(context.globalStorageUri.fsPath, override || undefined);
  service = new GraphService(runtime);
  return service;
}

/** @deprecated internal alias retained for readability at call sites. */
function getService(context: vscode.ExtensionContext): GraphService {
  return getGraphService(context);
}

export function registerKnowledgeGraphCommands(
  context: vscode.ExtensionContext,
  applyService: ApplyService,
): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand('tokenmin.setupKnowledgeGraph', () =>
      runSafely('Setup Knowledge Graph', () => setup(context)),
    ),
    vscode.commands.registerCommand('tokenmin.indexKnowledgeGraph', () =>
      runSafely('Index Knowledge Graph', () => indexAndShow(context)),
    ),
    vscode.commands.registerCommand('tokenmin.openKnowledgeGraph', () =>
      runSafely('Open Knowledge Graph', () => open(context)),
    ),
    vscode.commands.registerCommand('tokenmin.knowledgeGraphStatus', () =>
      runSafely('Knowledge Graph Status', () => status(context)),
    ),
    vscode.commands.registerCommand('tokenmin.configureCopilotMcp', () =>
      runSafely('Configure Copilot Graph Tools', () => configureCopilot(context, applyService)),
    ),
  ];
}

async function setup(context: vscode.ExtensionContext): Promise<void> {
  const svc = getService(context);
  const info = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'Token Optimizer: preparing knowledge graph runtime…' },
    async (progress) => svc.ensureRuntime((m) => progress.report({ message: m })),
  );
  logHeading('Knowledge graph runtime');
  logLine(`Binary: ${info.binaryPath}`);
  logLine(`Source: ${info.source}${info.version ? ` · ${info.version}` : ''}`);
  const choice = await vscode.window.showInformationMessage(
    `Knowledge graph runtime ready (${info.source}). Index this repository now?`,
    'Index Repo',
    'Later',
  );
  if (choice === 'Index Repo') {
    await indexAndShow(context);
  }
}

async function indexAndShow(context: vscode.ExtensionContext): Promise<void> {
  const svc = getService(context);
  // Show the unified dashboard panel — it owns the indexing + model update.
  DashboardPanel.show(svc);
}

async function open(context: vscode.ExtensionContext): Promise<void> {
  const svc = getService(context);
  DashboardPanel.show(svc);
}

async function status(context: vscode.ExtensionContext): Promise<void> {
  const svc = getService(context);
  const info = await svc.locate();
  logHeading('Knowledge graph status');
  if (!info) {
    logLine('Runtime: not installed. Run "Token Optimizer: Setup Knowledge Graph" to install it once.');
    getOutputChannel().show(true);
    void vscode.window.showInformationMessage(
      'Knowledge graph runtime is not installed yet. Run "Token Optimizer: Setup Knowledge Graph".',
    );
    return;
  }
  logLine(`Runtime: ${info.binaryPath}`);
  logLine(`Source: ${info.source}${info.version ? ` · ${info.version}` : ''}`);
  getOutputChannel().show(true);
}

async function configureCopilot(context: vscode.ExtensionContext, applyService: ApplyService): Promise<void> {
  const kgEnabled = vscode.workspace
    .getConfiguration('tokenmin')
    .get<boolean>('features.knowledgeGraphContext', true);
  if (!kgEnabled) {
    void vscode.window.showInformationMessage(
      'Knowledge Graph Context is turned off. Enable it in the Token Optimizer dashboard to configure Copilot.',
    );
    return;
  }
  const root = await resolveRepoRoot();
  if (!root) {
    return;
  }
  const svc = getService(context);
  const info = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'Token Optimizer: preparing knowledge graph runtime…' },
    async (progress) => svc.ensureRuntime((m) => progress.report({ message: m })),
  );

  const mcpUri = vscode.Uri.joinPath(root, '.vscode', 'mcp.json');
  let existingMcp = '';
  let mcpExists = false;
  try {
    existingMcp = Buffer.from(await vscode.workspace.fs.readFile(mcpUri)).toString('utf8');
    mcpExists = true;
  } catch {
    existingMcp = '';
  }
  const mcpChange: FileChange = {
    uri: mcpUri,
    relativePath: '.vscode/mcp.json',
    oldContent: existingMcp,
    newContent: mergeMcpConfigText(existingMcp, info.binaryPath),
    isNew: !mcpExists,
  };

  const agentChanges = await buildGeneratedFileChanges(root, buildGraphAgents());
  const result = await applyService.previewAndApply(root, [mcpChange, ...agentChanges], { offerBranch: false });

  if (result.applied) {
    logHeading('Copilot graph tools configured');
    logLine(`MCP server binary: ${info.binaryPath}`);
    void vscode.window.showInformationMessage(
      'Copilot graph tools configured. Open Copilot Chat and start the "codebase-memory" MCP server ' +
        '(you may need to reload the window), then use the graph-plan / graph-implement agents.',
    );
  }
}

/** Local copy of the extension's error-surfacing wrapper (keeps this module standalone). */
async function runSafely(label: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logHeading(`${label} failed`);
    logLine(message);
    const choice = await vscode.window.showErrorMessage(`Token Optimizer: ${label} failed — ${message}`, 'Show Logs');
    if (choice === 'Show Logs') {
      getOutputChannel().show(true);
    }
  }
}
