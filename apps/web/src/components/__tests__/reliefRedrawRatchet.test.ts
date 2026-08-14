import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { buildSurfaceMesh, WITHHELD, type GridCellValue } from '@lcx/shared';
import { buildChannel } from '@/components/geometry/pipelineChannel';
import { buildRiskField, type RiskFieldInput } from '@/components/risk/riskField';
import SurfaceReliefGl from '@/components/geometry/SurfaceReliefGl';
import PipelineReliefGl from '@/components/geometry/PipelineReliefGl';
import VaultReliefGl from '@/components/geometry/VaultReliefGl';
import OntologyOrreryGl from '@/components/geometry/OntologyOrreryGl';
import GlobeReliefGl from '@/components/market/GlobeReliefGl';
import StormReliefGl from '@/components/risk/StormReliefGl';
import { __resetQualityTierForTests } from '@/components/shared/useQualityTier';
import type { MapPoint } from '@/lib/api/bd';
import type { BdLead } from '@/types/bd';

/**
 * §6 RULE 7 ON THE AXIS NOBODY WAS CHECKING: A DATA CHANGE MUST NOT BUILD A NEW GL CONTEXT.
 *
 * `glContextBudget.test.ts` counts how many contexts a ROUTE can hold at once. It cannot see the failure this
 * file exists to stop, which is the same context being torn down and rebuilt over and over on one route: every
 * relief renderer listed its DATASET in the dependency array of the effect that calls `createStage`, so a
 * filter, a page turn or a click disposed the stage — context, programs, meshes, shadow map, AO and DOF
 * targets — and built the whole thing again.
 *
 * ── WHAT THAT COST, MEASURED RATHER THAN ARGUED ──────────────────────────────────────
 * The census below drives each renderer through a COUNTING WebGL2 context (the instrument
 * `packages/gl/src/flat/sharedCost.test.ts` already uses for the flat path) and counts what one change to the
 * data actually asks the driver for. Before the split:
 *
 *   E2 GlobeReliefGl      1 context · 7 programs · 7 VAOs · 8 textures · 489,432 B — of which 415,836 B is
 *                         `sphere(EARTH_R, 56, 84)`, the planet, which is not data and never was
 *   E3 PipelineReliefGl   1 context · 7 programs · 9 VAOs · 8 textures · 142,092 B — and NOT ONE BYTE of this
 *                         scene's geometry is data; every lead is the same unit cube placed by a matrix
 *   E4 OntologyOrreryGl   1 context · 4 programs · 10 VAOs · 6 textures · 399,612 B, on every SELECTION
 *   E5 SurfaceReliefGl    1 context · 5 programs · 5 VAOs · 6 textures · 2,040 B
 *   E6 VaultReliefGl      1 context · 6 programs · 6 VAOs · 8 textures · 4,704 B
 *   E7 StormReliefGl      1 context · 6 programs · 9 VAOs · 9 textures · a fresh 3-D volume texture · 60,336 B
 *
 * After: **zero contexts, zero programs, zero shaders, zero textures, zero framebuffers on all six**, which is
 * what the case below asserts. What remains is the geometry that genuinely IS the data — E5's heightfield and
 * ribbons, E6's record slab, E2's pins and corridors, E4's deck and rings, E7's voxel grid — and E3, whose
 * redraw uploads no geometry at all.
 *
 * ── WHAT THIS FILE CANNOT MEASURE, STATED SO NOBODY READS MORE INTO IT ───────────────
 * MILLISECONDS. Node has no GPU and a fake context can be made to report any number you like, so nothing here
 * asserts a frame time. The figure this work is aimed at — 33.30 ms rebuilt against ~9.70 ms re-rendered on a
 * real M1 — belongs to that machine and is not re-derivable here. What IS assertable without a GPU is the
 * sequence of allocations the renderer asks for, and that is most of the story: compilation is essentially the
 * entire rebuild cost, and the count of programs compiled per data change is now zero rather than four to seven.
 */

/* ── A COUNTING WEBGL2 CONTEXT ────────────────────────────────────────────────────── */

interface GlHarness {
  /** WebGL2 contexts handed out. §6 rule 7's number. */
  contexts: () => number;
  /** GL calls by name. `createProgram`, `createTexture` and friends are the allocation counts. */
  counts: Record<string, number>;
  /** Bytes handed to `bufferData` / `texImage2D` / `texImage3D` / `texSubImage3D`. */
  bytes: () => number;
  reset: () => void;
  restore: () => void;
}

