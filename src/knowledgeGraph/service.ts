/**
 * Editor-facing orchestration for the embedded knowledge graph. Owns the
 * managed {@link GraphRuntime}, runs CLI tools against the current repo, and
 * turns their output into the pure view models the webview renders.
 */
import * as vscode from 'vscode';
import { GraphRuntime, ProgressFn } from './runtime';
import { buildCliArgs, parseCliJson, asRecord, pickArray, pickString, pickNumber } from './cli';
import { buildImpactReport, buildViewModel, emptyModel } from './graphModel';
import { GraphProjectInfo, GraphViewModel, ImpactReport, RuntimeInfo } from './types';
import { logLine } from '../util/output';
import { estimateTokens } from '../model/chunking';
import { CacheStats, GraphQueryCache } from './queryCache';

export class GraphService {
  private readonly projectByRoot = new Map<string, string>();
  private readonly cache = new GraphQueryCache();

  constructor(private readonly runtime: GraphRuntime) {}

  /** Whether knowledge-graph query caching is enabled (dashboard toggle). */
  private get cachingEnabled(): boolean {
    return vscode.workspace.getConfiguration('tokenmin').get<boolean>('features.queryCaching', true);
  }

  /** Whether token comparison tracking is enabled (dashboard toggle). */
  private get trackingEnabled(): boolean {
    return vscode.workspace.getConfiguration('tokenmin').get<boolean>('features.tokenTracking', true);
  }

  /** Cache accounting for the dashboard. */
  cacheStats(): CacheStats {
    return this.cache.stats();
  }

  /** The repo path the CLI operates on (always absolute, forward-friendly). */
  private repoPath(root: vscode.Uri): string {
    return root.fsPath;
  }

  /** Locate without installing (for status checks). */
  locate(): Promise<RuntimeInfo | undefined> {
    return this.runtime.locate();
  }

  /** Ensure the managed runtime exists (installs once, then reused). */
  ensureRuntime(progress?: ProgressFn): Promise<RuntimeInfo> {
    return this.runtime.ensureInstalled(progress);
  }

  /** Start the managed 3D graph UI server and return its local URL. */
  async startGraphUi(port: number, progress?: ProgressFn): Promise<string> {
    return this.runtime.startUiServer(port, progress);
  }

  /** Start the managed 3D graph UI and open it in the user's browser. */
  async openGraphUi(port: number, progress?: ProgressFn): Promise<string> {
    const url = await this.runtime.startUiServer(port, progress);
    await vscode.env.openExternal(vscode.Uri.parse(url));
    return url;
  }

  /** Index (or refresh) the repo into the persistent graph. */
  async index(root: vscode.Uri, progress?: ProgressFn): Promise<void> {
    await this.runtime.ensureInstalled(progress);
    progress?.('Indexing repository into the knowledge graph…');
    const args = buildCliArgs('index_repository', { repo_path: this.repoPath(root) });
    const res = await this.runtime.run(args, this.repoPath(root), 600_000);
    if (res.code !== 0) {
      logLine(`index_repository stderr: ${res.stderr}`);
      throw new Error(`Indexing failed (exit ${res.code}). See the Token Optimizer output channel.`);
    }
    const parsed = asRecord(parseCliJson(res.stdout));
    const project = pickString(parsed, 'project', 'name');
    if (project) {
      this.projectByRoot.set(this.repoPath(root), project);
      // A fresh index means every cached query may be out of date.
      this.cache.invalidate(project);
    }
    const status = pickString(parsed, 'status');
    if (status === 'degraded') {
      void vscode.window.showWarningMessage(
        'Knowledge graph indexed with a degraded result — some symbols may be missing. Try re-indexing.',
      );
    }
  }

  /** Build the architecture view model for the repo. */
  async getViewModel(root: vscode.Uri): Promise<GraphViewModel> {
    const info = await this.runtime.locate();
    const name = workspaceName(root);
    if (!info) {
      return emptyModel(name, 'Knowledge graph runtime is not installed yet. Run setup to install it once.');
    }
    try {
      const project = await this.resolveProject(root);
      if (!project) {
        return emptyModel(name, 'No graph yet. Index this repository to populate it.');
      }
      const args = buildCliArgs('get_architecture', { project });
      const res = await this.runtime.run(args, this.repoPath(root), 120_000);
      if (res.code !== 0) {
        return emptyModel(name, 'No graph yet. Index this repository to populate it.');
      }
      return buildViewModel(name, parseCliJson(res.stdout));
    } catch (err) {
      logLine(`get_architecture failed: ${err instanceof Error ? err.message : String(err)}`);
      return emptyModel(name, 'Could not read the graph. Try indexing the repository.');
    }
  }

