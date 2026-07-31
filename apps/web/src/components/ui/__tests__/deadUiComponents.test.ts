import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * THE GUARD FOR DEAD SHARED COMPONENTS.
 *
 * Why it exists. `components/ui/Panel.tsx` shipped with ZERO importers and a
 * `max-height: 2000px` on its collapse transition — dead code that was also
 * booby-trapped for whoever found it, since any panel taller than 2000px would have
 * clipped silently. It was deleted rather than adopted, and this is the assertion that
 * would have caught it on the day it landed.
 *
 * The precedent is `.focus-ring-inset`: a utility applied at zero sites, purged by
 * Tailwind, shipped as a no-op, and only discovered by reading the CSS. Zero-consumer
 * code is invisible to every other kind of test in this repo — types pass, lint passes,
 * unit tests pass, the bundle is fine — so nothing but a census finds it.
 *
 * IT COUNTS IMPORTS, NOT USAGE, and that distinction is the whole reason it works.
 * `<Panel>` appears eleven times in `pages/CommandDeck.tsx` and five in
 * `pages/MarketMap.tsx` — and every one of them resolves to a LOCAL `function Panel`
 * declared at the bottom of that same file. A JSX-usage census would have called the
 * shared Panel alive sixteen times over. Only "does any module outside components/ui
 * import this name" is true.
 *
 * WHAT IT DELIBERATELY DOES NOT COUNT as a consumer:
 *  - `components/ui/index.ts`. A barrel re-export is not a use; that is precisely how a
 *    dead component looks alive from the outside.
 *  - anything under a `__tests__` directory. A component whose only caller is its own
 *    test is dead with extra steps — that is the case this is named for.
 *  - other files inside `components/ui/`. A private helper that only the ui kit uses is
 *    legitimate, so it is exempted by NAME below rather than by silence.
 *
 * WHAT IT CANNOT SEE, found by mutation during adversarial verification and stated here
 * because an unnamed blind spot is how the next Panel gets through:
 *  - A dead component whose only importer is ITSELF dead. A `pages/DeadProbePage.tsx` that
 *    imports the component but that nothing imports in turn reads as a live consumer, and
 *    the probe went green. Closing this needs transitive reachability from the route table,
 *    which is a different and much larger guard than a census; it is NOT closed here.
 *  - A component that is imported but never rendered.
 *  - A dynamic `import()` of a ui module, which would read as NO consumer — a false positive
 *    rather than a false negative, so it fails loudly rather than silently.
 *  - A module exporting only lowercase names (a styles or helper constant): `exportedNames`
 *    matches `[A-Z]\w*` only, so such a module is skipped. Deliberate — those are not
 *    components — but it means `ui/probeStyles.ts` could rot unnoticed.
 * Subdirectories WERE a blind spot of the same kind and are now asserted against below,
 * rather than left to be discovered.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const UI_DIR = join(HERE, '..');
const SRC_DIR = join(UI_DIR, '..', '..');

/**
 * Modules inside `components/ui` that exist to be composed by their siblings and are
 * not expected to have an outside importer. Explicit, so adding one is a decision
 * somebody makes on purpose rather than a silent exemption.
 */
const INTERNAL_ONLY = new Set<string>([]);

/**
 * ALREADY DEAD when this census was written, and outside the file scope of the stream
 * that wrote it. `Panel` — the component this guard is named for — was deleted. These two
 * were found by the same walk on the same day and are reported as findings rather than
 * silently swept, because deleting them is somebody else's diff.
 *
 * This is an admission, not an exemption, and the second assertion below keeps it that
 * way: every name here MUST still be dead. Adopt or delete one and this file goes red
 * until the entry comes off, so the list cannot quietly become the place dead code lives.
 */
const KNOWN_DEAD = new Map<string, string>([
  // Input.tsx was here until 2026-07-31 and is now REVIVED, not exempt: pages/Gps.tsx
  // imports it for the client-name and price fields. The entry is deleted rather
  // than annotated because this test fails on a stale entry — an exemption that is
  // no longer true is exactly the blind spot the guard exists to prevent.
  ['Tooltip.tsx', 'zero importers outside components/ui as of 2026-07-25 (charts/tooltip.tsx is a different component)'],
]);