const byteLength = (a: unknown): number =>
  (a && typeof a === 'object' && 'byteLength' in (a as ArrayBufferView))
    ? (a as ArrayBufferView).byteLength : 0;

function installFakeGl(): GlHarness {
  let counts: Record<string, number> = {};
  let uploaded = 0;
  let contexts = 0;
  const bump = (n: string): void => { counts[n] = (counts[n] ?? 0) + 1; };

  /* Every SCREAMING_CASE property is a GL enum. Handing out a distinct number per name means the code under
     test can compare them and never accidentally find two equal, which a blanket `0` would. */
  const K = new Map<string, number>();
  let nextK = 0x10000;
  const konst = (name: string): number => {
    const found = K.get(name);
    if (found !== undefined) return found;
    const v = nextK++;
    K.set(name, v);
    return v;
  };

  const api: Record<string, (...a: never[]) => unknown> = {
    getExtension: ((name: string) => (name === 'WEBGL_debug_renderer_info'
      ? { UNMASKED_RENDERER_WEBGL: konst('UNMASKED_RENDERER_WEBGL') }
      : {})) as never,
    getError: () => 0,
    getShaderParameter: () => true,
    getProgramParameter: () => true,
    getShaderInfoLog: () => '',
    getProgramInfoLog: () => '',
    getUniformLocation: () => ({}),
    getAttribLocation: () => 0,
    checkFramebufferStatus: () => konst('FRAMEBUFFER_COMPLETE'),
    createShader: () => { bump('createShader'); return {}; },
    createProgram: () => { bump('createProgram'); return {}; },
    createTexture: () => { bump('createTexture'); return {}; },
    createFramebuffer: () => { bump('createFramebuffer'); return {}; },
    createRenderbuffer: () => { bump('createRenderbuffer'); return {}; },
    createBuffer: () => { bump('createBuffer'); return {}; },
    createVertexArray: () => { bump('createVertexArray'); return {}; },
    /* A REAL RENDERER STRING, so `isSoftwareRasteriser` does not classify this harness as SwiftShader and send
       every surface down a path no reader takes. */
    getParameter: ((p: number) => {
      if (p === konst('VIEWPORT')) return new Int32Array([0, 0, 1, 1]);
      if (p === konst('IMPLEMENTATION_COLOR_READ_TYPE')) return konst('UNSIGNED_BYTE');
      if (p === konst('IMPLEMENTATION_COLOR_READ_FORMAT')) return konst('RGBA');
      if (p === konst('UNMASKED_RENDERER_WEBGL')) return 'Apple M1 (counting harness)';
      if (p === konst('FRAMEBUFFER_BINDING')) return {};
      return 1;
    }) as never,
    bufferData: ((...a: unknown[]) => { bump('bufferData'); uploaded += byteLength(a[1]); }) as never,
    texImage2D: ((...a: unknown[]) => { bump('texImage2D'); uploaded += byteLength(a[a.length - 1]); }) as never,
    texImage3D: ((...a: unknown[]) => { bump('texImage3D'); uploaded += byteLength(a[a.length - 1]); }) as never,
    texSubImage3D: ((...a: unknown[]) => { bump('texSubImage3D'); uploaded += byteLength(a[a.length - 1]); }) as never,
    readPixels: () => { bump('readPixels'); },
  };

  const gl = new Proxy({}, {
    get(_t, prop) {
      if (typeof prop !== 'string') return undefined;
      if (/^[A-Z][A-Z0-9_]*$/.test(prop)) return konst(prop);
      const impl = api[prop];
      if (impl) return impl;
      /* Everything else is a counted void command — `bindVertexArray`, `drawElements`, `deleteTexture`. */
      return (...a: never[]) => { bump(prop); void a; return undefined; };
    },
  }) as unknown as WebGL2RenderingContext;

  const spy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    ((kind: string) => {
      if (kind !== 'webgl2') return null;
      contexts++;
      return gl;
    }) as never,
  );

  return {
    contexts: () => contexts,
    get counts() { return counts; },
    bytes: () => uploaded,
    reset(): void { counts = {}; uploaded = 0; },
    restore(): void { spy.mockRestore(); },
  } as GlHarness;
}

/* ── FIXTURES. Two of each, differing in VALUE, because the census is about a data change ───────────── */

