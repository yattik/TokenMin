/**
 * Shared input for the (pure) artifact generators.
 */
import { StackAnalysis, StructureAnalysis } from '../analyzer/types';

export interface GeneratorContext {
  repoName: string;
  structure: StructureAnalysis;
  stack: StackAnalysis;
  /** A top-level ARCHITECTURE.md exists (so instructions can reference it). */
  hasArchitectureDoc: boolean;
  /** A CONTRIBUTING.md exists. */
  hasContributingDoc: boolean;
  /**
   * Optional model-tailored body for copilot-instructions.md. When present it
   * replaces the deterministic "Conventions" section. Supplied by Task 8.
   */
  tailoredInstructions?: string;
}

/** Map a primary language to applyTo globs for scoped instructions. */
export const LANGUAGE_GLOBS: Record<string, string[]> = {
  TypeScript: ['**/*.ts', '**/*.tsx'],
  JavaScript: ['**/*.js', '**/*.jsx'],
  Python: ['**/*.py'],
  Go: ['**/*.go'],
  Rust: ['**/*.rs'],
  Java: ['**/*.java'],
  Kotlin: ['**/*.kt'],
  Ruby: ['**/*.rb'],
  PHP: ['**/*.php'],
  'C#': ['**/*.cs'],
  'C++': ['**/*.cpp', '**/*.hpp', '**/*.cc'],
  Swift: ['**/*.swift'],
  Dart: ['**/*.dart'],
  Vue: ['**/*.vue'],
  Svelte: ['**/*.svelte'],
};

/** Short convention hints keyed by detected tech id. */
export const TECH_CONVENTIONS: Record<string, string> = {
  typescript: 'TypeScript: prefer explicit types at module boundaries; avoid `any`.',
  react: 'React: function components with hooks; keep components small.',
  vue: 'Vue: use the composition API and single-file components.',
  angular: 'Angular: follow the module/component/service structure.',
  svelte: 'Svelte: keep stores small and reactive blocks focused.',
  nextjs: 'Next.js: respect the app/router conventions; keep server/client boundaries clear.',
  nestjs: 'NestJS: use modules, providers, and DI; keep controllers thin.',
  express: 'Express: keep route handlers thin; put logic in services.',
  python: 'Python: follow PEP 8; type-hint public functions.',
  django: 'Django: keep business logic out of views; use services/managers.',
  flask: 'Flask: use blueprints; keep view functions small.',
  fastapi: 'FastAPI: use Pydantic models and dependency injection.',
  go: 'Go: handle errors explicitly; keep packages cohesive.',
  rust: 'Rust: prefer `Result` over panics in library code; keep modules focused.',
  java: 'Java: follow standard package layout; favor composition.',
  rails: 'Rails: follow conventions; keep models/controllers slim.',
  laravel: 'Laravel: use service classes; keep controllers thin.',
  flutter: 'Flutter: keep widgets small and stateless where possible.',
  dotnet: '.NET: follow standard project layout; use async APIs.',
};

/** Detected primary test command, for the "run tests" hint. */
export function testCommandFor(stack: StackAnalysis): string | undefined {
  const ids = new Set(stack.tech.map((t) => t.id));
  if (ids.has('node')) return 'npm test';
  if (ids.has('python')) return 'pytest';
  if (ids.has('rust')) return 'cargo test';
  if (ids.has('go')) return 'go test ./...';
  if (ids.has('maven')) return 'mvn test';
  if (ids.has('gradle')) return './gradlew test';
  if (ids.has('ruby')) return 'bundle exec rspec';
  if (ids.has('dotnet')) return 'dotnet test';
  if (ids.has('dart')) return 'dart test';
  return undefined;
}
