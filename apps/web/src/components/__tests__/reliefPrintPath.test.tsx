import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DeckRelief } from '@/components/geometry/DeckRelief';
import { SurfaceRelief } from '@/components/geometry/SurfaceRelief';
import { PipelineRelief } from '@/components/geometry/PipelineRelief';
import { VaultRelief } from '@/components/geometry/VaultRelief';
import { OntologyOrrery } from '@/components/geometry/OntologyOrrery';
import { GlobeRelief } from '@/components/market/GlobeRelief';
import { StormRelief } from '@/components/risk/StormRelief';
import { buildRiskField, type RiskFieldInput } from '@/components/risk/riskField';
import { buildSurfaceMesh, WITHHELD, type GridCellValue } from '@lcx/shared';
import type { DeckPanelDatum } from '@/components/geometry/deckSlots';
import type { OrreryEntityInput, OrreryCouplingInput } from '@/components/geometry/orrery/orreryLayout';
import type { MapPoint } from '@/lib/api/bd';
import type { BdFilters, BdLead } from '@/types/bd';

/**
 * §6 RULE 1 ON PAPER — "SSR, print, no-WebGL and reduced-motion all resolve to the existing surface."
 *
 * ── WHY PRINT GETS ITS OWN FILE, AND WHY IT IS THE HARDEST OF THE FOUR AXES ──────────
 * A canvas is a bitmap with no text in it, and paper has no toggle to press. `docs/3d/_shared/flatFallback.ts`
 * is the record of how expensive this axis is to get wrong: it needed a print block that undoes FIVE
 * properties of a screen clip, because `#lcx-fallback[data-rendered="1"]` (1-1-0) outranks `#lcx-fallback`
 * (1-0-0) — and even after that, a REFUSAL printed as an empty bordered box measured at 1.14:1 against
 * white in a real PDF, while every data cell in the same table measured 7:1 or better. A printed refusal
 * therefore showed a fully legible data table with no indication the render had failed.
 *
 * ── THE ONE THING THE APP GETS STRUCTURALLY RIGHT, AND IT IS WORTH KNOWING WHY ───────
 * That specific failure cannot recur here, and not because of a print rule. Each wrapper's `onRefused`
 * sets `wantRelief` back to false, so a refused surface has already swapped the canvas out for the flat
 * figure BEFORE any print job could see it. The harness had to make a refusal legible on paper; the app
 * never leaves one there. That is the fact this file pins, on all seven.
 *
 * ── WHAT IS NOT VERIFIED HERE, STATED PLAINLY ────────────────────────────────────────
 * jsdom applies no `@media print` and rasterises nothing, so nothing below is a measurement of ink. Two
 * things consequently remain unverified by any test in this repo, and neither is this file's to fix:
 *
 *   1 · What a SUCCESSFULLY DRAWN relief canvas does on paper. `createStage` sets
 *       `preserveDrawingBuffer: true` (`packages/gl/src/stage.ts:161`) so the buffer survives compositing
 *       and should print, but nobody has produced the PDF. The harnesses were captured; the app was not.
 *   2 · Whether the flat figure should come back under `@media print` when the relief is ON. It does not
 *       today: every wrapper SWAPS rather than layers, so with the relief open the flat surface is not in
 *       the document at all and there is no print rule anywhere in `apps/web` that puts it back.
 *       `components/report/PrintStyles.tsx` carries no `canvas` rule, and `StormRelief.tsx:120` holds the
 *       only print-aware line in all fifteen relief files.
 */

/* ── FIXTURES ─────────────────────────────────────────────────────────────────────── */

const SURFACE = buildSurfaceMesh({
  rows: [[0.31, 0.44, 0.52], [0.22, 0.36, 0.71], [null, 0.21, WITHHELD]] as readonly (readonly GridCellValue[])[],
  xAxis: { label: 'Ticket', unit: '$k', ticks: [25, 50, 100].map((v) => ({ value: v, label: String(v) })) },
  yAxis: { label: 'Days', unit: 'd', ticks: [7, 30, 90].map((v) => ({ value: v, label: String(v) })) },
  zAxis: { label: 'Win rate', unit: '', tickCount: 4 },
  frame: {
    environment: 'test', observedAt: '2026-08-12T00:00:00.000Z', windowFrom: null, windowTo: null,
    source: 'reliefPrintPath.test.tsx', valuesArePlaceholders: true,
  },
});

