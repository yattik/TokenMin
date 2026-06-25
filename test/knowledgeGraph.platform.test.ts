import * as assert from 'assert';
import {
  archiveExtension,
  assetName,
  assetUrl,
  binaryFileName,
  looksLikeBinary,
  resolvePlatformTarget,
  toGraphArch,
  toGraphPlatform,
} from '../src/knowledgeGraph/platform';

describe('knowledgeGraph platform', () => {
  it('maps node platform/arch to graph values', () => {
    assert.strictEqual(toGraphPlatform('win32'), 'windows');
    assert.strictEqual(toGraphPlatform('darwin'), 'darwin');
    assert.strictEqual(toGraphPlatform('linux'), 'linux');
    assert.strictEqual(toGraphPlatform('aix'), undefined);
    assert.strictEqual(toGraphArch('x64'), 'amd64');
    assert.strictEqual(toGraphArch('arm64'), 'arm64');
    assert.strictEqual(toGraphArch('ia32'), undefined);
  });

  it('resolves a full target or undefined', () => {
    assert.deepStrictEqual(resolvePlatformTarget('linux', 'x64'), { platform: 'linux', arch: 'amd64' });
    assert.strictEqual(resolvePlatformTarget('linux', 'mips'), undefined);
  });

  it('chooses zip for windows and tar.gz elsewhere', () => {
    assert.strictEqual(archiveExtension({ platform: 'windows', arch: 'amd64' }), 'zip');
    assert.strictEqual(archiveExtension({ platform: 'darwin', arch: 'arm64' }), 'tar.gz');
  });

  it('builds the correct asset name and url', () => {
    const target = { platform: 'linux' as const, arch: 'amd64' as const };
    assert.strictEqual(assetName(target), 'codebase-memory-mcp-linux-amd64.tar.gz');
    assert.strictEqual(assetName(target, 'ui'), 'codebase-memory-mcp-ui-linux-amd64.tar.gz');
    assert.strictEqual(
      assetUrl(target, 'https://example.test/dl'),
      'https://example.test/dl/codebase-memory-mcp-linux-amd64.tar.gz',
    );
    assert.strictEqual(
      assetUrl(target, 'https://example.test/dl', 'ui'),
      'https://example.test/dl/codebase-memory-mcp-ui-linux-amd64.tar.gz',
    );
    assert.strictEqual(
      assetName({ platform: 'windows', arch: 'amd64' }),
      'codebase-memory-mcp-windows-amd64.zip',
    );
    assert.strictEqual(
      assetName({ platform: 'windows', arch: 'amd64' }, 'ui'),
      'codebase-memory-mcp-ui-windows-amd64.zip',
    );
  });

  it('names the executable with .exe only on windows', () => {
    assert.strictEqual(binaryFileName({ platform: 'windows', arch: 'amd64' }), 'codebase-memory-mcp.exe');
    assert.strictEqual(binaryFileName({ platform: 'linux', arch: 'arm64' }), 'codebase-memory-mcp');
  });

  it('recognizes binaries but rejects archives/checksums', () => {
    assert.ok(looksLikeBinary('codebase-memory-mcp'));
    assert.ok(looksLikeBinary('codebase-memory-mcp.exe'));
    assert.ok(looksLikeBinary('codebase-memory-mcp-portable'));
    assert.ok(!looksLikeBinary('codebase-memory-mcp-linux-amd64.tar.gz'));
    assert.ok(!looksLikeBinary('codebase-memory-mcp.zip'));
    assert.ok(!looksLikeBinary('checksums.txt'));
    assert.ok(!looksLikeBinary('other-tool'));
  });
});
