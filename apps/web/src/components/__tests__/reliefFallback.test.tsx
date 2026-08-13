import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, type RenderResult } from '@testing-library/react';
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
import { ForgeBackdrop } from '@/components/brand/ForgeBackdrop';
import { ForgePlate } from '@/components/brand/ForgePlate';
import { buildRiskField, type RiskFieldInput } from '@/components/risk/riskField';
import { buildSurfaceMesh, WITHHELD, type GridCellValue } from '@lcx/shared';
import type { DeckPanelDatum } from '@/components/geometry/deckSlots';
import type { OrreryEntityInput, OrreryCouplingInput } from '@/components/geometry/orrery/orreryLayout';
import type { MapPoint } from '@/lib/api/bd';
import type { BdFilters, BdLead } from '@/types/bd';

/**
 * §6 RULE 1, ON THE EIGHT SURFACES THAT ACTUALLY SHIP — "every environment has a flat fallback that is
 * not a downgrade in INFORMATION. SSR, print, no-WebGL and reduced-motion all resolve to the existing
 * surface."
 *
 * ── THE BLIND SPOT THIS FILE EXISTS TO CLOSE ─────────────────────────────────────────
 * Every mechanised check of rule 1 in this repo points at `docs/3d`. `scripts/3d-audit.mjs` drives
 * reduced motion, print and no-WebGL against the HARNESS pages, and `packages/gl/src/env/harnessRules.test.ts`
 * globs the `docs/3d` environment directories. Neither knows `apps/web` exists. The eight surfaces a reader actually meets —
 * DeckRelief, SurfaceRelief, PipelineRelief, VaultRelief, OntologyOrrery, GlobeRelief, StormRelief and
 * ForgeBackdrop — had no rule-1 verification at all, on any axis.
 *
 * Each of the seven relief surfaces already has its own test file, and each of those asserts the flat
 * DEFAULT and the Suspense fallback. None of them ever awaited the lazy chunk, so none of them had
 * exercised the refusal path they were written to protect: the assertion was that a reader who does
 * nothing keeps their data, never that a reader who clicks on a machine with no WebGL2 gets it back.
 *
 * ── WHAT MAKES THAT TESTABLE HERE, WITHOUT A MOCK ────────────────────────────────────
 * jsdom genuinely has no WebGL2: `canvas.getContext('webgl2')` returns null, so `createStage` returns a
 * real `NO_WEBGL2` StageRefusal from `packages/gl/src/stage.ts:167` — the same value a 2014 laptop or a
 * blocklisted driver produces. So the whole path is live, with nothing stubbed on the GL side: await the
 * lazy chunk, let the renderer's effect run, and read what the reader is left looking at.
 *
 * ── WHAT THESE TESTS CANNOT SHOW, SO THAT NOBODY READS MORE INTO THEM ────────────────
 * The SUCCESS path. jsdom rasterises nothing, so the DOM overlays that carry rule 4's text — the deck's
 * projected panel buttons, the vault's record lines, the globe's site labels — only exist once a frame has
 * been presented, and no assertion here reaches them. That half is `docs/3d/e1`–`e8`'s captures against a
 * real rasteriser. This file is about the four degraded media, which is where rule 1 lives.
 */

/* ── FIXTURES ─────────────────────────────────────────────────────────────────────── */

const SURFACE = buildSurfaceMesh({
  rows: [[0.31, 0.44, 0.52], [0.22, 0.36, 0.71], [null, 0.21, WITHHELD]] as readonly (readonly GridCellValue[])[],
  xAxis: { label: 'Ticket', unit: '$k', ticks: [25, 50, 100].map((v) => ({ value: v, label: String(v) })) },
  yAxis: { label: 'Days', unit: 'd', ticks: [7, 30, 90].map((v) => ({ value: v, label: String(v) })) },
  zAxis: { label: 'Win rate', unit: '', tickCount: 4 },
  frame: {
    environment: 'test', observedAt: '2026-08-12T00:00:00.000Z', windowFrom: null, windowTo: null,
    source: 'reliefFallback.test.tsx', valuesArePlaceholders: true,
  },
});

