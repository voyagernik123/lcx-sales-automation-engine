import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrintStyles } from '@/components/report/PrintStyles';
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
import { storage } from '@/lib/persistence';
import { RELIEF_DEFAULT_ON } from '@/lib/reliefPreference';

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
 * ── THE HALF THAT USED TO BE MISSING, AND IS NOW ASSERTED RATHER THAN DOCUMENTED ──────
 * This header used to carry the gap as unverified item 2: *"Whether the flat figure should come back under
 * `@media print` when the relief is ON. It does not today: every wrapper SWAPS rather than layers, so with
 * the relief open the flat surface is not in the document at all and there is no print rule anywhere in
 * `apps/web` that puts it back."* That was true, and it was worst exactly where it mattered most — a ⌘P on
 * `MarketingCrisis` with the storm open put a canvas on a COMPLIANCE RECORD where the risk figures belong.
 *
 * Fixed for the three surfaces that reach paper (E1, E5, E7 — the same three the print-reachable census
 * below pins) and asserted in `a relief that is OPEN when ⌘P happens prints its flat form`. The other four
 * are on pages with no print sheet and are deliberately untouched: a print rule on a page that never
 * mounts `PrintStyles` is a rule that cannot fire.
 *
 * ── WHAT IS STILL NOT VERIFIED HERE, STATED PLAINLY ──────────────────────────────────
 * jsdom EVALUATES NO `@media print` and rasterises nothing, so nothing below is a measurement of ink. What
 * the CSSOM test does instead is stronger than a string match and weaker than a PDF: it parses the real
 * stylesheet, matches each rule's real `selectorText` against the real elements, and reads the real
 * declarations — so a typo'd selector or a dropped `!important` fails here. Whether a printer then honours
 * it is unmeasured. Two things therefore remain unverified by any test in this repo:
 *
 *   1 · What a SUCCESSFULLY DRAWN relief canvas does on paper. `createStage` sets
 *       `preserveDrawingBuffer: true` so the buffer survives compositing and should print, but nobody has
 *       produced the PDF. The harnesses were captured; the app was not. It matters less now that the flat
 *       form is what the sheet is designed around, and it is still the one honest way to close this axis:
 *       open a relief on `CommandDeck`, ⌘P to PDF, and look at the page.
 *   2 · The four unprintable surfaces, if one of their pages ever gains `PrintStyles`. The census below
 *       fails on that day and says which.
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
  /*
   * THE STORED-NO BASELINE. Since 2026-08-20 six of the seven reliefs default ON
   * (lib/reliefPreference.ts), and a toggle click PERSISTS through the storage module's in-memory
   * tier, which localStorage.clear() cannot reach. Every choreography in this file opens a relief
   * BY CLICKING — the reader's route — and a click on an already-on surface closes it instead,
   * which is how three of these tests spent a while reporting "never reached the drawn state".
   * Starting from a remembered "off" for all seven (a real production state) keeps the click
   * meaningful and each test independent of its neighbours' clicks.
   */
  storage.clearAll();
  for (const k of ['relief:deck', 'relief:globe', 'relief:pipeline', 'relief:orrery',
                   'relief:surface', 'relief:vault', 'relief:storm'] as const) {
    storage.set(k, false);
  }
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

/* ── THE ONE OBSERVATION THAT IS ONLY AVAILABLE ONCE PER FILE ─────────────────────── */

/**
 * THIS DESCRIBE MUST STAY FIRST, and the reason is a property of `React.lazy` rather than a preference.
 *
 * `lazy()` caches its module: after the first successful resolve it renders SYNCHRONOUSLY and never
 * suspends again. Vitest gives each test FILE its own module registry, so the loading state of E1's
 * renderer is observable exactly once in this file — on the first mount — and any test declared above this
 * one that clicks the theatre toggle spends it. Moved below the refusal suite, the assertion below still
 * passes and no longer looks at the state it names: it would be measuring the drawn state twice.
 */
