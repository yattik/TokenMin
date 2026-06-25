/**
 * Pure stack / layout / index-source detection.
 *
 * Consumes the file list plus the contents of any manifest files (read by the
 * flow layer) and `.git/config`. No `vscode` or FS access, so it is fully
 * unit-testable with synthetic input.
 */
import { baseName, extName } from '../core/noisePatterns';
import {
  DetectedTech,
  IndexSource,
  LayoutKind,
  ProjectModule,
  StackAnalysis,
} from './types';

export interface StackInput {
  /** All counted file paths (root-relative, forward slashes). */
  files: string[];
  /** Contents of manifest files, keyed by root-relative path. */
  manifests: Record<string, string>;
  /** Raw `.git/config` text, if available. */
  gitConfig?: string;
}

/** Filenames that should be read as manifests by the flow layer. */
export const MANIFEST_NAMES: ReadonlySet<string> = new Set([
  'package.json',
  'tsconfig.json',
  'deno.json',
  'deno.jsonc',
  'pyproject.toml',
  'requirements.txt',
  'setup.py',
  'setup.cfg',
  'Pipfile',
  'pom.xml',
  'build.gradle',
  'build.gradle.kts',
  'settings.gradle',
  'settings.gradle.kts',
  'Cargo.toml',
  'go.mod',
  'go.work',
  'Gemfile',
  'composer.json',
  'pubspec.yaml',
  'CMakeLists.txt',
  'Dockerfile',
  'pnpm-workspace.yaml',
  'lerna.json',
  'nx.json',
  'turbo.json',
]);

/** Extra manifests matched by extension/suffix. */
export function isManifestPath(path: string): boolean {
  const name = baseName(path);
  if (MANIFEST_NAMES.has(name)) {
    return true;
  }
  return name.endsWith('.csproj') || name.endsWith('.fsproj') || name.endsWith('.sln') || name.endsWith('.tf');
}

/** Root-relative directory of a path ('' for root-level files). */
function dirOf(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash === -1 ? '' : path.slice(0, slash);
}

// Extension -> language display name (for the prominence histogram).
const EXT_LANGUAGE: Record<string, string> = {
  '.ts': 'TypeScript', '.tsx': 'TypeScript', '.mts': 'TypeScript', '.cts': 'TypeScript',
  '.js': 'JavaScript', '.jsx': 'JavaScript', '.mjs': 'JavaScript', '.cjs': 'JavaScript',
  '.py': 'Python', '.rs': 'Rust', '.go': 'Go', '.java': 'Java', '.kt': 'Kotlin',
  '.rb': 'Ruby', '.php': 'PHP', '.cs': 'C#', '.fs': 'F#', '.swift': 'Swift',
  '.cpp': 'C++', '.cc': 'C++', '.cxx': 'C++', '.hpp': 'C++', '.c': 'C', '.h': 'C/C++',
  '.scala': 'Scala', '.dart': 'Dart', '.vue': 'Vue', '.svelte': 'Svelte',
  '.ex': 'Elixir', '.exs': 'Elixir', '.clj': 'Clojure', '.sh': 'Shell', '.lua': 'Lua',
};

// dependency name -> framework display name (matched in package.json deps).
const NODE_FRAMEWORKS: Array<{ dep: string; id: string; name: string }> = [
  { dep: 'next', id: 'nextjs', name: 'Next.js' },
  { dep: 'nuxt', id: 'nuxt', name: 'Nuxt' },
  { dep: '@angular/core', id: 'angular', name: 'Angular' },
  { dep: 'react', id: 'react', name: 'React' },
  { dep: 'vue', id: 'vue', name: 'Vue' },
  { dep: 'svelte', id: 'svelte', name: 'Svelte' },
  { dep: '@nestjs/core', id: 'nestjs', name: 'NestJS' },
  { dep: 'express', id: 'express', name: 'Express' },
  { dep: 'fastify', id: 'fastify', name: 'Fastify' },
  { dep: 'electron', id: 'electron', name: 'Electron' },
];

const PY_FRAMEWORKS: Array<{ needle: RegExp; id: string; name: string }> = [
  { needle: /\bdjango\b/i, id: 'django', name: 'Django' },
  { needle: /\bflask\b/i, id: 'flask', name: 'Flask' },
  { needle: /\bfastapi\b/i, id: 'fastapi', name: 'FastAPI' },
];