/* Three, not two: `DeckRelief` disables its own toggle below two panels, and a disabled toggle would
   make every assertion below pass without a GL context ever being asked for. */
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
const LEADS: readonly BdLead[] = [
  lead({ name: 'SABLE TREASURY', band: 'unscored', marketCapUsd: 240_000, updatedAt: isoDaysAgo(63) }),
  lead({ name: 'MERIDIAN PAY', band: 'high', marketCapUsd: 2_600_000, updatedAt: isoDaysAgo(41) }),
  lead({ name: 'ATLAS OTC', band: 'immediate', marketCapUsd: 4_200_000, updatedAt: isoDaysAgo(3) }),
];
const FILTERS: BdFilters = {
  market: null, minScore: 0, source: '', band: '', listedOnLcx: null, hasContact: null,
  marketRecommendation: '', sort: 'created', order: 'desc', search: '', tier: 'tracked',
};
const TABLE_PROPS = {
  leads: LEADS as BdLead[], filters: FILTERS, clarityEnacted: false,
  onSort: () => {}, onSelect: () => {}, loading: false,
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
      source: 'reliefFallback.test.tsx', observedAt: '2026-08-13T00:00:00.000Z',
      valuesArePlaceholders: true,
    },
  };
}
const FIELD = buildRiskField(riskInput());

const FLAT = <div data-testid="flat">the flat surface, exactly as the page renders it</div>;

/* ── THE ROSTER ───────────────────────────────────────────────────────────────────── */

interface Surface {
  /** The environment number in `3D_VFX_1000X.md` §2, so a failure names the environment. */
  readonly env: string;
  readonly name: string;
  /** Source path relative to `apps/web`, asserted to exist so the roster cannot rot silently. */
  readonly src: string;
  /** The control that opens the relief. */
  readonly toggle: RegExp;
  readonly mount: () => RenderResult;
  /** True while the reader still has the information the flat surface carries. */
  readonly flatIsShowing: (c: HTMLElement) => boolean;
}

const SURFACES: readonly Surface[] = [
  {
    env: 'E1', name: 'DeckRelief', src: 'src/components/geometry/DeckRelief.tsx', toggle: /theatre view/i,
    mount: () => render(<DeckRelief panels={PANELS}>{FLAT}</DeckRelief>),
    flatIsShowing: (c) => c.querySelector('[data-testid="flat"]') !== null,
  },
  {
    env: 'E2', name: 'GlobeRelief', src: 'src/components/market/GlobeRelief.tsx', toggle: /globe view/i,
    mount: () => render(<GlobeRelief points={POINTS}>{FLAT}</GlobeRelief>),
    flatIsShowing: (c) => c.querySelector('[data-testid="flat"]') !== null,
  },
  {
    env: 'E3', name: 'PipelineRelief', src: 'src/components/geometry/PipelineRelief.tsx', toggle: /channel view/i,
    mount: () => render(<MemoryRouter><PipelineRelief {...TABLE_PROPS} /></MemoryRouter>),
    /* E3's flat view is the incumbent lead table, and the triage keys act on its rows. */
    flatIsShowing: (c) => c.querySelector('table') !== null,
  },
  {
    env: 'E4', name: 'OntologyOrrery', src: 'src/components/geometry/OntologyOrrery.tsx', toggle: /orrery view/i,
    mount: () => render(
      <OntologyOrrery entities={ORRERY.entities} couplings={ORRERY.couplings} allCouplings={ORRERY.couplings}>
        {FLAT}
      </OntologyOrrery>,
    ),
    flatIsShowing: (c) => c.querySelector('[data-testid="flat"]') !== null,
  },
  {
    env: 'E5', name: 'SurfaceRelief', src: 'src/components/geometry/SurfaceRelief.tsx', toggle: /relief view/i,
    mount: () => render(<SurfaceRelief surface={SURFACE} title="Win rate" readsAs="Higher is better." heightPx={300} />),
    /* The flat engine draws an SVG; a missing SVG here is a reader left with the measurements gone. */
    flatIsShowing: (c) => c.querySelector('svg') !== null,
  },
  {
    env: 'E6', name: 'VaultRelief', src: 'src/components/geometry/VaultRelief.tsx', toggle: /vault view/i,
    mount: () => render(<VaultRelief entries={AUDIT}>{FLAT}</VaultRelief>),
    flatIsShowing: (c) => c.querySelector('[data-testid="flat"]') !== null,
  },
  {
    env: 'E7', name: 'StormRelief', src: 'src/components/risk/StormRelief.tsx', toggle: /storm view/i,
    mount: () => render(<StormRelief field={FIELD} title="Marketing risk" readsAs="Colour is a total." heightPx={240} />),
    flatIsShowing: (c) => c.querySelector('svg') !== null,
  },
];

