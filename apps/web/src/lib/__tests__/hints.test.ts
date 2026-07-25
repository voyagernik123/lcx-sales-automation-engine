import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GO_IDLE, GO_WINDOW_MS, stepGoGrammar } from '../navGrammar';
import { _resetDismiss, isOverlayOpen, pushDismissible } from '../dismiss';
import {
  HINT_ALPHABET,
  HINT_CHIP_H,
  HINT_LABEL,
  HINT_SELECTOR,
  activateTarget,
  chipWidth,
  collectTargets,
  isHintable,
  layoutTags,
  narrow,
  stepHint,
  tagLength,
  tagsFor,
  type HintTarget,
} from '../hints';
import { HINT_KEY } from '@/hooks/useHints';
import { MANUAL_KEY } from '@/hooks/useManual';

/**
 * The hint layer's mechanics (TERMINAL Phase 7).
 *
 * The claim this file defends is the one the plan made and the app never delivered:
 * every actionable element in the viewport is reachable from the keyboard WITHOUT
 * per-control wiring. Two things can quietly falsify that, and neither shows on
 * screen:
 *
 *  - the tag scheme stops being prefix-free, so a tag fires early and the operator's
 *    second keystroke lands on a page that binds `d` to disqualify;
 *  - the alphabet grows a character the app already binds, at which point the
 *    protection above evaporates during the lazy chunk's load window.
 *
 * Both are arithmetic, so both are tested as arithmetic. What is NOT here: anything
 * requiring layout. jsdom returns 0×0 for every `getBoundingClientRect`, so the
 * viewport filter is tested against STUBBED rects and the real DOM walk is tested in
 * e2e/hints.spec.ts against a real browser. A test that ran the real query here would
 * find nothing and pass, which is the worst of the three outcomes.
 */

const SRC = join(__dirname, '..', '..');

afterEach(() => vi.restoreAllMocks());

function key(k: string, init: KeyboardEventInit = {}): KeyboardEvent {
  return new KeyboardEvent('keydown', { key: k, ...init });
}

