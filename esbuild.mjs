import { context, build } from 'esbuild';

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/** @type {import('esbuild').BuildOptions} */
const shared = {
  bundle: true,
  sourcemap: !production,
  minify: production,
  logLevel: 'info',
};

/** @type {import('esbuild').BuildOptions} */
const extension = {
  ...shared,
  entryPoints: ['src/extension.ts'],
  outfile: 'dist/extension.js',
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  external: ['vscode'],
};

// Runs inside the sidebar webview. Bundles xterm.js and emits dist/webview.js + dist/webview.css.
/** @type {import('esbuild').BuildOptions} */
const webview = {
  ...shared,
  entryPoints: { webview: 'src/webview/main.ts' },
  outdir: 'dist',
  platform: 'browser',
  format: 'iife',
  target: 'es2022',
};

if (watch) {
  for (const options of [extension, webview]) {
    const ctx = await context(options);
    await ctx.watch();
  }
} else {
  await Promise.all([build(extension), build(webview)]);
}
