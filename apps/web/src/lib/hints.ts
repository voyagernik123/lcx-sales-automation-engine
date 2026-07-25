import { isOverlayOpen } from '@/lib/dismiss';
import { HINT_KEY } from '@/hooks/useHints';
import { MANUAL_KEY } from '@/hooks/useManual';

/**
 * The hint layer's mechanics — `f` tags every control in view (TERMINAL Phase 7).
 *
 * WHAT THIS IS FOR, stated as the plan stated it. LCX_TERMINAL_PLAN.md §C names
 * hint labels as the mechanism that makes "the entire platform keyboard-reachable,
 * forever, including pages built later", against a counted 198 arbitrary controls.
 * What actually shipped through six phases was 15 of those converted by hand, plus
 * a roving tabindex on the one table that adopted the hook. Hand-conversion is not
 * a smaller version of this feature; it is a different feature that has to be
 * redone for every page anyone adds. So the single non-negotiable property here is
 * ZERO PER-CONTROL WIRING: targets are discovered by querying the DOM at press
 * time. Nothing opts in, nothing takes a prop, and a page written next year is
 * covered on the day it renders.
 *
 * WHY THE TAGS ARE ALL THE SAME LENGTH, which is the one design decision worth
 * defending at length. The alternative — Vimium's own — is variable-length tags
 * where a short tag is a prefix of nothing and activation happens as soon as the
 * typed prefix is unambiguous. That is fewer keystrokes and it is the wrong trade
 * HERE, because of what the second keystroke would hit. If the layer draws `AL`
 * and then fires on `A`, the `L` lands on whatever the newly-activated surface
 * binds it to. On the two queue surfaces in this app the bare letters are
 * `s` snooze, `d` disqualify, `e` enroll (src/pages/BdPipeline.tsx:418-435,
 * src/components/queue/SessionMode.tsx:160-175) — that is a grammar where a
 * stray letter mutates a record. Uniform length makes the label a promise about
 * how many keys it will take, and a promise the layer always keeps is worth more
 * than one saved keystroke. Uniform length is also prefix-free by construction, so
 * "type the tag, it fires" needs no debounce and no commit key.
 *
 * WHY A MINIMUM OF TWO, even with three targets on screen. A one-character tag is
 * indistinguishable, in the fingers, from the page's own single-letter verbs. The
 * surfaces above spend all day teaching the operator that a bare letter DOES
 * something; drawing a tag that reads `A` invites the belief that bare letters do
 * things outside hint mode too. Two characters read as a code. It also keeps the
 * motion invariant — `f` then two keys, always — which is the part that becomes
 * muscle memory.
 *
 * WHAT IS NOT CLAIMED. This module snapshots the viewport at press time and does
 * not track it. Scroll and resize therefore CANCEL hint mode rather than
 * repositioning (see HintTags.tsx): repositioning existing chips while new
 * untagged targets slide into view would draw a screen that lies about what is
 * reachable, and reassigning tags mid-type would change the label the operator is
 * halfway through. Cancelling is the only option that never shows a false tag.
 */

/**
 * The dismiss-stack label. Exported so `lib/manual.ts` and the layer cannot
 * disagree — the manual reports the live stack, so a drifted label would make the
 * manual describe a layer that is not the one on screen.
 */
export const HINT_LABEL = 'hint tags';

/**
 * The tag alphabet: home-row-biased, and disjoint from every bare letter this app
 * already binds.
 *
 * EXCLUDED, and each one is a real binding, not a precaution: `s` `d` `e` `j` `k`
 * (src/pages/BdPipeline.tsx:398-435), `s` `d` `e` `j`
 * (src/components/queue/SessionMode.tsx:160-186), `g` (src/lib/navGrammar.ts:79),
 * and `f` itself, which cancels. `hints.test.ts` asserts the disjointness so a
 * later addition to this string cannot silently collide; what that test CANNOT do
 * is notice a NEW single-letter binding added to a page, so the list above is
 * maintained by hand and is the weak link.
 *
 * The exclusion matters even though hint mode swallows every single-character key while
 * it is armed, and the reason is the lazy chunk. `f` is owned by an eager listener but
 * the layer that consumes tag characters arrives with a dynamic import, so there
 * is a real window — measured in e2e/hints.spec.ts — between the press and the
 * layer being live. Characters typed into that window reach the page. With this
 * alphabet the worst they can do is nothing.
 *
 * ORDERED BY ERGONOMICS because for fewer than 12 targets only the first `n`
 * characters are ever used as a first character: `a` `l` `h` are the three home-row
 * keys left after the exclusions, then the strongest single-finger reaches.
 * `i` is deliberately absent even though it is available — `I` and `L` are the one
 * pair a reader has to look twice at, and there are 19 legal letters for 12 slots,
 * so the ambiguity costs nothing to avoid.
 */