/* ── THE HOST APIs THE RENDERERS MEASURE THEMSELVES AGAINST ──────────────────────── */

/*
 * jsdom reports every element as 0×0 and implements no `ResizeObserver`. Both have to be supplied, and
 * the reason is not convenience — it is that without them these components refuse for the WRONG reason
 * and the test proves nothing about rule 1:
 *
 *   · `DeckReliefGl.tsx:232` refuses `CANVAS_TOO_NARROW_FOR_PANEL_TEXT` below 480 CSS px, and
 *     `buildOrrery` refuses a canvas with no size, both BEFORE `createStage` is reached. A refusal that
 *     never asked for a GL context is not the no-WebGL2 axis.
 *   · `GlobeRelief.tsx:97` sizes its canvas from `getBoundingClientRect().height - 96`, so at 0×0 it
 *     never renders the relief at all and the toggle silently does nothing.
 *   · `OntologyOrreryGl.tsx:220` constructs `new ResizeObserver(...)` UNGUARDED. Measured with it absent:
 *     the throw inside the effect took React's whole subtree with it — `container.innerHTML` came back
 *     as the empty string and the flat diagram was gone, which is rule 1 inverted by the failure of the
 *     surface rule 1 protects. `GlobeRelief.tsx:108` guards exactly this call for exactly that reason.
 *     Every browser has had `ResizeObserver` since Safari 13.1, so the stub is what makes jsdom
 *     browser-like rather than what makes the test pass; the unguarded construction is reported
 *     separately and is not this file's to fix.
 */
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
const PANE = { width: 1200, height: 700 } as const;

beforeEach(() => {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = ResizeObserverStub;
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(PANE.width);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(PANE.height);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    width: PANE.width, height: PANE.height, top: 0, left: 0, right: PANE.width, bottom: PANE.height,
    x: 0, y: 0, toJSON: () => ({}),
  } as DOMRect);
});
afterEach(() => {
  delete (globalThis as { ResizeObserver?: unknown }).ResizeObserver;
  vi.restoreAllMocks();
});

/** Wait for the lazy chunk, the renderer's effect and the parent's state flip to all have happened. */
async function refusalNotice(container: HTMLElement): Promise<string> {
  await waitFor(
    () => { expect(container.querySelector('[role="alert"]')).not.toBeNull(); },
    { timeout: 8000 },
  );
  return container.querySelector('[role="alert"]')!.textContent ?? '';
}

/* ── AXIS 1 · NO WEBGL2 ──────────────────────────────────────────────────────────── */

