import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { PIPELINE_SOURCES, toneMapComposite, linearToSrgb, srgbToLinear } from '@lcx/gl';
import { bufferBucket, BUFFER_FLOOR_W, BUFFER_FLOOR_H } from '@lcx/gl/flat/shared.js';
import {
  SignatureBackdrop, resetCanvasSnapshot, backdropSize, backdropPlate,
} from '@/components/command/SignatureBackdrop';

/**
 * X1 · THE AMBIENT BACKDROP — the one 3-D surface that is not opt-in.
 *
 * ── THE DEFECT THIS SUITE EXISTS BECAUSE OF ─────────────────────────────────────────
 * `SignatureBackdrop` shipped on `/command-deck` painting ONE hard-coded near-black plate in
 * BOTH themes, and the platform defaults to LIGHT. `PageTitle` has no background, so the deck's
 * own `<h1 className="text-navy">` measured 1.29:1 against WCAG 2.2 SC 1.4.3's 4.5:1. Nothing
 * caught it: `lib/__tests__/contrast.test.ts` computes every text role against `--page-bg`, and
 * the whole point of a backdrop is that `--page-bg` is no longer what the text sits on.
 *
 * So the assertions below are about the RELATIONSHIP between this layer and that ratchet, not
 * about a list of colours. Nothing here names a text role. The previous version's failure is
 * precisely what a list of "roles we checked" would have missed.
 *
 * ── CAPTURED, at 1440x900 through SwiftShader, dark theme, two route shapes ──────────
 * Brightest pixel over the whole 816x512 frame: [9, 14, 27] — EXACTLY `--page-bg`.
 * Darkest: [3, 5, 13]. 30 distinct colours over 417,792 pixels. Every one of the 31 tokens in
 * the dark palette that is lighter than the canvas measured the same or better over the
 * backdrop than over the flat canvas; zero got worse.
 */

const SRC = resolve(process.cwd(), 'src');
const REPO = resolve(process.cwd(), '..', '..');
const read = (p: string) => readFileSync(p, 'utf8');

const BACKDROP_SRC = read(join(SRC, 'components', 'command', 'SignatureBackdrop.tsx'));
const LAYOUT_SRC = read(join(SRC, 'components', 'layout', 'AppLayout.tsx'));
const HOOK_SRC = read(join(SRC, 'components', 'charts', 'gl', 'useFlatChart.ts'));
const TOKENS = read(join(SRC, 'styles', 'tokens.css'));

/** Strip block and line comments. Prose about a colour is not a colour. */
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