describe('tag generation', () => {
  it('gives every tag the same length, so no tag is a prefix of another', () => {
    // The property that makes "type the tag, it fires" need no timeout and no commit
    // key. Checked at the boundaries where an off-by-one would hide: 1 target, exactly
    // one alphabet's worth, exactly capacity, capacity+1.
    //
    // Failures are COLLECTED and asserted once rather than asserted in the loop. Not
    // style: `expect()` per pair is 250,000 assertion objects at n=500, which took the
    // whole file past vitest's 5s default and failed as a timeout — a red test that
    // says nothing about the code.
    for (const n of [1, 2, 11, 12, 13, 143, 144, 145, 500]) {
      const tags = tagsFor(n);
      expect(tags).toHaveLength(n);
      const lengths = new Set(tags.map((t) => t.length));
      expect(lengths.size, `n=${n} produced mixed lengths: ${[...lengths].join(',')}`).toBe(1);

      const prefixes: string[] = [];
      for (const a of tags) {
        for (const b of tags) {
          if (a !== b && a.startsWith(b)) prefixes.push(`${a} starts with ${b}`);
        }
      }
      expect(prefixes, `n=${n}: ${prefixes.slice(0, 5).join(', ')}`).toEqual([]);
    }
  });

  it('never repeats a tag', () => {
    for (const n of [12, 144, 145, 1000]) {
      expect(new Set(tagsFor(n)).size, `n=${n} produced duplicate tags`).toBe(n);
    }
  });

  it('stays at two characters right up to the alphabet squared', () => {
    const k = HINT_ALPHABET.length;
    expect(tagLength(1)).toBe(2);
    expect(tagLength(k * k)).toBe(2);
    expect(tagLength(k * k + 1)).toBe(3);
    expect(tagLength(k * k * k)).toBe(3);
    expect(tagLength(k * k * k + 1)).toBe(4);
  });

  it('agrees with the logarithm for THIS alphabet, and beats it for others', () => {
    /*
     * A correction, kept rather than deleted. `tagLength` counts by multiplication, and
     * the comment in hints.ts originally justified that by claiming
     * `Math.log(144)/Math.log(12)` returns 2.0000000000000004 and `ceil`s to 3. This
     * test failed on that claim: for k=12 the log form is exact, at the square and at
     * the cube. The multiplicative form is insurance for a future alphabet size, and
     * the sweep below is the evidence for that narrower claim.
     */
    const k = HINT_ALPHABET.length;
    for (const p of [2, 3, 4]) {
      expect(Math.ceil(Math.log(k ** p) / Math.log(k)), `k=${k} p=${p}`).toBe(p);
    }

    /*
     * The overshoot set is COMPUTED here, never pinned — and that is the second
     * correction this test has needed.
     *
     * It used to assert `toEqual([...10 hardcoded pairs])` above a comment reading
     * "Measured:". Measured on one machine: Node 22 on arm64 produces ten pairs, and the
     * first CI run to execute this file — Node 20 on x86_64 — produced nine. The
     * disagreement is real and unavoidable: `Math.log(9)/Math.log(3)` is
     * 2.0000000000000004, not 2, because `log(9)` is not exactly twice `log(3)` in
     * binary64, so which (size, power) pairs land on the wrong side of `ceil` depends on
     * the libm the runtime was built against. Pinning that set asserted a property of the
     * machine, not of this module, and would have failed on any contributor's laptop that
     * did not match mine.
     *
     * What the test is actually FOR survives intact, and is stronger for being derived:
     * wherever the logarithm miscounts, the shipped multiplicative `tagLength` must not.
     * Both halves below are exact-integer, so both are platform-independent.
     */
    const overshoots: Array<{ size: number; p: number }> = [];
    for (let size = 2; size <= 40; size++) {
      for (const p of [2, 3, 4]) {
        if (Math.ceil(Math.log(size ** p) / Math.log(size)) !== p) overshoots.push({ size, p });
      }
    }

    // Non-vacuous: if the runtime's `Math.log` were exact everywhere, the loop below would
    // assert nothing and the multiplicative form would need no defending. Every engine
    // measured so far miscounts at k=3, so an empty set means the sweep is broken rather
    // than the hazard being gone.
    expect(
      overshoots.length,
      'the logarithm miscounted nowhere in 2..40 — this sweep no longer demonstrates anything',
    ).toBeGreaterThan(0);

    // THE claim: the shipped function is right for every case the logarithm gets wrong,
    // whatever that set turns out to be on this runtime.
    for (const { size, p } of overshoots) {
      const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789+-*/'.slice(0, size);
      expect(tagLength(size ** p, alphabet), `k=${size} p=${p}`).toBe(p);
    }
  });

  it('never emits a one-character tag, even for a single target', () => {
    // A bare letter is indistinguishable, in the fingers, from the page's own
    // single-letter verbs — see the note in hints.ts.
    expect(tagsFor(1)[0]).toHaveLength(2);
    expect(tagsFor(3).every((t) => t.length === 2)).toBe(true);
  });

  it('varies the FIRST character fastest, so one keystroke actually narrows', () => {
    // With the digits in natural order the first twelve targets would all be tagged
    // `a?`, and typing `a` would eliminate nothing. This is the assertion that keeps
    // the prefix filter useful rather than decorative.
    const tags = tagsFor(24);
    const firsts = tags.slice(0, HINT_ALPHABET.length).map((t) => t[0]);
    expect(new Set(firsts).size).toBe(HINT_ALPHABET.length);
    // 24 targets over a 12-letter alphabet: one keystroke must leave exactly two.
    expect(narrow(tags, 'a')).toHaveLength(2);
  });
});

describe('prefix filtering', () => {
  const tags = tagsFor(30);

  it('an empty prefix keeps everything', () => {
    expect(narrow(tags, '')).toHaveLength(30);
  });

  it('narrows monotonically and is case-insensitive', () => {
    const one = narrow(tags, 'a');
    expect(one.length).toBeGreaterThan(0);
    expect(one.length).toBeLessThan(tags.length);
    expect(narrow(tags, 'A')).toEqual(one);
  });

  it('an impossible prefix keeps nothing', () => {
    // `s` is excluded from the alphabet, so no tag can start with it.
    expect(narrow(tags, 's')).toEqual([]);
  });
});

