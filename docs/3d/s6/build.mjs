import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../..');
const r = await build({
  entryPoints: [resolve(HERE, 'entry.ts')],
  bundle: true, format: 'esm', target: 'es2022', minify: true, logLevel: 'silent',
  outfile: resolve(HERE, 'bundle.js'),
  alias: {
    '@lcx/gl': resolve(ROOT, 'packages/gl/src/index.ts'),
    '@lcx/shared': resolve(ROOT, 'packages/shared/src/index.ts'),
  },
});
if (r.errors?.length) { for (const e of r.errors) console.error(e); process.exit(1); }
const sized = await build({ entryPoints:[resolve(HERE,'entry.ts')], bundle:true, format:'esm', target:'es2022',
  minify:true, write:false, logLevel:'silent',
  alias:{ '@lcx/gl': resolve(ROOT,'packages/gl/src/index.ts'), '@lcx/shared': resolve(ROOT,'packages/shared/src/index.ts') } });
console.log(`  S6 capture bundle  ${(sized.outputFiles[0].contents.byteLength/1024).toFixed(1)} KB`);
