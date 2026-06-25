/**
 * Pure transforms from loose codebase-memory-mcp CLI JSON into the normalized
 * {@link GraphViewModel} / {@link ImpactReport} the webview renders. Defensive
 * by design: unknown shapes degrade to a partial model with a `notice` rather
 * than throwing. No `node`/`vscode` imports — fully unit-testable.
 */
import { asRecord, pickArray, pickNumber, pickString } from './cli';
import {
  GraphEdge,
  GraphNode,
  GraphViewModel,
  Hotspot,
  ImpactReport,
  ImpactSymbol,
  RouteInfo,
} from './types';

/** Cap on rendered nodes/edges so the webview stays responsive on huge repos. */
export const MAX_NODES = 120;
export const MAX_EDGES = 300;

/** An empty/“not indexed yet” model. */
export function emptyModel(projectName: string, notice?: string): GraphViewModel {
  return {
    projectName,
    indexed: false,
    summary: { nodes: 0, edges: 0, packages: 0, routes: 0, functions: 0, classes: 0, languages: [] },
    nodes: [],
    edges: [],
    hotspots: [],
    routes: [],
    notice,
  };
}

/**
 * Build the view model from `get_architecture` output. The architecture call
 * returns languages, packages, routes, hotspots, clusters and counts in one
 * payload; field names vary, so each is probed via aliases.
 */
export function buildViewModel(projectName: string, architecture: unknown): GraphViewModel {
  const root = asRecord(architecture);
  // Some builds wrap the payload under `result`/`data`/`architecture`.
  const arch = pickFirstRecord(root, 'architecture', 'result', 'data') ?? root;

  const languages = toStringList(pickArray(arch, 'languages', 'language'));
  const packagesRaw = pickArray(arch, 'packages', 'modules', 'clusters');
  const labelNodesRaw = pickArray(arch, 'node_labels', 'nodeLabels', 'labels');
  const routesRaw = pickArray(arch, 'routes', 'endpoints');
  const hotspotsRaw = pickArray(arch, 'hotspots', 'hot_spots');

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const seen = new Set<string>();

  for (const entry of packagesRaw) {
    if (nodes.length >= MAX_NODES) {
      break;
    }
    const rec = asRecord(entry);
    const label =
      pickString(rec, 'name', 'path', 'id', 'label') ?? (typeof entry === 'string' ? entry : undefined);
    if (!label) {
      continue;
    }
    const id = `pkg:${label}`;
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    nodes.push({
      id,
      label,
      kind: 'package',
      weight: pickNumber(rec, 'files', 'fileCount', 'size', 'nodes', 'weight') ?? 1,
      file: pickString(rec, 'path', 'file'),
    });
    // Dependency edges, when present.
    for (const dep of toStringList(pickArray(rec, 'imports', 'dependsOn', 'depends_on', 'deps'))) {
      if (edges.length >= MAX_EDGES) {
        break;
      }
      edges.push({ from: id, to: `pkg:${dep}`, kind: 'imports' });
    }
  }

  if (packagesRaw.length === 0) {
    for (const entry of labelNodesRaw) {
      if (nodes.length >= MAX_NODES) {
        break;
      }
      const rec = asRecord(entry);
      const label = pickString(rec, 'label', 'name', 'id');
      if (!label) {
        continue;
      }
      const id = `label:${label}`;
      if (seen.has(id)) {
        continue;
      }
      seen.add(id);
      nodes.push({
        id,
        label,
        kind: 'cluster',
        weight: pickNumber(rec, 'count', 'nodes', 'weight') ?? 1,
      });
    }
  }

  // Make sure dependency targets exist as nodes (so edges render).
  for (const edge of edges) {
    if (!seen.has(edge.to) && nodes.length < MAX_NODES) {
      seen.add(edge.to);
      nodes.push({ id: edge.to, label: edge.to.replace(/^pkg:/, ''), kind: 'package', weight: 1 });
    }
  }

  const hotspots: Hotspot[] = hotspotsRaw
    .map((h): Hotspot | undefined => {
      const rec = asRecord(h);
      const name = pickString(rec, 'name', 'symbol', 'function', 'qualifiedName');
      if (!name && typeof h !== 'string') {
        return undefined;
      }
      return {
        name: name ?? String(h),
        file: pickString(rec, 'file', 'path'),
        degree: pickNumber(rec, 'degree', 'callers', 'references', 'count') ?? 0,
      };
    })
    .filter((h): h is Hotspot => h !== undefined)
    .sort((a, b) => b.degree - a.degree)
    .slice(0, 20);

  const routes: RouteInfo[] = routesRaw
    .map((r): RouteInfo | undefined => {
      const rec = asRecord(r);
      const path = pickString(rec, 'path', 'route', 'pattern', 'url');
      if (!path && typeof r !== 'string') {
        return undefined;
      }
      return {
        method: pickString(rec, 'method', 'verb'),
        path: path ?? String(r),
        handler: pickString(rec, 'handler', 'function', 'name'),
        file: pickString(rec, 'file', 'path'),
      };
    })
    .filter((r): r is RouteInfo => r !== undefined)
    .slice(0, 50);

  // Hotspots become highlighted nodes too (linked to their package if known).
  for (const h of hotspots.slice(0, 12)) {
    if (nodes.length >= MAX_NODES) {
      break;
    }
    const id = `hot:${h.name}`;
    if (!seen.has(id)) {
      seen.add(id);
      nodes.push({ id, label: shortSymbol(h.name), kind: 'hotspot', weight: Math.max(1, h.degree), file: h.file });
    }
  }

  const counts = pickFirstRecord(arch, 'counts', 'stats', 'totals') ?? arch;
  const labelCount = (label: string): number | undefined => {
    for (const entry of labelNodesRaw) {
      const rec = asRecord(entry);
      if (pickString(rec, 'label', 'name') === label) {
        return pickNumber(rec, 'count', 'nodes', 'weight');
      }
    }
    return undefined;
  };
  const summary = {
    nodes: pickNumber(counts, 'nodes', 'nodeCount', 'totalNodes', 'total_nodes') ?? nodes.length,
    edges: pickNumber(counts, 'edges', 'edgeCount', 'totalEdges', 'total_edges') ?? edges.length,
    packages: packagesRaw.length,
    routes: routes.length,
    functions: pickNumber(counts, 'functions', 'functionCount') ?? labelCount('Function') ?? 0,
    classes: pickNumber(counts, 'classes', 'classCount') ?? labelCount('Class') ?? 0,
    languages,
    indexedAt: pickString(arch, 'indexedAt', 'indexed_at', 'timestamp'),
  };

  const indexed = nodes.length > 0 || summary.nodes > 0 || languages.length > 0;
  return {
    projectName,
    indexed,
    summary,
    nodes,
    edges: edges.filter((e) => seen.has(e.to)),
    hotspots,
    routes,
    notice: indexed ? undefined : 'No graph data found. Index this repository to populate the graph.',
  };
}