describe('rule 1 · a real StageRefusal puts every shipping surface back on its flat view', () => {
  it('covers all eight shipping surfaces and no fewer', () => {
    /*
     * THE ROSTER IS THE POINT OF THIS FILE, so it is asserted rather than assumed. The blind spot being
     * closed was one of COVERAGE — `docs/3d` was checked and `apps/web` was not — and a table-driven
     * suite silently losing a row would recreate it in miniature.
     */
    const covered = SURFACES.map((s) => s.name);
    expect(covered).toEqual([
      'DeckRelief', 'GlobeRelief', 'PipelineRelief', 'OntologyOrrery',
      'SurfaceRelief', 'VaultRelief', 'StormRelief',
    ]);
    /* ForgeBackdrop is the eighth and is tested separately below: it has no toggle and no flat
       counterpart to swap to, because `ForgePlate` is painted underneath it at all times. */
    for (const s of [...SURFACES, { src: 'src/components/brand/ForgeBackdrop.tsx' }]) {
      const file = resolve(process.cwd(), s.src);
      expect(existsSync(file), `cannot find ${file} — the roster names a surface that has moved`).toBe(true);
    }
  });

  it.each(SURFACES.map((s) => [s.env, s.name, s] as const))(
    '%s %s — NO_WEBGL2 is named to the reader and the flat view comes back',
    async (_env, name, s) => {
      const { container } = s.mount();
      expect(container.querySelector('canvas'), `${name} must not draw before it is asked`).toBeNull();

      fireEvent.click(screen.getByRole('button', { name: s.toggle }));
      const notice = await refusalNotice(container);

      /*
       * THE CODE, NOT JUST "SOMETHING WENT WRONG". A refusal a reader cannot name is a refusal they
       * cannot report, and `NO_WEBGL2` specifically is what pins that the surface got as far as asking
       * the GPU — an earlier geometry or size refusal would arrive under a different code and would
       * prove nothing about this axis.
       */
      expect(notice, `${name} must name the refusal code`).toMatch(/NO_WEBGL2/);
      /* The canvas is GONE, not merely blank: a canvas that failed keeps its last frame — or nothing —
         and on a governed-action log or a risk calendar a stale picture read as live is the worst
         available outcome. */
      expect(container.querySelectorAll('canvas').length, `${name} left a dead canvas on screen`).toBe(0);
      /* And the information is back. This is the clause the audit had never checked on any of the
         eight: not "a fallback exists" but "the reader has their data". */
      expect(s.flatIsShowing(container), `${name} refused and left the reader with no flat view`).toBe(true);
    },
    20_000,
  );

  it.each(SURFACES.map((s) => [s.name, s] as const))(
    '%s — a refused control either withdraws itself or survives a retry with the data intact',
    async (name, s) => {
      /*
       * SIX OF THE SEVEN DISABLE THE CONTROL ONCE REFUSED, with the reason written in each file:
       * "offering a toggle that cannot work is worse than not offering one". `OntologyOrrery.tsx:150`
       * deliberately does NOT — it clears the refusal on click, because E4's refusals are mostly
       * graph-shaped (`THIRD_AXIS_BUYS_NOTHING`, a kind with no plane) and a reader who changed a filter
       * is entitled to another attempt. `NO_WEBGL2` is not retryable, so on that machine the control
       * offers a click that can only re-refuse.
       *
       * Asserting `disabled` uniformly would therefore fail on a difference that is defensible, so what
       * is pinned is the property that is NOT negotiable: whichever route a surface takes, the toggle
       * never claims to be showing a relief that refused, and a second click never costs the reader the
       * flat view. That second clause is the one only E4 can break, and the only one worth a test.
       */
      const { container } = s.mount();
      fireEvent.click(screen.getByRole('button', { name: s.toggle }));
      await refusalNotice(container);

      const btn = screen.getByRole('button', { name: s.toggle });
      expect(btn.getAttribute('aria-pressed'), `${name} reports itself pressed after refusing`).toBe('false');

      /* `disabled` and `aria-disabled` differ on focusability, not on the promise to the reader, so
         either counts as withdrawn. */
      const withdrawn = btn.hasAttribute('disabled') || btn.getAttribute('aria-disabled') === 'true';
      if (withdrawn) {
        expect(s.flatIsShowing(container), `${name} withdrew the control and the data with it`).toBe(true);
        return;
      }
      fireEvent.click(btn);
      await refusalNotice(container);
      expect(
        container.querySelectorAll('canvas').length,
        `${name} offers a retry and the retry left a dead canvas on screen`,
      ).toBe(0);
      expect(
        s.flatIsShowing(container),
        `${name} offers a retry that costs the reader the flat view`,
      ).toBe(true);
    },
    20_000,
  );

  it('E8 ForgeBackdrop — the plate is the fallback, and a refusal costs no information at all', async () => {
    /*
     * E8 IS THE ONE SURFACE WITH NO `onRefused`, and that is correct rather than an omission. It is
     * `aria-hidden` scenery on the sign-in screen: `ForgePlate` paints the gradient underneath it on the
     * first frame, before this chunk is even fetched, so there is no state in which a reader loses
     * anything. What has to hold is that the canvas never becomes VISIBLE without a frame behind it —
     * a shown-but-undrawn canvas over the plate would black out the sign-in screen.
     */
    const { container, unmount } = render(<><ForgePlate /><ForgeBackdrop /></>);
    await waitFor(
      () => { expect(container.querySelector('canvas')).not.toBeNull(); },
      { timeout: 8000 },
    );
    const canvas = container.querySelector('canvas')!;
    expect(canvas.style.display, 'the canvas must stay hidden until a frame exists').toBe('none');
    /* THE INFORMATION CLAIM, asserted rather than argued: E8 carries no text, no number and no label, so
       "not a downgrade in INFORMATION" is satisfied by there being none to lose. If this ever gains a
       caption, rule 1 acquires a real obligation here and this assertion is where it will surface. */
    expect(container.textContent, 'E8 must carry no information the plate cannot').toBe('');
    expect(container.querySelector('[aria-hidden="true"]'), 'E8 is scenery, and says so').not.toBeNull();
    /* Unmounting after a refusal must not throw: the disposer runs on a teardown that never allocated. */
    expect(() => unmount()).not.toThrow();
  }, 20_000);
});

