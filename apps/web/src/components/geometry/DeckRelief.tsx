/**
 * E1 THE THEATRE — the command deck as a room, opt-in.
 *
 * ── WHY E1 WAS LAST, AND WHY THIS WRAPPER IS SHAPED DIFFERENTLY FROM THE OTHER EIGHT ─
 * The other environments replace a FIGURE: one chart, one table, one component with a props contract you can
 * wrap. E1 replaces a PAGE LAYOUT — §2 describes the whole command deck as a room you are standing in — and a
 * wrapper that tried to swallow the page would have to own its data fetching, its refusal states, its action
 * grammar and its four panel bodies. That is a rewrite wearing a toggle.
 *
 * So this wraps the smallest honest unit: the panel SET. Flat, the caller's own panels render exactly as they
 * did — this component passes them through untouched as `children` and adds nothing to them. In relief, the same
 * four panels stand at graded depths on a lit deck, and their text is projected DOM rather than baked pixels.
 *
 * ── WHAT THE ROOM ADDS, AND IT IS ONE THING ──────────────────────────────────────────
 * A flat grid gives every panel equal weight. Depth order does not: the panel nearest the camera is the one
 * being addressed, and it is the only one in focus. That is the whole reading, and it is worth being honest that
 * it is a small one — E1's own harness README records that its §7(b) case is *"a real tension, not a gap"*,
 * because the focus rack that states the emphasis is the same mechanism that costs the other panels legibility.
 *
 * Which is why relief defaults OFF here as everywhere else, and why the reason on the button is E1's specific
 * one rather than the generic sentence.
 *
 * ── THE HEADLINE MEASURES ARE THE PAGE'S OWN, OR THEY ARE ABSENT ─────────────────────
 * Each `DeckPanelDatum.headline` is a string the PAGE already formats and already shows. Nothing here computes a
 * new number, and a measure the page does not have arrives as `null` and renders as a named absence. §6 rule 6,
 * and E1 is the environment that broke it once already: its harness rendered E0's frame time as a number
 * belonging to a different programme, under a printed claim that every row was checkable.
 */
import { lazy, Suspense, useCallback, useId, useMemo, useState } from 'react';
import type { DeckPanelDatum } from '@/components/geometry/deckSlots';

/**
 * ── THE CONTROL WEARS THE APP'S TOKENS, BECAUSE `--brand` AND `--rule` DO NOT EXIST ──
 *
 * This block used to be inline hex: `var(--brand, #7FB2FF)` for the label,
 * `rgba(196,212,240,.66)` for the note, `#6B7A99` when disabled, `#E0A94A` for the refusal,
 * `1px solid var(--rule, #26355A)` for the border. Neither `--brand` nor `--rule` is defined
 * anywhere in `apps/web/src/styles/*.css`, so every one of those `var()` calls always took its
 * fallback — the dark-deck literal — and the app DEFAULTS TO LIGHT (`index.html` adds `.dark`
 * only when localStorage says so, and `CommandDeck`'s print handler strips it deliberately).
 *
 * Measured on the surfaces this control actually sits on — page canvas #F4F6FB and card
 * #FFFFFF light, #090E1B / #10182B dark:
 *
 *   #7FB2FF label            2.00 / 2.16 light   (8.91 / 8.18 dark)   needs 4.5
 *   rgba(196,212,240,.66)    1.23 / 1.30 light   (6.04 / 5.79 dark)   needs 4.5
 *   #E0A94A refusal alert    1.95 / 2.11 light   (9.12 / 8.37 dark)   needs 4.5
 *   #6B7A99 disabled label   3.99 / 4.31 light    4.47 / 4.10 dark    needs 4.5 — FAILS EVERYWHERE
 *
 * So on the default theme the refusal message §6 rule 1 exists to deliver measured 1.95:1, and
 * the opt-in reason 1.23:1 — which is the "printed as an empty box" failure again, and it also
 * hits the print path, because printing forces light. `StormRelief` documented and fixed exactly
 * this for itself; the other four wrappers were never re-checked.
 *
 * Replacements are tokens, measured light/dark on canvas and card:
 *   text-cyan-700 / dark:text-cyan-400   4.96 / 5.36  ·  10.66 / 9.78
 *   text-grey (unavailable)              5.67 / 6.13  ·   7.30 / 6.71
 *   text-grey-dark (note)               10.67 / 11.54 ·  12.40 / 11.39
 *   text-status-conditional (refusal)    5.22 / 5.65  ·   8.64 / 7.94
 *
 * The BORDER is `border-grey`, not the app's usual `border-line`: as a control boundary WCAG
 * 1.4.11 wants 3:1, and `--line` measures 1.59 / 1.72 light and 1.42 / 1.30 dark. `--grey-light`
 * is no better (2.18 / 2.00 dark). `--grey` is the only existing token that clears 3:1 on both
 * themes, and inventing a hue here is what put the numbers above on the page in the first place.
 */