export const HINT_ALPHABET = 'alhountrwcvm';

/**
 * Everything that can be actuated, expressed as one selector.
 *
 * `[role="button"]` is what covers an SVG `<g role="button">`, since
 * `querySelectorAll` does not care about the namespace. `[data-list-row]` is in here
 * because this app's tables are rows-as-targets by convention
 * (src/hooks/useListNavigation.ts:243) and a roving tabindex leaves all but one of
 * them at `tabindex="-1"`, so the generic tabindex clause would miss 199 of 200.
 *
 * `[tabindex]:not([tabindex^="-"])` is last and is the catch-all that makes the
 * "no per-control wiring" claim true for controls nobody anticipated: anything a
 * developer made keyboard-focusable is, by that act, something this layer can reach.
 *
 * WHAT THIS DOES NOT REACH, counted rather than guessed. A scan of every JSX opening tag
 * on a non-interactive element carrying `onClick` found 30; 16 also carry `role`,
 * `tabIndex` or `data-list-row` and are therefore matched above. Of the remaining 14, ten
 * are backdrops or `stopPropagation` guards (`components/ui/Modal.tsx:43`,
 * `components/help/Manual.tsx:73`, `components/lineage/Derived.tsx:96`, the four drawer
 * scrims, …) which MUST NOT be tagged — a chip on a full-screen scrim is a chip that
 * dismisses the thing the operator is reading. Two are SVG `<g>` wrappers whose painted
 * child already carries `role="button"` + `tabIndex`
 * (`components/kpi/PipelineSankey.tsx:132`, `components/competition/StrategicMatrix.tsx:237`),
 * so the action is reachable through the child.
 *
 * The genuine gap is the last two, and it is structural rather than an omission: click
 * SURFACES that decode WHERE inside themselves you clicked.
 * `src/pages/WinLoss.tsx:82` reads `e.clientX`/`e.clientY`; `FunnelSection.tsx:24` reads
 * `e.target`. `activateTarget` dispatches a synthetic `MouseEvent` with no coordinates and
 * with the surface itself as the target, so tagging them would draw a chip that does
 * NOTHING — measured against the source of `columnIndexFromClick`, whose first guard
 * (`e.clientY < rect.top`) rejects a coordinate-less event outright. An inert tag is worse
 * than an absent one, so they stay out, and the manual line says "the controls in view"
 * rather than "every control".
 */
export const HINT_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'summary',
  '[role="button"]',
  '[role="link"]',
  '[role="menuitem"]',
  '[role="menuitemcheckbox"]',
  '[role="menuitemradio"]',
  '[role="tab"]',
  '[role="option"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="switch"]',
  '[role="combobox"]',
  '[data-list-row]',
  '[contenteditable=""]',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex^="-"])',
].join(',');

