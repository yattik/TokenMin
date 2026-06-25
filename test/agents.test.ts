import * as assert from 'assert';
import { parse } from 'jsonc-parser';
import {
  buildAgentArtifacts,
  buildImplementAgent,
  buildPlanAgent,
  buildPlanPrompt,
  buildToolSet,
  IMPLEMENT_AGENT_PATH,
  IMPLEMENT_TOOLS,
  PLAN_AGENT_PATH,
  PLAN_PROMPT_PATH,
  PLAN_TOOLS,
  TOOLSET_PATH,
} from '../src/generators/agents';
import { GeneratorContext } from '../src/generators/types';
import { StackAnalysis, StructureAnalysis } from '../src/analyzer/types';

function ctx(): GeneratorContext {
  const structure: StructureAnalysis = {
    totalFiles: 10,
    totalSize: 100,
    truncated: false,
    topLevelDirs: [],
    noisyDirs: [],
    largeFiles: [],
    binaryFileCount: 0,
    binaryExtensions: [],
    lockfiles: [],
    gitignoredDirCount: 0,
  };
  const stack: StackAnalysis = {
    tech: [{ id: 'node', name: 'Node.js', category: 'runtime', source: 'package.json' }],
    layout: 'single',
    modules: [],
    indexSource: 'local',
    primaryLanguages: ['TypeScript'],
  };
  return { repoName: 'widget', structure, stack, hasArchitectureDoc: true, hasContributingDoc: false };
}

/** Extract the YAML-ish frontmatter block as raw lines. */
function frontmatter(content: string): string {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  assert.ok(match, 'frontmatter block expected');
  return match![1];
}

describe('agent generators', () => {
  it('plan agent: read-only tools, reasoning model, correct path', () => {
    const file = buildPlanAgent(ctx(), { planModel: 'o3' });
    assert.strictEqual(file.relativePath, PLAN_AGENT_PATH);
    const fm = frontmatter(file.content);
    assert.match(fm, /model: o3/);
    for (const tool of PLAN_TOOLS) {
      assert.ok(fm.includes(`'${tool}'`), `plan tools should include ${tool}`);
    }
    // Plan agent must not have edit/run tools.
    assert.ok(!fm.includes("'editFiles'"));
    assert.ok(!fm.includes("'runCommands'"));
  });

  it('implement agent: edit/run tools and cheaper model', () => {
    const file = buildImplementAgent(ctx(), { implementModel: 'gpt-4o' });
    assert.strictEqual(file.relativePath, IMPLEMENT_AGENT_PATH);
    const fm = frontmatter(file.content);
    assert.match(fm, /model: gpt-4o/);
    assert.ok(fm.includes("'editFiles'"));
    assert.ok(fm.includes("'runCommands'"));
    for (const tool of IMPLEMENT_TOOLS) {
      assert.ok(fm.includes(`'${tool}'`));
    }
  });

  it('tool set: valid JSONC with two lean sets', () => {
    const file = buildToolSet();
    assert.strictEqual(file.relativePath, TOOLSET_PATH);
    const parsed = parse(file.content);
    assert.deepStrictEqual(parsed['plan-readonly'].tools, PLAN_TOOLS);
    assert.deepStrictEqual(parsed['implement-lean'].tools, IMPLEMENT_TOOLS);
  });

  it('plan prompt: references the plan mode and a task input', () => {
    const file = buildPlanPrompt(ctx());
    assert.strictEqual(file.relativePath, PLAN_PROMPT_PATH);
    const fm = frontmatter(file.content);
    assert.match(fm, /mode: plan/);
    assert.match(file.content, /\$\{input:task\}/);
  });

  it('buildAgentArtifacts emits all four files with defaults', () => {
    const files = buildAgentArtifacts(ctx());
    const paths = files.map((f) => f.relativePath).sort();
    assert.deepStrictEqual(paths, [PLAN_AGENT_PATH, PLAN_PROMPT_PATH, TOOLSET_PATH, IMPLEMENT_AGENT_PATH].sort());
    // default models present
    assert.match(files.find((f) => f.relativePath === PLAN_AGENT_PATH)!.content, /model: .+/);
  });
});
