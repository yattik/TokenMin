/**
 * Pure feature-toggle model for the Token Optimizer dashboard.
 *
 * No `vscode`/`node` imports so the catalog and the config<->state mapping are
 * unit-testable. The dashboard panel reads/writes the actual configuration; this
 * module only owns the list of features, their config keys and their defaults.
 */

/** Stable identifiers for the toggleable optimization features. */
export type FeatureId =
  | 'knowledgeGraphContext'
  | 'queryCaching'
  | 'promptRestructuring'
  | 'tokenTracking'
  | 'graph3dVisualization';

/** One feature in the dashboard catalog. */
export interface FeatureDef {
  id: FeatureId;
  /** Configuration key under the `tokenmin.` namespace (without the prefix). */
  configKey: string;
  title: string;
  description: string;
  /** Default when the user has not set the toggle yet. */
  defaultEnabled: boolean;
}

/** The enabled/disabled state of every feature, keyed by id. */
export type FeatureState = Record<FeatureId, boolean>;

/** Config-key prefix (without the leading `tokenmin.`) shared by all toggles. */
export const FEATURE_CONFIG_PREFIX = 'features';

/** The ordered catalog rendered in the dashboard. */
export const FEATURES: readonly FeatureDef[] = [
  {
    id: 'knowledgeGraphContext',
    configKey: 'features.knowledgeGraphContext',
    title: 'Knowledge Graph Context',
    description:
      'Copilot agents query the local codebase knowledge graph (codebase-memory-mcp) before broad file reads, ' +
      'so context is precise and cheaper.',
    defaultEnabled: true,
  },
  {
    id: 'queryCaching',
    configKey: 'features.queryCaching',
    title: 'Knowledge Graph Query Caching',
    description:
      'Cache search_graph / trace_path results per repo + query. Repeated agent queries are served from cache and ' +
      'invalidated when indexing or detect_changes shows the graph changed.',
    defaultEnabled: true,
  },
  {
    id: 'promptRestructuring',
    configKey: 'features.promptRestructuring',
    title: 'Prompt Restructuring',
    description:
      'Rewrite vague prompts into focused intent, constraints, relevant files/symbols, acceptance criteria and ' +
      'verification steps before you paste them into Copilot Chat.',
    defaultEnabled: true,
  },
  {
    id: 'tokenTracking',
    configKey: 'features.tokenTracking',
    title: 'Token Comparison Tracking',
    description:
      'Show estimated token usage with and without TokenMin. Estimates only — actual Copilot billing is not exposed ' +
      'to extensions.',
    defaultEnabled: true,
  },
  {
    id: 'graph3dVisualization',
    configKey: 'features.graph3dVisualization',
    title: '3D Knowledge Graph Visualization',
    description:
      'Embed the codebase-memory-mcp 3D graph UI inside a VS Code webview — no external browser required.',
    defaultEnabled: true,
  },
];

/** Look up a feature definition by id (throws on an unknown id). */
export function featureById(id: FeatureId): FeatureDef {
  const def = FEATURES.find((f) => f.id === id);
  if (!def) {
    throw new Error(`Unknown feature id: ${id}`);
  }
  return def;
}

/** A minimal read interface over a configuration source (e.g. WorkspaceConfiguration). */
export interface ConfigReader {
  get<T>(section: string, defaultValue: T): T;
}

/** Resolve the full {@link FeatureState} from a configuration reader. */
export function readFeatureState(config: ConfigReader): FeatureState {
  const state = {} as FeatureState;
  for (const def of FEATURES) {
    state[def.id] = config.get<boolean>(def.configKey, def.defaultEnabled);
  }
  return state;
}

/** The state where every feature is at its default — handy for tests/fallbacks. */
export function defaultFeatureState(): FeatureState {
  const state = {} as FeatureState;
  for (const def of FEATURES) {
    state[def.id] = def.defaultEnabled;
  }
  return state;
}