const surfaceOf = (bump: number) => buildSurfaceMesh({
  rows: [
    [0.31 + bump, 0.44, 0.52, 0.61], [0.22, 0.36 + bump, 0.71, 0.55],
    [0.18, 0.21, 0.49, 0.64], [0.27, 0.33, 0.58, WITHHELD],
  ] as readonly (readonly GridCellValue[])[],
  xAxis: { label: 'Ticket', unit: '$k', ticks: [25, 50, 100, 250].map((v) => ({ value: v, label: String(v) })) },
  yAxis: { label: 'Days', unit: 'd', ticks: [7, 30, 90, 180].map((v) => ({ value: v, label: String(v) })) },
  zAxis: { label: 'Win rate', unit: '', tickCount: 4 },
  frame: {
    environment: 'test', observedAt: '2026-08-12T00:00:00.000Z', windowFrom: null, windowTo: null,
    source: 'reliefRedrawRatchet.test.ts', valuesArePlaceholders: true,
  },
});

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
const channelOf = (cap: number) => buildChannel([
  lead({ name: 'SABLE TREASURY', band: 'unscored', marketCapUsd: cap, updatedAt: isoDaysAgo(63) }),
  lead({ name: 'MERIDIAN PAY', band: 'high', marketCapUsd: 2_600_000, updatedAt: isoDaysAgo(41) }),
  lead({ name: 'ATLAS OTC', band: 'immediate', marketCapUsd: 4_200_000, updatedAt: isoDaysAgo(3) }),
], NOW);

const auditOf = (n: number) => Array.from({ length: n }, (_, i) => ({
  id: `a${i}`, actor: 'n.sharma', action: 'campaign_publish', entity: 'projects',
  entityId: `0191abcd-ef01-2345-6789-abcdef01234${i}`, meta: {}, projectName: 'Aster',
  createdAt: new Date(NOW - (i + 1) * 3_600_000).toISOString(),
}));

const ent = (id: string, kind: string) => ({ id, label: id, kind, record: {} });
const cpl = (s: string, t: string) => ({ id: `${s}-${t}`, source: s, target: t, kind: 'requires' });
const ORRERY_ENTITIES = [
  ent('HUB', 'license'), ent('A', 'requirement'), ent('B', 'requirement'),
  ent('P', 'product'), ent('Q', 'product'),
];
const ORRERY_COUPLINGS = [cpl('HUB', 'A'), cpl('HUB', 'B'), cpl('A', 'P'), cpl('B', 'Q')];
const orreryOf = (selectedId: string | null) => ({
  entities: ORRERY_ENTITIES, couplings: ORRERY_COUPLINGS, allCouplings: ORRERY_COUPLINGS,
  selectedId, flatCentres: null, flatHalfWidth: null,
});

const point = (over: Partial<MapPoint>): MapPoint => ({
  id: 'p1', name: 'Project One', ticker: 'ONE', marketCapUsd: 1_000_000, volume24hUsd: null,
  priceChange30d: null, category: null, region: 'eu', listedOnLcx: false, exchangeCount: 0,
  band: 'watch', priorityScore: 1, propensityScore: 1, euScore: null, usPreScore: null,
  usPostScore: null, recommendedMarket: null, ...over,
});
const pointsOf = (cap: number): readonly MapPoint[] => [
  point({ id: 'a', region: 'eu', marketCapUsd: cap, listedOnLcx: true }),
  point({ id: 'b', region: 'us' }),
];

const LANES = ['PAID_SEARCH', 'COMMUNITY'] as const;
const BANDS = ['ADVISORY', 'SEVERE'] as const;
function riskInput(scale: number): RiskFieldInput {
  const days = Array.from({ length: 6 }, (_, d) => ({ label: `D${d}`, state: 'observed' as const }));
  return {
    lanes: [...LANES], bands: [...BANDS], days,
    cells: LANES.map((_l, l) => days.map(() => BANDS.map((_b, b) => scale * (0.1 + 0.1 * l + 0.05 * b)))),
    reviewThreshold: 2.0, itemsLostToUnmeasuredDays: 0,
    frame: {
      source: 'reliefRedrawRatchet.test.ts', observedAt: '2026-08-13T00:00:00.000Z',
      valuesArePlaceholders: true,
    },
  };
}

/* ── THE ROSTER ───────────────────────────────────────────────────────────────────── */

