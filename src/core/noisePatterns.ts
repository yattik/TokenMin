/**
 * Pure primitives describing "noise" in a repo: generated/dependency
 * directories, lockfiles, and binary file types. Shared by the walker (to
 * decide what to prune) and the analyzer (to classify and report). No
 * `vscode` import so it stays unit-testable.
 */

/**
 * Confidence that a directory is safe to exclude from Copilot's view:
 * - `high`   never source; always safe (e.g. node_modules, .venv).
 * - `medium` usually build output but occasionally meaningful (dist, build).
 * - `low`    ambiguous; only excluded under aggressive settings (bin, vendor).
 */
export type NoiseTier = 'high' | 'medium' | 'low';

export interface NoisePattern {
  /** Directory base name matched anywhere in the tree. */
  dir: string;
  /** Human-readable reason shown in reports. */
  reason: string;
  tier: NoiseTier;
}

/** Known noisy directories, ordered most- to least-confident. */
export const NOISE_DIRS: readonly NoisePattern[] = [
  // high — dependencies / virtualenvs / framework caches: never source
  { dir: 'node_modules', reason: 'dependencies', tier: 'high' },
  { dir: 'bower_components', reason: 'dependencies', tier: 'high' },
  { dir: '.venv', reason: 'Python virtualenv', tier: 'high' },
  { dir: 'venv', reason: 'Python virtualenv', tier: 'high' },
  { dir: 'env', reason: 'Python virtualenv', tier: 'low' },
  { dir: '__pycache__', reason: 'Python bytecode cache', tier: 'high' },
  { dir: '.mypy_cache', reason: 'type-check cache', tier: 'high' },
  { dir: '.pytest_cache', reason: 'test cache', tier: 'high' },
  { dir: '.ruff_cache', reason: 'lint cache', tier: 'high' },
  { dir: '.tox', reason: 'Python tox envs', tier: 'high' },
  { dir: '.nyc_output', reason: 'coverage data', tier: 'high' },
  { dir: '.next', reason: 'Next.js build', tier: 'high' },
  { dir: '.nuxt', reason: 'Nuxt build', tier: 'high' },
  { dir: '.svelte-kit', reason: 'SvelteKit build', tier: 'high' },
  { dir: '.angular', reason: 'Angular cache', tier: 'high' },
  { dir: '.parcel-cache', reason: 'Parcel cache', tier: 'high' },
  { dir: '.turbo', reason: 'Turborepo cache', tier: 'high' },
  { dir: '.gradle', reason: 'Gradle cache', tier: 'high' },
  { dir: '.terraform', reason: 'Terraform cache', tier: 'high' },
  { dir: 'Pods', reason: 'CocoaPods', tier: 'high' },
  { dir: 'DerivedData', reason: 'Xcode build', tier: 'high' },
  // medium — build output: regenerated from source
  { dir: 'dist', reason: 'build output', tier: 'medium' },
  { dir: 'build', reason: 'build output', tier: 'medium' },
  { dir: 'out', reason: 'build output', tier: 'medium' },
  { dir: 'target', reason: 'build output', tier: 'medium' },
  { dir: 'coverage', reason: 'coverage report', tier: 'medium' },
  { dir: 'obj', reason: 'build intermediates', tier: 'medium' },
  { dir: '.output', reason: 'build output', tier: 'medium' },
  { dir: '.cache', reason: 'cache', tier: 'medium' },
  // low — ambiguous: may contain source/assets in some projects
  { dir: 'bin', reason: 'binaries', tier: 'low' },
  { dir: 'vendor', reason: 'vendored dependencies', tier: 'low' },
  { dir: 'tmp', reason: 'temporary files', tier: 'low' },
  { dir: 'temp', reason: 'temporary files', tier: 'low' },
  { dir: 'logs', reason: 'logs', tier: 'low' },
];

const NOISE_BY_NAME = new Map<string, NoisePattern>(NOISE_DIRS.map((p) => [p.dir, p]));

/** Return the noise pattern for a directory base name, if any. */
export function matchNoiseDir(name: string): NoisePattern | undefined {
  return NOISE_BY_NAME.get(name);
}

/** Lockfiles: large, machine-generated, low signal for the agent. */
export const LOCKFILES: ReadonlySet<string> = new Set([
  'package-lock.json',
  'npm-shrinkwrap.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'bun.lockb',
  'Cargo.lock',
  'poetry.lock',
  'Pipfile.lock',
  'Gemfile.lock',
  'composer.lock',
  'go.sum',
  'packages.lock.json',
  'pubspec.lock',
  'Podfile.lock',
  'gradle.lockfile',
]);

export function isLockfile(name: string): boolean {
  return LOCKFILES.has(name);
}

/** File extensions treated as binary / non-text (low value, high token cost). */
export const BINARY_EXTENSIONS: ReadonlySet<string> = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.webp', '.tiff', '.avif',
  '.pdf', '.zip', '.tar', '.gz', '.tgz', '.bz2', '.xz', '.7z', '.rar',
  '.exe', '.dll', '.so', '.dylib', '.bin', '.dat', '.class', '.jar', '.war',
  '.mp4', '.mp3', '.wav', '.mov', '.avi', '.mkv', '.flac', '.ogg',
  '.woff', '.woff2', '.ttf', '.eot', '.otf',
  '.wasm', '.pyc', '.pyo', '.o', '.a', '.lib', '.node', '.pdb',
  '.psd', '.sketch', '.fig', '.heic',
]);

/** Last extension of a path, lowercased, including the dot (e.g. `.png`). */
export function extName(path: string): string {
  const base = baseName(path);
  const dot = base.lastIndexOf('.');
  if (dot <= 0) {
    return '';
  }
  return base.slice(dot).toLowerCase();
}

/** Final path segment using forward-slash semantics. */
export function baseName(path: string): string {
  const norm = path.replace(/\/+$/, '');
  const slash = norm.lastIndexOf('/');
  return slash === -1 ? norm : norm.slice(slash + 1);
}

export function isBinaryPath(path: string): boolean {
  return BINARY_EXTENSIONS.has(extName(path));
}