describe('the alphabet avoids the keys this app already binds', () => {
  /**
   * Every bare letter the app binds outside hint mode, with where it is bound.
   *
   * Maintained BY HAND, and that is the weakness of this test, stated plainly: it
   * cannot notice a new single-letter binding added to a page tomorrow. What it does
   * catch is the likelier direction — somebody widening HINT_ALPHABET without checking.
   */
  const RESERVED: Record<string, string> = {
    s: 'src/pages/BdPipeline.tsx:418 snooze · src/components/queue/SessionMode.tsx:161',
    d: 'src/pages/BdPipeline.tsx:424 disqualify · src/components/queue/SessionMode.tsx:166',
    e: 'src/pages/BdPipeline.tsx:430 enroll · src/components/queue/SessionMode.tsx:171',
    j: 'src/pages/BdPipeline.tsx:398 down · src/components/queue/SessionMode.tsx:176',
    k: 'src/pages/BdPipeline.tsx:402 up',
    g: 'src/lib/navGrammar.ts:79 the go prefix',
    f: 'src/hooks/useHints.ts HINT_KEY — the cancel',
  };

  it('shares no character with a bound bare letter', () => {
    const collisions = [...HINT_ALPHABET].filter((c) => RESERVED[c]);
    expect(
      collisions,
      collisions.map((c) => `'${c}' is already ${RESERVED[c]}`).join('\n'),
    ).toEqual([]);
  });

  it('does not contain the cancel key', () => {
    expect(HINT_ALPHABET.includes(HINT_KEY)).toBe(false);
  });

  it('is large enough that a full screen still gets two-character tags', () => {
    // Measured on the real app in e2e/hints.spec.ts, which prints the in-viewport
    // target count per surface. This is the arithmetic side of that: whatever the
    // count turns out to be, the alphabet has to square past it.
    expect(HINT_ALPHABET.length * HINT_ALPHABET.length).toBeGreaterThanOrEqual(144);
  });

  it('has no duplicate characters, which would silently shrink the tag space', () => {
    expect(new Set(HINT_ALPHABET).size).toBe(HINT_ALPHABET.length);
  });

  it('is what the source file actually declares', () => {
    // Guards the one way the assertions above could all pass and still be about
    // nothing: someone changing the constant's name and leaving a stale copy.
    const src = readFileSync(join(SRC, 'lib', 'hints.ts'), 'utf8');
    expect(src).toContain(`export const HINT_ALPHABET = '${HINT_ALPHABET}'`);
  });
});

/**
 * The other live grammar `f` has to share a keyboard with.
 *
 * `g`-then-digit has a 1500ms window (lib/navGrammar.ts), and both listeners sit on the
 * document. Neither module imports the other, so nothing structural stops the two
 * grammars from corrupting each other — which makes this the kind of interaction that is
 * only ever true by accident until it is asserted.
 */
describe('the go prefix and the hint key do not corrupt each other', () => {
  afterEach(() => _resetDismiss());

  it('pressing f inside the g window cancels the prefix instead of navigating', () => {
    // `f` is not a destination key, and `stepGoGrammar` treats an unrecognised second key
    // as a silent cancel rather than as a fresh first key. If it did the latter, `g f`
    // would behave like `f` AND leave the grammar armed — so the next digit would
    // navigate by surprise, a frame after hint mode drew its chips.
    const armed = { armed: true, armedAt: 1_000 };
    const step = stepGoGrammar(armed, key(HINT_KEY), 1_000 + GO_WINDOW_MS - 1);
    expect(step.go).toBeUndefined();
    expect(step.claim, 'claiming f would stop the hint layer from ever arming').toBe(false);
    expect(step.state.armed).toBe(false);
  });

  it('the g prefix cannot arm at all while hint mode owns the keyboard', () => {
    // Hint mode is on the dismiss stack, and `stepGoGrammar` stands down for anything on
    // it. This is what stops `g` from being half-consumed: the hint layer swallows it as
    // an off-alphabet character and the go grammar never sees a prefix to remember.
    pushDismissible(HINT_LABEL, () => {});
    expect(isOverlayOpen()).toBe(true);
    const step = stepGoGrammar(GO_IDLE, key('g'), 5_000);
    expect(step.state.armed, 'g armed underneath the hint layer').toBe(false);
    expect(step.claim).toBe(false);
  });

  it('and the hint layer swallows g rather than leaving it to the page', () => {
    const step = stepHint(tagsFor(30), '', key('g'));
    expect(step.close).toBe(true);
    expect(step.claim).toBe(true);
  });
});

