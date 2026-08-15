import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { buildSurfaceMesh, WITHHELD, type GridCellValue } from '@lcx/shared';
import { buildChannel } from '@/components/geometry/pipelineChannel';
import { hexToLinear, luminance, toneMapComposite, encodeOutput, BRAND_HEX, statusHex } from '@lcx/gl';
import { sceneTheme } from '@lcx/gl/look/theme.js';
import SurfaceReliefGl from '@/components/geometry/SurfaceReliefGl';
import VaultReliefGl from '@/components/geometry/VaultReliefGl';
import PipelineReliefGl from '@/components/geometry/PipelineReliefGl';
import { __resetQualityTierForTests } from '@/components/shared/useQualityTier';
import type { AuditEntry } from '@/lib/api/audit';
import type { BdLead } from '@/types/bd';

/**
 * THE ENVIRONMENTS HAVE TO WORK ON THE THEME THE PLATFORM ACTUALLY DEFAULTS TO.
 *
 * `index.html` adds `.dark` only from a stored preference and four pages strip it to print, so LIGHT is the
 * ordinary case — and until this change seven of the eight shipping 3-D surfaces had no theme adaptation at
 * all. Every `dark` token in them was prose inside a comment. The reader who had never opened the settings got
 * a near-black instrument interior painted onto a white card.
 *
 * ── WHAT THIS FILE PINS, AND WHY EACH ONE IS DERIVED RATHER THAN LISTED ──────────────
 * Every census below finds its own subjects by reading `src/components` for `createStage` call sites, the same
 * way `reliefRedrawRatchet.test.ts` does. A hand-written roster is the recurring defect this repo keeps paying
 * for: it cannot fail on a renderer nobody thought of, and this programme adds renderers.
 *
 *   1 · every context owner either themes or has a RECORDED refusal, and a stale refusal fails
 *   2 · every themed owner installs the observer, the print hook and both teardowns
 *   3 · a theme change REDRAWS and does not rebuild the context (§6 rule 7 on the theme axis)
 *   4 · the light rig's ratios, including that dark is arithmetic identity
 *   5 · the contrast numbers the surfaces' comments claim, so a token edit cannot quietly break them
 *   6 · E7's refusal is still a live refutation, with the condition that would end it
 *
 * ── WHAT THIS FILE CANNOT MEASURE, SAID PLAINLY ──────────────────────────────────────
 * THE RENDERED PIXEL OF A LIT SURFACE. Node has no GPU. Everything asserted here is either source structure or
 * arithmetic on ALBEDOS and CSS colours through the engine's own tone map and sRGB encode — which is exactly
 * what the surfaces' own comments claim, and no more. The claim "the light theme looks right" is not made here
 * and is not made anywhere: `apps/web` has no capture harness, and that gap is the one thing this work could
 * not close.
 */

/* ── A COUNTING WEBGL2 CONTEXT. The same instrument `reliefRedrawRatchet.test.ts` uses, cut down to the
   allocations this file needs to distinguish a redraw from a rebuild. ─────────────────────────────── */

interface GlHarness {
  contexts: () => number;
  counts: Record<string, number>;
  reset: () => void;
  restore: () => void;
}

