import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../..');
const opts = { entryPoints: [resolve(HERE, 'entry.ts')], bundle: true, format: 'esm', target: 'es2022',
  minify: true, logLevel: 'silent', alias: { '@lcx/gl': resolve(ROOT, 'packages/gl/src/index.ts') } };
const w = await build({ ...opts, outfile: resolve(HERE, 'bundle.js') });
if (w.errors?.length) { for (const e of w.errors) console.error(e); process.exit(1); }
const s = await build({ ...opts, write: false });
console.log(`  W1 bundle (spine + L4 bars + gate)  ${(s.outputFiles[0].contents.byteLength/1024).toFixed(1)} KB`);