describe('the key step', () => {
  const tags = tagsFor(30);

  it('leaves Escape entirely alone, because lib/dismiss owns it', () => {
    const step = stepHint(tags, 'a', key('Escape'));
    expect(step).toEqual({ typed: 'a', activate: null, close: false, claim: false });
  });

  it('closes without claiming on a modifier, so ⌘K still opens the command line', () => {
    const step = stepHint(tags, '', key('k', { metaKey: true }));
    expect(step.close).toBe(true);
    expect(step.claim).toBe(false);
  });

  it('toggles off on the hint key itself', () => {
    const step = stepHint(tags, '', key(HINT_KEY));
    expect(step.close).toBe(true);
    // Claimed: the page must not also receive the `f`.
    expect(step.claim).toBe(true);
  });

  it('ignores keys with multi-character names rather than closing', () => {
    // Shift arrives as its own keydown while a capital is being typed, and closing on
    // it would make the alphabet un-growable. Arrows are left alone too: an arrow that
    // scrolls trips the scroll cancel, which is the honest trigger.
    for (const k of ['Shift', 'ArrowDown', 'F5', 'CapsLock', 'Meta']) {
      expect(stepHint(tags, 'a', key(k)), k).toEqual({
        typed: 'a',
        activate: null,
        close: false,
        claim: false,
      });
    }
  });

  it('closes on `?` but does NOT swallow it, so the manual still opens', () => {
    /*
     * A regression this file caught. `claim` now means `stopPropagation` from a capture
     * listener, not just `preventDefault` — without which a fumbled `d` reached
     * BdPipeline's window-level disqualify verb. But `useManual` listens on the document
     * BUBBLE, so the first version of that fix silently stopped `?` from ever opening the
     * manual out of hint mode, which e2e/hints.spec.ts asserts and which is the one global
     * key that deliberately does not stand down for overlays.
     *
     * Yielding is safe here for a reason that does not generalise: `?` has exactly one
     * listener in this app and no page binds it as a verb.
     */
    const step = stepHint(tags, '', key(MANUAL_KEY));
    expect(step.close).toBe(true);
    expect(step.claim, 'claiming `?` stops useManual from ever seeing it').toBe(false);
    expect(step.activate).toBeNull();
  });

  it('swallows an off-alphabet character instead of letting the page have it', () => {
    // THE assertion that stops a mistyped tag from disqualifying a lead. `d` is bound
    // on the queue surfaces; if this ever returns claim:false, a fumbled tag opens the
    // disqualify dialog for whatever row is selected.
    const step = stepHint(tags, '', key('d'));
    expect(step.close).toBe(true);
    expect(step.claim).toBe(true);
    expect(step.activate).toBeNull();
  });

  it('accumulates a prefix, then activates on the completed tag', () => {
    const target = tags[17]!;
    const first = stepHint(tags, '', key(target[0]!));
    expect(first.typed).toBe(target[0]);
    expect(first.activate).toBeNull();
    expect(first.claim).toBe(true);

    const second = stepHint(tags, first.typed, key(target[1]!));
    expect(second.activate).toBe(17);
    expect(second.close).toBe(true);
    expect(second.claim).toBe(true);
  });

  it('is case-insensitive on the tag characters', () => {
    const target = tags[5]!;
    const first = stepHint(tags, '', key(target[0]!.toUpperCase()));
    expect(first.typed).toBe(target[0]);
  });

  it('closes when the prefix can no longer match anything', () => {
    // Only two targets, so only `aa` and `la` exist: `a` then `l` is a dead end.
    const few = tagsFor(2);
    const step = stepHint(few, 'a', key('l'));
    expect(step.close).toBe(true);
    expect(step.claim).toBe(true);
    expect(step.activate).toBeNull();
  });

  it('backspace un-types, so a fumbled first character is not fatal', () => {
    const step = stepHint(tags, 'al', key('Backspace'));
    expect(step.typed).toBe('a');
    expect(step.close).toBe(false);
    expect(step.claim).toBe(true);
  });
});