const refusals: string[] = [];
const onRefused = (code: string): void => { refusals.push(code); };
const onRefused2 = (code: string, _reason: string): void => { refusals.push(code); };
const onReading = (): void => {};

interface Case {
  /** The environment number in `3D_VFX_1000X.md` §2, so a failure names the environment. */
  readonly env: string;
  readonly name: string;
  /** Source path relative to `src/components`, cross-checked against the derived roster below. */
  readonly src: string;
  readonly a: () => Record<string, unknown>;
  readonly b: () => Record<string, unknown>;
  readonly el: (p: Record<string, unknown>) => ReturnType<typeof createElement>;
}

const CASES: readonly Case[] = [
  {
    env: 'E5', name: 'SurfaceReliefGl', src: 'geometry/SurfaceReliefGl.tsx',
    a: () => ({ surface: surfaceOf(0), heightPx: 300, onRefused, contourLevels: [0.4] }),
    b: () => ({ surface: surfaceOf(0.05), heightPx: 300, onRefused, contourLevels: [0.4] }),
    el: (p) => createElement(SurfaceReliefGl, p as never),
  },
  {
    env: 'E3', name: 'PipelineReliefGl', src: 'geometry/PipelineReliefGl.tsx',
    a: () => ({ channel: channelOf(240_000), heightPx: 460, onRefused }),
    b: () => ({ channel: channelOf(310_000), heightPx: 460, onRefused }),
    el: (p) => createElement(PipelineReliefGl, p as never),
  },
  {
    env: 'E6', name: 'VaultReliefGl', src: 'geometry/VaultReliefGl.tsx',
    a: () => ({ entries: auditOf(4), heightPx: 460, onRefused }),
    b: () => ({ entries: auditOf(5), heightPx: 460, onRefused }),
    el: (p) => createElement(VaultReliefGl, p as never),
  },
  {
    env: 'E4', name: 'OntologyOrreryGl', src: 'geometry/OntologyOrreryGl.tsx',
    a: () => ({ input: orreryOf(null), onRefused: onRefused2, onReading }),
    b: () => ({ input: orreryOf('P'), onRefused: onRefused2, onReading }),
    el: (p) => createElement(OntologyOrreryGl, p as never),
  },
  {
    env: 'E2', name: 'GlobeReliefGl', src: 'market/GlobeReliefGl.tsx',
    a: () => ({ points: pointsOf(1_000_000), heightPx: 460, onRefused }),
    b: () => ({ points: pointsOf(2_400_000), heightPx: 460, onRefused }),
    el: (p) => createElement(GlobeReliefGl, p as never),
  },
  {
    env: 'E7', name: 'StormReliefGl', src: 'risk/StormReliefGl.tsx',
    a: () => ({ field: buildRiskField(riskInput(1)), heightPx: 240, onRefused }),
    b: () => ({ field: buildRiskField(riskInput(1.4)), heightPx: 240, onRefused }),
    el: (p) => createElement(StormReliefGl, p as never),
  },
];

/* jsdom reports every element as 0x0 and implements no `ResizeObserver`. Both have to be supplied or these
   components refuse for a size reason before `createStage` is reached, and the census would measure nothing —
   the same two stubs `reliefFallback.test.tsx:219-233` installs, for the same reason. */
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
const PANE = { width: 1200, height: 700 } as const;

let gl: GlHarness | null = null;

beforeEach(() => {
  refusals.length = 0;
  /* The probe resolves ONCE per page load and this module is one page load for the whole file. Reset per case,
     or the first surface's tier decision would change how many resources the later ones allocate on mount. */
  __resetQualityTierForTests();
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = ResizeObserverStub;
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(PANE.width);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(PANE.height);
  gl = installFakeGl();
});
afterEach(() => {
  cleanup();
  gl?.restore();
  gl = null;
  delete (globalThis as { ResizeObserver?: unknown }).ResizeObserver;
  vi.restoreAllMocks();
});

/** The allocations a data change is forbidden to make. Each one implies a torn-down and rebuilt context. */
const FORBIDDEN_ON_REDRAW = [
  'createProgram', 'createShader', 'createTexture', 'createFramebuffer', 'createRenderbuffer',
  /* Immutable 3-D storage. E7's volume is the one allocation whose SIZE is a property of the dataset, so it is
     the one a "keep the context" fix could leave behind — and reallocating it per update would put the whole
     grid back on the driver's allocator on every feed tick. */
  'texStorage3D',
] as const;