const PANELS: readonly DeckPanelDatum[] = [
  { id: 'gating', title: 'Launch readiness', headline: '3/7 gates', note: null },
  { id: 'work', title: 'Workstreams', headline: '5 workstreams', note: '41 tasks across them' },
  { id: 'risks', title: 'Risk heatmap', headline: '9 risks', note: 'Critical risks present' },
];

const NOW = Date.parse('2026-08-13T00:00:00.000Z');
const isoDaysAgo = (d: number): string => new Date(NOW - d * 86_400_000).toISOString();
let seq = 0;
function lead(over: Partial<BdLead> = {}): BdLead {
  seq += 1;
  return {
    id: `p${seq}`, name: `PROJECT ${seq}`, ticker: null, website: null, source: 'manual',
    chain: null, jurisdiction: null, category: null, listedOnLcx: null,
    euScore: 50, usPreScore: 50, usPostScore: 50, band: 'nurture',
    marketCapUsd: 250_000, peopleCount: 1, verifiedContactCount: 1,
    createdAt: isoDaysAgo(90), updatedAt: isoDaysAgo(3), hasContact: true, marketTag: null, ...over,
  };
}
const TABLE_PROPS = {
  leads: [
    lead({ name: 'SABLE TREASURY', band: 'unscored', marketCapUsd: 240_000, updatedAt: isoDaysAgo(63) }),
    lead({ name: 'MERIDIAN PAY', band: 'high', marketCapUsd: 2_600_000, updatedAt: isoDaysAgo(41) }),
    lead({ name: 'ATLAS OTC', band: 'immediate', marketCapUsd: 4_200_000, updatedAt: isoDaysAgo(3) }),
  ],
  filters: {
    market: null, minScore: 0, source: '', band: '', listedOnLcx: null, hasContact: null,
    marketRecommendation: '', sort: 'created', order: 'desc', search: '', tier: 'tracked',
  } as BdFilters,
  clarityEnacted: false, onSort: () => {}, onSelect: () => {}, loading: false,
};

const AUDIT = [{
  id: 'a', actor: 'n.sharma', action: 'campaign_publish', entity: 'projects',
  entityId: '0191abcd-ef01-2345-6789-abcdef012345', meta: {}, projectName: 'Aster',
  createdAt: new Date(NOW - 3 * 3_600_000).toISOString(),
}];

const ent = (id: string, kind: string): OrreryEntityInput => ({ id, label: id, kind, record: {} });
const cpl = (s: string, t: string): OrreryCouplingInput => ({ id: `${s}-${t}`, source: s, target: t, kind: 'requires' });
const ORRERY = {
  entities: [ent('HUB', 'license'), ent('A', 'requirement'), ent('B', 'requirement'),
    ent('P', 'product'), ent('Q', 'product')],
  couplings: [cpl('HUB', 'A'), cpl('HUB', 'B'), cpl('A', 'P'), cpl('B', 'Q')],
};

const point = (over: Partial<MapPoint>): MapPoint => ({
  id: 'p1', name: 'Project One', ticker: 'ONE', marketCapUsd: 1_000_000, volume24hUsd: null,
  priceChange30d: null, category: null, region: 'eu', listedOnLcx: false, exchangeCount: 0,
  band: 'watch', priorityScore: 1, propensityScore: 1, euScore: null, usPreScore: null,
  usPostScore: null, recommendedMarket: null, ...over,
});
const POINTS: readonly MapPoint[] = [point({ id: 'a', region: 'eu' }), point({ id: 'b', region: 'us' })];

const LANES = ['PAID_SEARCH', 'COMMUNITY'] as const;
const BANDS = ['ADVISORY', 'SEVERE'] as const;
function riskInput(): RiskFieldInput {
  const days = Array.from({ length: 6 }, (_, d) => ({ label: `D${d}`, state: 'observed' as const }));
  return {
    lanes: [...LANES], bands: [...BANDS], days,
    cells: LANES.map((_l, l) => days.map(() => BANDS.map((_b, b) => 0.1 + 0.1 * l + 0.05 * b))),
    reviewThreshold: 2.0, itemsLostToUnmeasuredDays: 0,
    frame: {
      source: 'reliefPrintPath.test.tsx', observedAt: '2026-08-13T00:00:00.000Z',
      valuesArePlaceholders: true,
    },
  };
}
const FIELD = buildRiskField(riskInput());