describe('viewport filtering', () => {
  const viewport = { width: 1000, height: 800 };

  function el(rect: Partial<DOMRect>, html = '<button>x</button>'): Element {
    const host = document.createElement('div');
    host.innerHTML = html;
    const node = host.firstElementChild!;
    document.body.appendChild(host);
    vi.spyOn(node, 'getBoundingClientRect').mockReturnValue({
      top: 0,
      left: 0,
      width: 80,
      height: 24,
      bottom: 24,
      right: 80,
      x: 0,
      y: 0,
      toJSON: () => ({}),
      ...rect,
    } as DOMRect);
    return node;
  }

  it('keeps something on screen', () => {
    expect(isHintable(el({ top: 100, bottom: 124, left: 40, right: 120 }), viewport)).toBe(true);
  });

  it('drops what has scrolled off, in all four directions', () => {
    // The whole reason for filtering: 198 controls including off-screen ones would push
    // every tag to three characters and fill the screen with codes for things nobody
    // can see.
    expect(isHintable(el({ top: -60, bottom: -10 }), viewport)).toBe(false);
    expect(isHintable(el({ top: 900, bottom: 940 }), viewport)).toBe(false);
    expect(isHintable(el({ left: -200, right: -10 }), viewport)).toBe(false);
    expect(isHintable(el({ left: 1200, right: 1400 }), viewport)).toBe(false);
  });

  it('keeps something only half in view', () => {
    // A row scrolled half off the bottom is still something the operator can see and
    // mean. Intersection, not containment.
    expect(isHintable(el({ top: 780, bottom: 830 }), viewport)).toBe(true);
  });

  it('drops a zero-area element', () => {
    expect(isHintable(el({ width: 0, height: 0, bottom: 0, right: 0 }), viewport)).toBe(false);
  });

  it('drops anything under an aria-hidden ancestor', () => {
    const wrap = document.createElement('div');
    wrap.setAttribute('aria-hidden', 'true');
    const node = el({ top: 10, bottom: 34 });
    wrap.appendChild(node);
    document.body.appendChild(wrap);
    expect(isHintable(node, viewport)).toBe(false);
  });

  it('drops aria-disabled, which looks enabled to the selector', () => {
    const node = el({ top: 10, bottom: 34 });
    node.setAttribute('aria-disabled', 'true');
    expect(isHintable(node, viewport)).toBe(false);
  });

  it('never tags its own chips', () => {
    const layer = document.createElement('div');
    layer.setAttribute('data-hint-layer', '');
    const node = el({ top: 10, bottom: 34 });
    layer.appendChild(node);
    document.body.appendChild(layer);
    expect(isHintable(node, viewport)).toBe(false);
  });
});

describe('the selector reaches the things that are not buttons', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('matches links, role=button spans, table rows and an SVG group', () => {
    // The four shapes the brief singles out, because each one is a control this app
    // ships and none of them is a <button>.
    document.body.innerHTML = `
      <a href="/x">link</a>
      <span role="button" tabindex="0">custom</span>
      <table><tbody><tr data-list-row="0" tabindex="-1"><td>row</td></tr></tbody></table>
      <svg><g role="button" tabindex="0"><rect /></g></svg>
      <div>not actionable</div>
    `;
    const matched = Array.from(document.querySelectorAll(HINT_SELECTOR));
    expect(matched.map((e) => e.tagName.toLowerCase())).toEqual(['a', 'span', 'tr', 'g']);
  });

  it('picks up a roving-tabindex row even at tabindex=-1', () => {
    // 199 of 200 rows sit at -1 under the roving tabindex, so the generic
    // `[tabindex]:not([tabindex^="-"])` clause misses almost all of them. This is why
    // `[data-list-row]` is named explicitly.
    document.body.innerHTML = `<div data-list-row="7" tabindex="-1">row</div>`;
    expect(document.querySelectorAll(HINT_SELECTOR)).toHaveLength(1);
  });

  it('skips a disabled control and a hidden input', () => {
    document.body.innerHTML = `
      <button disabled>no</button>
      <input type="hidden" value="no" />
      <select disabled></select>
      <button>yes</button>
    `;
    const matched = Array.from(document.querySelectorAll(HINT_SELECTOR));
    expect(matched).toHaveLength(1);
    expect(matched[0]!.textContent).toBe('yes');
  });
});