describe('a data change redraws; it does not rebuild the GL context', () => {
  it.each(CASES.map((c) => [c.env, c.name, c] as const))(
    '%s %s allocates nothing on a new dataset',
    (_env, name, c) => {
      const h = gl!;
      const { rerender } = render(c.el(c.a()));
      expect(refusals, `${name} refused on the counting context: ${refusals.join(', ')}`).toEqual([]);

      /*
       * THE MOUNT IS ASSERTED FIRST, and not as a formality. If the fake context were incomplete enough that
       * the renderer bailed out early, every "zero allocations on redraw" assertion below would pass while
       * measuring a component that never drew anything — the empty-loop failure this repo has been bitten by
       * twice, wearing a GL costume.
       */
      const mountContexts = h.contexts();
      const mount: Record<string, number> = { ...h.counts, __bytes: h.bytes() };
      expect(mountContexts, `${name} never asked for a WebGL2 context`).toBe(1);
      expect(mount.createProgram ?? 0, `${name} compiled no programs on mount`).toBeGreaterThanOrEqual(1);
      expect(mount.createVertexArray ?? 0, `${name} uploaded no meshes on mount`).toBeGreaterThanOrEqual(1);

      h.reset();
      act(() => { rerender(c.el(c.b())); });
      const change: Record<string, number> = { ...h.counts, __bytes: h.bytes() };

      const line = (t: string, m: Record<string, number>, ctx: number): string =>
        `${name} ${t}: contexts=${ctx} programs=${m.createProgram ?? 0} shaders=${m.createShader ?? 0}`
        + ` vaos=${m.createVertexArray ?? 0} bufferData=${m.bufferData ?? 0}`
        + ` textures=${m.createTexture ?? 0} framebuffers=${m.createFramebuffer ?? 0}`
        + ` vol3D=${m.texStorage3D ?? 0}alloc/${m.texSubImage3D ?? 0}upload bytes=${m.__bytes ?? 0}`;
      /* The per-surface numbers are RECORDED rather than pinned. A vertex count that moves because someone
         re-tessellates a torus is not a regression, and an assertion on it would fail for the wrong reason. */
      // eslint-disable-next-line no-console
      console.log(line('MOUNT ', mount, mountContexts));
      // eslint-disable-next-line no-console
      console.log(line('CHANGE', change, h.contexts() - mountContexts));

      expect(refusals, `${name} refused on the data change: ${refusals.join(', ')}`).toEqual([]);
      expect(h.contexts() - mountContexts,
        `${name} built a SECOND WebGL2 context for a data change. §6 rule 7: past the browser cap of 8-16 the`
        + ' OLDEST context is killed silently, and on a chart route that is the shared one — every chart on the'
        + ' page blanks and it reads as a data bug. The dataset belongs in a redraw, not in the setup effect.')
        .toBe(0);
      for (const call of FORBIDDEN_ON_REDRAW) {
        expect(change[call] ?? 0,
          `${name} called ${call} ${change[call]} times on a data change. Nothing a dataset changes can require`
          + ' a new program, shader, texture, framebuffer or renderbuffer — those all belong to the size and the'
          + ' quality tier, and allocating one means the stage was torn down and rebuilt.')
          .toBe(0);
      }
    },
  );
});

/* ── THE RATCHET, DERIVED FROM THE SOURCE ────────────────────────────────────────── */

/**
 * WHY THIS PARSES RATHER THAN ENUMERATES.
 *
 * Every recurring defect in this repo has been a hand-list that could not fail on an item nobody thought of,
 * and this defect was itself found by an audit rather than by a gate — it was live in all seven renderers at
 * once. So the roster is globbed, the data props are read off each component's own props interface, and the
 * dependency array is read off the effect that actually calls `createStage`. A renderer added tomorrow is
 * checked tomorrow, with no edit here.
 *
 * COMMENTS ARE STRIPPED BEFORE ANY MATCH. Prose has counted as code twice in this repo:
 * `glContextBudget.test.ts` counted four `sharedRenderer(` call sites of which three were header comments, and
 * the same file read `<OntologyOrrery>` inside a backticked sentence as a second JSX mount site. A paragraph
 * in one of these files that mentions `createStage(` would otherwise make it a context owner.
 */