/** Build an impact report from `detect_changes` output. */
export function buildImpactReport(detectChanges: unknown): ImpactReport {
  const root = asRecord(detectChanges);
  const data = pickFirstRecord(root, 'result', 'data', 'changes') ?? root;
  const symbolsRaw = pickArray(data, 'symbols', 'affected', 'affectedSymbols', 'impacts', 'impacted_symbols');

  const symbols: ImpactSymbol[] = symbolsRaw
    .map((s): ImpactSymbol | undefined => {
      const rec = asRecord(s);
      const name = pickString(rec, 'name', 'symbol', 'function', 'qualifiedName');
      if (!name) {
        return undefined;
      }
      return {
        name,
        file: pickString(rec, 'file', 'path'),
        risk: normalizeRisk(pickString(rec, 'risk', 'riskLevel', 'severity')),
        blastRadius: pickNumber(rec, 'blastRadius', 'blast_radius', 'dependents', 'callers') ?? 0,
      };
    })
    .filter((s): s is ImpactSymbol => s !== undefined)
    .sort((a, b) => b.blastRadius - a.blastRadius);

  const changedFiles =
    pickNumber(data, 'changedFiles', 'changed_files', 'changed_count', 'fileCount') ??
    new Set(symbols.map((s) => s.file).filter(Boolean)).size;

  return {
    changedFiles,
    symbols,
    notice: symbols.length === 0 ? 'No affected symbols detected for the current diff.' : undefined,
  };
}

// ── helpers ─────────────────────────────────────────────────────────────────

function pickFirstRecord(
  obj: Record<string, unknown>,
  ...keys: string[]
): Record<string, unknown> | undefined {
  for (const key of keys) {
    const v = obj[key];
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      return v as Record<string, unknown>;
    }
  }
  return undefined;
}

function toStringList(arr: unknown[]): string[] {
  const out: string[] = [];
  for (const item of arr) {
    if (typeof item === 'string' && item.length > 0) {
      out.push(item);
    } else if (item && typeof item === 'object') {
      const name = pickString(asRecord(item), 'name', 'id', 'label', 'language');
      if (name) {
        out.push(name);
      }
    }
  }
  return out;
}

function normalizeRisk(value?: string): ImpactSymbol['risk'] {
  switch ((value ?? '').toLowerCase()) {
    case 'low':
      return 'low';
    case 'medium':
    case 'med':
      return 'medium';
    case 'high':
    case 'critical':
      return 'high';
    default:
      return 'unknown';
  }
}

/** Trim a fully-qualified symbol name to its last 1–2 segments for display. */
function shortSymbol(name: string): string {
  const parts = name.split(/[.#:]/).filter(Boolean);
  return parts.length <= 2 ? name : parts.slice(-2).join('.');
}