describe('chip layout', () => {
  const at = (tag: string, top: number, left: number): HintTarget =>
    ({ el: document.createElement('div'), tag, top, left }) as HintTarget;

  it('pushes co-located chips apart instead of stacking them', () => {
    // The real case: a lead row is a target AND contains an EntityChip and two
    // role="button" derived values, so four chips want the same corner.
    const out = layoutTags([at('aa', 100, 40), at('la', 100, 40), at('ha', 100, 40)]);
    expect(out.map((t) => t.top)).toEqual([100, 100 + HINT_CHIP_H, 100 + 2 * HINT_CHIP_H]);
    // Horizontal position is untouched: it is what associates a chip with a column.
    expect(new Set(out.map((t) => t.left))).toEqual(new Set([40]));
  });

  it('leaves chips that do not overlap where they were', () => {
    const out = layoutTags([at('aa', 100, 40), at('la', 100, 400), at('ha', 300, 40)]);
    expect(out.map((t) => t.top)).toEqual([100, 100, 300]);
  });

  it('treats horizontally adjacent chips as clear once they clear the chip width', () => {
    const w = chipWidth('aa');
    const out = layoutTags([at('aa', 100, 0), at('la', 100, w)]);
    expect(out.map((t) => t.top)).toEqual([100, 100]);
  });

  it('gives up rather than looping on a pathological nest', () => {
    // 40 targets at one point cannot all be separated within the guard, and a
    // cosmetic overlap is strictly better than a hang.
    const out = layoutTags(Array.from({ length: 40 }, (_, i) => at(tagsFor(40)[i]!, 100, 40)));
    expect(out).toHaveLength(40);
    expect(out.every((t) => Number.isFinite(t.top))).toBe(true);
  });
});

describe('collection ties it together', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('tags only what is in view, in document order', () => {
    document.body.innerHTML = `
      <button id="a">a</button>
      <button id="off">off</button>
      <button id="b">b</button>
    `;
    for (const [id, top] of [
      ['a', 10],
      ['off', 5000],
      ['b', 30],
    ] as const) {
      const node = document.getElementById(id)!;
      vi.spyOn(node, 'getBoundingClientRect').mockReturnValue({
        top,
        left: 0,
        width: 40,
        height: 20,
        bottom: top + 20,
        right: 40,
        x: 0,
        y: top,
        toJSON: () => ({}),
      } as DOMRect);
    }

    const targets = collectTargets(document, { width: 800, height: 600 });
    expect(targets.map((t) => (t.el as HTMLElement).id)).toEqual(['a', 'b']);
    // Two targets, so two-character tags with distinct first characters.
    expect(targets.map((t) => t.tag)).toEqual(['aa', 'la']);
  });
});