/* ── AXIS 3 · REDUCED MOTION ─────────────────────────────────────────────────────── */

const GL_ENTRY_POINTS: readonly (readonly [string, string])[] = [
  ['E1 DeckReliefGl', 'src/components/geometry/DeckReliefGl.tsx'],
  ['E2 GlobeReliefGl', 'src/components/market/GlobeReliefGl.tsx'],
  ['E3 PipelineReliefGl', 'src/components/geometry/PipelineReliefGl.tsx'],
  ['E4 OntologyOrreryGl', 'src/components/geometry/OntologyOrreryGl.tsx'],
  ['E5 SurfaceReliefGl', 'src/components/geometry/SurfaceReliefGl.tsx'],
  ['E6 VaultReliefGl', 'src/components/geometry/VaultReliefGl.tsx'],
  ['E7 StormReliefGl', 'src/components/risk/StormReliefGl.tsx'],
];

/**
 * Source with COMMENTS stripped and string literals kept.
 *
 * Stripping comments is not cosmetic: every one of these seven files documents in prose that it does not
 * call `requestAnimationFrame`, so a naive `includes` over the raw text fails on the files that satisfy
 * the rule and would only pass on one that stopped explaining itself. String literals are deliberately
 * KEPT — `matchMedia('(prefers-reduced-motion: reduce)')` is the media query itself, and stripping it
 * would delete the one piece of evidence E8's branch is checked against.
 *
 * Line numbering is preserved (comments become blank space, not nothing) so the SSR scan below can report
 * a real file:line.
 */
function codeOf(rel: string): string {
  const file = resolve(process.cwd(), rel);
  expect(existsSync(file), `cannot find ${file} — this check would otherwise pass vacuously`).toBe(true);
  const src = readFileSync(file, 'utf8');
  expect(src.length, `${rel} is empty, so nothing below could fail`).toBeGreaterThan(500);
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
}