describe('the print copy never doubles the flat figure, in the state where doubling would show', () => {
  it('has exactly ONE flat deck in the document while the chunk loads AND once it is drawn', async () => {
    /*
     * THE HAZARD THIS SHAPE EXISTS TO AVOID. The obvious fix — a hidden print copy rendered ALONGSIDE the
     * visible figure — puts two of everything in the document, and several suites query the flat figure with
     * `getByTestId`/`getByText`, which THROW on multiple matches: `deckRelief.test.tsx:48` does exactly that
     * immediately after clicking this toggle, and `reliefAccessibility.test.tsx` finds its toggle by
     * filtering all buttons to exactly one match.
     *
     * So the print copy is the second arm of the SAME Suspense boundary the renderer is in. React mounts one
     * arm at a time: the fallback while the chunk loads, the copy plus the canvas once it is drawn. Never
     * both. A copy placed OUTSIDE the boundary fails this test in the loading state with 2 — which is what
     * the first draft of this fix did.
     */
    stubbed.drawn = true;
    try {
      const { container } = render(<DeckRelief panels={PANELS}>{FLAT}</DeckRelief>);
      expect(container.querySelectorAll('[data-testid="flat"]').length, 'default state').toBe(1);

      fireEvent.click(screen.getByRole('button', { name: /theatre view/i }));
      /* Still loading: nothing has resolved inside this synchronous turn, which is exactly why this test has
         to be first — see the note above the describe. */
      expect(container.querySelector('[data-testid="stub-canvas"]'),
        'the renderer resolved synchronously, so the loading state was never observed and this test is'
        + ' no longer watching anything — check that no earlier test mounts DeckReliefGl').toBeNull();
      expect(container.querySelectorAll('[data-testid="flat"]').length, 'while the chunk loads').toBe(1);

      await waitFor(() => {
        expect(container.querySelector('[data-testid="stub-canvas"]')).not.toBeNull();
      });
      expect(container.querySelectorAll('[data-testid="flat"]').length, 'once the relief is drawn').toBe(1);
    } finally {
      stubbed.drawn = false;
    }
  });
});

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

/* ── WHAT A ⌘P WITH THE RELIEF OPEN PRINTS, WHICH IS THE HALF THAT WAS MISSING ────── */

/**
 * THE ONLY THREE SURFACES THAT REACH PAPER, and the whole of what was wrong.
 *
 * `showRelief ? <Gl/> : <Flat/>` meant that with a relief OPEN the flat figure was not in the document,
 * and nothing anywhere in `apps/web` put it back for print — this file's own header said so, and
 * `PrintStyles.tsx` contained zero occurrences of `canvas`. So a ⌘P taken with the relief open printed a
 * canvas: on `CommandDeck` into a board pack, and on `MarketingCrisis` into a COMPLIANCE RECORD.
 *
 * Each wrapper now renders the flat figure as the SECOND ARM OF THE SAME SUSPENSE BOUNDARY the renderer
 * is in — hidden on screen by an inline `display: none`, revealed on paper by `PrintStyles` — with the
 * live block wrapped so that print removes the canvas AND the DOM text projected over it.
 *
 * ── HOW THE RELIEF IS HELD OPEN AT ALL, WHICH NO OTHER TEST IN THE REPO DOES ─────────
 * jsdom has no WebGL2, so every real renderer refuses on mount and each wrapper sends itself straight
 * back to flat. That is why every other test in this file, and all of `reliefFallback.test.tsx`, observes
 * the REFUSED state — and it is why the print question could only ever be *documented* here before now.
 *
 * So E1, E5 and E7's GL modules are stubbed for this file. The stub REFUSES BY DEFAULT, exactly as the
 * real renderer does in jsdom, and draws a canvas only while `stubbed.drawn` is set — so the refusal
 * tests above still exercise the wrapper's swap-back, and only the three tests that need a live canvas
 * get one. Two honest limits: those three refusals now come from a stub rather than from `createStage`
 * (the real-renderer refusal, with its real `NO_WEBGL2` code, is `reliefFallback.test.tsx`'s job and it
 * covers all seven), and jsdom EVALUATES NO `@media print` — see the closing note in this file's header.
 * Everything else here is shipping code: the wrappers, their Suspense arms, the real flat figures, and
 * the real `PrintStyles` stylesheet parsed through the real CSSOM.
 */
const stubbed = vi.hoisted(() => ({ drawn: false }));

/**
 * One stub for all three, built inside the factory because a `vi.mock` factory is hoisted above this
 * file's own imports — `react` has to be imported by the factory itself rather than closed over.
 */
async function stubRenderer() {
  const react = await import('react');
  const StubGl = (props: { onRefused: (code: string, reason: string) => void }) => {
    /* From an EFFECT, and one tick late, because that is when the real renderers refuse — and the whole
       `aria-disabled`-not-`disabled` design of these toggles exists because of that timing. A stub that
       refused during render would test a wrapper nobody ships. */
    react.useEffect(() => {
      if (!stubbed.drawn) props.onRefused('STUB_REFUSAL', 'the stub renderer refuses the way jsdom does');
    }, [props.onRefused]);
    return stubbed.drawn
      ? react.createElement('canvas', { 'data-testid': 'stub-canvas', 'aria-hidden': 'true' })
      : null;
  };
  return { default: StubGl };
}
vi.mock('@/components/geometry/DeckReliefGl', () => stubRenderer());
vi.mock('@/components/geometry/SurfaceReliefGl', () => stubRenderer());
vi.mock('@/components/risk/StormReliefGl', () => stubRenderer());