const COMPONENTS = resolve(process.cwd(), 'src/components');

const withoutComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

function walk(root: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(root)) {
    const full = join(root, entry);
    if (statSync(full).isDirectory()) {
      if (entry !== '__tests__' && entry !== 'node_modules') out.push(...walk(full));
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

/**
 * A prop is DATA unless its declared type is a number, a boolean or a function.
 *
 * Stated as an EXCLUSION rather than a list of data types on purpose. `heightPx: number` and
 * `onRefused: (code: string) => void` are the two shapes that legitimately belong to the setup effect — a size
 * and a callback — and everything else a caller can hand a renderer is something the frame is drawn FROM. A
 * rule written the other way round ("an array or an object is data") would have missed `contourLevels`, which
 * is `readonly number[]`, and would miss the first prop somebody declares as a branded string.
 */
const isDataType = (t: string): boolean => {
  const s = t.trim().replace(/\|\s*null$/, '').replace(/\|\s*undefined$/, '').trim();
  if (/^(number|boolean)$/.test(s)) return false;
  /* A function type: `(a: X) => Y`. Matched on the arrow rather than on the name, because these are inline. */
  if (/=>/.test(s)) return false;
  return true;
};

interface Owner {
  readonly id: string;
  readonly propsName: string | null;
  readonly dataProps: readonly string[];
  /** The dependency array of the effect that calls `createStage`, or null when it could not be parsed. */
  readonly setupDeps: readonly string[] | null;
}

const OWNERS: readonly Owner[] = (existsSync(COMPONENTS) ? walk(COMPONENTS) : [])
  .map((file) => ({ file, src: withoutComments(readFileSync(file, 'utf8')) }))
  .filter(({ src }) => /createStage\s*\(/.test(src))
  .map(({ file, src }): Owner => {
    const fn = /export (?:default )?function \w+\(\s*\{([^}]*)\}\s*:\s*(\w+)/.exec(src);
    const propsName = fn ? fn[2]! : null;
    const iface = propsName
      ? new RegExp(`interface ${propsName} \\{([\\s\\S]*?)\\n\\}`).exec(src) : null;
    const dataProps: string[] = [];
    for (const line of (iface?.[1] ?? '').split('\n')) {
      const p = /readonly\s+(\w+)\??\s*:\s*(.+?);\s*$/.exec(line);
      if (p && isDataType(p[2]!)) dataProps.push(p[1]!);
    }
    /*
     * THE SETUP EFFECT IS THE ONE CONTAINING `createStage`, and its dependency array is the first
     * `\n  }, [...]);` after it — the two-space indent is a `useEffect` closing at component-body level, which
     * is where every one of these lives. A file where that cannot be found is reported as a parse failure
     * rather than skipped: a censor that silently finds nothing is a green test that checks nothing.
     */
    const at = src.indexOf('createStage(');
    const closing = /\n {2}\}, \[([^\]]*)\]\)/.exec(src.slice(at));
    const setupDeps = closing
      ? closing[1]!.split(',').map((d) => d.trim()).filter((d) => d.length > 0)
      : null;
    return { id: relative(COMPONENTS, file), propsName, dataProps, setupDeps };
  });

/**
 * Renderers still listing their data in the setup effect, with the reason, as an ADMISSION and not an exemption.
 *
 * The assertion below fails if an entry stops being true, which is the discipline `glContextBudget.test.ts`
 * uses for `EXCLUSIVE_MOUNTS`: an entry here cannot quietly become the place unfixed renderers live, because
 * fixing one WITHOUT deleting its line turns this file red.
 */
const PENDING = new Map<string, { readonly props: readonly string[]; readonly why: string }>([
  ['geometry/DeckReliefGl.tsx', {
    props: ['panels'],
    why: 'E1 already hoists its redraw into a ref (DeckReliefGl.tsx:205-213) and is the reference the other six'
      + ' were generalised from — but its ref carries the ADDRESSED PANEL, not the dataset, so `panels` is still'
      + ' in the setup effect at DeckReliefGl.tsx:718 and a new deck still rebuilds the context. It was owned by'
      + ' a concurrent worktree in the change that fixed the other six and is deliberately untouched here.',
  }],
]);