/* ── Scope ───────────────────────────────────────────────────────────────────
 * WHERE THE LAYER IS ALLOWED TO LOOK, added because the answer used to be "nowhere, if
 * anything is open" and that cost the feature its most valuable surface.
 *
 * `useHints` used to refuse `f` outright while `isOverlayOpen()`, justified by "two
 * overlays' worth of controls is 2-3 Tab stops". MEASURED on the partner dossier: 24 Tab
 * stops, and e2e/keyboardday.spec.ts flow 3 attributes the worst keyboard cost of the five
 * flows to exactly that drawer. So the mechanism built to make the platform
 * keyboard-reachable was blind on the surface that needed it most.
 *
 * The stand-down was still protecting something real, and it is NOT the keystroke hazard.
 * That one — a fumbled tag character reaching `d` disqualify / `s` snooze on the page
 * behind — is now held by `HintTags`'s CAPTURE-phase listener plus `stopPropagation()`,
 * which is a strictly stronger guarantee than going quiet and is asserted for the overlay
 * case in `components/help/__tests__/hintTags.test.tsx`. What the stand-down also
 * prevented is a chip drawn on a control BEHIND the backdrop: Tab is trapped away from it,
 * so a tag that activates it acts on a surface the operator cannot see and did not choose.
 *
 * So the fix is a scope rather than a veto, and it is deliberately CONSERVATIVE in both
 * directions — every branch that cannot answer "which overlay is the operator looking at?"
 * with certainty returns `unscoped`, which draws nothing and behaves exactly as the old
 * stand-down did. This can make the feature absent; it cannot make it wrong.
 */

/**
 * The layer's own stacking level, pinned to the class on the chip container in
 * `HintTags.tsx` by `lib/__tests__/hintScope.test.ts` — Tailwind needs the literal in the
 * source, so the constant and the class can drift and the number is load-bearing below.
 */
export const HINT_LAYER_Z = 110;

/**
 * How an overlay announces itself. Not invented here: this is the same declaration
 * `lib/__tests__/dismissRegistration.test.ts` already ratchets the whole app against
 * ("every overlay is on the one Escape stack" recognises an overlay by exactly these three
 * attributes), so scoping to it borrows an invariant that is already enforced rather than
 * adding a second, weaker one.
 */
export const HINT_OVERLAY_SELECTOR = '[role="dialog"],[role="alertdialog"],[aria-modal="true"]';

export type HintScopeKind = 'page' | 'overlay' | 'unscoped';

export interface HintScope {
  readonly kind: HintScopeKind;
  /** What to query. `null` means draw nothing. */
  readonly root: ParentNode | null;
}

/** `visibility`/`opacity`/`display` — the three ways a node keeps its rect and stops existing. */
function isDisplayed(el: Element): boolean {
  const check = (el as Element & { checkVisibility?: (o?: unknown) => boolean }).checkVisibility;
  if (typeof check !== 'function') return true;
  return check.call(el, { visibilityProperty: true, opacityProperty: true, contentVisibilityAuto: true });
}

/**
 * Would this element, or anything it sits inside, paint at or above the hint layer?
 *
 * Read off the Tailwind class rather than out of `getComputedStyle`, and that is a
 * deliberate choice with a real cost. The class is where this app states its stacking —
 * `z-40` on the dossier, `z-[120]` on the manual — and a class is legible in jsdom, where
 * no stylesheet is loaded and every computed `z-index` is `auto`. A computed-style version
 * of this function would be a decoration in every unit test that "covers" it.
 *
 * What it therefore does NOT catch: a z-index applied from a stylesheet or an inline
 * style. That direction of error is unsafe (it would let the layer scope to an overlay it
 * paints under, and draw chips nobody can see), so `hintScope.test.ts` also enumerates the
 * app's trapping overlays and fails if any of them stops expressing its level as a class.
 */
function paintsAtOrAbove(el: Element, level: number): boolean {
  for (let node: Element | null = el; node; node = node.parentElement) {
    for (const cls of Array.from(node.classList)) {
      const m = /^z-(?:\[(\d+)\]|(\d+))$/.exec(cls);
      if (m && Number(m[1] ?? m[2]) >= level) return true;
    }
  }
  return false;
}

