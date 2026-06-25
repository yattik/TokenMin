import * as assert from 'assert';
import { detectStack, isManifestPath, MANIFEST_NAMES } from '../src/analyzer/stack';

describe('detectStack', () => {
  it('detects a single Node + TypeScript + React project', () => {
    const stack = detectStack({
      files: ['src/App.tsx', 'src/index.ts', 'src/util.ts', 'package.json'],
      manifests: {
        'package.json': JSON.stringify({
          name: 'web',
          dependencies: { react: '^18.0.0' },
          devDependencies: { typescript: '^5.0.0' },
        }),
        'tsconfig.json': '{}',
      },
    });
    assert.strictEqual(stack.layout, 'single');
    const ids = stack.tech.map((t) => t.id).sort();
    assert.ok(ids.includes('node'));
    assert.ok(ids.includes('typescript'));
    assert.ok(ids.includes('react'));
    assert.strictEqual(stack.primaryLanguages[0], 'TypeScript');
    assert.deepStrictEqual(stack.modules, []);
  });

  it('detects a polyglot single project (Python + Go)', () => {
    const stack = detectStack({
      files: ['main.go', 'main.go', 'app.py', 'app.py', 'app.py', 'go.mod', 'requirements.txt'],
      manifests: {
        'go.mod': 'module example.com/app\n\ngo 1.21\n',
        'requirements.txt': 'fastapi==0.110\nuvicorn\n',
      },
    });
    const ids = stack.tech.map((t) => t.id);
    assert.ok(ids.includes('go'));
    assert.ok(ids.includes('python'));
    assert.ok(ids.includes('fastapi'));
    // Python has more files -> ranked first.
    assert.strictEqual(stack.primaryLanguages[0], 'Python');
  });

  it('detects a monorepo via npm workspaces and lists modules', () => {
    const stack = detectStack({
      files: [
        'package.json',
        'packages/web/package.json',
        'packages/api/package.json',
        'packages/web/src/i.ts',
        'packages/api/src/server.ts',
      ],
      manifests: {
        'package.json': JSON.stringify({ name: 'root', workspaces: ['packages/*'] }),
        'packages/web/package.json': JSON.stringify({ name: '@app/web', dependencies: { next: '14' } }),
        'packages/api/package.json': JSON.stringify({ name: '@app/api', dependencies: { express: '4' } }),
      },
    });
    assert.strictEqual(stack.layout, 'monorepo');
    const modulePaths = stack.modules.map((m) => m.path).sort();
    assert.deepStrictEqual(modulePaths, ['packages/api', 'packages/web']);
    const web = stack.modules.find((m) => m.path === 'packages/web')!;
    assert.strictEqual(web.name, '@app/web');
    assert.ok(web.tech.includes('nextjs'));
  });

  it('detects a monorepo from multiple sub-manifests without a workspace marker', () => {
    const stack = detectStack({
      files: ['services/a/go.mod', 'services/b/Cargo.toml'],
      manifests: {
        'services/a/go.mod': 'module a\n',
        'services/b/Cargo.toml': '[package]\nname = "b"\n',
      },
    });
    assert.strictEqual(stack.layout, 'monorepo');
    assert.strictEqual(stack.modules.length, 2);
  });

  it('detects GitHub remote index source from git config', () => {
    const stack = detectStack({
      files: ['index.ts'],
      manifests: {},
      gitConfig: '[remote "origin"]\n\turl = https://github.com/acme/widget.git\n',
    });
    assert.strictEqual(stack.indexSource, 'github-remote');
    assert.match(stack.remoteUrl ?? '', /github\.com\/acme\/widget/);
  });

  it('reports local index when remote is not GitHub', () => {
    const stack = detectStack({
      files: ['index.ts'],
      manifests: {},
      gitConfig: '[remote "origin"]\n\turl = git@gitlab.com:acme/widget.git\n',
    });
    assert.strictEqual(stack.indexSource, 'local');
  });

  it('reports unknown index source without git config', () => {
    const stack = detectStack({ files: ['index.ts'], manifests: {} });
    assert.strictEqual(stack.indexSource, 'unknown');
  });

  it('recognizes manifest paths by name and extension', () => {
    assert.ok(MANIFEST_NAMES.has('package.json'));
    assert.ok(isManifestPath('packages/web/package.json'));
    assert.ok(isManifestPath('src/App.csproj'));
    assert.ok(isManifestPath('infra/main.tf'));
    assert.strictEqual(isManifestPath('src/index.ts'), false);
  });
});