interface OpenSurface {
  readonly env: string;
  readonly name: string;
  readonly toggle: RegExp;
  readonly mount: () => { container: HTMLElement };
  /** Something only the FLAT figure ever renders. */
  readonly flatMark: (root: ParentNode) => Element | null;
}

const PRINT_SURFACES: readonly OpenSurface[] = [
  {
    env: 'E1', name: 'DeckRelief', toggle: /theatre view/i,
    mount: () => render(<DeckRelief panels={PANELS}>{FLAT}</DeckRelief>),
    flatMark: (r) => r.querySelector('[data-testid="flat"]'),
  },
  {
    env: 'E5', name: 'SurfaceRelief', toggle: /relief view/i,
    mount: () => render(<SurfaceRelief surface={SURFACE} title="Win rate" readsAs="Higher is better." heightPx={300} />),
    flatMark: (r) => r.querySelector('svg'),
  },
  {
    env: 'E7', name: 'StormRelief', toggle: /storm view/i,
    mount: () => render(<StormRelief field={FIELD} title="Marketing risk" readsAs="Colour is a total." heightPx={240} />),
    flatMark: (r) => r.querySelector('svg'),
  },
];

/** Every `@media print` rule the house sheet declares, read out of the real CSSOM. */
function printRules(): CSSStyleRule[] {
  const { container } = render(<PrintStyles />);
  const style = container.querySelector('style');
  expect(style, 'PrintStyles rendered no <style> element').not.toBeNull();
  const sheet = style!.sheet;
  expect(sheet, 'jsdom did not attach a CSSStyleSheet — nothing below could be read').not.toBeNull();
  const out: CSSStyleRule[] = [];
  for (const rule of Array.from(sheet!.cssRules)) {
    if (!(rule instanceof CSSMediaRule) || rule.conditionText !== 'print') continue;
    for (const inner of Array.from(rule.cssRules)) if (inner instanceof CSSStyleRule) out.push(inner);
  }
  expect(out.length, 'no rules parsed out of the @media print block').toBeGreaterThan(5);
  return out;
}