  /** Map the current git diff to affected symbols + blast radius. */
  async getImpact(root: vscode.Uri): Promise<ImpactReport> {
    await this.runtime.ensureInstalled();
    const project = await this.resolveProject(root);
    if (!project) {
      return { changedFiles: 0, symbols: [], notice: 'Index this repository before running impact analysis.' };
    }
    const args = buildCliArgs('detect_changes', { project });
    const res = await this.runtime.run(args, this.repoPath(root), 120_000);
    if (res.code !== 0) {
      return { changedFiles: 0, symbols: [], notice: 'Impact analysis failed — is this a git repo with changes?' };
    }
    const report = buildImpactReport(parseCliJson(res.stdout));
    // Use the diff fingerprint to invalidate stale cached queries when the graph
    // has effectively changed under the agent's feet.
    const signature = `${report.changedFiles}:${report.symbols.map((s) => s.name).sort().join(',')}`;
    this.cache.setSignature(project, signature);
    return report;
  }

  /** Structured symbol search (search_graph). Returns rendered result rows. */
  async searchGraph(root: vscode.Uri, pattern: string): Promise<QueryResult> {
    return this.runCachedQuery(root, 'search_graph', pattern, (project) =>
      buildCliArgs('search_graph', { name_pattern: pattern, project }),
    );
  }

  /** Inbound + outbound call trace for a symbol (trace_path). */
  async tracePath(root: vscode.Uri, name: string): Promise<QueryResult> {
    return this.runCachedQuery(root, 'trace_path', name, (project) =>
      buildCliArgs('trace_path', { function_name: name, direction: 'both', project }),
    );
  }

  /**
   * Shared path for cacheable graph queries: resolve the project, serve a cache
   * hit when caching is enabled, otherwise run the CLI, build the comparison and
   * cache the result keyed by project + tool + argument.
   */
  private async runCachedQuery(
    root: vscode.Uri,
    tool: 'search_graph' | 'trace_path',
    rawArg: string,
    buildArgs: (project: string) => string[],
  ): Promise<QueryResult> {
    if (!rawArg.trim()) {
      return emptyQueryResult();
    }
    await this.runtime.ensureInstalled();
    const project = await this.resolveProject(root);
    if (!project) {
      return emptyQueryResult();
    }

    if (this.cachingEnabled) {
      const hit = this.cache.get<QueryResult>(project, tool, rawArg);
      if (hit) {
        return { ...hit, fromCache: true };
      }
    }

    const args = buildArgs(project);
    const res = await this.runtime.run(args, this.repoPath(root), 60_000);
    const result = await this.withComparison(root, rowsFromResults(parseCliJson(res.stdout)));
    if (this.cachingEnabled) {
      this.cache.set(project, tool, rawArg, result);
    }
    return result;
  }

  private async withComparison(root: vscode.Uri, rows: SearchRow[]): Promise<QueryResult> {
    const graphTokens = estimateTokens(JSON.stringify(rows));
    if (!this.trackingEnabled) {
      return {
        rows,
        fromCache: false,
        comparison: { graphTokens, fileReadTokens: 0, savedTokens: 0, reductionPercent: 0, filesRead: 0 },
      };
    }
    const files = uniqueFiles(rows).slice(0, 12);
    let fileReadTokens = 0;
    for (const file of files) {
      const text = await readWorkspaceText(root, file);
      if (text !== undefined) {
        fileReadTokens += estimateTokens(text);
      }
    }
    const savedTokens = Math.max(0, fileReadTokens - graphTokens);
    const reductionPercent = fileReadTokens > 0 ? Math.round((savedTokens / fileReadTokens) * 100) : 0;
    return {
      rows,
      fromCache: false,
      comparison: {
        graphTokens,
        fileReadTokens,
        savedTokens,
        reductionPercent,
        filesRead: files.length,
      },
    };
  }