const FLAT = <div data-testid="flat">the flat surface, exactly as the page renders it</div>;

interface Surface {
  readonly env: string;
  readonly name: string;
  readonly toggle: RegExp;
  readonly mount: () => { container: HTMLElement };
  readonly flatIsShowing: (c: HTMLElement) => boolean;
}

const SURFACES: readonly Surface[] = [
  {
    env: 'E1', name: 'DeckRelief', toggle: /theatre view/i,
    mount: () => render(<DeckRelief panels={PANELS}>{FLAT}</DeckRelief>),
    flatIsShowing: (c) => c.querySelector('[data-testid="flat"]') !== null,
  },
  {
    env: 'E2', name: 'GlobeRelief', toggle: /globe view/i,
    mount: () => render(<GlobeRelief points={POINTS}>{FLAT}</GlobeRelief>),
    flatIsShowing: (c) => c.querySelector('[data-testid="flat"]') !== null,
  },
  {
    env: 'E3', name: 'PipelineRelief', toggle: /channel view/i,
    mount: () => render(<MemoryRouter><PipelineRelief {...TABLE_PROPS} /></MemoryRouter>),
    flatIsShowing: (c) => c.querySelector('table') !== null,
  },
  {
    env: 'E4', name: 'OntologyOrrery', toggle: /orrery view/i,
    mount: () => render(
      <OntologyOrrery entities={ORRERY.entities} couplings={ORRERY.couplings} allCouplings={ORRERY.couplings}>
        {FLAT}
      </OntologyOrrery>,
    ),
    flatIsShowing: (c) => c.querySelector('[data-testid="flat"]') !== null,
  },
  {
    env: 'E5', name: 'SurfaceRelief', toggle: /relief view/i,
    mount: () => render(<SurfaceRelief surface={SURFACE} title="Win rate" readsAs="Higher is better." heightPx={300} />),
    flatIsShowing: (c) => c.querySelector('svg') !== null,
  },
  {
    env: 'E6', name: 'VaultRelief', toggle: /vault view/i,
    mount: () => render(<VaultRelief entries={AUDIT}>{FLAT}</VaultRelief>),
    flatIsShowing: (c) => c.querySelector('[data-testid="flat"]') !== null,
  },
  {
    env: 'E7', name: 'StormRelief', toggle: /storm view/i,
    mount: () => render(<StormRelief field={FIELD} title="Marketing risk" readsAs="Colour is a total." heightPx={240} />),
    flatIsShowing: (c) => c.querySelector('svg') !== null,
  },
];

/* See the long note in `reliefFallback.test.tsx`: jsdom reports 0×0 and has no `ResizeObserver`, and
   without both several of these refuse for a reason that has nothing to do with print. */
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
beforeEach(() => {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = ResizeObserverStub;
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1200);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(700);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    width: 1200, height: 700, top: 0, left: 0, right: 1200, bottom: 700, x: 0, y: 0, toJSON: () => ({}),
  } as DOMRect);
});
afterEach(() => {
  delete (globalThis as { ResizeObserver?: unknown }).ResizeObserver;
  vi.restoreAllMocks();
});

function read(rel: string): string {
  const file = resolve(process.cwd(), rel);
  expect(existsSync(file), `cannot find ${file} — this check would otherwise pass vacuously`).toBe(true);
  const src = readFileSync(file, 'utf8');
  expect(src.length, `${rel} is empty, so nothing below could fail`).toBeGreaterThan(500);
  return src;
}

/* ── WHAT AN UNATTENDED ⌘P ACTUALLY PRINTS ───────────────────────────────────────── */

describe('the default state is the printed state, on every one of the seven', () => {
  it.each(SURFACES.map((s) => [s.env, s.name, s] as const))(
    '%s %s prints its flat form, because that is what is in the document',
    (_env, name, s) => {
      /*
       * THE ONE PRINT GUARANTEE THAT NEEDS NO CSS. All seven default to `useState(false)`, so a reader who
       * never pressed the toggle has the flat figure in the document and no canvas — and print, having no
       * toggle, is permanently in that state unless a reader opened the relief and then printed. This is
       * asserted per surface rather than argued once because it is the only reason the absence of a print
       * rule for these canvases is survivable rather than fatal.
       */
      const { container } = s.mount();
      expect(s.flatIsShowing(container), `${name} has no flat form in the document to print`).toBe(true);
      expect(container.querySelectorAll('canvas').length, `${name} put a canvas on paper by default`).toBe(0);
    },
  );
});