describe('activation', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('reports a detached target instead of acting on it', async () => {
    // The tags are a snapshot; a target can unmount between `f` and the second
    // character. Acting on a detached node would be a silent no-op that looks like
    // the layer is broken.
    const orphan = document.createElement('button');
    await expect(activateTarget(orphan)).resolves.toBe('detached');
  });

  it('clicks a real button', async () => {
    document.body.innerHTML = '<button id="b">go</button>';
    const btn = document.getElementById('b')!;
    const seen: string[] = [];
    btn.addEventListener('click', () => seen.push('click'));
    await expect(activateTarget(btn)).resolves.toBe('click');
    expect(seen).toEqual(['click']);
  });

  it('dispatches an event rather than calling click(), so SVG works', async () => {
    // `HTMLElement.prototype.click` does not exist on SVGElement, so an
    // `el.click()` implementation would throw on the `<g role="button">` targets
    // this layer is explicitly required to reach.
    document.body.innerHTML = '<svg><g id="g" role="button" tabindex="0"><rect /></g></svg>';
    const g = document.getElementById('g')!;
    expect('click' in g && typeof (g as unknown as { click?: unknown }).click === 'function').toBe(false);
    let clicked = false;
    g.addEventListener('click', () => {
      clicked = true;
    });
    await activateTarget(g);
    expect(clicked).toBe(true);
  });

  it('only focuses a text field, because clicking one achieves nothing', async () => {
    document.body.innerHTML = '<input id="t" type="text" />';
    const input = document.getElementById('t')!;
    let clicked = false;
    input.addEventListener('click', () => {
      clicked = true;
    });
    await expect(activateTarget(input)).resolves.toBe('focus');
    expect(clicked).toBe(false);
    expect(document.activeElement).toBe(input);
  });

  it('falls back to Enter for a custom target whose click changes nothing', async () => {
    // A row whose activation lives in a container-level onKeyDown rather than its own
    // onClick. Without this, the tag would appear to do nothing at all.
    document.body.innerHTML = '<div id="r" role="button" tabindex="0">row</div>';
    const row = document.getElementById('r')!;
    const seen: string[] = [];
    row.addEventListener('click', () => seen.push('click'));
    row.addEventListener('keydown', (e) => seen.push(`keydown:${(e as KeyboardEvent).key}`));
    await expect(activateTarget(row)).resolves.toBe('click+key');
    expect(seen).toEqual(['click', 'keydown:Enter']);
  });

  it('does NOT send Enter when the click already did something', async () => {
    // The double-activation hazard. A row that handles both would otherwise open twice
    // — or worse, toggle twice and land back where it started.
    document.body.innerHTML = '<div id="r" role="button" tabindex="0">row</div>';
    const row = document.getElementById('r')!;
    const seen: string[] = [];
    row.addEventListener('click', () => {
      seen.push('click');
      // Any DOM change at all is enough — this is what the MutationObserver sees.
      document.body.appendChild(document.createElement('span'));
    });
    row.addEventListener('keydown', () => seen.push('keydown'));
    await expect(activateTarget(row)).resolves.toBe('click');
    expect(seen).toEqual(['click']);
  });

  it('does NOT send Enter when the click was default-prevented', async () => {
    document.body.innerHTML = '<div id="r" role="button" tabindex="0">row</div>';
    const row = document.getElementById('r')!;
    const seen: string[] = [];
    row.addEventListener('click', (e) => {
      seen.push('click');
      e.preventDefault();
    });
    row.addEventListener('keydown', () => seen.push('keydown'));
    await expect(activateTarget(row)).resolves.toBe('click');
    expect(seen).toEqual(['click']);
  });

  it('never sends Enter to a native control, even a silent one', async () => {
    // A <button> with no handler did nothing on click, but sending it Enter would be
    // a second activation attempt on something the platform already handled.
    document.body.innerHTML = '<button id="b">quiet</button>';
    const btn = document.getElementById('b')!;
    const seen: string[] = [];
    btn.addEventListener('keydown', () => seen.push('keydown'));
    await expect(activateTarget(btn)).resolves.toBe('click');
    expect(seen).toEqual([]);
  });

  it('focuses before it clicks, so the keyboard stays where it landed', async () => {
    // `lib/dismiss.ts` names losing focus to <body> the worst keyboard defect measured
    // in this shell: after it, Tab restarts from the top of the document.
    document.body.innerHTML = '<button id="b">go</button>';
    const btn = document.getElementById('b')!;
    let focusedAtClick: Element | null = null;
    btn.addEventListener('click', () => {
      focusedAtClick = document.activeElement;
    });
    await activateTarget(btn);
    expect(focusedAtClick).toBe(btn);
  });
});