describe('a relief that is OPEN when ⌘P happens prints its flat form', () => {
  /* The stub refuses by default so that the refusal tests above keep working; these four ask for a frame.
     Reset in `afterEach` rather than at the end of each test, or one failure leaks a live canvas into the
     refusal suite and the failure that follows names the wrong defect. */
  beforeEach(() => { stubbed.drawn = true; });
  afterEach(() => { stubbed.drawn = false; });

  it.each(PRINT_SURFACES.map((s) => [s.env, s.name, s] as const))(
    '%s %s keeps the flat figure IN the document while the canvas is live',
    async (_env, name, s) => {
      /*
       * The failure this replaces: with the relief open, `container.querySelector('svg')` (E5, E7) and
       * `[data-testid="flat"]` (E1) were both null and a canvas was the only figure in the document. That
       * is what a board pack and a compliance record were printing.
       */
      const { container } = s.mount();
      fireEvent.click(screen.getByRole('button', { name: s.toggle }));
      await waitFor(() => {
        expect(container.querySelector('[data-testid="stub-canvas"]'), `${name} never reached the drawn state`)
          .not.toBeNull();
      });

      const printCopy = container.querySelector('[data-relief-print-flat]');
      expect(printCopy, `${name} has no flat form in the document while the relief is open`).not.toBeNull();
      expect(s.flatMark(printCopy!), `${name}'s print copy does not contain the flat figure itself`).not.toBeNull();

      /* HIDDEN ON SCREEN BY THE ELEMENT ITSELF, not by a class — so a page that never mounts `PrintStyles`
         shows one figure rather than two. This is the assertion that stops the fix from becoming a
         visible-duplicate bug on the four pages with no print sheet. */
      expect((printCopy as HTMLElement).style.display, `${name} shows its print copy on screen`).toBe('none');

      /* And the canvas is inside a block print deletes WHOLE. Hiding the bitmap alone would leave
         `DeckReliefGl`'s projected panel text and HUD plate printing over the flat deck. */
      const live = container.querySelector('[data-relief-live]');
      expect(live, `${name} has no print-removable wrapper around its live relief`).not.toBeNull();
      expect(live!.querySelector('[data-testid="stub-canvas"]'), `${name}'s canvas is outside the live block`)
        .not.toBeNull();
    },
  );

  it('the house sheet actually contains rules that MATCH those two elements, at !important', () => {
    /*
     * NOT A STRING MATCH ON THE CSS. The stylesheet is parsed by jsdom's CSSOM and each rule's real
     * `selectorText` is tested against the real elements with `Element.matches`, and the declarations are
     * read through `CSSStyleDeclaration` — so a typo'd selector, a mis-nested brace or a dropped
     * `!important` fails here rather than in a PDF nobody generates.
     *
     * `!important` is load-bearing and not tidy-up: the print copy's `display: none` is INLINE, and an
     * inline declaration outranks every selector. Without it the flat figure would stay hidden on paper
     * and print would show a blank space where the canvas used to be — the same defect, fewer pixels.
     */
    const rules = printRules();
    const { container } = render(<StormRelief field={FIELD} title="Marketing risk" readsAs="Colour." heightPx={240} />);
    fireEvent.click(screen.getByRole('button', { name: /storm view/i }));
    const printCopy = container.querySelector('[data-relief-print-flat]');
    const live = container.querySelector('[data-relief-live]');
    expect(printCopy, 'nothing to match the reveal rule against').not.toBeNull();
    expect(live, 'nothing to match the hide rule against').not.toBeNull();

    const matching = (el: Element) => rules.filter((r) => el.matches(r.selectorText));
    const reveal = matching(printCopy!);
    expect(reveal.length, 'no @media print rule matches the flat print copy').toBeGreaterThan(0);
    expect(reveal.some((r) => r.style.display === 'block' && r.style.getPropertyPriority('display') === 'important'),
      'the flat copy is never revealed on paper, so print shows a gap where the canvas was').toBe(true);

    const hide = matching(live!);
    expect(hide.length, 'no @media print rule matches the live relief block').toBeGreaterThan(0);
    expect(hide.some((r) => r.style.display === 'none' && r.style.getPropertyPriority('display') === 'important'),
      'the live canvas and its projected text still print').toBe(true);
  });

  it('and the OFF state gains nothing to hide — neither attribute exists with the relief off', () => {
    /* The scoping claim, checked rather than argued: with the relief off, the two selectors match
       nothing at all, so the print fix cannot change what a flat-state print job prints. "Off" is no
       longer the universal default — RELIEF_DEFAULT_ON ships E1 and E5 on, and only storm off — so
       this test reaches the off state the way an operator does, through a remembered choice (the
       suite-wide stored-no baseline above). The pin below keeps this file honest about which of its
       three print-reachable surfaces still lands here by default. */
    expect(RELIEF_DEFAULT_ON.storm, 'storm going default-on must be a decision made HERE too').toBe(false);
    for (const s of PRINT_SURFACES) {
      const { container } = s.mount();
      expect(container.querySelector('[data-relief-print-flat]'), `${s.name} off state`).toBeNull();
      expect(container.querySelector('[data-relief-live]'), `${s.name} off state`).toBeNull();
      expect(s.flatMark(container), `${s.name} lost its flat figure in the off state`).not.toBeNull();
    }
  });
});