export function detectStack(input: StackInput): StackAnalysis {
  const techMap = new Map<string, DetectedTech>();
  const addTech = (t: DetectedTech) => {
    if (!techMap.has(t.id)) {
      techMap.set(t.id, t);
    }
  };

  const moduleDirs = new Map<string, ProjectModule>();
  const addModule = (dir: string, name: string | undefined, tech: string[]) => {
    const existing = moduleDirs.get(dir);
    if (existing) {
      existing.name = existing.name ?? name;
      for (const id of tech) {
        if (!existing.tech.includes(id)) {
          existing.tech.push(id);
        }
      }
    } else {
      moduleDirs.set(dir, { path: dir, name, tech: [...tech] });
    }
  };

  let workspaceMarker = false;

  for (const [path, content] of Object.entries(input.manifests)) {
    const name = baseName(path);
    const dir = dirOf(path);
    const localTech: string[] = [];
    const note = (t: DetectedTech) => {
      addTech(t);
      if (!localTech.includes(t.id)) {
        localTech.push(t.id);
      }
    };

    let moduleName: string | undefined;
    let isPrimaryManifest = false;

    switch (true) {
      case name === 'package.json': {
        isPrimaryManifest = true;
        note({ id: 'node', name: 'Node.js', category: 'runtime', source: path });
        const pkg = safeJson(content);
        moduleName = typeof pkg?.name === 'string' ? pkg.name : undefined;
        if (pkg?.workspaces) {
          workspaceMarker = true;
        }
        const deps = { ...(pkg?.dependencies ?? {}), ...(pkg?.devDependencies ?? {}) } as Record<string, unknown>;
        if ('typescript' in deps) {
          note({ id: 'typescript', name: 'TypeScript', category: 'language', source: path });
        }
        for (const fw of NODE_FRAMEWORKS) {
          if (fw.dep in deps) {
            note({ id: fw.id, name: fw.name, category: 'framework', source: path });
          }
        }
        break;
      }
      case name === 'tsconfig.json':
        note({ id: 'typescript', name: 'TypeScript', category: 'language', source: path });
        break;
      case name === 'pyproject.toml' || name === 'requirements.txt' || name === 'setup.py' || name === 'setup.cfg' || name === 'Pipfile':
        isPrimaryManifest = true;
        note({ id: 'python', name: 'Python', category: 'language', source: path });
        for (const fw of PY_FRAMEWORKS) {
          if (fw.needle.test(content)) {
            note({ id: fw.id, name: fw.name, category: 'framework', source: path });
          }
        }
        break;
      case name === 'Cargo.toml':
        isPrimaryManifest = true;
        note({ id: 'rust', name: 'Rust', category: 'language', source: path });
        if (/\[workspace\]/.test(content)) {
          workspaceMarker = true;
        }
        break;
      case name === 'go.mod':
        isPrimaryManifest = true;
        note({ id: 'go', name: 'Go', category: 'language', source: path });
        break;
      case name === 'go.work':
        workspaceMarker = true;
        note({ id: 'go', name: 'Go', category: 'language', source: path });
        break;
      case name === 'pom.xml':
        isPrimaryManifest = true;
        note({ id: 'java', name: 'Java', category: 'language', source: path });
        note({ id: 'maven', name: 'Maven', category: 'build', source: path });
        break;
      case name.startsWith('build.gradle') || name.startsWith('settings.gradle'):
        isPrimaryManifest = name.startsWith('build.gradle');
        note({ id: 'gradle', name: 'Gradle', category: 'build', source: path });
        note({ id: 'jvm', name: 'JVM (Java/Kotlin)', category: 'language', source: path });
        break;
      case name === 'Gemfile':
        isPrimaryManifest = true;
        note({ id: 'ruby', name: 'Ruby', category: 'language', source: path });
        if (/\brails\b/i.test(content)) {
          note({ id: 'rails', name: 'Ruby on Rails', category: 'framework', source: path });
        }
        break;
      case name === 'composer.json':
        isPrimaryManifest = true;
        note({ id: 'php', name: 'PHP', category: 'language', source: path });
        if (/laravel/i.test(content)) {
          note({ id: 'laravel', name: 'Laravel', category: 'framework', source: path });
        }
        break;
      case name === 'pubspec.yaml':
        isPrimaryManifest = true;
        note({ id: 'dart', name: 'Dart', category: 'language', source: path });
        if (/flutter/i.test(content)) {
          note({ id: 'flutter', name: 'Flutter', category: 'framework', source: path });
        }
        break;
      case name.endsWith('.csproj') || name.endsWith('.fsproj') || name.endsWith('.sln'):
        isPrimaryManifest = name.endsWith('.csproj') || name.endsWith('.fsproj');
        note({ id: 'dotnet', name: '.NET', category: 'runtime', source: path });
        break;
      case name === 'Dockerfile':
        note({ id: 'docker', name: 'Docker', category: 'infra', source: path });
        break;
      case name.endsWith('.tf'):
        note({ id: 'terraform', name: 'Terraform', category: 'infra', source: path });
        break;
      case name === 'pnpm-workspace.yaml' || name === 'lerna.json' || name === 'nx.json' || name === 'turbo.json':
        workspaceMarker = true;
        break;
      case name === 'CMakeLists.txt':
        note({ id: 'cmake', name: 'CMake', category: 'build', source: path });
        break;
      default:
        break;
    }

    if (isPrimaryManifest && dir !== '') {
      addModule(dir, moduleName, localTech);
    }
  }

  const modules = [...moduleDirs.values()].sort((a, b) => a.path.localeCompare(b.path));
  const layout = decideLayout(workspaceMarker, modules);
  const { indexSource, remoteUrl } = detectIndexSource(input.gitConfig);
  const primaryLanguages = rankLanguages(input.files);

  return {
    tech: [...techMap.values()].sort((a, b) => a.name.localeCompare(b.name)),
    layout,
    modules: layout === 'monorepo' ? modules : [],
    indexSource,
    remoteUrl,
    primaryLanguages,
  };
}

function decideLayout(workspaceMarker: boolean, modules: ProjectModule[]): LayoutKind {
  if (workspaceMarker || modules.length >= 2) {
    return 'monorepo';
  }
  return 'single';
}

function detectIndexSource(gitConfig?: string): { indexSource: IndexSource; remoteUrl?: string } {
  if (!gitConfig) {
    return { indexSource: 'unknown' };
  }
  const urls = [...gitConfig.matchAll(/url\s*=\s*(\S+)/g)].map((m) => m[1]);
  const github = urls.find((u) => /github\.com/i.test(u));
  if (github) {
    return { indexSource: 'github-remote', remoteUrl: github };
  }
  if (urls.length > 0) {
    return { indexSource: 'local', remoteUrl: urls[0] };
  }
  return { indexSource: 'local' };
}

function rankLanguages(files: string[]): string[] {
  const counts = new Map<string, number>();
  for (const file of files) {
    const lang = EXT_LANGUAGE[extName(file)];
    if (lang) {
      counts.set(lang, (counts.get(lang) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([lang]) => lang);
}

function safeJson(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