const CONTROL = 'border px-2.5 py-1.5 font-mono text-micro font-bold uppercase tracking-wider';
const CONTROL_ON = 'cursor-pointer border-grey text-cyan-700 hover:bg-ice-soft dark:text-cyan-400';
/**
 * `border-dashed` is the point of this class, not the colour: enabled-vs-unavailable was carried
 * by text colour alone (#7FB2FF → #6B7A99), and `cursor: not-allowed` is mouse-only. A dashed
 * boundary states the same thing in shape, which survives all three dichromacies — the simulation
 * puts #7FB2FF/#6B7A99 at 20.2-21.7 ΔE2000 so the colour cue happens to survive too, but a state
 * carried by one channel is one token change away from not surviving.
 */
const CONTROL_OFF = 'cursor-not-allowed border-dashed border-grey text-grey';
const NOTE = 'font-mono text-micro leading-snug text-grey-dark';
const ALERT = 'font-mono text-micro leading-snug text-status-conditional';

const DeckReliefGl = lazy(() => import('@/components/geometry/DeckReliefGl'));

export interface DeckReliefProps {
  /** The flat panels, rendered untouched when relief is off. */
  readonly children: React.ReactNode;
  /** One entry per panel, in the order the flat grid shows them. */
  readonly panels: readonly DeckPanelDatum[];
  readonly heightPx?: number;
}

