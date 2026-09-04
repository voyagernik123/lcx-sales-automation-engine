// THE ONE ROUTE LIST (P8). Derived from apps/web/src/router.tsx by the parse the instrument has used since P0 — lifted here so
// `instrument-audit.mjs` and `verify-app-renders.mjs` read the same eighty routes and drift the same way (or not at all). A parse
// that finds fewer than 60 routes throws: the regex has drifted from router.tsx, and a short list would read as "covered".
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const WEB_SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'apps', 'web', 'src');
export const UNSEATED = ['/lcxos', '/portal', '/select'];

export function routesFromRouter(srcDir = WEB_SRC) {
  const src = readFileSync(join(srcDir, 'router.tsx'), 'utf8');
  const imports = new Map();
  for (const m of src.matchAll(/const (\w+) = lazy\(\(\) => import\('@\/pages\/([^']+)'\)/g)) imports.set(m[1], `pages/${m[2]}`);
  for (const m of src.matchAll(/import \{ (\w+) \} from '@\/pages\/([^']+)'/g)) imports.set(m[1], `pages/${m[2]}`);
  const routes = [];
  for (const m of src.matchAll(/\{ path: '([^']+)', element: <(\w+)/g)) {
    const raw = m[1];
    const path = raw.startsWith('/') ? raw : `/${raw}`;
    const probe = path.replace(/:[A-Za-z]+/g, 'probe');
    routes.push({ path, probe, component: m[2], module: imports.get(m[2]) ?? null, seated: !UNSEATED.includes(path) });
  }
  if (routes.length < 60) throw new Error(`router parse found only ${routes.length} routes — the regex has drifted from router.tsx`);
  return routes;
}
