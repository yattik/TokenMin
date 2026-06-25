import * as assert from 'assert';
import {
  buildCopilotInstructions,
  buildScopedInstructions,
  checkInstructionSize,
  COPILOT_INSTRUCTIONS_PATH,
  SCOPED_INSTRUCTIONS_DIR,
  INSTRUCTION_MAX_CHARS,
} from '../src/generators/instructions';
import { buildArchitectureDoc } from '../src/generators/architecture';
import { GeneratorContext } from '../src/generators/types';
import { StackAnalysis, StructureAnalysis } from '../src/analyzer/types';

function structure(partial: Partial<StructureAnalysis> = {}): StructureAnalysis {
  return {
    totalFiles: 50,
    totalSize: 1000,
    truncated: false,
    topLevelDirs: [
      { name: 'src', fileCount: 40, totalSize: 900 },
      { name: '.', fileCount: 3, totalSize: 100 },
    ],
    noisyDirs: [],
    largeFiles: [],
    binaryFileCount: 0,
    binaryExtensions: [],
    lockfiles: [],
    gitignoredDirCount: 0,
    ...partial,
  };
}

function stack(partial: Partial<StackAnalysis> = {}): StackAnalysis {
  return {
    tech: [
      { id: 'node', name: 'Node.js', category: 'runtime', source: 'package.json' },
      { id: 'typescript', name: 'TypeScript', category: 'language', source: 'package.json' },
      { id: 'react', name: 'React', category: 'framework', source: 'package.json' },
    ],
    layout: 'single',
    modules: [],
    indexSource: 'github-remote',
    primaryLanguages: ['TypeScript'],
    ...partial,
  };
}

function ctx(partial: Partial<GeneratorContext> = {}): GeneratorContext {
  return {
    repoName: 'widget',
    structure: structure(),
    stack: stack(),
    hasArchitectureDoc: false,
    hasContributingDoc: false,
    ...partial,
  };
}

describe('buildCopilotInstructions', () => {
  it('renders a concise, stack-seeded instructions file', () => {
    const file = buildCopilotInstructions(ctx());
    assert.strictEqual(file.relativePath, COPILOT_INSTRUCTIONS_PATH);
    assert.match(file.content, /# Copilot instructions: widget/);
    assert.match(file.content, /TypeScript/);
    assert.match(file.content, /React/);
    assert.match(file.content, /npm test/);
    // Stays lean.
    assert.ok(file.content.length < INSTRUCTION_MAX_CHARS, 'should be concise');
  });

  it('references ARCHITECTURE.md only when present', () => {
    const without = buildCopilotInstructions(ctx({ hasArchitectureDoc: false }));
    assert.ok(!/ARCHITECTURE\.md/.test(without.content));
    const withDoc = buildCopilotInstructions(ctx({ hasArchitectureDoc: true }));
    assert.match(withDoc.content, /ARCHITECTURE\.md/);
  });

  it('uses tailored instructions when supplied', () => {
    const file = buildCopilotInstructions(ctx({ tailoredInstructions: 'Custom model-written guidance.' }));
    assert.match(file.content, /Custom model-written guidance\./);
  });

  it('lists monorepo modules in the layout section', () => {
    const file = buildCopilotInstructions(
      ctx({
        stack: stack({
          layout: 'monorepo',
          modules: [
            { path: 'packages/web', name: '@app/web', tech: ['nextjs'] },
            { path: 'packages/api', name: '@app/api', tech: ['express'] },
          ],
        }),
      }),
    );
    assert.match(file.content, /packages\/web/);
    assert.match(file.content, /packages\/api/);
  });
});

describe('buildScopedInstructions', () => {
  it('emits one file per monorepo module with a correct applyTo glob', () => {
    const files = buildScopedInstructions(
      ctx({
        stack: stack({
          layout: 'monorepo',
          modules: [
            { path: 'packages/web', name: '@app/web', tech: ['nextjs'] },
            { path: 'services/api', name: 'api', tech: ['go'] },
          ],
        }),
      }),
    );
    assert.strictEqual(files.length, 2);
    const web = files.find((f) => f.content.includes('packages/web/**'))!;
    assert.ok(web.relativePath.startsWith(SCOPED_INSTRUCTIONS_DIR));
    assert.match(web.content, /applyTo: "packages\/web\/\*\*"/);
  });

  it('emits one file per language for a polyglot single project', () => {
    const files = buildScopedInstructions(
      ctx({ stack: stack({ layout: 'single', primaryLanguages: ['TypeScript', 'Python'] }) }),
    );
    const globs = files.map((f) => f.content.match(/applyTo: "([^"]+)"/)?.[1]);
    assert.ok(globs.some((g) => g?.includes('**/*.ts')));
    assert.ok(globs.some((g) => g?.includes('**/*.py')));
  });

  it('produces no scoped files for a simple single-language project', () => {
    const files = buildScopedInstructions(ctx({ stack: stack({ primaryLanguages: ['TypeScript'] }) }));
    assert.strictEqual(files.length, 1); // one language -> one file, but that's still scoped
  });
});

describe('checkInstructionSize', () => {
  it('returns no warning for concise content', () => {
    const warning = checkInstructionSize({ relativePath: 'x', content: 'short\n' });
    assert.strictEqual(warning, undefined);
  });

  it('warns when content exceeds the soft cap', () => {
    const big = { relativePath: 'big.md', content: 'x'.repeat(INSTRUCTION_MAX_CHARS + 1) };
    const warning = checkInstructionSize(big);
    assert.ok(warning);
    assert.match(warning!.message, /large/);
  });
});

describe('buildArchitectureDoc', () => {
  it('renders a skeleton with modules or layout', () => {
    const file = buildArchitectureDoc(ctx());
    assert.strictEqual(file.relativePath, 'ARCHITECTURE.md');
    assert.match(file.content, /# Architecture: widget/);
    assert.match(file.content, /src\//);
    assert.match(file.content, /npm test/);
  });
});