/**
 * Which subtree `f` may tag right now.
 *
 * `page` — nothing is open, so the whole document, exactly as before.
 *
 * `overlay` — one overlay is on screen and the layer can paint over it, so its root and
 * nothing else. The controls behind the backdrop are unreachable by Tab and must stay
 * untagged; the backdrop itself is outside the root, which is what keeps a chip off the
 * one element whose job is to dismiss what the operator is reading.
 *
 * `unscoped` — draw nothing. Three cases reach it, and all three are the old behaviour:
 *   · NO CANDIDATE. Something is on the dismiss stack without declaring overlay ARIA
 *     (`SessionMode`'s letter-key surface, a tooltip). Nothing to scope to.
 *   · MORE THAN ONE. A modal over a drawer. Document order is not paint order and this
 *     module has no honest way to rank them — `lib/dismiss.ts` knows, because its stack IS
 *     the ranking, but it exposes `topTraps()` as a boolean rather than the container. The
 *     exact version of this function is three lines long and needs a `topContainer()`
 *     export from that module; until then, ambiguity refuses.
 *   · THE LAYER PAINTS UNDERNEATH IT. The manual is `z-[120]` and the chips are
 *     `z-[110]`, so tagging the manual would draw a full status pill and zero visible
 *     chips — a feature that looks broken rather than absent. `f` and `?` are mutually
 *     exclusive by design already (rung 5 below closes hint mode on `?`); this is the
 *     same exclusion pointed the other way.
 */
export function resolveHintScope(doc: ParentNode = document): HintScope {
  if (!isOverlayOpen()) return { kind: 'page', root: doc };

  const candidates = Array.from(doc.querySelectorAll(HINT_OVERLAY_SELECTOR)).filter(isDisplayed);
  if (candidates.length !== 1) return { kind: 'unscoped', root: null };

  const root = candidates[0]!;
  if (paintsAtOrAbove(root, HINT_LAYER_Z)) return { kind: 'unscoped', root: null };
  return { kind: 'overlay', root };
}

/**
 * The snapshot the layer renders: what to tag, and which of the three answers above
 * produced it, so the status line can say "nothing here" and "I cannot tell where you
 * are" in different words.
 */
export function hintSnapshot(
  viewport: Viewport = { width: window.innerWidth, height: window.innerHeight },
): { kind: HintScopeKind; targets: HintTarget[] } {
  const scope = resolveHintScope();
  if (!scope.root) return { kind: scope.kind, targets: [] };
  return { kind: scope.kind, targets: collectTargets(scope.root, viewport) };
}

/**
 * Chip height in CSS pixels, including its 1px border.
 *
 * A constant because `layoutTags` has to resolve overlaps before anything is
 * rendered and therefore cannot measure. It is pinned to the rendered element by
 * `e2e/hints.spec.ts`, which reads a real chip's `offsetHeight` and fails if the two
 * disagree — otherwise this is exactly the kind of number that silently stops
 * matching the CSS.
 */
export const HINT_CHIP_H = 15;

/** Rendered chip width, approximated from the 10px monospace advance + padding. */
export function chipWidth(tag: string): number {
  // 6px per glyph at font-size 10px in JetBrains Mono (advance is 0.6em), plus
  // 4px horizontal padding either side and 1px border either side. Approximate ON
  // PURPOSE: this feeds overlap avoidance, where being a pixel out shifts a chip
  // that did not need shifting, and the alternative is a synchronous measure pass
  // over every target.
  return tag.length * 6 + 10;
}

export interface Viewport {
  width: number;
  height: number;
}

export interface HintTarget {
  readonly el: Element;
  readonly tag: string;
  /** Viewport coordinates for the chip, after overlap resolution. */
  readonly top: number;
  readonly left: number;
}

/**
 * How many characters every tag needs so that `count` of them fit and none is a
 * prefix of another.
 *
 * Counted by multiplication rather than `Math.ceil(Math.log(n) / Math.log(k))`, and
 * the honest reason is narrower than the one I first wrote here. I claimed the log
 * form overshoots for this alphabet; it does not — MEASURED, `Math.log(144) /
 * Math.log(12)` is exactly 2, and so is the k=12 case at 1728. It DOES overshoot for
 * other alphabet sizes: swept k=2..40 at powers 2..4, the log form returns
 * 2.0000000000000004-style values and `ceil`s one too high for k=3 at every power and
 * for k ∈ {5,6,7,18,25,36,39} at the cube. So this is insurance against someone
 * resizing HINT_ALPHABET, not a fix for a live bug — and the cost of getting it wrong
 * is invisible: every tag on a full screen would silently be one character longer.
 */
export function tagLength(count: number, alphabet: string = HINT_ALPHABET): number {
  const k = alphabet.length;
  let length = 2;
  let capacity = k * k;
  while (capacity < count) {
    capacity *= k;
    length += 1;
  }
  return length;
}