describe('rule 1 INVERTED · a missing browser API must not take the flat surface down with it', () => {
  /*
   * THE SHARPEST VERSION OF A RULE-1 FAILURE: not "the relief did not draw" but "the relief's failure
   * DESTROYED the surface rule 1 exists to preserve."
   *
   * `OntologyOrreryGl` called `new ResizeObserver(...)` unguarded. With the API absent the throw happened
   * inside an effect, and React escalates that to unmounting the WHOLE SUBTREE — so `container.innerHTML`
   * came back as the empty string, the flat diagram was gone, and the ReferenceError escaped as an
   * unhandled error into other test files. Measured both ways on this exact mount: 0 characters unguarded
   * against 1047 guarded.
   *
   * `GlobeRelief` had guarded the identical call for exactly this reason. This is the ratchet that was
   * missing, and its absence is WHY the defect survived: with the subtree gone there was nothing for a
   * fallback test to assert against, so E4's refusal path had never been reachable from a test at all.
   *
   * Every browser since Safari 13.1 has the API, so this is not live on a target browser. The value is
   * that the failure mode is now pinned rather than rediscovered.
   */
  const ORRERY_SURFACE = SURFACES.find((s) => s.name === 'OntologyOrrery');

  it('has a surface to test — the roster must still carry E4', () => {
    expect(ORRERY_SURFACE, 'OntologyOrrery left the roster; this suite would silently test nothing')
      .toBeDefined();
  });

  it('E4 keeps its flat diagram when ResizeObserver does not exist', async () => {
    const holder = globalThis as { ResizeObserver?: unknown };
    const saved = holder.ResizeObserver;
    delete holder.ResizeObserver;
    try {
      const s = ORRERY_SURFACE!;
      const { container } = s.mount();
      fireEvent.click(screen.getByRole('button', { name: s.toggle }));
      /* The lazy chunk has to resolve and its effect has to run before the throw can happen, so this must
         await the announcement rather than assert immediately — the same `refusalNotice` helper the roster
         suite above uses, for the same reason. */
      await refusalNotice(container);
      /*
       * THE CONTAINER FIRST, and the order matters: an empty container makes every assertion after it
       * vacuously true, which is how a suite reports green over a deleted subtree.
       */
      expect(container.innerHTML.length,
        'the subtree was unmounted — the relief failing took the flat diagram with it').toBeGreaterThan(0);
      expect(s.flatIsShowing(container), 'the flat view did not come back').toBe(true);
      /* And the reader must be TOLD, not just quietly returned to flat. */
      expect(container.querySelector('[role="alert"]'),
        'the refusal was not announced to assistive technology').not.toBeNull();
    } finally {
      if (saved === undefined) delete holder.ResizeObserver;
      else holder.ResizeObserver = saved;
    }
  });
});