describe('a refusal never reaches paper in place of the data', () => {
  it.each(SURFACES.map((s) => [s.env, s.name, s] as const))(
    '%s %s — the refusal notice is a live region, NOT a status the print sheet deletes',
    async (_env, name, s) => {
      /*
       * THE SCAR THIS ASSERTION COMES FROM IS IN `PrintStyles.tsx:19-21`, and it was not about relief at
       * all: the print rules hid `header, aside, footer`, then someone noticed the offline banner is a
       * `<div role="status">` in the main flow, so printing during an API blip put half a page of apology
       * on top of a board report. The fix hides `[role="status"]` in print — which means any relief that
       * announced its refusal as a status would be announcing it into a rule that deletes it on paper.
       *
       * `[role="alert"]` is not in that block, so these notices survive. The assertion is on the ROLE
       * rather than on the stylesheet, because the role is the thing a future edit would change casually.
       */
      const { container } = s.mount();
      fireEvent.click(screen.getByRole('button', { name: s.toggle }));
      await waitFor(
        () => { expect(container.querySelector('[role="alert"]')).not.toBeNull(); },
        { timeout: 8000 },
      );

      expect(container.querySelector('[role="status"]'), `${name} announced its refusal as a status`).toBeNull();
      /* And the harness's expensive failure — a refusal printed as an empty box while a legible table sat
         under it — is unreachable here: the flat figure is back and the canvas is gone before any print
         job could see either. */
      expect(container.querySelectorAll('canvas').length, `${name} left a canvas for the printer`).toBe(0);
      expect(s.flatIsShowing(container), `${name} refused and left nothing to print`).toBe(true);
    },
    20_000,
  );
});

/* ── THE PRINT-REACHABLE ROUTES ──────────────────────────────────────────────────── */

describe('which relief surfaces can reach paper at all', () => {
  /*
   * `PrintStyles` is the house print sheet — A4, chrome hidden, dark tokens re-pinned for white paper,
   * scroll containers unlocked. Only a page that mounts it has a designed print output, so the set of
   * relief surfaces on such a page is exactly the set for which the unverified item 2 in this file's
   * header is a live risk rather than a theoretical one. Pinned so that adding a relief to a printable
   * page, or `PrintStyles` to a page that has one, is a test failure that says what to check.
   */
  const PRINTABLE: readonly (readonly [string, string, string])[] = [
    ['E1 DeckRelief', 'src/pages/CommandDeck.tsx', 'DeckRelief'],
    ['E5 SurfaceRelief', 'src/pages/CommandDeck.tsx', 'CockpitPanels'],
    ['E7 StormRelief', 'src/pages/MarketingCrisis.tsx', 'StormRelief'],
  ];

  it.each(PRINTABLE)('%s ships on %s, which mounts PrintStyles', (_label, page, mounted) => {
    const src = read(page);
    expect(src, `${page} must still mount the house print sheet`).toContain('<PrintStyles');
    expect(src, `${page} must still mount ${mounted}`).toContain(mounted);
  });

  it('E5 reaches paper through CockpitPanels rather than directly, and that is the whole hop', () => {
    /* `SurfaceRelief` appears on no page's own source. It arrives on the command deck inside
       `CockpitPanels`, which is why a grep for it against `pages/` finds nothing and why this hop is
       written down: it is the one printable surface whose route is not visible from the page file. */
    const panels = read('src/components/command/CockpitPanels.tsx');
    expect(panels).toContain('<SurfaceRelief');
    const deck = read('src/pages/CommandDeck.tsx');
    expect(deck, 'the deck must still import the panels that carry E5').toMatch(/from '@\/components\/command\/CockpitPanels'/);
  });

  it('the other four ship on pages with no print sheet, so ⌘P there is undesigned for every element', () => {
    /*
     * Not a defect and not a licence: a page without `PrintStyles` prints its dark theme, its chrome and
     * its clipped scroll containers for EVERYTHING on it, relief or not. It is recorded because the day
     * one of these four becomes printable, the relief canvas on it becomes a print question — and this
     * failure is where that gets noticed.
     */
    const unprintable: readonly (readonly [string, string])[] = [
      ['E2 GlobeRelief', 'src/pages/MarketMap.tsx'],
      ['E3 PipelineRelief', 'src/pages/BdPipeline.tsx'],
      ['E4 OntologyOrrery', 'src/pages/OntologyExplorer.tsx'],
      ['E6 VaultRelief', 'src/pages/AuditLog.tsx'],
    ];
    expect(unprintable.length, 'an empty list would make this pass without reading a page').toBe(4);
    for (const [label, page] of unprintable) {
      expect(
        read(page).includes('<PrintStyles'),
        `${page} now mounts PrintStyles — ${label}'s canvas has become a print question, see this file's header`,
      ).toBe(false);
    }
  });
});