function installFakeGl(): GlHarness {
  let counts: Record<string, number> = {};
  let contexts = 0;
  const bump = (n: string): void => { counts[n] = (counts[n] ?? 0) + 1; };

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
    bufferData: () => { bump('bufferData'); },
    texImage2D: () => { bump('texImage2D'); },
    texImage3D: () => { bump('texImage3D'); },
    texSubImage3D: () => { bump('texSubImage3D'); },
    readPixels: () => { bump('readPixels'); },
  };

  const gl = new Proxy({}, {
    get(_t, prop) {
      if (typeof prop !== 'string') return undefined;
      if (/^[A-Z][A-Z0-9_]*$/.test(prop)) return konst(prop);
      const impl = api[prop];
      if (impl) return impl;
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
    reset(): void { counts = {}; },
    restore(): void { spy.mockRestore(); },
  } as GlHarness;
}

/* ── THE DERIVED ROSTER ───────────────────────────────────────────────────────────── */

const COMPONENTS = resolve(__dirname, '..');

const walk = (dir: string): string[] => readdirSync(dir).flatMap((n) => {
  const full = join(dir, n);
  return statSync(full).isDirectory() ? walk(full) : (/\.tsx?$/.test(n) ? [full] : []);
});

/* Block comments are stripped before every structural test below, so a file that merely TALKS about
   `sceneTheme` in prose — which several of them do at length — cannot satisfy a check for calling it. That is
   the exact failure mode this whole programme was named after: `dark` tokens that were only ever comments. */
const withoutComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

interface Owner {
  readonly id: string;
  readonly src: string;
  /** True when the file has a prop that is plainly a DATASET rather than a size or a callback. */
  readonly carriesData: boolean;
}

const OWNERS: readonly Owner[] = walk(COMPONENTS)
  .filter((f) => !f.includes('__tests__'))
  .map((file) => ({ file, src: withoutComments(readFileSync(file, 'utf8')) }))
  .filter(({ src }) => /createStage\s*\(/.test(src))
  .map(({ file, src }): Owner => ({
    id: relative(COMPONENTS, file),
    src,
    /* DERIVED FROM THE PROPS INTERFACE, not from the file name: a renderer whose subject is a dataset has a
       prop that is neither a number nor a function. `ForgeBackdrop` has only `intensity?: number` and is
       therefore correctly excluded — it themes already, and it is the reference the rest were built from. */
    carriesData: (/interface \w+Props \{([\s\S]*?)\n\}/.exec(src)?.[1] ?? '')
      .split('\n')
      .some((l) => {
        const m = /readonly\s+\w+\??\s*:\s*(.+?);\s*$/.exec(l);
        if (!m) return false;
        const t = m[1]!.trim();
        return !/^number$/.test(t) && !/=>/.test(t) && !/^string$/.test(t) && !/^boolean$/.test(t);
      }),
  }));

/**
 * The surfaces that are NOT themed, with the refutation, as an ADMISSION rather than an exemption.
 *
 * The assertion below fails if an entry stops being true — the same discipline `reliefRedrawRatchet.test.ts`
 * uses for `PENDING` — so fixing one WITHOUT deleting its line turns this file red, and an entry cannot
 * quietly become the place unthemed renderers live.
 */
const NOT_THEMED = new Map<string, string>([
  ['risk/StormReliefGl.tsx',
    'E7 THE STORM. The volume composites ONE, ONE_MINUS_SRC_ALPHA over the floor, so on a light ground more'
    + ' accumulation must mean a DARKER pixel — and the severity ramp runs brand blue to reference orange,'
    + ' whose linear luminances are 0.18271 and 0.39774. Higher severity is therefore intrinsically LIGHTER,'
    + ' and the two requirements are opposed. Measured at the shipped exposures the severe end of the ramp'
    + ' falls from 5.06:1 over the dark tile to 1.28:1 over the light ground while the calm end holds at'
    + ' 2.50:1 — the reading inverted. Re-exposing cannot fix it either: preserving the order needs'
    + ' s_hi < 0.4594 x s_lo, which flattens the whole ramp to 1.0% of its low end. The arithmetic is in the'
    + ' file header and case 6 below keeps it live.'],
]);

/* ── ARITHMETIC HELPERS. The same WCAG expressions the surfaces use, so the numbers agree. ─────────── */

const relLum = (r: number, g: number, b: number): number => {
  const f = (v: number): number => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratioOf = (a: number, b: number): number => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
const bytesOf = (c: readonly [number, number, number]): [number, number, number] =>
  encodeOutput(c).map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255)) as [number, number, number];
const hexBytes = (hex: string): [number, number, number] =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
/** Albedo → the bytes a swatch of it would be, which is what a contrast checker would read off the palette. */
const albedo = (hex: string): [number, number, number] => bytesOf(hexToLinear(hex));
/** A linear radiance → the bytes this pipeline's tone map and encode actually write. */
const shown = (c: readonly [number, number, number]): [number, number, number] =>
  bytesOf(toneMapComposite(c));
const scale = (c: readonly [number, number, number], k: number): [number, number, number] =>
  [c[0] * k, c[1] * k, c[2] * k];
const add = (a: readonly [number, number, number], b: readonly [number, number, number]):
[number, number, number] => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
/** Source-over in sRGB bytes — the compositor's own order, which is why the alpha is applied before `relLum`. */
const over = (
  bg: readonly [number, number, number], a: number, fg: readonly [number, number, number],
): [number, number, number] => [0, 1, 2].map((i) => bg[i]! + a * (fg[i]! - bg[i]!)) as [number, number, number];

const AA = 4.5;
/** WCAG 2.2 SC 1.4.11 — a graphical object that carries information. The strokes and the rings are these. */
const NON_TEXT = 3;
const CARD_LIGHT: [number, number, number] = [255, 255, 255];
const CARD_DARK: [number, number, number] = [16, 24, 43];

/* ── FIXTURES ─────────────────────────────────────────────────────────────────────── */

const surfaceOf = () => buildSurfaceMesh({
  rows: [
    [0.31, 0.44, 0.52, 0.61], [0.22, 0.36, 0.71, 0.55],
    [0.18, 0.21, 0.49, 0.64], [0.27, 0.33, 0.58, WITHHELD],
  ] as readonly (readonly GridCellValue[])[],
  xAxis: { label: 'Ticket', unit: '$k', ticks: [25, 50, 100, 250].map((v) => ({ value: v, label: String(v) })) },
  yAxis: { label: 'Days', unit: 'd', ticks: [7, 30, 90, 180].map((v) => ({ value: v, label: String(v) })) },
  zAxis: { label: 'Win rate', unit: '', tickCount: 4 },
  frame: {
    environment: 'test', observedAt: '2026-08-12T00:00:00.000Z', windowFrom: null, windowTo: null,
    source: 'reliefTheme.test.tsx', valuesArePlaceholders: true,
  },
});

const NOW = Date.parse('2026-08-13T00:00:00.000Z');
const auditOf = (n: number): readonly AuditEntry[] => Array.from({ length: n }, (_, i) => ({
  id: `a${i}`, actor: 'n.sharma', action: 'campaign_publish', entity: 'projects',
  entityId: `0191abcd-ef01-2345-6789-abcdef01234${i}`, meta: {}, projectName: 'Aster',
  createdAt: new Date(NOW - (i + 1) * 3_600_000).toISOString(),
})) as unknown as readonly AuditEntry[];

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
const channelOf = () => buildChannel([
  lead({ name: 'SABLE TREASURY', band: 'unscored', marketCapUsd: 900_000, updatedAt: isoDaysAgo(63) }),
  lead({ name: 'MERIDIAN PAY', band: 'high', marketCapUsd: 2_600_000, updatedAt: isoDaysAgo(41) }),
  lead({ name: 'ATLAS OTC', band: 'immediate', marketCapUsd: 4_200_000, updatedAt: isoDaysAgo(3) }),
], NOW);

let gl: GlHarness | null = null;
const refusals: string[] = [];
const onRefused = (code: string): void => { refusals.push(code); };

beforeEach(() => {
  refusals.length = 0;
  __resetQualityTierForTests();
  document.documentElement.className = '';
  gl = installFakeGl();
  /* A REAL SIZE. `clientWidth` is 0 in jsdom, and `DeckReliefGl` refuses below 480 px — a suite that measured
     nothing because every surface refused would pass every assertion in it. */
  vi.spyOn(HTMLCanvasElement.prototype, 'clientWidth', 'get').mockReturnValue(960);
  vi.spyOn(HTMLCanvasElement.prototype, 'clientHeight', 'get').mockReturnValue(420);
});
afterEach(() => {
  cleanup();
  gl?.restore();
  vi.restoreAllMocks();
  document.documentElement.className = '';
});

/* ══ 1 · EVERY CONTEXT OWNER EITHER THEMES OR HAS A RECORDED REFUSAL ═════════════════════════════ */

describe('every 3-D surface answers to the page theme, or says in writing why it cannot', () => {
  it('finds the context owners at all, and finds their data props', () => {
    /* Two floors, because each census below is vacuous if its glob comes back empty — which is how this class
       of guard dies. Eight today: seven reliefs plus `brand/ForgeBackdrop.tsx`. */
    expect(OWNERS.length, 'no createStage call sites found under src/components')
      .toBeGreaterThanOrEqual(8);
    const withData = OWNERS.filter((o) => o.carriesData);
    expect(withData.length,
      `only ${withData.length} of ${OWNERS.length} context owners were classified as carrying data — the`
      + ' classifier is broken and every assertion below would pass on an empty set')
      .toBeGreaterThanOrEqual(7);
  });

  it('reads the live theme, rather than mentioning it in a comment', () => {
    let checked = 0;
    for (const o of OWNERS) {
      if (!o.carriesData || NOT_THEMED.has(o.id)) continue;
      checked++;
      expect(/sceneTheme\s*\(/.test(o.src),
        `${o.id} owns a GL context and carries a dataset but never calls sceneTheme(). The platform defaults`
        + ' to LIGHT, so an unthemed surface paints a near-black interior onto a white card. Swap its scenery'
        + ' the way SurfaceReliefGl.tsx does, or add it to NOT_THEMED with the measurement that refutes it.')
        .toBe(true);
      expect(/liveTheme\s*\(/.test(o.src),
        `${o.id} calls sceneTheme but never liveTheme, so it cannot know WHICH theme is on the page.`)
        .toBe(true);
    }
    expect(checked, 'no themed owner was checked — the loop above proved nothing').toBeGreaterThanOrEqual(6);
  });

  it('every NOT_THEMED entry is still a real, unthemed surface', () => {
    for (const [id, why] of NOT_THEMED) {
      const owner = OWNERS.find((o) => o.id === id);
      expect(owner, `NOT_THEMED names ${id}, which no longer owns a GL context`).toBeDefined();
      expect(/sceneTheme\s*\(/.test(owner!.src),
        `NOT_THEMED records ${id} as unthemed and it now calls sceneTheme(). A stale admission is how an`
        + ` exemption list becomes the place unthemed renderers live — delete the entry. On record: ${why}`)
        .toBe(false);
    }
  });
});

/* ══ 2 · THE OBSERVER, THE PRINT HOOK AND BOTH TEARDOWNS ════════════════════════════════════════ */

describe('a theme change reaches the canvas, and is cleaned up', () => {
  it('every themed owner watches the class, hooks beforeprint, and tears both down', () => {
    let checked = 0;
    for (const o of OWNERS) {
      if (!o.carriesData || NOT_THEMED.has(o.id)) continue;
      checked++;
      const need: [RegExp, string][] = [
        [/new MutationObserver\(/,
          'no MutationObserver: these surfaces draw ONE frame and stop, so without one the canvas keeps the'
          + ' theme it mounted with for the life of the page'],
        [/attributeFilter:\s*\['class'\]/,
          "the observer is not filtered to ['class'], so it fires on every attribute the app writes to <html>"],
        [/addEventListener\('beforeprint'/,
          'no beforeprint hook: BoardReport.tsx:105-109 strips .dark and calls window.print() in the SAME'
          + ' synchronous function, so the observer microtask has not run and the print snapshot would carry'
          + ' the dark frame onto a white page'],
        [/themeWatch\.disconnect\(\)/, 'the observer is never disconnected — it outlives the context it draws to'],
        [/removeEventListener\('beforeprint'/, 'the beforeprint listener is never removed'],
        [/liveTheme\(\) === drawnTheme/,
          'no guard against a class change that is NOT a theme change, so the four print handlers that strip'
          + ' and restore .dark each cost two redraws and every unrelated <html> class costs one'],
      ];
      for (const [re, why] of need) {
        expect(re.test(o.src), `${o.id}: ${why}`).toBe(true);
      }
    }
    expect(checked, 'no themed owner was checked for the observer').toBeGreaterThanOrEqual(6);
  });

  /*
   * EVERY ONE OF THESE AWAITS, AND THE AWAIT IS THE POINT RATHER THAN BOILERPLATE.
   *
   * A `MutationObserver` callback is delivered at the MICROTASK CHECKPOINT, so it has not run while the
   * statement that changed the class is still on the stack. A synchronous `act()` therefore measures the frame
   * BEFORE the observer fires and would report "a theme change drew nothing" for an observer that works — it
   * did, on the first run of this file. `await act(async () => ...)` yields, which is the same yield a browser
   * gives before it paints. The one case that must NOT await is the BoardReport reproduction below, where the
   * whole defect is that no yield happens.
   */
  it('E5 · a theme flip redraws and does NOT build a second context', async () => {
    render(createElement(SurfaceReliefGl, {
      surface: surfaceOf(), heightPx: 420, onRefused,
    } as never));
    expect(refusals, `SurfaceReliefGl refused: ${refusals.join(', ')}`).toEqual([]);
    const h = gl!;
    expect(h.contexts(), 'the mount created no context, so nothing below proves anything').toBe(1);
    expect(h.counts.drawElements ?? 0, 'the mount drew nothing').toBeGreaterThanOrEqual(1);

    h.reset();
    await act(async () => { document.documentElement.classList.add('dark'); });

    expect(h.counts.drawElements ?? 0,
      'a theme change drew no frame — the canvas is still showing the other theme').toBeGreaterThanOrEqual(1);
    expect(h.contexts(), 'a theme change built a SECOND WebGL context').toBe(1);
    /*
     * WHAT MUST BE ZERO IS THE REBUILD COST. `reliefRedrawRatchet.test.ts` records the finding this rests on:
     * compilation is essentially the entire cost of a context rebuild, and the count of programs compiled per
     * change is the number that matters. None of these may move on a theme toggle.
     */
    for (const alloc of ['createProgram', 'createShader', 'createTexture', 'createFramebuffer']) {
      expect(h.counts[alloc] ?? 0,
        `a theme change called ${alloc} ${h.counts[alloc]} time(s). §6 rule 7: a theme toggle must redraw,`
        + ' not dispose the stage and rebuild the programs and targets.').toBe(0);
    }
    /*
     * WHAT IS NOT ZERO, MEASURED RATHER THAN GLOSSED: 1 vertex array and its four buffers. The theme observer
     * calls the SAME redraw a data change calls, so on E5 it pays that redraw's data-mesh rebuild — the
     * heightfield, whose vertex COUNT is the drawn-cell count and which `MeshBuffer` gives no way to update in
     * place. `reliefRedrawRatchet.test.ts` measured that whole redraw at 2,040 bytes against the 1 context /
     * 5 programs / 10 shaders / 6 textures / 5 framebuffers a rebuild costs.
     *
     * It is bounded rather than accepted silently: E4 and E7 already keep a SHAPE KEY and re-upload nothing when
     * only the values move, and the same key on E5 and E6 would take this to zero. That is the follow-up this
     * number exists to keep visible, and the bound fails the day a theme toggle starts costing more than one.
     */
    expect(h.counts.createVertexArray ?? 0,
      'a theme toggle re-uploaded more than one mesh. E5 rebuilds its heightfield because the redraw is shared'
      + ' with the data path; anything beyond that is a new cost nobody measured.').toBeLessThanOrEqual(1);
  });

  it('E5 · a class change that is NOT a theme change costs nothing', async () => {
    render(createElement(SurfaceReliefGl, {
      surface: surfaceOf(), heightPx: 420, onRefused,
    } as never));
    expect(refusals).toEqual([]);
    const h = gl!;
    h.reset();
    await act(async () => { document.documentElement.classList.add('reduce-motion'); });
    expect(h.counts.drawElements ?? 0,
      'an unrelated <html> class redrew the frame. The four print handlers add and remove classes on this'
      + ' element, so an unguarded observer pays for every one of them.').toBe(0);
  });

  it('E6 · beforeprint redraws when the class was stripped in the SAME task, which is BoardReport', () => {
    document.documentElement.classList.add('dark');
    render(createElement(VaultReliefGl, {
      entries: auditOf(6), heightPx: 420, onRefused,
    } as never));
    expect(refusals, `VaultReliefGl refused: ${refusals.join(', ')}`).toEqual([]);
    const h = gl!;
    h.reset();

    /* EXACTLY BoardReport.tsx:105-109 — remove the class and print without yielding, so the observer's
       microtask has not run. Nothing is awaited between the two statements on purpose. */
    act(() => {
      document.documentElement.classList.remove('dark');
      window.dispatchEvent(new Event('beforeprint'));
    });

    expect(h.counts.drawElements ?? 0,
      'beforeprint drew no frame after a same-task class strip, so a board pack would print the dark corridor'
      + ' onto a white page').toBeGreaterThanOrEqual(1);
    expect(h.contexts(), 'the print path built a second context').toBe(1);
  });

  it('E6 · the print restore redraws once, not twice', async () => {
    render(createElement(VaultReliefGl, {
      entries: auditOf(6), heightPx: 420, onRefused,
    } as never));
    expect(refusals).toEqual([]);
    const h = gl!;
    /* The three timeout pages strip the class, RETURN, and print 60 ms later — so by the time `beforeprint`
       fires the observer has already redrawn. Awaiting reproduces that yield; the assertion is that the second
       trigger costs nothing. Without the `drawnTheme` guard this draws a whole extra frame inside a print
       handler, which is what the first run of this file measured: 33 drawElements. */
    await act(async () => { document.documentElement.classList.add('dark'); });
    h.reset();
    await act(async () => { window.dispatchEvent(new Event('beforeprint')); });
    expect(h.counts.drawElements ?? 0,
      'beforeprint redrew a frame that was already at the live theme — the guard is not working, and on the'
      + ' three timeout pages that is a wasted frame inside a print handler').toBe(0);
  });
});

/* ══ 3 · THE LIGHT RIG'S RATIOS ═════════════════════════════════════════════════════════════════ */

describe('the light rig moves by ratio, so the dark frame is arithmetic identity', () => {
  const D = sceneTheme('dark'), L = sceneTheme('light');

  it('dark over dark is exactly 1 on all three terms', () => {
    expect(D.keyGain / D.keyGain).toBe(1);
    expect(D.ambientGain / D.ambientGain).toBe(1);
    expect(D.shadowStrength / D.shadowStrength).toBe(1);
  });

  it('light is the measured triple, and it is NOT 1 — the negative control', () => {
    expect(L.keyGain / D.keyGain).toBeCloseTo(1.4231, 4);
    expect(L.ambientGain / D.ambientGain).toBeCloseTo(0.5391, 4);
    expect(L.shadowStrength / D.shadowStrength).toBeCloseTo(0.6889, 4);
    /* If any of these were 1 the swap would be a no-op and every assertion above would still pass. */
    for (const r of [L.keyGain / D.keyGain, L.ambientGain / D.ambientGain, L.shadowStrength / D.shadowStrength]) {
      expect(r).not.toBe(1);
    }
  });

  it('the direction is the counter-intuitive one ForgeBackdrop measured', () => {
    expect(L.keyGain, 'light should take a STRONGER key — form has to come from somewhere once ambient drops')
      .toBeGreaterThan(D.keyGain);
    expect(L.ambientGain, 'light should take a WEAKER ambient — a bright ground already fills the scene')
      .toBeLessThan(D.ambientGain);
    expect(L.shadowStrength, 'light should take WEAKER shadows — a hard shadow on a white plate reads as dirt')
      .toBeLessThan(D.shadowStrength);
  });

  it('every themed owner scales its own calibration rather than assigning the theme absolutes', () => {
    let checked = 0;
    for (const o of OWNERS) {
      if (!o.carriesData || NOT_THEMED.has(o.id)) continue;
      /*
       * E2 is the exception and states it in the file: its ambient gains are a missing emission channel
       * rather than a light rig, so it holds ambient RADIANCE invariant by dividing the dark sky's own
       * irradiance by the current theme's. Found by the property and not by name, so a second surface
       * adopting the same mechanism satisfies this without an edit.
       *
       * THE PREDICATE USED TO BE "calls skyIrradiance AT ALL", AND IT STOPPED DISCRIMINATING. E3 now
       * calls it once, as a term in an exposure solve against `inverseToneMap(albedo)` — a completely
       * different mechanism — and was silently skipped, which dropped the checked count from 5 to 4 and
       * took a compliant surface out of the census. The floor below is the only reason that surfaced.
       *
       * TWO calls, because the invariance mechanism is a RATIO and a ratio needs two irradiances: the
       * dark reference and the live theme. One call cannot be that mechanism, whatever else it is doing.
       * That is a property of the arithmetic rather than a count that happens to work today.
       */
      if ((o.src.match(/skyIrradiance\s*\(/g) ?? []).length >= 2) continue;
      checked++;
      expect(/th\.keyGain \/ TH_DARK\.keyGain/.test(o.src),
        `${o.id} does not derive its key from the theme's RATIO. Assigning theme.keyGain directly would`
        + " re-light this surface in DARK mode too, using ForgeBackdrop's number for one disc on one plinth.")
        .toBe(true);
      /*
       * A NAMED CONSTANT IS AS GOOD AS A LITERAL, and these patterns used to reject it. They demanded
       * `[\d.]+ * rig.ambient`, so `AMBIENT_BASE * rig.ambient` — the same arithmetic with the
       * coefficient given a name, which is the better spelling — read as a violation. The rule being
       * enforced is that the surface scales its OWN calibration by the theme's ratio rather than
       * assigning the theme's absolute; the coefficient's spelling has nothing to do with it.
       */
      expect(/ambientGain:\s*[A-Za-z0-9_.]+\s*\*\s*rig\.ambient/.test(o.src),
        `${o.id} does not scale its own ambient by the theme ratio`).toBe(true);
      expect(/shadowStrength:\s*[A-Za-z0-9_.]+\s*\*\s*rig\.shadow/.test(o.src),
        `${o.id} does not scale its own shadow strength by the theme ratio`).toBe(true);
    }
    expect(checked, 'no owner was checked for the ratio rule').toBeGreaterThanOrEqual(5);
  });

  it('no themed owner takes a DATA colour from the theme', () => {
    /* The line `theme.ts` exists to draw. `sceneTheme` has no data fields, so the only way to violate this is
       to stop passing a brand hex — which is what this checks: every data hex a themed surface names must
       still be handed to `hexToLinear` directly rather than routed through `scenery`. */
    const DATA = new Set(Object.values(BRAND_HEX).map((h) => h.toUpperCase()));
    let checked = 0;
    for (const o of OWNERS) {
      if (!o.carriesData || NOT_THEMED.has(o.id)) continue;
      for (const m of o.src.matchAll(/scenery\((?:th|theme),\s*'(#[0-9A-Fa-f]{6})'/g)) {
        checked++;
        expect(DATA.has(m[1]!.toUpperCase()),
          `${o.id} routes ${m[1]} through scenery(), and that hex is in BRAND_HEX. A data colour may not be`
          + ' tinted to suit a background — that is editing the measurement to flatter the page.').toBe(false);
      }
    }
    expect(checked, 'no scenery() call site was inspected — the regex found nothing').toBeGreaterThanOrEqual(8);
  });
});

/* ══ 4 · THE CONTRAST NUMBERS THE SURFACES CLAIM ════════════════════════════════════════════════ */

describe('the contrast measurements the surfaces print in their comments', () => {
  it('the caption under every frame was BELOW the floor on the light card, and the new token clears it', () => {
    /* The defect this work found rather than caused: these captions sit on the PAGE, and the platform's
       default is light. Both alphas were shipping. */
    for (const a of [0.62, 0.66]) {
      const old = over(CARD_LIGHT, a, [196, 212, 240]);
      expect(ratioOf(relLum(...old), relLum(...CARD_LIGHT)),
        `rgba(196,212,240,${a}) on the light card must be recorded as failing — if it now passes, the token`
        + ' or the card changed and the comments in the surfaces are stale').toBeLessThan(1.5);
      const onDark = over(CARD_DARK, a, [196, 212, 240]);
      expect(ratioOf(relLum(...onDark), relLum(...CARD_DARK)),
        'the dark-theme caption must still clear AA — it is kept, so it must still be right').toBeGreaterThan(AA);
    }
    expect(ratioOf(relLum(...hexBytes('#5A6272')), relLum(...CARD_LIGHT)),
      '#5A6272 is the light-theme caption; it must clear AA on the light card').toBeGreaterThan(AA);
  });

  it('E1 · neither type family works on both panels, which is why the frame measures per panel', () => {
    const LIGHT_RUNS = ['#FFFFFF', '#EAF1FF', '#7FB2FF', '#C6D4EC'];
    const INK_RUNS = ['#1E2761', '#333948', '#0B1220'];
    const darkPanel = albedo('#16203A');
    const lightPanel = bytesOf(sceneTheme('light').structure);

    const worst = (runs: string[], bg: [number, number, number]): number =>
      Math.min(...runs.map((h) => ratioOf(relLum(...hexBytes(h)), relLum(...bg))));

    expect(worst(LIGHT_RUNS, darkPanel), 'the light family must clear AA on the dark panel').toBeGreaterThan(AA);
    expect(worst(LIGHT_RUNS, lightPanel),
      'the light family must be recorded as FAILING on the light panel — that is the defect')
      .toBeLessThan(2);
    expect(worst(INK_RUNS, lightPanel), 'the ink family must clear AA on the light panel').toBeGreaterThan(AA);
    expect(worst(INK_RUNS, darkPanel),
      'the ink family must be recorded as failing on the dark panel — if it passed, one family would serve'
      + ' both and the per-panel measurement would be unnecessary').toBeLessThan(2);
  });

  it('E1 · the HUD keeps its dark plate because the white one measures WORSE on a dark scene', () => {
    const hudRuns = ['#8FB7FF', '#C6D4EC', '#E0A94A'];
    const inkRuns = ['#1E2761', '#333948', '#8A5F00'];
    const worstOver = (plate: [number, number, number], a: number, runs: string[]) => Math.min(
      ...([[0, 0, 0], [255, 255, 255]] as [number, number, number][]).flatMap((scene) => {
        const p = over(scene, a, plate);
        return runs.map((h) => ratioOf(relLum(...hexBytes(h)), relLum(...p)));
      }),
    );
    const dark = worstOver([4, 6, 11], 0.82, hudRuns);
    const white = worstOver([255, 255, 255], 0.88, inkRuns);
    expect(dark, 'the dark HUD chip must clear AA over BOTH extremes of scene brightness').toBeGreaterThan(AA);
    expect(dark, 'the dark chip must be the better of the two, which is why it is kept in both themes')
      .toBeGreaterThan(white);
  });

  it('E3 · the frame actually SWITCHES its blend state, it does not merely know it should', async () => {
    /*
     * THE ARITHMETIC BELOW IS TRUE WHETHER OR NOT THE RENDERER ACTS ON IT. Forcing `additive: true` in
     * `PipelineReliefGl` left every other assertion in this file green, which is the "dark tokens that were
     * only ever comments" failure wearing a different hat. So this one watches the GL state instead.
     *
     * `gl.blendFunc` is called ONLY on the additive branch — the ink branch calls `gl.disable(BLEND)` — so the
     * count going 1 to 0 across a theme flip is the switch itself, observed rather than inferred.
     */
    render(createElement(PipelineReliefGl, {
      channel: channelOf(), heightPx: 420, onRefused,
    } as never));
    expect(refusals, `PipelineReliefGl refused: ${refusals.join(', ')}`).toEqual([]);
    const h = gl!;
    expect(h.counts.blendFunc ?? 0,
      'the light mount called blendFunc, so it is still blending the gate outline additively over a bright'
      + ' ground — measured at 1.28:1, which is no line at all').toBe(0);

    h.reset();
    await act(async () => { document.documentElement.classList.add('dark'); });
    expect(h.counts.blendFunc ?? 0,
      'the dark frame did NOT call blendFunc, so the luminous membrane is no longer additive — on a dark ground'
      + ' an opaque ink rule is a dark line on a dark floor').toBeGreaterThanOrEqual(1);
  });

  it('E3 · the additive stroke dies on a light ground and the opaque ink replaces it', () => {
    const L = sceneTheme('light');
    const fogL = shown(L.fog), fogD = shown(hexToLinear('#0C1322'));
    const ink = hexToLinear(BRAND_HEX.rule);
    for (const [colour, gain] of [['#4E8CFF', 1.5], ['#7FB2FF', 1.1]] as const) {
      const c = hexToLinear(colour);
      const additiveDark = ratioOf(relLum(...shown(add(hexToLinear('#0C1322'), scale(c, gain)))), relLum(...fogD));
      const additiveLight = ratioOf(relLum(...shown(add(L.fog, scale(c, gain)))), relLum(...fogL));
      const inkLight = ratioOf(relLum(...shown(scale(ink, gain))), relLum(...fogL));
      expect(additiveDark, `${colour} additive must still carry on the dark fog`).toBeGreaterThan(NON_TEXT);
      expect(additiveLight,
        `${colour} additive on the light fog must be recorded as failing — if it now passes, additive blending`
        + ' would be the simpler answer and the ink branch should go').toBeLessThan(1.5);
      expect(inkLight, `${BRAND_HEX.rule} at gain ${gain} must carry on the light fog`).toBeGreaterThan(NON_TEXT);
    }
    /* AND THE ORDER SURVIVES: on dark the axis is the more prominent of the two, and on light — where the same
       gains now scale an ink rather than a light — it must still be. */
    const axisInk = ratioOf(relLum(...shown(scale(ink, 1.1))), relLum(...fogL));
    const gateInk = ratioOf(relLum(...shown(scale(ink, 1.5))), relLum(...fogL));
    expect(axisInk, 'the axis must stay more prominent than the gate outline, as it is on dark')
      .toBeGreaterThan(gateInk);
  });

  it('E4 · the ring/deck relationship survives the swap, and the flat control still loses', () => {
    const L = sceneTheme('light');
    const lum = (b: [number, number, number]) => relLum(...b);
    const darkRatio = ratioOf(lum(albedo('#22355E')), lum(albedo('#090F1C')));
    const lightRatio = ratioOf(lum(bytesOf(L.rule)), lum(bytesOf(L.ground)));
    expect(darkRatio).toBeCloseTo(1.586, 2);
    expect(lightRatio).toBeCloseTo(1.463, 2);
    expect(Math.abs(lightRatio - darkRatio),
      `the inclined ring reads at ${darkRatio.toFixed(3)}:1 against the deck on dark and`
      + ` ${lightRatio.toFixed(3)}:1 on light; more than 0.15 apart and the axis has changed weight between`
      + ' the two themes rather than been carried across').toBeLessThan(0.15);

    /* AND THE THREE-WAY ORDER, which is what `FLAT_RING_T` is solved for: the collapsed control must sit
       between the deck and the inclined ring on BOTH themes, or the flat/inclined comparison — the whole
       reason both are drawn — stops being a comparison. */
    const mix = (t: number) => [0, 1, 2].map(
      (i) => L.ground[i]! + (L.rule[i]! - L.ground[i]!) * t,
    ) as [number, number, number];
    const flatLight = lum(bytesOf(mix(0.2898)));
    expect(flatLight).toBeLessThan(lum(bytesOf(L.ground)));
    expect(flatLight).toBeGreaterThan(lum(bytesOf(L.rule)));
    const flatDark = lum(albedo('#141F38'));
    expect(flatDark).toBeGreaterThan(lum(albedo('#090F1C')));
    expect(flatDark).toBeLessThan(lum(albedo('#22355E')));
  });

  it('E6 · taking the better of white and ink is never worse than white alone', () => {
    const L = sceneTheme('light');
    const INK: [number, number, number] = [8, 11, 18];
    const WHITE: [number, number, number] = [255, 255, 255];
    const grounds: [string, [number, number, number]][] = [
      /* BLOCKED is DERIVED, not typed. It used to be the literal `#C9552B`, which is the divergence
         T4 closed — and a scoring test carrying a stale sample of the very colour that moved would
         be scoring a background the product no longer draws. The other two are literals on purpose:
         ALLOWED is identity and WITHHELD is absence, and neither is a status role. */
      ['ALLOWED', albedo('#2C6BFF')], ['BLOCKED', albedo(statusHex('blocked', 'light'))],
      ['WITHHELD', albedo('#5C6880')],
      ['dark fog', albedo('#0B1220')], ['light fog', bytesOf(L.fog)], ['light plate', bytesOf(L.plate)],
    ];
    expect(grounds.length, 'no backgrounds to score').toBeGreaterThan(0);
    for (const [name, bg] of grounds) {
      for (const a of [1, 0.5, 0.25]) {
        const w = ratioOf(relLum(...over(bg, a, WHITE)), relLum(...bg));
        const k = ratioOf(relLum(...over(bg, a, INK)), relLum(...bg));
        expect(Math.max(w, k), `${name} at a=${a}: the better of the two is worse than white alone`)
          .toBeGreaterThanOrEqual(w);
      }
    }
    /* THE ENABLING CASE, stated separately so it cannot be satisfied by the tautology above: on the light
       theme's own fog, white is unusable and ink is not. */
    const fog = bytesOf(L.fog);
    expect(ratioOf(relLum(...over(fog, 1, WHITE)), relLum(...fog))).toBeLessThan(1.5);
    expect(ratioOf(relLum(...over(fog, 1, INK)), relLum(...fog))).toBeGreaterThan(AA);
  });
});

/* ══ 5 · E7's REFUSAL, AND THE CONDITION THAT WOULD END IT ══════════════════════════════════════ */

describe('E7 THE STORM stays dark, and the refutation is kept live', () => {
  const blue = hexToLinear(BRAND_HEX.brand);
  const orange = hexToLinear(BRAND_HEX.reference);

  it('the severity ramp runs from the DARKER hue to the LIGHTER one, which is the whole problem', () => {
    expect(luminance(blue)).toBeCloseTo(0.18271, 5);
    expect(luminance(orange)).toBeCloseTo(0.39774, 5);
    expect(luminance(orange), 'if reference ever became DARKER than brand, E7 could be themed and this'
      + ' refusal should be re-opened').toBeGreaterThan(luminance(blue));
  });

  it('at the shipped exposures the severe end dies on a light floor while the calm end survives', () => {
    const L = sceneTheme('light');
    const low = scale(blue, 0.55), high = scale(orange, 1.45);
    const overFloor = (col: [number, number, number], a: number, floor: readonly [number, number, number]) =>
      ratioOf(relLum(...shown(add(scale(col, a), scale(floor, 1 - a)))), relLum(...shown(floor)));

    const darkTile = hexToLinear('#22315A');
    expect(overFloor(high, 0.8, darkTile), 'the severe end must carry on the dark tile it was calibrated on')
      .toBeGreaterThan(AA);
    expect(overFloor(high, 0.8, L.ground),
      'the severe end must be recorded as dying on the light ground — if it now carries, E7 can be themed')
      .toBeLessThan(1.5);
    expect(overFloor(low, 0.8, L.ground),
      'the calm end must still be recorded as surviving, because it is the INVERSION that is the defect'
      + ' rather than a uniform loss').toBeGreaterThan(2);
  });

  it('re-exposing cannot fix it: preserving the order flattens the ramp', () => {
    const bound = luminance(blue) / luminance(orange);
    expect(bound, 'the exposure bound the file header quotes').toBeCloseTo(0.4594, 4);
    const sLo = 0.55;
    const sHi = bound * sLo;
    expect(luminance(scale(orange, sHi))).toBeCloseTo(luminance(scale(blue, sLo)), 6);
    /* At the largest exposure that keeps the order, the ramp spans nothing. 5.74x is what it spans on dark. */
    const darkSpan = luminance(scale(orange, 1.45)) / luminance(scale(blue, sLo));
    expect(darkSpan).toBeCloseTo(5.739, 2);
    const flatSpan = luminance(scale(blue, sLo)) / luminance(scale(orange, sHi * 0.99));
    expect(flatSpan, 'the best-ordered light ramp must span under 1.05x — a ramp with no luminance range')
      .toBeLessThan(1.05);
  });
});