describe('rule 3 · reduced motion resolves to the final frame, not to a faster animation', () => {
  it.each(GL_ENTRY_POINTS)(
    '%s schedules no frame after the first, so the frame it draws IS the final frame',
    (label, rel) => {
      /*
       * THE STRUCTURAL FORM OF RULE 3, AND IT IS THE HONEST ONE FOR THESE SEVEN.
       *
       * `harnessRules.test.ts:110` bans `requestAnimationFrame` and `setInterval` in the harness entry
       * points; nothing applied the same ban to the shipping renderers. It holds — all seven render
       * once, on demand, from an effect — and that is WHY none of them reads
       * `prefers-reduced-motion`: with no loop to shorten there is no "same animation, faster" state to
       * fall into, and the single frame already satisfies rule 3 by construction. The second assertion
       * is the load-bearing half: it is what would catch someone adding a motion branch here, which
       * would mean a loop had appeared for it to branch on.
       */
      const code = codeOf(rel);
      /* The stripper is checked against a file that DOES schedule frames — `ForgeBackdrop`, below —
         which is what stops this ban being a regex that quietly matches nothing. */
      for (const banned of ['requestAnimationFrame', 'setInterval', 'setTimeout']) {
        expect(code.includes(banned), `${label} schedules ${banned} — §6 rule 2 and rule 3`).toBe(false);
      }
      expect(
        code.includes('matchMedia'),
        `${label} branches on a media query, which means it has motion to reduce`,
      ).toBe(false);
    },
  );

  it('E8 ForgeBackdrop is the one renderer with a sweep, and it fails CLOSED on reduced motion', () => {
    /*
     * E8 has a five-second key-light arc, so it is the only one of the eight for which rule 3 is a real
     * branch. Two things are asserted, and the second is the one worth a test: the preference is read
     * from `matchMedia` and, when the preference CANNOT be read, `reduced` defaults to `true`. Defaulting
     * the other way would invent consent from a reader who never gave it — and it is a one-character
     * edit away from doing so.
     */
    const code = codeOf('src/components/brand/ForgeBackdrop.tsx');
    /* And this is also the control on the ban above: the stripper leaves E8's scheduling calls intact,
       so a `codeOf` that had stopped finding anything would fail HERE rather than pass seven times. */
    expect(code, 'the stripper must leave real code behind, or the ban above proves nothing').toContain('requestAnimationFrame');
    expect(code, 'the preference must be read for reduce, not for no-preference').toContain('prefers-reduced-motion');
    /*
     * THE WHOLE TERNARY, not a bare `: true`. Matching the default in isolation would also match any
     * unrelated `: true;` in the file, so the pattern walks from the media query through `.matches` to the
     * fallback — which is what makes it fail when the default is flipped to `false`, the only edit that
     * matters here.
     */
    expect(
      /prefers-reduced-motion[\s\S]{0,80}?\.matches[\s\S]{0,80}?:\s*true\s*;/.test(code),
      'with no way to read the preference, ForgeBackdrop must assume reduced motion rather than invent consent',
    ).toBe(true);
    /* THE SWEEP STOPS: the else branch clears the handle rather than scheduling another frame. A trailing
       rAF would be idle animation (§6 rule 2) on the one screen every operator and every stranger passes
       through, and this is the branch that decides it. */
    expect(code, 'the arc must stop instead of scheduling a further frame').toMatch(/else\s+rafRef\.current\s*=\s*null/);
  });

  it('E8 refuses without ever scheduling the sweep it was about to run', async () => {
    /*
     * The behavioural companion to the two structural checks above, and it is deliberately only E8: it is
     * the sole file that owns a `requestAnimationFrame` to leak, so it is the sole file where "a refusal
     * left a loop running against a canvas it gave up on" is representable at all. The other seven are
     * covered by having nothing to schedule.
     *
     * The mechanism is `ForgeBackdrop.tsx:138-144` bailing on the refused resource before the `reduced`
     * branch is even reached — so a machine with no WebGL2 gets the plate and zero frames, not a sweep
     * against a dead context.
     */
    const raf = vi.spyOn(globalThis, 'requestAnimationFrame');
    const { container, unmount } = render(<><ForgePlate /><ForgeBackdrop /></>);
    await waitFor(
      () => { expect(container.querySelector('canvas')).not.toBeNull(); },
      { timeout: 8000 },
    );
    unmount();
    expect(raf.mock.calls.length, 'a renderer that refused must not animate a canvas it cannot draw to').toBe(0);
  }, 20_000);
});

/* ── AXIS 4 · SERVER RENDER ──────────────────────────────────────────────────────── */

