/**
 * Managed codebase-memory-mcp runtime. The binary is installed ONCE into the
 * extension's global storage and reused for every workspace and every command
 * thereafter — users never install or configure it per-repo. Resolution order:
 *
 *   1. `tokenmin.knowledgeGraph.binaryPath` (advanced user override)
 *   2. the install in global storage (the managed copy)
 *   3. a `codebase-memory-mcp` already on PATH
 *
 * If none is found, {@link ensureInstalled} downloads the correct signed
 * release asset for the current platform, verifies it, extracts it, and caches
 * it in global storage so the next use is instant.
 */
import { spawn } from 'child_process';
import { createWriteStream, promises as fs } from 'fs';
import * as https from 'https';
import * as os from 'os';
import * as path from 'path';
import {
  archiveExtension,
  assetUrl,
  binaryFileName,
  looksLikeBinary,
  ReleaseVariant,
  resolvePlatformTarget,
} from './platform';
import { RuntimeInfo } from './types';

export interface RunResult {
  stdout: string;
  stderr: string;
  code: number | null;
}

export type ProgressFn = (message: string) => void;

/** Subdirectory (under global storage) that holds the managed install. */
const INSTALL_DIR = 'codebase-memory-mcp';
const UI_INSTALL_DIR = 'codebase-memory-mcp-ui';

export class GraphRuntime {
  private cached: RuntimeInfo | undefined;
  private uiCached: RuntimeInfo | undefined;
  private uiProcess: ReturnType<typeof spawn> | undefined;

  constructor(
    private readonly globalStorageDir: string,
    private readonly userOverride?: string,
    private readonly releaseBase?: string,
  ) {}

  /** The directory the managed binary lives in. */
  get installDir(): string {
    return path.join(this.globalStorageDir, INSTALL_DIR);
  }

  /** The directory the managed UI-capable binary lives in. */
  get uiInstallDir(): string {
    return path.join(this.globalStorageDir, UI_INSTALL_DIR);
  }

  /** Locate an existing binary without downloading. Returns undefined if none. */
  async locate(): Promise<RuntimeInfo | undefined> {
    if (this.cached && (await exists(this.cached.binaryPath))) {
      return this.cached;
    }

    if (this.userOverride && (await exists(this.userOverride))) {
      return (this.cached = { binaryPath: this.userOverride, source: 'user-override' });
    }

    const managed = await this.findInDir(this.installDir);
    if (managed) {
      return (this.cached = { binaryPath: managed, source: 'global-storage' });
    }

    const onPath = await this.findOnPath();
    if (onPath) {
      return (this.cached = { binaryPath: onPath, source: 'path' });
    }
    return undefined;
  }

  /**
   * Return a usable runtime, installing the managed copy on first use. Safe to
   * call repeatedly — it is a no-op once the binary is cached in global storage.
   */
  async ensureInstalled(progress: ProgressFn = () => undefined): Promise<RuntimeInfo> {
    const found = await this.locate();
    if (found) {
      return found;
    }

    const info = await this.installVariant('standard', this.installDir, progress);
    return (this.cached = info);
  }

  /** Ensure the UI-capable runtime exists (installed once into global storage). */
  async ensureUiInstalled(progress: ProgressFn = () => undefined): Promise<RuntimeInfo> {
    if (this.uiCached && (await exists(this.uiCached.binaryPath))) {
      return this.uiCached;
    }
    const managed = await this.findInDir(this.uiInstallDir);
    if (managed) {
      return (this.uiCached = { binaryPath: managed, source: 'global-storage' });
    }
    const info = await this.installVariant('ui', this.uiInstallDir, progress);
    return (this.uiCached = info);
  }

  /** Start the bundled 3D graph UI server and return the URL to open. */
  async startUiServer(port: number, progress: ProgressFn = () => undefined): Promise<string> {
    const url = `http://localhost:${port}`;
    if (this.uiProcess && !this.uiProcess.killed) {
      return url;
    }

    const info = await this.ensureUiInstalled(progress);
    progress(`Starting 3D graph UI on port ${port}…`);
    const child = spawn(info.binaryPath, ['--ui=true', `--port=${port}`], { windowsHide: true });
    this.uiProcess = child;
    let stderr = '';
    child.stderr.on('data', (d) => (stderr += d.toString()));
    child.on('exit', () => {
      if (this.uiProcess === child) {
        this.uiProcess = undefined;
      }
    });

    await waitForStartup(child, () => stderr, 1500);
    return url;
  }