/**
 * Assign a tag to each of `count` targets.
 *
 * The FIRST character varies fastest, which is the opposite of how you would write
 * a number, and it is the whole reason the prefix filter is useful. With the digits
 * in the natural order the first 12 targets would all be tagged `A?` and typing `A`
 * would narrow nothing; with them reversed, typing one character cuts a 40-target
 * screen to 4. Adjacent targets in document order also get different first
 * characters, so the survivors of the first keystroke are scattered rather than
 * clustered — easier to pick out.
 */
export function tagsFor(count: number, alphabet: string = HINT_ALPHABET): string[] {
  const k = alphabet.length;
  const length = tagLength(count, alphabet);
  const tags: string[] = [];
  for (let i = 0; i < count; i++) {
    let rest = i;
    let tag = '';
    for (let d = 0; d < length; d++) {
      tag += alphabet[rest % k];
      rest = Math.floor(rest / k);
    }
    tags.push(tag);
  }
  return tags;
}

/** Indices of the tags still in play after the operator has typed `prefix`. */
export function narrow(tags: readonly string[], prefix: string): number[] {
  const out: number[] = [];
  const p = prefix.toLowerCase();
  for (let i = 0; i < tags.length; i++) {
    if (tags[i]!.startsWith(p)) out.push(i);
  }
  return out;
}

/**
 * Is this element worth tagging, given where it is right now?
 *
 * Split out from `collectTargets` so it can be unit-tested against stubbed rects —
 * jsdom has no layout at all, so every `getBoundingClientRect` is 0×0 there and a
 * test that ran the real query would assert on an empty list and pass.
 *
 * THE LIMIT, stated because it is the direction of error that matters and because the
 * manual line was narrowed for it. "In view" here means IN THE VIEWPORT. It does not
 * mean unclipped by an ancestor and it does not mean unoccluded. A control scrolled out
 * of a short `max-h-*` scroller — and this app has a dozen of them
 * (src/components/layout/NotificationBell.tsx:133, src/pages/Integrations.tsx:568,
 * src/pages/LeadDetail.tsx:54, src/pages/Ops.tsx:203, and others) — has a rect that is
 * still inside the viewport, so it is tagged, and its chip is drawn over whatever
 * happens to be at those coordinates. That is worse than a missing tag, because the
 * operator did not choose it.
 *
 * NOT FIXED HERE, deliberately. The two candidate fixes are an ancestor walk
 * intersecting every clipping box, or one `elementFromPoint` hit-test per candidate. Both
 * would newly EXCLUDE targets, and neither can be validated in jsdom (no layout) — so
 * shipping either on a unit-test-only basis risks turning an over-tagging cosmetic defect
 * into a silent under-tagging one that kills the feature on surfaces nobody checked. The
 * spec that would settle it: an e2e that opens a surface with a short scroller, scrolls
 * the INNER container (not the page), presses `f`, and asserts no chip is drawn for an
 * element whose rect no longer intersects its nearest clipping ancestor. Until that
 * exists this stays a stated limit rather than an unverified heuristic.
 */
export function isHintable(el: Element, viewport: Viewport): boolean {
  // Our own chips carry no matching selector, but a future control inside the layer
  // would, and tagging the tags is a loop worth being immune to.
  if (el.closest('[data-hint-layer]')) return false;
  if (el.getAttribute('aria-disabled') === 'true') return false;
  // Checked on ancestors too: an `aria-hidden` wrapper is how this app hides a
  // collapsed panel that still has layout, and its buttons are not reachable.
  if (el.closest('[aria-hidden="true"]')) return false;

  const rect = el.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  // Viewport intersection, not containment: a row half-scrolled off the bottom is
  // still something the operator can see and mean.
  if (rect.bottom <= 0 || rect.right <= 0) return false;
  if (rect.top >= viewport.height || rect.left >= viewport.width) return false;

  // `checkVisibility` is the only cheap way to catch `visibility: hidden` and
  // `opacity: 0`, both of which leave a normal-looking rect behind. It exists in
  // the shipping WKWebView and in Chrome; where it does not exist the rect test
  // above is all we have, and that is stated rather than papered over.
  const check = (el as Element & { checkVisibility?: (o?: unknown) => boolean }).checkVisibility;
  if (typeof check === 'function') {
    return check.call(el, { visibilityProperty: true, opacityProperty: true, contentVisibilityAuto: true });
  }
  return true;
}