describe('rule 1 · a server render resolves to the flat surface instead of throwing', () => {
  it('renders all eight on the server, and only the scenery emits a canvas', async () => {
    /*
     * `renderToString` runs no effects and has no refs, so this is the medium in which a DOM global read
     * during module evaluation or the render phase becomes a 500 rather than a degraded picture. All
     * eight are exercised in one test because the interesting result is the TABLE — one surface throwing
     * while seven pass is the finding, and eight separate tests hide which.
     */
    const { renderToString } = await import('react-dom/server');
    const cases: readonly (readonly [string, () => string])[] = [
      ['E1 DeckRelief', () => renderToString(<DeckRelief panels={PANELS}>{FLAT}</DeckRelief>)],
      ['E2 GlobeRelief', () => renderToString(<GlobeRelief points={POINTS}>{FLAT}</GlobeRelief>)],
      ['E3 PipelineRelief', () => renderToString(<MemoryRouter><PipelineRelief {...TABLE_PROPS} /></MemoryRouter>)],
      ['E4 OntologyOrrery', () => renderToString(
        <OntologyOrrery entities={ORRERY.entities} couplings={ORRERY.couplings} allCouplings={ORRERY.couplings}>
          {FLAT}
        </OntologyOrrery>,
      )],
      ['E5 SurfaceRelief', () => renderToString(
        <SurfaceRelief surface={SURFACE} title="Win rate" readsAs="Higher is better." heightPx={300} />,
      )],
      ['E6 VaultRelief', () => renderToString(<VaultRelief entries={AUDIT}>{FLAT}</VaultRelief>)],
      ['E7 StormRelief', () => renderToString(
        <StormRelief field={FIELD} title="Marketing risk" readsAs="Colour is a total." heightPx={240} />,
      )],
    ];
    expect(cases.length, 'an empty case list would make every assertion below vacuous').toBe(7);

    for (const [label, run] of cases) {
      let html = '';
      expect(() => { html = run(); }, `${label} threw on the server`).not.toThrow();
      expect(html.length, `${label} server-rendered nothing`).toBeGreaterThan(200);
      /* NO CANVAS ON THE SERVER. The relief is opt-in and `useState(false)` is the server's value, so a
         canvas in this markup would mean a surface nobody has timed had become the server default. */
      expect(html.includes('<canvas'), `${label} server-rendered a canvas`).toBe(false);
    }

    /* E8 is the exception and is meant to be: its canvas is `aria-hidden` scenery over `ForgePlate`'s
       gradient, so the server emits an empty canvas the plate is already visible behind. */
    const forge = renderToString(<><ForgePlate /><ForgeBackdrop /></>);
    expect(forge).toContain('<canvas');
    expect(forge).toContain('aria-hidden="true"');
    expect(forge, 'the plate must be in the server markup, or the sign-in screen ships bare').toContain('radial-gradient');
  }, 20_000);

  it('no relief file touches document, window or navigator at module scope', () => {
    /*
     * `renderToString` above proves the render phase is clean; it cannot prove module evaluation is,
     * because jsdom supplies those globals to the importer. This is the complementary check, and it
     * covers the seven GL renderers too — which SSR never reaches today, and which a single eager
     * import away from being reached would.
     *
     * Module scope in this repo is column 0 and a component body is column 2, so anything reading a DOM
     * global from inside an effect or a callback is indented at least four. A match at three or fewer is
     * either module scope or a component body — a render-phase read — and both break SSR.
     */
    const files = [
      ...SURFACES.map((s) => s.src),
      ...GL_ENTRY_POINTS.map(([, rel]) => rel),
      'src/components/brand/ForgeBackdrop.tsx',
      'src/components/brand/ForgePlate.tsx',
    ];
    expect(files.length, 'an empty file list would make this pass without reading anything').toBe(16);
    const offenders: string[] = [];
    let seen = 0;
    for (const rel of files) {
      const code = codeOf(rel);
      code.split('\n').forEach((line, i) => {
        if (!/\b(document|window|navigator|localStorage|sessionStorage)\s*\./.test(line)) return;
        seen += 1;
        const indent = line.length - line.trimStart().length;
        if (indent < 4) offenders.push(`${rel}:${i + 1} ${line.trim()}`);
      });
    }
    /*
     * ASSERTED BEFORE THE VERDICT, and this repo has been bitten twice by the omission: a scan whose
     * pattern has quietly stopped matching reports an empty offender list, which is indistinguishable
     * from a clean result. Nine such reads exist across these sixteen files at the time of writing —
     * `window.devicePixelRatio` in each renderer, plus E8's theme and preference reads — so a zero here
     * means the regex broke, not that the code got safer.
     */
    expect(seen, 'the scan matched nothing at all, so its verdict below means nothing').toBeGreaterThan(0);
    expect(offenders, 'a DOM global read outside a callback makes the server render throw').toEqual([]);
  });
});