describe('E7 is the only relief that says anything about print, and it says the right thing', () => {
  it('keeps its control off the paper and its calibration sentence on it', () => {
    /*
     * `StormRelief.tsx:120` is the single print-aware line in all fifteen relief files, and it is on the
     * surface that needs it most: `MarketingCrisis` is a record page that mounts `PrintStyles`, so its
     * output is an artefact somebody keeps. `.br-no-print` is deleted from the printed sheet by
     * `PrintStyles.tsx:55`, and the row it is on holds the toggle and the refusal notice — a button on a
     * printed compliance record is chrome, and the notice explains a control that is not there.
     *
     * What must NOT be on that row is the calibration sentence, which bounds what the volume is entitled
     * to claim. `data-testid="storm-calibration"` renders only over a drawn frame, so it cannot be
     * asserted from jsdom; its placement OUTSIDE the non-printing row can be, and that is the half a
     * future edit would break by tidying the two into one container.
     */
    const src = read('src/components/risk/StormRelief.tsx');
    const noPrint = src.indexOf('br-no-print');
    expect(noPrint, 'E7 must keep its print rule').toBeGreaterThan(0);
    const calibration = src.indexOf('data-testid="storm-calibration"');
    expect(calibration, 'the calibration sentence must still exist to be placed').toBeGreaterThan(0);
    expect(
      calibration,
      'the calibration sentence moved into the non-printing row, so the printed figure lost the clause that bounds it',
    ).toBeGreaterThan(noPrint);

    render(<StormRelief field={FIELD} title="Marketing risk" readsAs="Colour is a total." heightPx={240} />);
    const btn = screen.getByRole('button', { name: /storm view/i });
    expect(btn.closest('.br-no-print'), 'a toggle printed on a compliance record is chrome').not.toBeNull();
  });

  it('and the other six carry no print rule, which is the gap this file documents rather than asserts', () => {
    /*
     * DELIBERATELY A COUNT, NOT A BAN. Six of the seven have no `@media print` and no print class, so on
     * `CommandDeck` — which mounts `PrintStyles` — E1's and E5's toggles and their "nobody has yet timed
     * whether it answers faster" sentences print onto a board deck as UI furniture. `GpsPrint.tsx:94`
     * records the same class of defect in the same words ("a button printed on a client proposal").
     *
     * This is reported to the owner of those components, not fixed here, so what is asserted is only that
     * E7 remains the ONE exception. If a second surface gains a print rule this fails, and the right
     * response is to update the count — not to delete the rule.
     */
    const files: readonly string[] = [
      'src/components/geometry/DeckRelief.tsx',
      'src/components/geometry/SurfaceRelief.tsx',
      'src/components/geometry/PipelineRelief.tsx',
      'src/components/geometry/VaultRelief.tsx',
      'src/components/geometry/OntologyOrrery.tsx',
      'src/components/market/GlobeRelief.tsx',
      'src/components/risk/StormRelief.tsx',
    ];
    expect(files.length, 'an empty list would make this pass without reading a file').toBe(7);
    const withPrintRule = files.filter((f) => {
      const src = read(f);
      return src.includes('br-no-print') || src.includes('@media print') || src.includes('print-only');
    });
    expect(withPrintRule).toEqual(['src/components/risk/StormRelief.tsx']);
  });
});