/**
 * Every actionable element in the viewport, in document order, tagged.
 *
 * Document order rather than visual order: it is free, it is deterministic, and it
 * is the order Tab and a screen reader already use, so the tags do not impose a
 * second, competing sense of "next".
 */
export function collectTargets(
  root: ParentNode = document,
  viewport: Viewport = { width: window.innerWidth, height: window.innerHeight },
): HintTarget[] {
  const found: Element[] = [];
  for (const el of Array.from(root.querySelectorAll(HINT_SELECTOR))) {
    if (isHintable(el, viewport)) found.push(el);
  }
  const tags = tagsFor(found.length);
  return layoutTags(
    found.map((el, i) => {
      const rect = el.getBoundingClientRect();
      return {
        el,
        tag: tags[i]!,
        // Clamped so a chip for a control flush against the top or left edge is not
        // half off-screen. Not clamped at the far edges: a chip that runs a few px
        // past the right edge is still readable, and pulling it left would move it
        // off the element it belongs to, which is worse.
        top: Math.max(0, rect.top),
        left: Math.max(0, rect.left),
      };
    }),
  );
}

/**
 * Push overlapping chips apart.
 *
 * Necessary because this app nests targets deliberately: a lead row is a target AND
 * contains an `EntityChip` and two `role="button"` derived values
 * (src/components/bd/LeadTable.tsx:168-186), so four chips want the same corner.
 * Unresolved, they stack into an unreadable smear and the operator cannot tell
 * which tag belongs to the row.
 *
 * Pushes DOWN rather than sideways: a chip's horizontal position is what associates
 * it with a column, and columns in this app are narrow enough that a sideways nudge
 * would put a chip over the wrong cell.
 */
export function layoutTags(placed: readonly HintTarget[]): HintTarget[] {
  const out: HintTarget[] = [];
  for (const item of placed) {
    let top = item.top;
    const width = chipWidth(item.tag);
    // Bounded: with a very deep nest this gives up rather than looping, and a chip
    // that is still overlapping is a cosmetic defect where a hang is not.
    for (let guard = 0; guard < 20; guard++) {
      const clash = out.some(
        (other) =>
          Math.abs(other.top - top) < HINT_CHIP_H &&
          other.left < item.left + width &&
          item.left < other.left + chipWidth(other.tag),
      );
      if (!clash) break;
      top += HINT_CHIP_H;
    }
    out.push({ ...item, top });
  }
  return out;
}

export interface HintStep {
  /** The typed prefix after this key. */
  typed: string;
  /** Index into `tags` when the prefix completed a whole tag. */
  activate: number | null;
  /** The layer should close. */
  close: boolean;
  /**
   * The key was consumed; the caller must `preventDefault` AND `stopPropagation` from a
   * CAPTURE-phase listener.
   *
   * Both halves, and the phase, are part of the contract rather than an implementation
   * detail of the caller. `preventDefault` alone leaves the key visible to every other
   * listener, and this app binds record-mutating bare letters on `window` — see the long
   * note on the listener in `components/help/HintTags.tsx`, and rung 5 below.
   */
  claim: boolean;
}

