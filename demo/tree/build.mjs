// Bundles the FileTree demo (React included) into demo/tree/out/demo.js, a plain script that
// index.html loads straight from disk. Run `npm run build` first: the demo imports dist/tree.js.
import { build } from 'esbuild';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
await build({
  entryPoints: [join(here, 'demo.jsx')],
  outfile: join(here, 'out', 'demo.js'),
  bundle: true,
  format: 'iife',
  platform: 'browser',
  jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'warning',
});
console.log('demo/tree/out/demo.js');