describe('E7 says the right thing about print, and E1 and E5 now say it too', () => {
  it('keeps its control off the paper and its calibration sentence with the volume it describes', () => {
    /*
     * `MarketingCrisis` is a record page that mounts `PrintStyles`, so its output is an artefact somebody
     * keeps. `.br-no-print` is deleted from the printed sheet by `PrintStyles`, and the row it is on holds
     * the toggle and the refusal notice — a button on a printed compliance record is chrome, and the notice
     * explains a control that is not there.
     *
     * THE CALIBRATION SENTENCE MOVED, AND THIS ASSERTION MOVED WITH IT. It used to have to sit OUTSIDE the
     * non-printing row so that it printed; that was right while the printed figure was the storm, and it is
     * wrong now that the printed figure is the CALENDAR. Its first clause — "depth of colour is the total
     * risk BETWEEN YOU AND that day" — is a claim about accumulation along a ray, which the calendar does
     * not make: a calendar cell is one day's own risk. So it now carries `data-relief-live`, leaving the
     * sheet with the figure it describes while staying on screen whenever the storm is up.
     *
     * Both halves still matter: it must NOT be in the `br-no-print` row (which would delete it from a
     * printed sheet even where the rest of this fix had not applied), and it must be inside the live block.
     */
    const src = read('src/components/risk/StormRelief.tsx');
    const noPrint = src.indexOf('br-no-print');
    expect(noPrint, 'E7 must keep its print rule').toBeGreaterThan(0);
    const calibration = src.indexOf('data-testid="storm-calibration"');
    expect(calibration, 'the calibration sentence must still exist to be placed').toBeGreaterThan(0);
    expect(
      calibration,
      'the calibration sentence moved into the non-printing row, so it now vanishes from screen as well as paper',
    ).toBeGreaterThan(noPrint);

    stubbed.drawn = true;
    try {
      const { container } = render(
        <StormRelief field={FIELD} title="Marketing risk" readsAs="Colour is a total." heightPx={240} />,
      );
      const btn = screen.getByRole('button', { name: /storm view/i });
      expect(btn.closest('.br-no-print'), 'a toggle printed on a compliance record is chrome').not.toBeNull();

      fireEvent.click(btn);
      const p = container.querySelector('[data-testid="storm-calibration"]');
      expect(p, 'the calibration sentence must be on screen while the storm is').not.toBeNull();
      expect(p!.closest('[data-relief-live]'),
        'the volume\'s caption prints on a sheet whose figure is the calendar').not.toBeNull();
      expect(p!.closest('.br-no-print'), 'the caption is now hidden on screen too').toBeNull();
    } finally {
      stubbed.drawn = false;
    }
  });

  it('all three printable surfaces now carry a print rule, and the four unprintable ones still do not', () => {
    /*
     * WAS A COUNT OF ONE, AND THE COUNT WAS THE DEFECT. This asserted `['risk/StormRelief.tsx']` — E7 was
     * the only relief file that said anything about print at all, which is why E1's and E5's toggles and
     * their "nobody has yet timed whether it answers faster" sentences printed onto a board deck as UI
     * furniture. `GpsPrint.tsx:94` records the same class of defect in the same words ("a button printed on
     * a client proposal").
     *
     * The list is still a LIST rather than a ban in either direction: the four surfaces on pages with no
     * print sheet have nothing to say about print, and adding a rule to one of them without adding
     * `PrintStyles` to its page would be a rule that never fires. If that changes, this fails and says so.
     */
    const printable: readonly string[] = [
      'src/components/geometry/DeckRelief.tsx',
      'src/components/geometry/SurfaceRelief.tsx',
      'src/components/risk/StormRelief.tsx',
    ];
    const unprintable: readonly string[] = [
      'src/components/geometry/PipelineRelief.tsx',
      'src/components/geometry/VaultRelief.tsx',
      'src/components/geometry/OntologyOrrery.tsx',
      'src/components/market/GlobeRelief.tsx',
    ];
    expect(printable.length + unprintable.length, 'an empty list would make this pass without reading a file').toBe(7);

    const hasRule = (f: string) => {
      const src = read(f);
      return src.includes('br-no-print') || src.includes('@media print')
        || src.includes('data-relief-print-flat') || src.includes('data-relief-live');
    };
    expect(printable.filter((f) => !hasRule(f)),
      'a surface that reaches paper has nothing to say about what it prints').toEqual([]);
    expect(unprintable.filter(hasRule),
      'a surface on a page with no print sheet gained a print rule that can never fire').toEqual([]);
  });

  it('and the two print attributes are declared by the wrappers and the sheet, with no third owner', () => {
    /*
     * THE PAIR HAS TO STAY A PAIR. `[data-relief-live]` without `[data-relief-print-flat]` is a printed gap
     * where the figure was — "hiding the canvas and printing nothing is the same defect with fewer pixels".
     * A wrapper that sets one and not the other, or a sheet that styles one and not the other, is exactly
     * how that would arrive, and neither is visible from the other file.
     */
    const sheet = read('src/components/report/PrintStyles.tsx');
    for (const attr of ['[data-relief-live]', '[data-relief-print-flat]']) {
      expect(sheet.includes(attr), `PrintStyles no longer styles ${attr} for paper`).toBe(true);
    }
    for (const f of ['src/components/geometry/DeckRelief.tsx', 'src/components/geometry/SurfaceRelief.tsx',
      'src/components/risk/StormRelief.tsx']) {
      const src = read(f);
      expect(src.includes('data-relief-print-flat'), `${f} stopped rendering a flat form for print`).toBe(true);
      expect(src.includes('data-relief-live'), `${f} stopped marking its live block print-removable`).toBe(true);
    }
  });
});
