import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * THE FLOOR-IS-DATA RATCHET — S5 of INSTRUMENT_100X_PLAN, made mechanical.
 *
 * S5 removed the one always-on GL surface (it drew nothing in the default theme and an empty plate in
 * dark on 77 routes), retired the one relief whose third dimension carried nothing the flat form lost,
 * and widened the search-around to the compartments that carry the money and the liability. This
 * file keeps those permanent:
 *
 *   · the removed layers cannot come back by import;
 *   · every relief that remains refuses to a flat form the caller owns (rule 1) — grep-provable;
 *   · the three inspector unions (API `InspectorType`, web `InspectorEntityType`, registry `ObjectType`
 *     keys) are IDENTICAL SETS — the API comment said "mirrors" and nothing enforced it;
 *   · every type the API can resolve has a payload case in the inspector body, so a chip never dead-ends;
 *   · the related panel renders a WITHHELD group rather than dropping it.
 */

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const API = resolve(SRC, '../../api/src');
const read = (rel: string, root = SRC) => {
  const p = join(root, rel);
  expect(existsSync(p), `${rel} is missing — this check would otherwise pass vacuously`).toBe(true);
  return readFileSync(p, 'utf8');
};
function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) { if (!/__tests__|e2e|node_modules/.test(n)) walk(p, out); }
    else if (/\.(ts|tsx)$/.test(n) && !/\.test\.|\.spec\./.test(n)) out.push(p);
  }
  return out;
}
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => (/^\s*\/\//.test(l) ? '' : l)).join('\n');
const rel = (p: string) => p.slice(SRC.length + 1);

/** Members of a TS string-literal union declared as `export type Name =\n | 'a' | 'b' ...;` */
function unionMembers(src: string, name: string): string[] {
  const m = new RegExp(`export type ${name}\\s*=([\\s\\S]*?);`).exec(strip(src));
  expect(m, `no union named ${name}`).not.toBeNull();
  return [...m![1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]).sort();
}

describe('the floor is data', () => {
  it('the removed layers cannot come back by import', () => {
    const offenders = walk(SRC)
      .filter((f) => /SignatureBackdrop|geometry\/DeckRelief|DeckReliefGl|geometry\/deckSlots/.test(strip(readFileSync(f, 'utf8'))))
      .map(rel).sort();
    expect(offenders, 'X1 SignatureBackdrop and E1 DeckRelief were removed in S5 for measured reasons (LEDGER §5)').toEqual([]);
    expect(existsSync(join(SRC, 'components/command/SignatureBackdrop.tsx'))).toBe(false);
    expect(existsSync(join(SRC, 'components/geometry/DeckReliefGl.tsx'))).toBe(false);
  });

  it('every remaining relief wrapper refuses to a flat form the caller owns', () => {
    const wrappers = walk(SRC).filter((f) => /useReliefPreference/.test(readFileSync(f, 'utf8')) && !/reliefPreference\.ts$/.test(f)).map(rel).sort();
    expect(wrappers).toEqual([
      'components/geometry/OntologyOrrery.tsx', 'components/geometry/PipelineRelief.tsx',
      'components/geometry/SurfaceRelief.tsx', 'components/geometry/VaultRelief.tsx',
      'components/market/GlobeRelief.tsx', 'components/risk/StormRelief.tsx',
    ]);
    for (const w of wrappers) {
      const src = strip(read(w));
      expect(src, `${w} must hand its renderer an onRefused`).toMatch(/onRefused/);
      expect(src, `${w} must announce a refusal`).toMatch(/role="alert"|role: 'alert'|ALERT/);
    }
  });

  it('the three inspector unions are identical sets, and the registry maps every one', () => {
    const api = unionMembers(read('graph/links.ts', API), 'InspectorType');
    const web = unionMembers(read('stores/useInspectorStore.ts'), 'InspectorEntityType');
    const registry = unionMembers(read('lib/objectRegistry.ts'), 'ObjectType');
    expect(web, 'web InspectorEntityType drifted from the API InspectorType').toEqual(api);
    // The registry is the READING vocabulary; `handoff` reads as `interaction` there, by design.
    const registryAsInspector = registry.map((t) => (t === 'interaction' ? 'handoff' : t)).sort();
    expect(registryAsInspector, 'ObjectType drifted from InspectorEntityType').toEqual(api);
    const map = strip(read('lib/objectRegistry.ts'));
    const block = /export const INSPECTOR_TO_OBJECT[^=]*=\s*\{([\s\S]*?)\};/.exec(map)![1];
    const mapped = [...block.matchAll(/^\s*([a-z_]+):/gm)].map((m) => m[1]).sort();
    expect(mapped, 'INSPECTOR_TO_OBJECT does not map every inspector type').toEqual(api);
    expect(api.length).toBe(18);
  });

  it('every type the API can resolve has a payload case, so no chip dead-ends', () => {
    const links = strip(read('graph/links.ts', API));
    const reg = /export const RELATED_RESOLVERS[^=]*=\s*\{([\s\S]*?)\n\};/.exec(links);
    expect(reg, 'RELATED_RESOLVERS not found').not.toBeNull();
    const resolvable = [...reg![1].matchAll(/^\s{2}([a-z_]+):/gm)].map((m) => m[1]).sort();
    const body = strip(read('components/inspect/InspectorBody.tsx'));
    const cases = [...body.matchAll(/case '([a-z_]+)':/g)].map((m) => m[1]).sort();
    for (const t of resolvable) expect(cases, `InspectorBody has no case for '${t}'`).toContain(t);
    expect(resolvable.length).toBeGreaterThanOrEqual(17);
  });

  it('the related panel says what is withheld instead of dropping it', () => {
    const panel = strip(read('components/inspect/RelatedPanel.tsx'));
    expect(panel).toMatch(/g\.withheld/);
    expect(panel).toMatch(/do not hold/);
    const links = strip(read('graph/links.ts', API));
    expect(links).toMatch(/withheld:\s*ws/);
  });
});