/**
 * Advance the layer by one keypress.
 *
 * Takes a real `KeyboardEvent` rather than a key string, matching
 * `stepGoGrammar` — the interesting cases are all about modifiers and precedence,
 * and a signature that hides them invites a test that cannot express them.
 *
 * The precedence, in order, and why each rung is where it is:
 *
 *  1. ESCAPE IS NOT OURS. `lib/dismiss.ts` owns it for every overlay in this app and
 *     nothing else may listen for it. Returning `ignore` lets the stack close us,
 *     which is also what puts hint mode in the manual's "esc closes, in this order"
 *     report for free.
 *  2. A MODIFIER MEANS THEY MEANT SOMETHING ELSE. ⌘K should still open the command
 *     line from hint mode. So: close, and do NOT claim, so the chord lands.
 *  3. `f` TOGGLES OFF. The eager listener cannot do this — hint mode registers on
 *     the dismiss stack, so its own `isOverlayOpen()` guard refuses the second press.
 *  4. A KEY WITH A MULTI-CHARACTER NAME IS IGNORED ENTIRELY — Shift, the arrows, F5,
 *     CapsLock. Closing on Shift would make a capital letter impossible to reach if
 *     the alphabet ever grew one, and closing on an arrow is unnecessary: an arrow
 *     that scrolls will trip the scroll cancel instead, which is the honest trigger.
 *  5. `?` CLOSES AND YIELDS, like a modifier chord and for the same reason. This rung
 *     exists because the swallow below became a real swallow: rung 6 now stops
 *     propagation, and `useManual` listens on the document BUBBLE, so without this the
 *     manual would simply stop opening from hint mode — a documented interaction
 *     (e2e/hints.spec.ts) traded away for the fix. It is safe to yield precisely because
 *     `?` is not a page verb anywhere in this app: `useManual` is its only listener,
 *     which is the opposite of the situation with `d`. `useManual` is also the one global
 *     key that deliberately does NOT stand down for overlays, so hint mode must not be
 *     the exception that breaks it.
 *  6. ANY OTHER OFF-ALPHABET CHARACTER CLOSES AND IS SWALLOWED. This is the rung that
 *     matters. Letting it fall through would mean a mistyped tag runs whatever the
 *     page binds that letter to — `d` on the queue opens the disqualify dialog for
 *     the selected lead. `stepGoGrammar` reached the same conclusion for `g x`
 *     (src/lib/navGrammar.ts:71-75) and for the same reason. "Swallowed" means
 *     `preventDefault` AND `stopPropagation` from a capture-phase listener; see the note
 *     on `claim` above, because `preventDefault` alone does not do it and used not to.
 */
export function stepHint(tags: readonly string[], typed: string, e: KeyboardEvent): HintStep {
  const stay: HintStep = { typed, activate: null, close: false, claim: false };

  if (e.key === 'Escape') return stay;
  if (e.metaKey || e.ctrlKey || e.altKey) return { ...stay, close: true };
  if (e.key === HINT_KEY) return { ...stay, close: true, claim: true };
  if (e.key === 'Backspace') return { ...stay, typed: typed.slice(0, -1), claim: true };
  if (e.key.length !== 1) return stay;
  if (e.key === MANUAL_KEY) return { ...stay, close: true };

  const ch = e.key.toLowerCase();
  if (!HINT_ALPHABET.includes(ch)) return { ...stay, close: true, claim: true };

  const next = typed + ch;
  const exact = tags.indexOf(next);
  if (exact !== -1) return { typed: next, activate: exact, close: true, claim: true };
  if (narrow(tags, next).length === 0) return { ...stay, close: true, claim: true };
  return { ...stay, typed: next, claim: true };
}

/** What `activateTarget` actually did, so a test can assert the path rather than guess. */
export type Activation = 'detached' | 'focus' | 'click' | 'click+key';

/** Targets where a click is meaningless and focus is the whole point. */
function isTextEntry(el: Element): boolean {
  const tag = el.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if ((el as HTMLElement).isContentEditable === true) return true;
  if (tag !== 'INPUT') return false;
  const type = (el as HTMLInputElement).type;
  return type !== 'checkbox' && type !== 'radio' && type !== 'button' && type !== 'submit' && type !== 'reset' && type !== 'file';
}

/** Elements the platform activates on a click without any author code. */
function isNativelyActivatable(el: Element): boolean {
  return /^(?:BUTTON|A|INPUT|SELECT|TEXTAREA|SUMMARY|LABEL|OPTION)$/.test(el.tagName);
}

/** Resolve on the next paint, with a timeout so this can never hang a background tab. */
function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(finish);
    setTimeout(finish, 50);
  });
}