/** Every .ts/.tsx under a root, skipping node_modules. */
function walk(root: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(root)) {
    if (entry === 'node_modules') continue;
    const full = join(root, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const isTest = (file: string) => file.includes(`${'__tests__'}`) || /\.test\.tsx?$/.test(file);

/** `export function X` / `export const X` / `export class X` / `export { A, B }`. */
function exportedNames(source: string): string[] {
  const names = new Set<string>();
  for (const m of source.matchAll(/export\s+(?:default\s+)?(?:async\s+)?(?:function|const|let|class)\s+([A-Z]\w*)/g)) {
    names.add(m[1]!);
  }
  for (const m of source.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const part of m[1]!.split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop()!.trim();
      if (/^[A-Z]\w*$/.test(name)) names.add(name);
    }
  }
  return [...names];
}

/** Every `import ... from '<source>'` in a file, as (specifiers, source) pairs. */
function imports(source: string): Array<{ names: string[]; from: string }> {
  const out: Array<{ names: string[]; from: string }> = [];
  for (const m of source.matchAll(/import\s+(?:type\s+)?([^'"]*?)\s*from\s*['"]([^'"]+)['"]/g)) {
    const clause = m[1]!;
    const names = [...clause.matchAll(/([A-Za-z_$][\w$]*)/g)].map(x => x[1]!);
    out.push({ names, from: m[2]! });
  }
  return out;
}

type Imp = { names: string[]; from: string };

/**
 * Does this one import statement pull in `components/ui/<moduleName>`, by module path or
 * by one of its exported names through the barrel?
 *
 * ONE function, shared by the census and by its positive control below, and that sharing
 * is load-bearing. The control was originally written with its own copy of these two
 * regexes; breaking the census's copy left the control GREEN, so it vouched for nothing —
 * measured, and the reason this exists. A positive control on a different code path from
 * the assertion it certifies is a decoration.
 */
function importsUi(imp: Imp, moduleName: string, names: readonly string[]): boolean {
  // Either the module directly (`@/components/ui/Panel`, `../ui/Panel`) …
  if (new RegExp(`(^|/)components/ui/${moduleName}$|(^|/)ui/${moduleName}$|^\\./${moduleName}$`).test(imp.from)) return true;
  // … or one of its names, through the barrel. Note `import`, never `export … from`: a
  // re-export is what a dead component hides behind, so it must not count as a consumer.
  if (!/(^|\/)components\/ui$|(^|\/)\.\.\/ui$/.test(imp.from)) return false;
  return names.some(n => imp.names.includes(n));
}

/** Everything in src that could consume the ui kit: not the kit itself, and not a test. */
function consumerModules(): Array<{ file: string; imports: Imp[] }> {
  return walk(SRC_DIR)
    .filter(f => !f.startsWith(UI_DIR + '/'))
    .filter(f => !isTest(f))
    .map(f => ({ file: relative(SRC_DIR, f), imports: imports(readFileSync(f, 'utf8')) }));
}

describe('components/ui has no dead components', () => {
  it('every exported ui component is imported by at least one module outside the ui kit', () => {
    const uiFiles = readdirSync(UI_DIR)
      .filter(f => /\.tsx?$/.test(f) && f !== 'index.ts')
      .filter(f => !INTERNAL_ONLY.has(basename(f, '.tsx')));

    expect(uiFiles.length, 'no ui components were found, so this census proves nothing').toBeGreaterThan(5);

    /*
     * THE CENSUS'S SCOPE, ASSERTED RATHER THAN ASSUMED. `readdirSync` is not recursive, so a
     * component in a subdirectory of components/ui is invisible here — verified by mutation:
     * a dead `components/ui/panels/SubPanel.tsx` passed this file cleanly. The kit is flat by
     * convention, so rather than recurse over a shape that does not exist, this fails the day
     * the convention breaks. A blind spot that announces itself is not a blind spot.
     */
    const subdirs = readdirSync(UI_DIR).filter(
      f => statSync(join(UI_DIR, f)).isDirectory() && f !== '__tests__',
    );
    expect(
      subdirs,
      'components/ui grew a subdirectory, which this census cannot see into. Make the walk ' +
      'recursive or the next dead component in there ships unnoticed',
    ).toEqual([]);

    const consumers = consumerModules();
    expect(consumers.length, 'no consumer modules were scanned').toBeGreaterThan(50);

    const dead: string[] = [];
    for (const file of uiFiles) {
      const moduleName = basename(file, file.endsWith('.tsx') ? '.tsx' : '.ts');
      const names = exportedNames(readFileSync(join(UI_DIR, file), 'utf8'));
      if (names.length === 0) continue;

      const importedBy = consumers.filter(c => c.imports.some(imp => importsUi(imp, moduleName, names)));

      if (importedBy.length === 0) {
        dead.push(`components/ui/${file} (exports ${names.join(', ')})`);
      }
    }

    const unexpected = dead.filter(d => ![...KNOWN_DEAD.keys()].some(k => d.includes(`/${k} `)));
    expect(
      unexpected,
      `dead shared component(s) — no module outside components/ui imports these, so they ship as ` +
      `unreachable code with unreviewed defects inside them. Give each a real consumer or delete it:\n  ` +
      unexpected.join('\n  '),
    ).toEqual([]);

    // And the admission list is not allowed to rot. An entry that is no longer dead is a
    // stale exemption, and a stale exemption is how the next dead component gets through.
    const revived = [...KNOWN_DEAD.keys()].filter(k => !dead.some(d => d.includes(`/${k} `)));
    expect(
      revived,
      `KNOWN_DEAD is out of date: ${revived.join(', ')} now has a consumer (or is gone). ` +
      `Delete the entry — leaving it turns this guard into a blind spot.`,
    ).toEqual([]);
  });

  it('the census can see a consumer, so a green run is not a green wall', () => {
    /*
     * THE POSITIVE CONTROL. "Nothing is dead" and "the import scanner matches nothing"
     * are the same green, and that confusion is how a ratchet becomes a comment. It runs
     * `importsUi` — the census's OWN matcher, not a second copy — against two components
     * that are demonstrably alive, one through the barrel and one imported directly.
     * Break either half of that matcher and this test says so.
     */
    const consumers = consumerModules();

    const barrel = consumers.filter(c => c.imports.some(imp => importsUi(imp, 'Button', ['Button'])));
    expect(
      barrel.length,
      'the matcher cannot see Button, which the app imports everywhere — the census above is inert',
    ).toBeGreaterThan(5);

    // `EntityChip`-style direct imports: `@/components/ui/<Module>` without the barrel.
    // Modal is imported both ways in this app, so it exercises the module-path branch.
    const direct = consumers.filter(c =>
      c.imports.some(imp => /(^|\/)components\/ui\/[A-Z]/.test(imp.from) && importsUi(imp, imp.from.split('/').pop()!, [])),
    );
    expect(
      direct.length,
      'the matcher cannot see any direct @/components/ui/<Module> import — half of it is dead',
    ).toBeGreaterThan(0);
  });
});