/* ── the token file, parsed the way `lib/__tests__/contrast.test.ts` parses it ─────── */
type Rgb = [number, number, number];
function palettes(): { light: Record<string, Rgb>; dark: Record<string, Rgb> } {
  const light: Record<string, Rgb> = {};
  const dark: Record<string, Rgb> = {};
  for (const block of TOKENS.matchAll(/(:root|\.dark)\s*\{([\s\S]*?)\n\}/g)) {
    const target = block[1] === '.dark' ? dark : light;
    for (const m of block[2]!.matchAll(/--([a-z0-9-]+):\s*(\d+)\s+(\d+)\s+(\d+)\s*;/g)) {
      target[m[1]!] = [Number(m[2]), Number(m[3]), Number(m[4])];
    }
    for (const m of block[2]!.matchAll(/--([a-z0-9-]+):\s*#([0-9a-fA-F]{6})\s*;/g)) {
      target[m[1]!] = [0, 2, 4].map((i) => parseInt(m[2]!.slice(i, i + 2), 16)) as Rgb;
    }
  }
  return { light, dark: { ...light, ...dark } };
}

/** WCAG 2.x relative luminance and contrast — the same maths as `lib/__tests__/contrast.test.ts`. */
const luminance = ([r, g, b]: Rgb): number => {
  const f = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const contrast = (a: Rgb, b: Rgb): number => {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};
const byte = (linear: number) => Math.round(255 * linearToSrgb(Math.max(0, Math.min(1, linear))));

afterEach(() => {
  cleanup();
  resetCanvasSnapshot();
  document.documentElement.classList.remove('dark');
  document.documentElement.style.removeProperty('--page-bg');
});

/** jsdom applies no stylesheet, so the token is installed inline — the same computed value. */
function theme(name: 'light' | 'dark') {
  document.documentElement.classList.toggle('dark', name === 'dark');
  document.documentElement.style.setProperty('--page-bg', name === 'dark' ? '9 14 27' : '244 246 251');
  resetCanvasSnapshot();
}

describe('X1 · the backdrop can only ever raise the contrast the ratchet certified', () => {
  it('the composite SUBTRACTS the vignette from the plate, so the plate is the frame maximum', () => {
    /*
     * THE WHOLE INVARIANT RESTS ON THIS ONE SHADER LINE, so it is asserted against the shipped
     * source rather than restated in prose. `look/pipeline.ts`:
     *
     *     vec3 plate = uPlate * (1.0 - uVignetteDepth * smoothstep(0.12, 1.00, length(...)));
     *
     * `smoothstep` is in [0,1] and `uVignetteDepth` is in [0,1], so the factor is in [0,1] and
     * the plate is the supremum of the field. A future edit to `1.0 +`, or to a gain above one,
     * or a bloom term that is not zeroed, would make some pixel BRIGHTER than `--page-bg` — and
     * in the dark theme that is the direction that costs a text role its contrast. Nothing about
     * the rendered frame would look wrong, which is why this is a string check.
     */
    expect(PIPELINE_SOURCES.composite).toMatch(
      /vec3\s+plate\s*=\s*uPlate\s*\*\s*\(\s*1\.0\s*-\s*uVignetteDepth\s*\*\s*smoothstep\(/,
    );
    /* And the composite must still ADD the scene and bloom to it — the backdrop draws an empty
       scene and passes `bloomGain: 0`, so both terms are zero and the plate stands alone. If the
       composite ever multiplied instead, "empty scene" would mean "black frame". */
    expect(PIPELINE_SOURCES.composite).toContain('vec3 lit = plate + scene + bloom * uBloomGain;');
  });

  it('the tone map cannot lift a channel, so the encoded maximum is at most --page-bg', () => {
    /* Reinhard `c / (1 + 0.4c)` is <= c for every c >= 0. Swept rather than argued, because the
       exported curve is the thing that could be replaced with one that has gain below 1. */
    for (let i = 0; i <= 400; i++) {
      const c = i / 100;
      const [r] = toneMapComposite([c, c, c]);
      expect(r, `toneMapComposite lifted ${c} to ${r} — the plate would exceed --page-bg`)
        .toBeLessThanOrEqual(c + 1e-12);
    }
  });

  it('every dark token that can be canvas text measures the same or better over the backdrop', () => {
    /*
     * DERIVED, NOT ENUMERATED. The candidate set is "every token in the dark palette that is
     * LIGHTER than the canvas", because a colour darker than the canvas cannot be text on it in
     * a dark theme — it would already fail the ratchet at 1.1:1. A token added tomorrow is in
     * this set tomorrow, which is the property a hand list of text roles does not have.
     *
     * Contrast against a fixed foreground is monotone in the background's luminance, so checking
     * the two ENDS of the ramp checks the whole ramp: the plate itself (the maximum, which is
     * `--page-bg` up to the tone map) and full extinction at vignette depth 1.
     */
    const { dark } = palettes();
    const canvas = dark['page-bg'];
    expect(canvas, '--page-bg missing from the dark palette').toBeDefined();

    /* THROUGH THE COMPONENT'S OWN DERIVATION, not a re-typed copy of it: `backdropPlate` is the
       single step between the token the page paints and the uniform the composite multiplies,
       so a stray gain introduced there fails HERE. */
    const brightest = toneMapComposite(backdropPlate(canvas!.join(' '), srgbToLinear)).map(byte) as Rgb;
    const darkest = toneMapComposite([0, 0, 0]).map(byte) as Rgb;

    /* The measured capture, pinned: the brightest pixel of the real 816x512 frame was exactly
       [9, 14, 27]. If the derivation or the tone map ever costs a byte here, this says so
       instead of the invariant drifting. */
    expect(brightest, 'the plate no longer resolves to --page-bg itself').toEqual(canvas);

    const candidates = Object.entries(dark).filter(([, v]) => luminance(v) > luminance(canvas!));
    expect(candidates.length, 'no dark token is lighter than the canvas — the parser broke')
      .toBeGreaterThanOrEqual(10);

    const worse: string[] = [];
    for (const [name, rgb] of candidates) {
      const flat = contrast(rgb, canvas!);
      for (const [where, bg] of [['brightest', brightest], ['darkest', darkest]] as const) {
        const over = contrast(rgb, bg);
        if (over + 1e-9 < flat) worse.push(`--${name} ${flat.toFixed(2)}:1 -> ${over.toFixed(2)}:1 at the ${where} pixel`);
      }
    }
    expect(worse, `the backdrop REDUCED contrast:\n${worse.join('\n')}`).toEqual([]);
  });

  it('the light theme has no corridor for this, which is why it renders nothing', () => {
    /*
     * The refusal, as arithmetic rather than as an opinion. In the light theme the canvas text is
     * DARKER than the canvas, so the invariant above runs backwards and any darkening costs
     * contrast. This measures how much darkening the light canvas can take before the WEAKEST
     * pair the ratchet certifies on `page-bg` hits 4.5:1 — and how far it is from `--card` in the
     * other direction. Both answers are about ten 8-bit levels, and this pipeline has no dither,
     * so a ramp that fits inside them puts a Mach contour every ~120 px on a 1200 px field.
     *
     * It is a computed floor, not a recorded one: if a token moves, the number moves with it.
     */
    const { light } = palettes();
    const canvas = light['page-bg']!;
    const card = light['card']!;
    const roles = Object.entries(light).filter(([, v]) => luminance(v) < luminance(canvas));
    expect(roles.length, 'no light token is darker than the canvas — the parser broke').toBeGreaterThanOrEqual(5);

    /* The weakest CERTIFIED pair. `contrast.test.ts` asserts >= 4.5:1 for its text roles on
       page-bg with an empty exception list, so the smallest ratio at or above 4.5 is the one
       with the least room. Anything below 4.5 here is not certified and cannot bind. */
    const certified = roles.map(([, v]) => contrast(v, canvas)).filter((r) => r >= 4.5);
    expect(certified.length, 'nothing clears 4.5:1 on the light canvas — the ratchet changed shape')
      .toBeGreaterThanOrEqual(1);
    const weakest = Math.min(...certified);

    /* Invert the WCAG ratio for the background luminance at which that pair reaches exactly 4.5,
       then express the gap as 8-bit levels on a neutral of that luminance. */
    const lt = (luminance(canvas) + 0.05) / weakest - 0.05;
    const floorLum = 4.5 * (lt + 0.05) - 0.05;
    const down = byte(luminance(canvas)) - byte(floorLum);
    const up = byte(luminance(card)) - byte(luminance(canvas));

    expect(down, `the light canvas can darken ${down} levels before ${weakest.toFixed(2)}:1 reaches 4.5:1`)
      .toBeLessThanOrEqual(16);
    expect(up, `the light canvas is ${up} levels below --card; spending them upward deletes the elevation step`)
      .toBeLessThanOrEqual(16);

    /* And the component must actually act on it. */
    theme('light');
    const { container } = render(<SignatureBackdrop />);
    expect(container.innerHTML, 'the light theme rendered a backdrop despite the corridor above').toBe('');
  });
});

describe('X1 · rule 1 — the page is unchanged by this layer being absent', () => {
  it('a refusal paints NOTHING: no canvas, no CSS plate, no background of its own', async () => {
    /*
     * jsdom has no WebGL2, so this is the real refusal path and not a simulation of one.
     *
     * The version this replaces painted a hard-coded `radial-gradient(#0b1220 -> #04060b)` div
     * that was "always present, always underneath" — so a machine without WebGL2 got the dark
     * plate laid over a LIGHT page with no pipeline involved at all. §6 rule 1 asks for a flat
     * fallback that is not a downgrade in information; for a backdrop the flat fallback is the
     * page, and `bg-page` is already painted by the shell.
     */
    theme('dark');
    const { container } = render(<SignatureBackdrop />);
    const host = container.querySelector('div');
    expect(host, 'the dark theme rendered no host at all').not.toBeNull();
    expect(host!.getAttribute('aria-hidden')).toBe('true');
    expect(host!.className).toContain('pointer-events-none');
    /* `-z-10` is only behind the content while an ancestor isolates; AppLayout's is asserted below. */
    expect(host!.className).toContain('-z-10');

    for (const el of container.querySelectorAll<HTMLElement>('*')) {
      expect(el.style.background, `${el.tagName} paints its own background on the refusal path`).toBe('');
      expect(el.style.backgroundImage, `${el.tagName} paints a gradient on the refusal path`).toBe('');
    }
    const canvas = container.querySelector('canvas');
    expect(canvas, 'no canvas element').not.toBeNull();
    expect(canvas!.style.display, 'the canvas is shown before a frame has been drawn').toBe('none');
  });

  it('two mounts produce ONE layer — the shell wins and the page-scoped copy stands down', () => {
    /*
     * `pages/CommandDeck.tsx:95` mounts this component inside `.br-page`, and `AppLayout` now
     * mounts one across the shell. Both are OPAQUE, so the deck's copy covers the shell's inside
     * the page container only — and its falloff is computed over a 1400 px box against the
     * shell's viewport, so the two disagree at the container's edge. Captured before the guard:
     * a visibly darker rectangle with a hard seam down the left of the content area.
     *
     * Order matters and is the right way round: AppLayout renders before the Outlet, so the
     * shell claims first and the page-scoped copy is the one that stands down.
     */
    theme('dark');
    const { container } = render(<><SignatureBackdrop /><SignatureBackdrop /></>);
    expect(container.querySelectorAll('canvas').length,
      'two backdrops are live at once — the deck seam is back').toBe(1);
  });

  it('an unreadable --page-bg refuses rather than guessing a colour, and keeps looking', () => {
    document.documentElement.classList.add('dark');
    document.documentElement.style.setProperty('--page-bg', 'var(--something-else)');
    resetCanvasSnapshot();
    const { container, rerender } = render(<SignatureBackdrop />);
    expect(container.innerHTML, 'a shape this parser does not recognise produced a backdrop anyway').toBe('');

    /*
     * AND THE REFUSAL IS NOT STICKY. In dev the stylesheet is injected by JS, so the first render
     * can find no `--page-bg` at all; memoising that answer would leave the layer absent for the
     * whole session, because the class attribute never changes to invalidate it. The token
     * arriving late must be enough — with NO `resetCanvasSnapshot()` here, which is exactly what
     * a memoised null would need.
     */
    document.documentElement.style.setProperty('--page-bg', '9 14 27');
    rerender(<SignatureBackdrop />);
    expect(container.querySelector('canvas'),
      'the layer never came back after the token resolved — a null read was memoised').not.toBeNull();
  });

  it('a theme flip swaps the layer without a remount', () => {
    theme('light');
    const { container, rerender } = render(<SignatureBackdrop />);
    expect(container.innerHTML).toBe('');
    theme('dark');
    rerender(<SignatureBackdrop />);
    expect(container.querySelector('canvas'), 'the dark theme did not bring the layer back').not.toBeNull();
  });

  it('no colour is written into this component — the plate comes from the live token', () => {
    /*
     * THE EXACT DEFECT, RATCHETED. `DECK_PLATE = [0.0052, 0.0086, 0.0224]` and a
     * `#0b1220 -> #04060b` CSS gradient were both hard-coded here, which is how a dark plate
     * ended up under a light page. A hex or an `rgb(` in this file's CODE (comments stripped —
     * the header quotes the old values on purpose) means a second definition of a colour that
     * `tokens.css` already owns, and a second definition is what drifts.
     */
    const body = code(BACKDROP_SRC);
    expect(body).not.toMatch(/#[0-9a-fA-F]{6}\b/);
    expect(body).not.toMatch(/\brgba?\(/);
    expect(body).not.toContain('gradient');
    /* And it must read the token it is covering, not some other one. */
    expect(body).toContain("getPropertyValue('--page-bg')");
  });
});

describe('X1 · rule 2 — it renders on mount, resize and theme change, and then stops', () => {
  it('schedules no frame of its own', () => {
    const body = code(BACKDROP_SRC);
    for (const banned of ['requestAnimationFrame', 'setInterval', 'setTimeout']) {
      expect(body.includes(banned), `SignatureBackdrop schedules ${banned} — §6 rule 2 forbids idle animation`)
        .toBe(false);
    }
  });

  it('passes BOTH tween durations as zero, and that is load-bearing rather than tidy', () => {
    /*
     * `useFlatChart` runs a `requestAnimationFrame` tween unless the duration is `<= 0`, and it
     * uses TWO durations: `entranceMs` for the first frame and `updateMs` (default 260) for every
     * later one. The previous version passed only `entranceMs: 0`, so every resize and every
     * theme flip ran a 260 ms rAF loop redrawing the SAME static gradient about sixteen times,
     * each pass being the full five-pass pipeline plus a blit. Frames that carry no new
     * information — §6 rule 2 reached from the direction the policy does not name.
     */
    const body = code(BACKDROP_SRC);
    expect(body).toMatch(/entranceMs:\s*0/);
    expect(body).toMatch(/updateMs:\s*0/);
    /* The zeros only mean anything while the hook still short-circuits on them. If this branch
       is removed, the two options above become decoration and the loop comes back. */
    expect(code(HOOK_SRC), 'useFlatChart no longer short-circuits a zero-length tween')
      .toMatch(/if\s*\(reduced\s*\|\|\s*ms\s*<=\s*0\)/);
  });
});

describe('X1 · rule 7 — one shared context, and it must not make the shared buffer grow', () => {
  it('builds no context of its own', () => {
    expect(code(BACKDROP_SRC)).not.toContain('createStage');
    expect(code(BACKDROP_SRC)).toContain('useFlatChart');
  });

  it('the copied buffer floor is the renderer\'s own', () => {
    /*
     * The component cannot IMPORT these: a value import from `@lcx/gl` in a file the eager shell
     * chunk reaches would pull the renderer into the initial bundle. So they are copied, and this
     * is what stops the copy going stale.
     */
    const body = code(BACKDROP_SRC);
    expect(body).toContain(`const BUFFER_FLOOR_W = ${BUFFER_FLOOR_W};`);
    expect(body).toContain(`const BUFFER_FLOOR_H = ${BUFFER_FLOOR_H};`);
  });

  it('every realistic viewport renders inside the buffer floor, so no other chart pays for it', () => {
    /*
     * `flat/shared.ts` prices a `drawImage` by the WHOLE drawing buffer and not by the source
     * rect — 0.50 ms at the floor against 2.41 ms at 2400x920 on an M1 through ANGLE Metal. A
     * viewport-sized backdrop grows that buffer and hands the bill to every sparkline on the
     * page. The fit below is the arithmetic in the component, driven through the renderer's OWN
     * `bufferBucket` rather than a copy of it.
     */
    const viewports: [number, number, number][] = [
      [1280, 720, 1], [1440, 900, 2], [1512, 982, 2], [1920, 1080, 1],
      [2560, 1440, 2], [3440, 1440, 2], [800, 600, 1], [5120, 2880, 2],
    ];
    for (const [vw, vh, dpr] of viewports) {
      /* `backdropSize` IS the component's sizing, exported for exactly this. The first version
         of this test recomputed the same three lines and then checked its own output, which
         stayed green with the reduction deleted from the component entirely. */
      const { w, h } = backdropSize(vw, vh, dpr);
      const dw = Math.round(w * dpr), dh = Math.round(h * dpr);
      expect(bufferBucket(dw, BUFFER_FLOOR_W),
        `${vw}x${vh}@${dpr} renders ${dw}x${dh} and grows the shared buffer's width`).toBe(BUFFER_FLOOR_W);
      expect(bufferBucket(dh, BUFFER_FLOOR_H),
        `${vw}x${vh}@${dpr} renders ${dw}x${dh} and grows the shared buffer's height`).toBe(BUFFER_FLOOR_H);
    }
  });

  it('the target set it asks for is small enough for stage.ts to keep', () => {
    /*
     * `stage.ts` caches target sets by size with a budget of `TARGET_CACHE_TEXELS`. A set over
     * that budget is evicted the moment any chart renders at a different size, so the backdrop
     * would reallocate three framebuffers and three textures on every redraw AND push the
     * chart's own set out. Read from the package source so the budget cannot move underneath it.
     */
    const stageSrc = read(join(REPO, 'packages', 'gl', 'src', 'stage.ts'));
    const m = /TARGET_CACHE_TEXELS\s*=\s*([\d_]+)/.exec(stageSrc);
    expect(m, 'TARGET_CACHE_TEXELS is no longer declared in stage.ts').not.toBeNull();
    const budget = Number(m![1]!.replace(/_/g, ''));
    expect(BUFFER_FLOOR_W * BUFFER_FLOOR_H,
      `a full-floor backdrop set is over stage.ts's ${budget}-texel cache budget`).toBeLessThan(budget);
  });
});

describe('X1 · the mount — the shell is the only element that spans every route', () => {
  it('AppLayout mounts it, and isolates the stacking context it needs', () => {
    /*
     * Without `isolate` the failure is INVISIBILITY, not breakage: a negative-z child paints
     * above its stacking context's own background, and this div creates no stacking context on
     * its own, so the layer would resolve against the ROOT element and paint behind `bg-page`
     * here. Nothing throws. `pages/CommandDeck.tsx:89` carries the same pair for the same reason.
     */
    expect(LAYOUT_SRC).toContain('<SignatureBackdrop />');
    const root = /<div className="([^"]*bg-page[^"]*)">/.exec(LAYOUT_SRC);
    expect(root, "AppLayout's shell div no longer matches — the backdrop's ancestor is unpinned").not.toBeNull();
    expect(root![1]).toContain('relative');
    expect(root![1]).toContain('isolate');
  });

  it('the routes outside the shell are outside on purpose', () => {
    /* `/select` and `/lcxos` are SIBLINGS of AppLayout in `router.tsx`, so this layer does not
       reach them. `/select` already has E8's ForgeBackdrop; `/lcxos` is the public page. Pinned
       so that moving either one under the shell is a decision rather than a side effect. */
    const router = read(join(SRC, 'router.tsx'));
    expect(router).toMatch(/path:\s*'\/select'[\s\S]{0,80}element:\s*<SelectOperator\s*\/>/);
    expect(router).toMatch(/path:\s*'\/lcxos'/);
  });
});
