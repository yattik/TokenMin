/**
 * Pure platform/asset resolution for the embedded codebase-memory-mcp runtime.
 *
 * No `node`/`vscode` imports — callers pass `process.platform`/`process.arch`
 * so the mapping is fully unit-testable. The runtime layer uses these to pick
 * the correct release asset and to name the on-disk binary.
 */
import { GraphArch, GraphPlatform, PlatformTarget } from './types';

export type ReleaseVariant = 'standard' | 'ui';

/** Base URL for `latest` release assets. Override for self-hosting/testing. */
export const DEFAULT_RELEASE_BASE =
  'https://github.com/DeusData/codebase-memory-mcp/releases/latest/download';

/** Map a Node `process.platform` value to a graph platform, or undefined. */
export function toGraphPlatform(nodePlatform: string): GraphPlatform | undefined {
  switch (nodePlatform) {
    case 'win32':
      return 'windows';
    case 'darwin':
      return 'darwin';
    case 'linux':
      return 'linux';
    default:
      return undefined;
  }
}

/** Map a Node `process.arch` value to a graph arch, or undefined. */
export function toGraphArch(nodeArch: string): GraphArch | undefined {
  switch (nodeArch) {
    case 'x64':
      return 'amd64';
    case 'arm64':
      return 'arm64';
    default:
      return undefined;
  }
}

/** Resolve the current platform target, or undefined if unsupported. */
export function resolvePlatformTarget(
  nodePlatform: string,
  nodeArch: string,
): PlatformTarget | undefined {
  const platform = toGraphPlatform(nodePlatform);
  const arch = toGraphArch(nodeArch);
  if (!platform || !arch) {
    return undefined;
  }
  return { platform, arch };
}

/** Archive extension for a target (zip on Windows, tar.gz elsewhere). */
export function archiveExtension(target: PlatformTarget): 'zip' | 'tar.gz' {
  return target.platform === 'windows' ? 'zip' : 'tar.gz';
}

/** Release asset filename for a target, e.g. `codebase-memory-mcp-linux-amd64.tar.gz`. */
export function assetName(target: PlatformTarget, variant: ReleaseVariant = 'standard'): string {
  const suffix = variant === 'ui' ? '-ui' : '';
  return `codebase-memory-mcp${suffix}-${target.platform}-${target.arch}.${archiveExtension(target)}`;
}

/** Full download URL for a target's asset. */
export function assetUrl(
  target: PlatformTarget,
  base = DEFAULT_RELEASE_BASE,
  variant: ReleaseVariant = 'standard',
): string {
  return `${base.replace(/\/$/, '')}/${assetName(target, variant)}`;
}

/** Executable basename for a target (Windows gets `.exe`). */
export function binaryFileName(target: PlatformTarget): string {
  return target.platform === 'windows' ? 'codebase-memory-mcp.exe' : 'codebase-memory-mcp';
}

/** True if a file basename looks like the runtime binary (any variant). */
export function looksLikeBinary(basename: string): boolean {
  const lower = basename.toLowerCase();
  if (!lower.startsWith('codebase-memory-mcp')) {
    return false;
  }
  // Reject archives / checksums / signatures that share the prefix.
  return !/\.(zip|gz|tar|txt|sig|sha256|json|pem|bundle)$/.test(lower);
}
