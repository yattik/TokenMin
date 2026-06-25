// esbuild bundler for the extension.
// Bundles src/extension.ts -> dist/extension.js as CommonJS, with `vscode` marked external.
const esbuild = require('esbuild');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/** @type {import('esbuild').BuildOptions} */
const options = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  format: 'cjs',
  minify: production,
  sourcemap: !production,
  sourcesContent: false,
  platform: 'node',
  target: 'node18',
  // Prefer ESM entry points so deps like jsonc-parser (whose UMD `main` uses
  // runtime require('./impl/...') calls esbuild can't inline) are fully bundled.
  mainFields: ['module', 'main'],
  outfile: 'dist/extension.js',
  external: ['vscode'],
  logLevel: 'info',
};

async function main() {
  if (watch) {
    const ctx = await esbuild.context(options);
    await ctx.watch();
    console.log('[esbuild] watching...');
  } else {
    await esbuild.build(options);
    console.log('[esbuild] build complete');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
