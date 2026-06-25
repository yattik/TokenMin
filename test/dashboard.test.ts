import * as assert from 'assert';
import { renderDashboardHtml, DashboardData } from '../src/dashboard/dashboardHtml';
import { brandLightSurfaceVars } from '../src/util/theme';
import { emptyModel } from '../src/knowledgeGraph/graphModel';

function makeData(o: Partial<DashboardData> = {}): DashboardData {
  return { cache: { hits: 3, misses: 1, entries: 2 }, runtimeInstalled: true, runtimeSource: 'global-storage',
    projectName: 'demo', mcpConfigured: true, agentsConfigured: true,
    model: emptyModel('demo', 'Not indexed.'), impact: undefined, projects: [], busy: false, ...o };
}
function render(o: Partial<DashboardData> = {}) {
  return renderDashboardHtml(makeData(o), { nonce: 'NONCE', cspSource: 'vscode-resource:' });
}

describe('dashboard html', () => {
  it('renders the Overview tab and a Knowledge Graph 3D shortcut', () => {
    const h = render();
    assert.ok(h.includes('data-outer="overview"'));
    assert.ok(h.includes('Knowledge Graph 3D'));
    assert.ok(h.includes('data-action="openUi"'));
  });
  it('shows the core action buttons', () => {
    const h = render();
    assert.ok(h.includes('Index Repo into Graph') || h.includes('Re-index Repo'));
    assert.ok(h.includes('Configure Copilot to Use Graph'));
    assert.ok(h.includes('Optimize Prompt'));
    assert.ok(h.includes('Track Enterprise Usage'));
    assert.ok(h.includes('tokenmin.trackEnterpriseCopilotUsage'));
    assert.ok(h.includes('Feature settings'));
  });
  it('does NOT render feature toggle checkboxes', () => {
    assert.ok(!render().includes('type="checkbox"'));
  });
  it('does not render the removed Copilot setup checklist', () => {
    const h = render();
    assert.ok(!h.includes('Copilot setup'));
    assert.ok(!h.includes('mcp.json configured'));
    assert.ok(!h.includes('MCP server running but no tool calls'));
  });
  it('shows cache stats and estimates disclaimer', () => {
    const h = render();
    assert.ok(h.includes('estimates'));
    assert.ok(h.toLowerCase().includes('billing'));
  });
  it('uses the light SH surface theme', () => {
    assert.ok(render().includes('--sh-surface'));
  });
  it('does not embed the in-panel knowledge graph section', () => {
    const h = render();
    assert.ok(!h.includes('data-outer-panel="graph"'));
    assert.ok(!h.includes('search_graph'));
  });
  it('shows Re-index label when already indexed', () => {
    const m = emptyModel('demo', undefined);
    m.indexed = true;
    assert.ok(render({ model: m }).includes('Re-index Repo'));
  });
});

describe('light theme variables', () => {
  it('defines the clinical light surface variables', () => {
    const css = brandLightSurfaceVars();
    for (const v of ['--sh-surface', '--sh-surface-2', '--sh-text', '--sh-muted', '--sh-border'])
      assert.ok(css.includes(v), 'missing ' + v);
    assert.ok(css.includes('#ffffff'));
  });
});
