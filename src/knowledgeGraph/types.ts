/**
 * Domain types for the embedded codebase-memory-mcp knowledge graph.
 *
 * Pure (no `vscode`, no `node` imports) so the platform/CLI/model/HTML logic
 * built on top of these stays unit-testable. The runtime + service layers add
 * the editor/process integration.
 */

/** OS families the codebase-memory-mcp project ships static binaries for. */
export type GraphPlatform = 'windows' | 'darwin' | 'linux';

/** CPU architectures the project ships binaries for. */
export type GraphArch = 'amd64' | 'arm64';

/** A resolved download target (platform + arch). */
export interface PlatformTarget {
  platform: GraphPlatform;
  arch: GraphArch;
}

/** Where a usable binary was found, for honest reporting in the UI. */
export type RuntimeSource = 'user-override' | 'global-storage' | 'path';

/** A located, ready-to-run binary. */
export interface RuntimeInfo {
  /** Absolute path to the executable. */
  binaryPath: string;
  /** `--version` output, when known. */
  version?: string;
  /** How the binary was located. */
  source: RuntimeSource;
}

/**
 * One knowledge-graph instance tracked by the codebase-memory MCP server
 * (`list_projects`). Each indexed repository is a separate project/graph.
 */
export interface GraphProjectInfo {
  /** Project name as stored by the MCP server. */
  name: string;
  /** Absolute repo path the graph was indexed from, when known. */
  rootPath?: string;
  /** Indexed file count, when reported. */
  files?: number;
  /** Indexed symbol/node count, when reported. */
  symbols?: number;
  /** Last index timestamp, when reported. */
  indexedAt?: string;
  /** True when this graph matches the currently open workspace. */
  current?: boolean;
}

/** The MCP CLI tools this extension drives. */
export type GraphTool =
  | 'index_repository'
  | 'index_status'
  | 'list_projects'
  | 'get_architecture'
  | 'search_graph'
  | 'trace_path'
  | 'detect_changes'
  | 'get_code_snippet'
  | 'search_code'
  | 'query_graph';

// ── Normalized view model (architecture → graph) ────────────────────────────

/** A node in the rendered graph (package/module/cluster). */
export interface GraphNode {
  id: string;
  label: string;
  kind: 'package' | 'module' | 'cluster' | 'route' | 'hotspot';
  /** Relative weight (file count, degree, etc.) used for node sizing. */
  weight: number;
  /** Optional file path for "open in editor" actions. */
  file?: string;
}

/** A directed edge between two graph nodes. */
export interface GraphEdge {
  from: string;
  to: string;
  kind: 'imports' | 'calls' | 'contains' | 'related';
}

/** A code hotspot (high-degree / frequently-touched symbol). */
export interface Hotspot {
  name: string;
  file?: string;
  degree: number;
}

/** A detected HTTP/RPC route. */
export interface RouteInfo {
  method?: string;
  path: string;
  handler?: string;
  file?: string;
}

/** Headline counts shown in the summary cards. */
export interface GraphSummary {
  nodes: number;
  edges: number;
  packages: number;
  routes: number;
  functions: number;
  classes: number;
  languages: string[];
  indexedAt?: string;
}

/** The full, render-ready model passed to the webview. */
export interface GraphViewModel {
  projectName: string;
  indexed: boolean;
  summary: GraphSummary;
  nodes: GraphNode[];
  edges: GraphEdge[];
  hotspots: Hotspot[];
  routes: RouteInfo[];
  /** Human-readable note when the model is partial or unavailable. */
  notice?: string;
}

// ── Impact analysis (detect_changes) ────────────────────────────────────────

/** One symbol affected by the current git diff. */
export interface ImpactSymbol {
  name: string;
  file?: string;
  risk: 'low' | 'medium' | 'high' | 'unknown';
  /** Number of dependents that may be affected (blast radius). */
  blastRadius: number;
}

export interface ImpactReport {
  changedFiles: number;
  symbols: ImpactSymbol[];
  notice?: string;
}