describe('no relief renderer lists its data in the effect that builds the GL context', () => {
  it('finds context-owning components and their data props at all', () => {
    /* Three floors, because each census below is silently vacuous if its own glob comes back empty — which is
       how this class of guard dies. Eight today: seven reliefs plus `brand/ForgeBackdrop.tsx`, which carries no
       dataset at all and therefore passes the rule by having nothing to violate it with. */
    expect(existsSync(COMPONENTS), `cannot find ${COMPONENTS}`).toBe(true);
    expect(OWNERS.length, 'no createStage call sites found under src/components')
      .toBeGreaterThanOrEqual(8);
    for (const o of OWNERS) {
      expect(o.propsName, `${o.id} calls createStage but no props interface could be parsed for it`).not.toBeNull();
      expect(o.setupDeps,
        `${o.id} calls createStage but its effect's dependency array could not be parsed, so the assertion`
        + ' below would pass without checking anything').not.toBeNull();
    }
    /* And the classifier must actually classify. If `isDataType` broke, every renderer would report zero data
       props and the whole file would go green while asserting nothing. */
    const withData = OWNERS.filter((o) => o.dataProps.length > 0);
    expect(withData.length,
      `only ${withData.length} of ${OWNERS.length} context owners have a data prop — the classifier is broken`)
      .toBeGreaterThanOrEqual(7);
  });

  it('the derived roster covers every renderer the cost census drives', () => {
    /* The two halves of this file must be about the same components. A renderer that moved would otherwise be
       measured by one and ratcheted by neither. */
    const ids = new Set(OWNERS.map((o) => o.id));
    for (const c of CASES) {
      expect(ids.has(c.src), `${c.src} is measured above but is not in the derived context-owner roster`).toBe(true);
    }
  });

  it('every context owner keeps its data out of the setup effect', () => {
    let checked = 0;
    for (const o of OWNERS) {
      if (o.dataProps.length === 0) continue;
      checked++;
      const listed = o.dataProps.filter((p) => o.setupDeps!.includes(p));
      const pending = PENDING.get(o.id);
      const allowed = pending ? [...pending.props].sort() : [];
      expect(listed.sort(), pending
        ? `${o.id} is in PENDING for [${allowed.join(', ')}] but now lists [${listed.join(', ')}].`
          + ` If it is FIXED, delete its PENDING entry. Reason on record: ${pending.why}`
        : `${o.id} lists its data — [${listed.join(', ')}] — in the dependency array of the effect that calls`
          + ' createStage, so a data change disposes the stage and rebuilds the context, the programs, the'
          + ' meshes and every target. Hoist the redraw into a ref the way DeckReliefGl.tsx:205-213 does and'
          + ' leave only the size, the callbacks and the quality tier in this array.')
        .toEqual(allowed);
    }
    expect(checked, 'no context owner with a data prop was checked — the loop above proved nothing')
      .toBeGreaterThanOrEqual(7);
  });

  it('the redraw is synchronous — no renderer schedules a frame it does not draw', () => {
    /*
     * §6 RULE 2, ON THE SURFACES RATHER THAN THE HARNESSES.
     *
     * `packages/gl/src/env/harnessRules.test.ts:110-120` bans `requestAnimationFrame` and `setInterval` in
     * every `docs/3d/eN/entry.ts` and in its built bundle. Nothing made the same demand of `apps/web`, and
     * "redraw on data arrival" is exactly the change that would tempt someone to schedule one — a frame queued
     * for the next tick is a frame that can land after the data it draws has been replaced, and a scheduler
     * left behind by a disposed context is an idle animation nobody meant to write.
     *
     * Every redraw in these files is called straight from an effect and returns having presented, so this is a
     * ratchet on a property that holds today rather than a discovery. Rule 3 needs no separate check here
     * because there is no transition to resolve: a redraw's final frame is its only frame.
     */
    let checked = 0;
    for (const o of OWNERS) {
      /* ForgeBackdrop is the deliberate exception and it is derived, not named: it is the only context owner
         with no data prop, because its subject is a forge rather than a dataset, and `MOTION_POLICY` governs
         its animation instead. A renderer that carries data has nothing to animate between frames. */
      if (o.dataProps.length === 0) continue;
      checked++;
      const src = withoutComments(readFileSync(join(COMPONENTS, o.id), 'utf8'));
      for (const banned of ['requestAnimationFrame', 'setInterval', 'setTimeout']) {
        expect(src.includes(banned),
          `${o.id} calls ${banned}. §6 rule 2 forbids idle animation, and a redraw scheduled for a later tick`
          + ' can also land after its own data has been replaced or after its context has been disposed.')
          .toBe(false);
      }
    }
    expect(checked, 'no data-carrying renderer was checked for schedulers').toBeGreaterThanOrEqual(7);
  });

  it('every PENDING entry is still a real, unfixed violation', () => {
    for (const [id, entry] of PENDING) {
      const owner = OWNERS.find((o) => o.id === id);
      expect(owner, `PENDING names ${id}, which no longer owns a GL context`).toBeDefined();
      const listed = owner!.dataProps.filter((p) => owner!.setupDeps!.includes(p)).sort();
      expect(listed,
        `PENDING records ${id} as still listing [${[...entry.props].sort().join(', ')}]; it now lists`
        + ` [${listed.join(', ')}]. A stale admission is how an exemption list becomes the place unfixed`
        + ' renderers live — delete the entry.')
        .toEqual([...entry.props].sort());
    }
  });
});