  /**
   * Every knowledge-graph instance the MCP server knows about (`list_projects`).
   * Used by the dashboard to show all graphs at a glance; the one matching the
   * open workspace is flagged with `current`. Returns `[]` when the runtime is
   * not installed or the CLI cannot be reached.
   */
  async listProjects(activeRoot?: vscode.Uri): Promise<GraphProjectInfo[]> {
    const info = await this.runtime.locate();
    if (!info) {
      return [];
    }
    const cwd = activeRoot ? this.repoPath(activeRoot) : process.cwd();
    const res = await this.runtime.run(buildCliArgs('list_projects'), cwd, 30_000);
    if (res.code !== 0) {
      return [];
    }
    const parsed = asRecord(parseCliJson(res.stdout));
    const activeNormalized = activeRoot ? normalizePath(this.repoPath(activeRoot)) : undefined;
    return pickArray(parsed, 'projects')
      .map((project): GraphProjectInfo | undefined => {
        const rec = asRecord(project);
        const name = pickString(rec, 'name', 'project');
        if (!name) {
          return undefined;
        }
        const rootPath = pickString(rec, 'root_path', 'rootPath', 'repo_path', 'repoPath');
        // Remember the mapping so resolveProject can serve it without a re-scan.
        if (rootPath) {
          this.projectByRoot.set(rootPath, name);
        }
        return {
          name,
          rootPath,
          files: pickNumber(rec, 'files', 'file_count', 'fileCount'),
          symbols: pickNumber(rec, 'symbols', 'symbol_count', 'symbolCount', 'nodes', 'node_count'),
          indexedAt: pickString(rec, 'indexed_at', 'indexedAt', 'updated_at', 'updatedAt', 'last_indexed'),
          current: Boolean(activeNormalized && rootPath && normalizePath(rootPath) === activeNormalized),
        };
      })
      .filter((p): p is GraphProjectInfo => p !== undefined);
  }

  private async resolveProject(root: vscode.Uri): Promise<string | undefined> {
    const rootPath = this.repoPath(root);
    const cached = this.projectByRoot.get(rootPath);
    if (cached) {
      return cached;
    }

    await this.runtime.ensureInstalled();
    const match = (await this.listProjects(root)).find((p) => p.current);
    return match?.name;
  }
}

export interface SearchRow {
  name: string;
  file?: string;
  detail?: string;
}

export interface TokenComparison {
  graphTokens: number;
  fileReadTokens: number;
  savedTokens: number;
  reductionPercent: number;
  filesRead: number;
}

export interface QueryResult {
  rows: SearchRow[];
  comparison: TokenComparison;
  /** True when this result was served from the query cache (no fresh CLI call). */
  fromCache: boolean;
}

function emptyQueryResult(): QueryResult {
  return {
    rows: [],
    comparison: { graphTokens: 0, fileReadTokens: 0, savedTokens: 0, reductionPercent: 0, filesRead: 0 },
    fromCache: false,
  };
}

function rowsFromResults(parsed: unknown): SearchRow[] {
  const root = asRecord(parsed);
  const results = pickArray(root, 'results', 'nodes', 'matches', 'paths', 'callers', 'callees');
  const arr = results.length ? results : Array.isArray(parsed) ? (parsed as unknown[]) : [];
  return arr
    .map((item): SearchRow | undefined => {
      if (typeof item === 'string') {
        return { name: item };
      }
      const rec = asRecord(item);
      const name = pickString(rec, 'name', 'qualifiedName', 'symbol', 'label');
      if (!name) {
        return undefined;
      }
      const degree = pickNumber(rec, 'degree', 'callers', 'references');
      return {
        name: pickString(rec, 'qualified_name', 'qualifiedName') ?? name,
        file: pickString(rec, 'file', 'file_path', 'path') ?? pathLikeName(name),
        detail:
          pickString(rec, 'kind', 'label', 'type') ??
          (degree !== undefined ? `degree ${degree}` : degreeFromInOut(rec)),
      };
    })
    .filter((r): r is SearchRow => r !== undefined)
    .slice(0, 100);
}

function uniqueFiles(rows: SearchRow[]): string[] {
  const files = new Set<string>();
  for (const row of rows) {
    if (row.file) {
      files.add(row.file);
    }
  }
  return [...files];
}

async function readWorkspaceText(root: vscode.Uri, file: string): Promise<string | undefined> {
  try {
    const uri = /^[a-zA-Z]:[\\/]/.test(file) ? vscode.Uri.file(file) : vscode.Uri.joinPath(root, ...file.split(/[\\/]/));
    const data = await vscode.workspace.fs.readFile(uri);
    return Buffer.from(data).toString('utf8');
  } catch {
    return undefined;
  }
}

function pathLikeName(name: string): string | undefined {
  return /[\\/]/.test(name) && /\.[A-Za-z0-9]+$/.test(name) ? name : undefined;
}

function degreeFromInOut(rec: Record<string, unknown>): string | undefined {
  const inDegree = pickNumber(rec, 'in_degree', 'inDegree');
  const outDegree = pickNumber(rec, 'out_degree', 'outDegree');
  if (inDegree === undefined && outDegree === undefined) {
    return undefined;
  }
  return `in ${inDegree ?? 0}, out ${outDegree ?? 0}`;
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, '/').replace(/\/$/, '').toLowerCase();
}

function workspaceName(root: vscode.Uri): string {
  const parts = root.fsPath.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] || 'repo';
}