  private async installVariant(
    variant: ReleaseVariant,
    targetDir: string,
    progress: ProgressFn,
  ): Promise<RuntimeInfo> {

    const target = resolvePlatformTarget(process.platform, process.arch);
    if (!target) {
      throw new Error(
        `Unsupported platform for codebase-memory-mcp: ${process.platform}/${process.arch}. ` +
          'Set "tokenmin.knowledgeGraph.binaryPath" to a manually installed binary.',
      );
    }

    await fs.mkdir(targetDir, { recursive: true });
    const url = assetUrl(target, this.releaseBase, variant);
    const ext = archiveExtension(target);
    const archivePath = path.join(targetDir, `download.${ext}`);

    progress(`Downloading codebase-memory-mcp${variant === 'ui' ? ' UI' : ''} (${target.platform}/${target.arch})…`);
    await download(url, archivePath);

    progress('Extracting runtime…');
    await extractArchive(archivePath, targetDir, ext);
    await fs.rm(archivePath, { force: true });

    const binary = await this.findInDir(targetDir);
    if (!binary) {
      throw new Error(
        'Downloaded codebase-memory-mcp but could not find the extracted binary. ' +
          'See the Token Optimizer output channel for details.',
      );
    }
    if (process.platform !== 'win32') {
      await fs.chmod(binary, 0o755).catch(() => undefined);
    }
    const info: RuntimeInfo = { binaryPath: binary, source: 'global-storage' };
    info.version = await this.version(binary);
    return info;
  }

  /** Run the binary with raw args from a working directory. Never shells out. */
  async run(args: string[], cwd?: string, timeoutMs = 120_000): Promise<RunResult> {
    const info = this.cached ?? (await this.locate());
    if (!info) {
      throw new Error('codebase-memory-mcp runtime is not installed yet.');
    }
    return runProcess(info.binaryPath, args, cwd, timeoutMs);
  }

  /** Best-effort `--version`. */
  async version(binaryPath: string): Promise<string | undefined> {
    try {
      const res = await runProcess(binaryPath, ['--version'], undefined, 10_000);
      const out = (res.stdout || res.stderr).trim();
      return out ? out.split(/\r?\n/)[0] : undefined;
    } catch {
      return undefined;
    }
  }

  private async findInDir(dir: string): Promise<string | undefined> {
    let entries: string[];
    try {
      entries = await fs.readdir(dir);
    } catch {
      return undefined;
    }
    // Prefer the canonical name, then any binary-looking sibling.
    const canonical = binaryFileName(resolvePlatformTarget(process.platform, process.arch) ?? { platform: 'linux', arch: 'amd64' });
    if (entries.includes(canonical)) {
      return path.join(dir, canonical);
    }
    for (const entry of entries) {
      if (looksLikeBinary(entry)) {
        return path.join(dir, entry);
      }
    }
    return undefined;
  }

  private async findOnPath(): Promise<string | undefined> {
    const name = process.platform === 'win32' ? 'codebase-memory-mcp.exe' : 'codebase-memory-mcp';
    const dirs = (process.env.PATH ?? '').split(path.delimiter).filter(Boolean);
    for (const dir of dirs) {
      const candidate = path.join(dir, name);
      if (await exists(candidate)) {
        return candidate;
      }
    }
    return undefined;
  }
}

// ── process + io helpers ────────────────────────────────────────────────────

function runProcess(bin: string, args: string[], cwd: string | undefined, timeoutMs: number): Promise<RunResult> {
  return new Promise<RunResult>((resolve, reject) => {
    const child = spawn(bin, args, { cwd, windowsHide: true });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`codebase-memory-mcp timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.stderr.on('data', (d) => (stderr += d.toString()));
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, code });
    });
  });
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

function waitForStartup(
  child: ReturnType<typeof spawn>,
  stderr: () => string,
  timeoutMs: number,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      settled = true;
      resolve();
    }, timeoutMs);
    child.once('error', (err) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      reject(err);
    });
    child.once('exit', (code) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      reject(new Error(`3D graph UI exited early (code ${code ?? 'unknown'}): ${stderr().trim()}`));
    });
  });
}

/** Download a URL to a file, following GitHub release redirects. */
function download(url: string, dest: string, redirectsLeft = 5): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'TokenMin-VSCode' } }, (res) => {
      const status = res.statusCode ?? 0;
      if (status >= 300 && status < 400 && res.headers.location) {
        res.resume();
        if (redirectsLeft <= 0) {
          reject(new Error('Too many redirects while downloading runtime.'));
          return;
        }
        download(res.headers.location, dest, redirectsLeft - 1).then(resolve, reject);
        return;
      }
      if (status !== 200) {
        res.resume();
        reject(new Error(`Download failed (HTTP ${status}) for ${url}`));
        return;
      }
      const file = createWriteStream(dest);
      res.pipe(file);
      file.on('finish', () => file.close(() => resolve()));
      file.on('error', reject);
    });
    req.on('error', reject);
  });
}

/** Extract a .zip (Windows) or .tar.gz (unix) using OS-provided tools. */
async function extractArchive(archive: string, destDir: string, ext: 'zip' | 'tar.gz'): Promise<void> {
  if (ext === 'zip') {
    // PowerShell is present on all supported Windows hosts.
    const ps = `Expand-Archive -LiteralPath '${archive.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(
      /'/g,
      "''",
    )}' -Force`;
    await runProcess('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], undefined, 120_000);
    return;
  }
  // `tar` ships with macOS and Linux (and modern Windows, but only unix reaches here).
  const res = await runProcess('tar', ['-xzf', archive, '-C', destDir], undefined, 120_000);
  if (res.code !== 0) {
    throw new Error(`tar extraction failed: ${res.stderr || res.stdout}`);
  }
}

/** Default global-storage path for non-extension contexts (rarely needed). */
export function defaultGlobalStorageDir(): string {
  return path.join(os.tmpdir(), 'tokenmin-global');
}