/**
 * The chip's contrast, and the reason it is a fixed treatment rather than a themed one.
 *
 * A hint chip is the only surface in this app that lands over CONTENT rather than over
 * a known token — it can sit on a white cell, a navy header, a chart, or an image. So
 * the usual method (measure the pair) does not apply; there is no pair. What can be
 * proven instead is a floor: with the fill at one end of the luminance range and the
 * border at the other, the worse of the two boundaries is maximised, and the sweep
 * below finds its minimum over every possible background.
 *
 * That is what rules out every candidate TOKEN. `--amber-bg` is #FDF3D7 in light and
 * #32280F in dark; a chip that inverts with the theme cannot hold a floor, because in
 * one of the two themes both fill and border sit at the same end. So the fill is
 * Tailwind's `amber-200`, fixed in both themes, and only the text/border role comes
 * from a token — `--navy-deep`, whose light and dark values are BOTH dark, which is
 * the property that makes it safe here.
 */
describe('the chip is legible over arbitrary content', () => {
  const luminance = ([r, g, b]: [number, number, number]) => {
    const f = (v: number) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratioFromL = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

  /** Tailwind's `amber-200`. Pinned to the class the component actually renders below. */
  const FILL: [number, number, number] = [253, 230, 138];

  function navyDeep(): { light: [number, number, number]; dark: [number, number, number] } {
    const css = readFileSync(join(SRC, 'styles', 'tokens.css'), 'utf8');
    const found: Array<[number, number, number]> = [];
    for (const m of css.matchAll(/--navy-deep:\s*(\d+)\s+(\d+)\s+(\d+)/g)) {
      found.push([Number(m[1]), Number(m[2]), Number(m[3])]);
    }
    expect(found.length, 'tokens.css must define --navy-deep for both themes').toBe(2);
    return { light: found[0]!, dark: found[1]! };
  }

  it('renders the exact fill and ink this test measures', () => {
    // Without this the numbers below are about a colour nobody ships.
    const src = readFileSync(join(SRC, 'components', 'help', 'HintTags.tsx'), 'utf8');
    expect(src).toContain('bg-amber-200');
    expect(src).toContain('text-navy-deep');
    expect(src).toContain('border-navy-deep');
  });

  it('the tag text clears 4.5:1 in both themes', () => {
    const { light, dark } = navyDeep();
    const fill = luminance(FILL);
    const lightRatio = ratioFromL(luminance(light), fill);
    const darkRatio = ratioFromL(luminance(dark), fill);
    // Measured: 13.35:1 light, 15.78:1 dark. Recorded so a fill change cannot quietly
    // erode them.
    expect(lightRatio).toBeGreaterThanOrEqual(4.5);
    expect(darkRatio).toBeGreaterThanOrEqual(4.5);
    expect(Math.round(lightRatio * 100) / 100).toBe(13.35);
    expect(Math.round(darkRatio * 100) / 100).toBe(15.78);
  });

  it('one of the chip edges always clears 3:1, whatever is behind it', () => {
    // The sweep. For every possible background luminance, the better of {fill vs
    // background, border vs background} must clear the WCAG 1.4.11 non-text minimum,
    // because it only takes one visible boundary to see the chip. The minimum lands
    // where the two ratios cross.
    const { light, dark } = navyDeep();
    const fill = luminance(FILL);
    for (const [name, ink] of [
      ['light', luminance(light)],
      ['dark', luminance(dark)],
    ] as const) {
      let worst = Infinity;
      let worstAt = 0;
      for (let i = 0; i <= 1000; i++) {
        const bg = i / 1000;
        const best = Math.max(ratioFromL(fill, bg), ratioFromL(ink, bg));
        if (best < worst) {
          worst = best;
          worstAt = bg;
        }
      }
      // Measured floors: 3.66:1 light against a background at relative luminance
      // 0.181, and 3.98:1 dark at 0.162. Those are the crossover points where the fill
      // and the border are equally hard to see; everywhere else one of them is better.
      expect(worst, `${name} worst-case chip edge is ${worst.toFixed(2)}:1 at bg L=${worstAt}`).toBeGreaterThanOrEqual(3);
      expect(Math.round(worst * 100) / 100).toBe(name === 'light' ? 3.66 : 3.98);
      expect(worstAt).toBeCloseTo(name === 'light' ? 0.181 : 0.162, 3);
    }
  });
});