/**
 * Activate a target the way the operator meant.
 *
 * FOCUS FIRST, ALWAYS. The point of a keyboard mechanic is that the keyboard stays
 * where it landed; a click that leaves focus on `<body>` means the next Tab restarts
 * from the top of the document, which `lib/dismiss.ts` names as the worst keyboard
 * defect measured in this shell.
 *
 * A DISPATCHED EVENT, NOT `el.click()`. `click()` is defined on `HTMLElement` only,
 * so it does not exist on the SVG `<g role="button">` targets this layer is
 * explicitly required to reach. A dispatched `MouseEvent` works for both, still runs
 * the platform's activation behaviour for links and checkboxes, and bubbles to
 * React's root listener.
 *
 * ASYNC, AND ONLY THE TAIL IS. Focus and the click happen synchronously in the
 * caller's tick — an async function runs to its first `await` before yielding — so
 * nothing about the ordering with the dismiss stack changes. What is deferred is the
 * decision about Enter, below.
 *
 * THE ENTER FALLBACK, and a claim in this comment that was FALSE and is corrected
 * here. Some targets answer keydown and not click — a row whose activation lives in a
 * container-level `onKeyDown` (src/hooks/useListNavigation.ts:216) rather than in its
 * own `onClick` — so a click alone would leave those tags doing nothing. Sending Enter
 * unconditionally is worse: it double-activates everything that handles both. The
 * first version of this function decided between the two by dispatching the click
 * under a `MutationObserver` and reading `takeRecords()` SYNCHRONOUSLY, on the stated
 * grounds that "React 18 flushes discrete events synchronously, so by the time
 * `dispatchEvent` returns any re-render has already touched the DOM".
 *
 * That is not true, and e2e/hints.spec.ts measured it: clicking a real lead row in the
 * running app produced ZERO mutation records inside `dispatchEvent`. React 18 schedules
 * the sync flush in a MICROTASK, so it lands after the dispatch returns. The
 * consequence was not subtle — every row tag fired its click, then a spurious Enter,
 * which ran `onActivate` as well and tore the table down.
 *
 * So the check waits a frame. That direction of error is chosen deliberately: an
 * unrelated background mutation in that frame suppresses an Enter that was wanted,
 * which leaves a tag inert; a missed suppression sends an Enter that was not wanted,
 * which destroys work. Inert is recoverable, so the detector is biased toward silence.
 */
export async function activateTarget(el: Element): Promise<Activation> {
  // Checked before anything else: the tags are a snapshot too, so a target can have
  // been unmounted between the press and the tag being completed.
  if (!el.isConnected) return 'detached';

  const focusable = el as Element & { focus?: (options?: FocusOptions) => void };
  focusable.focus?.({ preventScroll: true });

  if (isTextEntry(el)) return 'focus';

  const before = document.activeElement;
  // Counted IN THE CALLBACK, not read out of `takeRecords()` alone. `takeRecords()`
  // returns only records that have not yet been DELIVERED, and delivery happens at the
  // next microtask checkpoint — so a `new MutationObserver(() => {})` with an empty
  // callback silently drains the queue before any later read can see it. That cost a
  // debugging round: the deferred check reported "nothing happened" for a click that had
  // demonstrably mutated the DOM, and sent a duplicate Enter anyway.
  let mutations = 0;
  const observer = new MutationObserver((records) => {
    mutations += records.length;
  });
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    characterData: true,
  });

  // No `view` in the init dict. It is the conventional thing to pass and jsdom rejects
  // it outright ("member view is not of type Window"), which would have made every
  // activation test un-runnable; nothing in this app or in React reads `event.view`.
  const notPrevented = el.dispatchEvent(
    new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }),
  );

  // The platform already activated it. Asking again would be a second activation of
  // something that worked.
  if (isNativelyActivatable(el)) {
    observer.disconnect();
    return 'click';
  }

  await nextFrame();
  // Plus anything still queued: the frame boundary is not a microtask checkpoint.
  mutations += observer.takeRecords().length;
  observer.disconnect();
  const quiet = mutations === 0 && notPrevented && document.activeElement === before;
  // `isConnected` again: if the click replaced or unmounted this node, Enter would be
  // going to a detached element and the click plainly did land.
  if (!quiet || !el.isConnected) return 'click';

  el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  el.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true, cancelable: true }));
  return 'click+key';
}