describe('the shape caches hold when only the values move', () => {
  /*
   * E4 AND E7 CACHE ON A SHAPE KEY RATHER THAN REDRAWING FROM SCRATCH, and that is the half of the fix a
   * count of contexts cannot see. Both allocate geometry whose SIZE is a property of the dataset — E4's deck
   * plane and one torus per shell radius, E7's 3-D volume texture at lane x band x day — so "keep one context"
   * is not enough on its own: without the key, every update would still reallocate those.
   *
   * These are the two cases where the key earns its place, and they are the common ones:
   *   · E4 — a new `input` OBJECT carrying the same graph. The wrapper memoises it (`OntologyOrrery.tsx:129`),
   *     but a memo is one edit away from being lost, and the failure would be silent.
   *   · E7 — the same channels over the same horizon with new severities, which is what a feed update IS.
   */
  it('E4 uploads NOTHING for a graph whose layout has not moved', () => {
    const h = gl!;
    const { rerender } = render(createElement(OntologyOrreryGl,
      { input: orreryOf(null), onRefused: onRefused2, onReading } as never));
    expect(refusals, `OntologyOrreryGl refused: ${refusals.join(', ')}`).toEqual([]);
    expect(h.counts.createVertexArray ?? 0, 'the mount uploaded no meshes, so the rerun proves nothing')
      .toBeGreaterThanOrEqual(1);

    h.reset();
    act(() => {
      rerender(createElement(OntologyOrreryGl,
        { input: orreryOf(null), onRefused: onRefused2, onReading } as never));
    });
    expect(h.counts.createVertexArray ?? 0,
      'E4 re-uploaded its deck and rings for a graph that produced the same deck size and the same shell radii')
      .toBe(0);
    expect(h.bytes(), 'E4 sent bytes to the GPU for a layout that did not move').toBe(0);
  });

  it('E7 re-uploads the grid and reallocates nothing when the field keeps its shape', () => {
    const h = gl!;
    const { rerender } = render(createElement(StormReliefGl,
      { field: buildRiskField(riskInput(1)), heightPx: 240, onRefused } as never));
    expect(refusals, `StormReliefGl refused: ${refusals.join(', ')}`).toEqual([]);
    /* `createVolumeField` allocates with `texStorage3D` (`packages/gl/src/env/volume.ts:399`) and fills with
       `texSubImage3D`, so the allocation to watch is the immutable storage call, not `texImage3D`. */
    expect(h.counts.texStorage3D ?? 0, 'the mount allocated no volume texture').toBeGreaterThanOrEqual(1);

    h.reset();
    act(() => {
      rerender(createElement(StormReliefGl,
        { field: buildRiskField(riskInput(2)), heightPx: 240, onRefused } as never));
    });
    expect(h.counts.texStorage3D ?? 0,
      'E7 allocated a NEW 3-D texture for a field with the same lane, band and day counts')
      .toBe(0);
    expect(h.counts.createVertexArray ?? 0,
      'E7 re-uploaded its floor and fence meshes, whose widths depend on the lane count and nothing else')
      .toBe(0);
    /* And the grid IS re-uploaded, because the severities really did change. A cache that skipped this would
       leave the previous reading on screen under a new caption — the failure mode the cache must not have. */
    expect(h.counts.texSubImage3D ?? 0, 'E7 did not re-upload the voxel grid, so the frame is stale data')
      .toBeGreaterThanOrEqual(1);
  });
});
