import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FIG_ADDRESSES, FIG_ID_PREFIXES, figPaletteItems } from '@/components/fig/figAddress';

/**
 * THE ONE-FIGURE-SYSTEM RATCHET — S6 of INSTRUMENT_100X_PLAN, made mechanical.
 *
 * S6's claim is that every figure on a desk is live, dated and addressable, and that a screen holds many.
 * A ratchet cannot measure density (the instrument does, with fixtures) but it can keep the SYSTEM one:
 *
 *   · the eight desk landings render their figures through `<Fig>` and keep no private figure component;
 *   · every `<Fig id>` literal on a desk is REGISTERED (or under a registered prefix), so it has an address —
 *     an unregistered figure is unreachable, and the palette would not know it exists;
 *   · every registered figure resolves to a destination with a chord, and palette ids are unique;
 *   · the 11 px floor is the only small size on the desks and in `<Fig>` itself;
 *   · `<Fig>` is still: no animation class, no timer of its own — the age text rides `useClock`.
 */

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel: string) => readFileSync(join(SRC, rel), 'utf8');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => (/^\s*\/\//.test(l) ? '' : l)).join('\n');

/**
 * The eight desks (WORKSPACES[].defaultLanding) and the file that renders each one's figures, with the
 * minimum `<Fig>` count each must carry and WHY: the pipeline's density is its table, so its header count
 * is one figure; the marketing landing's figures live in its measurement strip component.
 */
const DESKS: readonly { route: string; file: string; minFigs: number; why: string }[] = [
  { route: '/command-deck', file: 'pages/CommandDeck.tsx', minFigs: 12, why: 'counts strip + gating + gap register' },
  { route: '/bd-pipeline', file: 'pages/BdPipeline.tsx', minFigs: 1, why: 'the table IS the density; the header count is the figure' },
  { route: '/command', file: 'pages/CommandCenter.tsx', minFigs: 12, why: 'portfolio + forecast + SLOs' },
  { route: '/regulatory-dashboard', file: 'pages/Dashboard.tsx', minFigs: 6, why: 'the compiled cockpit counts (undated by their dataset)' },
  { route: '/distribution', file: 'pages/DistributionCockpit.tsx', minFigs: 16, why: '16 <Fig> literals — presence, listings, campaigns, funnel (one literal in a map renders four), conversions, emission, ontology' },
  { route: '/marketing', file: 'components/marketing/DeskMeasurement.tsx', minFigs: 4, why: 'the desk measurement strip' },
  { route: '/gps', file: 'pages/Gps.tsx', minFigs: 12, why: 'the book: live, clients, money per currency, gaps' },
  { route: '/wbr', file: 'pages/Wbr.tsx', minFigs: 7, why: 'the review counts strip + every metric' },
];

const registered = new Set(FIG_ADDRESSES.map((f) => f.id));
const isRegistered = (id: string) => registered.has(id) || FIG_ID_PREFIXES.some((p) => id.startsWith(p.prefix));

describe('the terminal — one figure system on the eight desks', () => {
  it('every desk renders its figures through <Fig>, at or above its stated minimum', () => {
    for (const d of DESKS) {
      const src = strip(read(d.file));
      const n = (src.match(/<Fig\b/g) ?? []).length;
      expect(n, `${d.route} (${d.file}) carries ${n} <Fig>, below its minimum ${d.minFigs}: ${d.why}`).toBeGreaterThanOrEqual(d.minFigs);
    }
  });

  it('no desk keeps a private figure component beside <Fig>', () => {
    for (const d of DESKS) {
      const src = strip(read(d.file));
      const local = src.match(/function (Stat|StatCard|Tile|GapStat|MetricCard|Measure|KpiTile)\s*\(/g) ?? [];
      // MetricCard on /wbr is the <Fig> adapter for a WBR metric, by name — it renders <Fig> and nothing else.
      const offenders = local.filter((m) => !(d.route === '/wbr' && /MetricCard/.test(m)));
      expect(offenders, `${d.route} still defines its own figure component: ${offenders.join(', ')}`).toEqual([]);
    }
  });

  it('every <Fig id> literal on a desk is registered or under a registered prefix, so it has an address', () => {
    const unregistered: string[] = [];
    for (const d of DESKS) {
      const src = strip(read(d.file));
      for (const m of src.matchAll(/<Fig\b[^>]*?\bid="([^"]+)"/g)) if (!isRegistered(m[1])) unregistered.push(`${d.route}: ${m[1]}`);
      for (const m of src.matchAll(/<Fig\b[^>]*?\bid=\{`([^`$]+)\$\{/g)) {
        // a template id: its literal prefix must be a registered prefix
        if (!FIG_ID_PREFIXES.some((p) => m[1].startsWith(p.prefix) || p.prefix.startsWith(m[1]))) unregistered.push(`${d.route}: ${m[1]}…`);
      }
    }
    expect(unregistered, 'register it in components/fig/figAddress.ts — a figure nobody can address is a defect').toEqual([]);
  });

  it('the registry resolves every figure to a desk with a chord, with unique palette ids', () => {
    const items = figPaletteItems();
    expect(items.length).toBe(FIG_ADDRESSES.length);
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
    for (const i of items) {
      expect(i.sublabel, i.id).toMatch(/· g\d$/);
      expect(i.to, i.id).toMatch(/^\/.+#fig-/);
    }
  });

  it('11 px is the only small size on the desks and in <Fig> itself', () => {
    const files = [...DESKS.map((d) => d.file), 'components/fig/Fig.tsx'];
    const offenders: string[] = [];
    for (const f of files) {
      const src = strip(read(f));
      for (const m of src.matchAll(/text-\[(\d+)px\]/g)) if (Number(m[1]) < 11) offenders.push(`${f}: text-[${m[1]}px]`);
    }
    expect(offenders, 'the density floor is text-micro (11 px); nothing on a desk goes below it').toEqual([]);
  });

  it('<Fig> is still: no animation, no private timer, the age rides the one clock', () => {
    const src = strip(read('components/fig/Fig.tsx'));
    expect(src).not.toMatch(/animate-|setInterval|setTimeout|requestAnimationFrame/);
    expect(src).toMatch(/useClock\(/);
    expect(src).toMatch(/undated/);
    expect(src).toMatch(/first reading/);
  });
});