export function DeckRelief({ children, panels, heightPx = 460 }: DeckReliefProps) {
  const [wantRelief, setWantRelief] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  /* The reason lives in a sibling <span>, which a screen reader reaches only in browse mode and only
     if it goes looking. `aria-describedby` puts it on the control it explains. */
  const noteId = useId();

  /*
   * STABLE, because `DeckReliefGl` lists it in an effect's dependency array. A fresh function every render would
   * tear the renderer down and rebuild it whenever anything else on this page changed — a new GL context per
   * keystroke, which is what §6 rule 7 exists to prevent.
   */
  const onRefused = useCallback((code: string) => {
    setRefusal(code);
    /* Straight back to the grid. A canvas that failed keeps its last frame — or nothing — on screen, and a
       stale picture presented as live data is worse than no picture. */
    setWantRelief(false);
  }, []);

  /*
   * MEMOISED FOR THE SAME REASON, and it is not a micro-optimisation: the array is an effect dependency, so a
   * new identity each render remounts the renderer. Keyed on the panels' own content rather than on the array,
   * because the caller builds it inline.
   */
  const contentKey = panels.map((p) => `${p.id}\u001f${p.title}\u001f${p.headline ?? ''}\u001f${p.note ?? ''}`).join('\u001e');
  /* eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the panels' CONTENT and deliberately not on
     the array, which is the whole point: the caller builds `panels` inline, so depending on its identity would
     rebuild the GL context every render (§6 rule 7). The separators are the ASCII unit and record separators
     rather than spaces, so two different decks cannot produce the same key by having a title that contains the
     delimiter — a collision there would pin the renderer to stale panels with no visible cause. */
  const stable = useMemo(() => panels, [contentKey]);

  /* A deck with nothing on it is not a room. Refusing here rather than in the renderer keeps the reader on the
     grid instead of showing them an empty stage that looks like a broken canvas. */
  const drawable = stable.length >= 2;
  const showRelief = wantRelief && refusal === null && drawable;
  const blocked = refusal !== null || !drawable;

  return (
    <div>
      {showRelief ? (
        /* THE FALLBACK IS THE PANELS THEMSELVES, not a spinner. A reader who clicked for relief has not asked to
           lose the deck they were reading for the length of a network round trip. */
        <Suspense fallback={<>{children}</>}>
          {/*
            THE PANELS ARE WHAT PRINTS, EVEN WITH THE THEATRE OPEN. `CommandDeck` mounts `PrintStyles` and has
            a "Board Pack (print)" button, so a ⌘P with the theatre open used to put a canvas in a board pack
            where the gating chain, the workstream rollup and the risk list belong. §6 rule 1: print resolves
            to the existing surface.

            E1 IS THE WORST CASE OF THE THREE, and it is why the print rule removes the whole live block
            rather than just its canvas: `DeckReliefGl` projects the panel text as REAL DOM over the canvas,
            with a HUD on an `rgba(4,6,11,.82)` plate. Delete only the bitmap and that text prints unbacked on
            white paper, in a homography transform, on top of the flat deck it duplicates.

            Two arms of ONE Suspense boundary, so exactly one is mounted at a time: the reader keeps the
            visible deck while the chunk loads, and the deck stays in the document as the print form once the
            room is drawn. A hidden sibling next to a visible one would make `getByTestId` ambiguous, which is
            how a print fix breaks four other suites.
          */}
          <div data-relief-print-flat="" style={{ display: 'none' }} aria-hidden="true">{children}</div>
          <div data-relief-live="">
            <DeckReliefGl panels={stable} heightPx={heightPx} onRefused={onRefused} />
          </div>
        </Suspense>
      ) : (
        children
      )}

      {/* `br-no-print`, as on `StormRelief`: on paper the flat deck above is the figure, so a toggle and a
          sentence about whether relief has been timed are chrome on a board pack. `GpsPrint.tsx:94` records
          the same class of defect in the same words — "a button printed on a client proposal". */}
      <div className="br-no-print" style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => { if (blocked) return; setWantRelief((v) => !v); }}
          /*
           * `aria-disabled` RATHER THAN `disabled`, AND IT IS A FOCUS BUG, NOT A PREFERENCE.
           *
           * `onRefused` fires from the renderer's mount effect — i.e. moments after the reader pressed
           * Enter on THIS button, while it still holds focus. Setting `disabled` on the focused element
           * makes the browser blur it, so `document.activeElement` becomes `<body>` and the next Tab
           * restarts from the top of the document: the reader is thrown to the start of the page as their
           * reward for asking for relief. `aria-disabled` announces the same state without evicting focus.
           *
           * It also keeps the control in the tab ring, which is the only way the reason below is reachable
           * from the thing it explains — a `disabled` button is skipped, so a non-sighted operator met a
           * control they could not reach carrying a refusal they could not find.
           */
          aria-disabled={blocked || undefined}
          aria-pressed={showRelief}
          aria-describedby={noteId}
          className={`${CONTROL} ${blocked ? CONTROL_OFF : CONTROL_ON}`}
        >
          {/*
            THE NAME AGREES WITH `aria-pressed`, WHICH IT DID NOT.
            This read `Flat deck` while relief was on, so a screen reader announced "Flat deck, toggle
            button, PRESSED" — the label names one surface and the state bit asserts the other, which is
            the exact opposite of the truth. Naming the surface once and stating on/off in the label keeps
            the two consistent, keeps the accessible name equal to the visible text (WCAG 2.5.3), and gives
            a sighted reader the state in words rather than only in the label that flipped.
          */}
          Theatre view: {showRelief ? 'on' : 'off'}
        </button>

        {refusal !== null ? (
          <span id={noteId} role="alert" className={ALERT}>
            Theatre unavailable — <code>{refusal}</code>. The panels above are unaffected.
          </span>
        ) : !drawable ? (
          /* `role="alert"`, WHICH IT DID NOT HAVE. Only the renderer's refusal was announced; a deck that becomes
             unarrangeable — the caller's `panels` shrinking to one as a filter narrows — silently greyed the
             control and put its reason in a sibling nobody was told about. `aria-describedby` is the on-demand
             route to the same node; the alert is the interruption. (Present-at-mount live regions are not
             announced by real screen readers, so this costs nothing on first paint.) */
          <span id={noteId} role="alert" className={NOTE}>
            Theatre needs at least two panels to arrange in depth; this deck has {stable.length}.
          </span>
        ) : (
          /*
           * E1's OWN REASON, not the generic one. The other eight say nobody has timed whether relief answers
           * faster. E1's harness went further and measured the cost: at a wide aperture only the focused panel is
           * comfortably readable, so the emphasis it adds is paid for in the legibility of everything else. A
           * reader deciding whether to switch is owed that specific trade, not a general disclaimer.
           */
          <span id={noteId} className={NOTE}>
            Theatre view is opt-in: depth states which panel is addressed, and the focus that states it costs the
            others legibility. Nobody has yet timed whether it answers faster than this grid.
          </span>
        )}
      </div>
    </div>
  );
}
