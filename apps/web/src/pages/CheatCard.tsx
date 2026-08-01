import { Keyboard, Printer } from 'lucide-react';
import { Button, PageTitle, SectionLabel } from '@/components/ui';
import { PrintStyles } from '@/components/report/PrintStyles';
import { ACTION_MANIFEST, MANIFEST_HASH } from '@/lib/command/generated/actionManifest';
import { DESTINATIONS } from '@/lib/destinations';
import { GO_WINDOW_MS } from '@/lib/navGrammar';

/**
 * The wall card (TERMINAL Phase 6).
 *
 * One page of paper, for the operator who has the app on one screen and wants the
 * grammar on the desk next to them. Phase 6 is written against the satisficing
 * research — assume nobody reads anything — so this is built to be SCANNED in three
 * seconds, not read: no paragraphs above the fold, chords on the left where the eye
 * lands, the prose demoted to footnotes that only get read once.
 *
 * EVERY KEY ON IT IS GENERATED, and that is the whole point rather than a nicety. A
 * hand-typed list of shortcuts is stale the first time somebody adds a workspace, and
 * a stale card on a wall is WORSE than no card, because paper is trusted and cannot
 * be corrected in place. So the destinations come from `DESTINATIONS` (the same table
 * the Rust menu reads), the `g` window from `GO_WINDOW_MS`, and the verb counts and
 * the printed hash from the generated action manifest.
 *
 * Where a key cannot be read from data — the arrow grammar, the session letters —
 * it is DECLARED with the module that binds it (`Press.from`), and
 * `__tests__/cheatCard.test.tsx` resolves that module off disk and proves the literal
 * is still there. That is the closest a printed artefact gets to being type-checked.
 *
 * Deliberately NOT built on `lib/manual.ts`, which answers "what can I do to THIS
 * object, from THIS screen, with the authority I hold". Two of its four sections —
 * the object's verbs and the live dismiss stack — are readings of the current moment,
 * and a reading of the current moment is exactly the thing you must not print. The
 * card answers the complementary question: what is always true.
 *
 * It also deliberately does NOT listen for Escape. `lib/dismiss` owns Escape for the
 * whole app; the card only describes it.
 */

/** Which module binds a key. The test resolves each to a file and proves the literal is there. */
export type Binding =
  /** `DESTINATIONS[].key` — the post-`g` digit, which is also the native ⌘ accelerator. */
  | 'destinations'
  /** `lib/navGrammar` — the `g` prefix itself. */
  | 'navGrammar'
  /** `lib/keyboard` — the command chord. */
  | 'keyboard'
  /** `hooks/useListNavigation` — the arrow/Home/End/Enter grammar on ranked lists. */
  | 'listNav'
  /** `components/queue/SessionMode` — the single-letter session keys. */
  | 'session'
  /** `lib/dismiss` — Escape, centrally. */
  | 'dismiss'
  /** `hooks/useSplitView` — the ⌘\ dock chord (T1 #12). */
  | 'split'
  /** `hooks/useManual` — the `?` that opens the living manual. */
  | 'manual'
  /** `apps/desktop/src-tauri/src/lib.rs` — accelerators that exist only in the native app. */
  | 'nativeMenu';

export interface Press {
  /**
   * The literal the binding site spells — a `KeyboardEvent.key` for the webview
   * bindings, the accelerator key for a native one. Stored raw rather than
   * pre-formatted so the test can grep for it; `pressLabel` does the glyphs.
   */
  key: string;
  mod?: 'meta' | 'alt';
  from: Binding;
}

export interface CardRow {
  /** Alternative chords that do the same thing. Each is a sequence pressed in order. */
  chords: Press[][];
  what: string;
}

export interface CardSection {
  title: string;
  /** The one line that makes the section usable without reading the rows. */
  lede?: string;
  rows: CardRow[];
  /** Read once, then never again. Everything that is a reason rather than an instruction. */
  footnote?: string;
}

/** `KeyboardEvent.key` → what a human reads on paper. */
const GLYPH: Record<string, string> = {
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowRight: '→',
  // ↵ rather than ⏎, matching the session action buttons — and it is the one of the
  // two that JetBrains Mono actually has a glyph for.
  Enter: '↵',
  Escape: 'esc',
  ' ': 'space',
  Space: 'space',
};

const MOD_GLYPH: Record<'meta' | 'alt', string> = { meta: '⌘', alt: '⌥' };

/** One chip's text. Single letters go uppercase, as the app's own buttons render them. */
export function pressLabel(p: Press): string {
  const base = GLYPH[p.key] ?? (p.key.length === 1 ? p.key.toUpperCase() : p.key);
  return p.mod ? `${MOD_GLYPH[p.mod]}${base}` : base;
}

/**
 * The card, as data.
 *
 * Exported so the test can walk it without a DOM.
 *
 * ORDER IS THE LAYOUT. The first three sections are the grammar that holds no matter
 * what is on screen — move, act, retreat — and the last three are what a particular
 * surface adds. That is the split between the two printed columns, so the reader is
 * scanning one question per column rather than a list that happened to be cut in half.
 */
export function cheatCard(): CardSection[] {
  const seconds = Math.round(GO_WINDOW_MS / 100) / 10;
  const verbs = ACTION_MANIFEST.actions;
  const anyObject = verbs.filter((a) => a.subjectTypes.includes('*')).length;
  const objectTypes = new Set(verbs.flatMap((a) => a.subjectTypes).filter((t) => t !== '*')).size;

  return [
    {
      title: 'Go somewhere',
      lede: `Press G, then the key — within ${seconds}s.`,
      // THE ⌘ MIRROR IS PRINTED ONLY WHERE ONE EXISTS. Every compartment root has a
      // ⌘<digit> accelerator in the native menu; the desks inside a compartment
      // (`withinWorkspace`) are letters with no accelerator, because ⌘0-9 were spent
      // and ⌘B/⌘L would in any case claim a class of key that means "compartment".
      // Printing the mirror unconditionally taught six chords that do nothing — the
      // one failure mode a card that exists to be trusted cannot have.
      rows: DESTINATIONS.map((d): CardRow => {
        const goChord: Press[] = [
          { key: 'g', from: 'navGrammar' },
          { key: d.key, from: 'destinations' },
        ];
        const cmdMirror: Press[][] = d.withinWorkspace
          ? []
          : [[{ key: d.key, mod: 'meta', from: 'nativeMenu' }]];
        return { chords: [goChord, ...cmdMirror], what: d.label };
      }),
      footnote:
        'The ⌘ column is the native Go menu, and works in the LCXOS app only: a browser reserves those chords for its own tabs and never delivers them to the page. Both columns resolve through one table, so they cannot come to mean different things. Rows with no ⌘ chord are desks inside a compartment: the digits are spent, and the G chord is the whole grammar for them.',
    },
    {
      title: 'Do something',
      lede: `${verbs.length} governed verbs · ${objectTypes} object types · ${anyObject} apply to anything.`,
      rows: [
        {
          chords: [[{ key: 'k', mod: 'meta', from: 'keyboard' }]],
          what: 'Command line → the object → the verb',
        },
        {
          // One capability, two chords — and the second is not redundancy. `?` yields to
          // a text field (it must: otherwise a question mark could not be typed), and the
          // command line autofocuses its search box, so `?` cannot reach the manual from
          // the one place an operator most needs to ask what a gate means. ⌘/ can, and it
          // is what the native Help menu has always advertised.
          chords: [[{ key: '?', from: 'manual' }], [{ key: '/', mod: 'meta', from: 'manual' }]],
          what: 'The manual, for where you are standing',
        },
      ],
      footnote: `? stands aside for a text field; ⌘/ reaches the manual even mid-sentence. The verbs are generated from the action registry, so the command line cannot offer one the server lacks. Printed from manifest ${MANIFEST_HASH} — reprint this card when that hash changes.`,
    },
    {
      title: 'Back out',
      rows: [
        {
          chords: [[{ key: 'Escape', from: 'dismiss' }]],
          what: 'Close the most recently opened thing',
        },
        /*
         * ⌘\ is on the RETREAT card rather than with the list keys, and the reason is the
         * footnote below it (T1 #12).
         *
         * That footnote read "Anything on screen that Escape will not close is a bug worth
         * reporting" — and the docked evidence pane made it FALSE on a printed card. The pane
         * deliberately does not register with the dismiss stack, because one entry there
         * silences the very row keys it exists to preserve (argued at length in lib/split.ts,
         * and measured: registering it kills `d` and the arrows). So Escape does not close it,
         * that is not a bug, and the operator holding this card would have been told to report
         * one.
         *
         * Two ways to fix a card that has gone stale: soften the sentence, or name the one
         * exception. Naming it is better — the sentence is load-bearing (it is how an
         * unreachable overlay gets reported instead of shrugged at), and softening it to
         * "almost anything" would retire a useful bug report to protect one line.
         */
        {
          chords: [[{ key: '\\', mod: 'meta', from: 'split' }]],
          what: 'Dock the evidence beside the surface — or undock it',
        },
      ],
      footnote:
        'One layer per press, innermost first — never a navigation, never a discarded edit. Anything on screen that Escape will not close is a bug worth reporting — with one exception, and it is the row above: the docked evidence pane owns no keys, so it is not on the Escape ladder and ⌘\\ is what closes it. It only appears on a window at least 1424px wide.',
    },
    {
      title: 'On any ranked list',
      lede: 'The queue, the deal board, the partner table — all the same keys.',
      rows: [
        {
          chords: [[{ key: 'ArrowUp', from: 'listNav' }], [{ key: 'ArrowDown', from: 'listNav' }]],
          what: 'Move the cursor row',
        },
        { chords: [[{ key: 'Home', from: 'listNav' }], [{ key: 'End', from: 'listNav' }]], what: 'First row · last row' },
        { chords: [[{ key: 'Enter', from: 'listNav' }], [{ key: ' ', from: 'listNav' }]], what: 'Open the row you are on' },
      ],
      footnote:
        'A whole list is ONE tab stop — Tab moves in and out of it, the arrows move within it. J and K are deliberately unbound: on these same lists S snoozes and D disqualifies, and a grammar where some bare letters move and others mutate will eventually disqualify a lead you meant to scroll past.',
    },
    {
      title: 'In a focus session',
      lede: 'One lead per screen. Every key advances to the next.',
      rows: [
        { chords: [[{ key: 'e', from: 'session' }]], what: 'Enroll in the sequence' },
        { chords: [[{ key: 's', from: 'session' }]], what: 'Snooze — 1 / 3 / 7 then wakes' },
        { chords: [[{ key: 'd', from: 'session' }]], what: 'Disqualify, with a reason' },
        { chords: [[{ key: 'j', from: 'session' }], [{ key: 'ArrowRight', from: 'session' }]], what: 'Skip' },
        { chords: [[{ key: 'Enter', from: 'session' }]], what: 'Open the full dossier' },
        { chords: [[{ key: 'Escape', from: 'dismiss' }]], what: 'End the session' },
      ],
    },
    {
      title: 'In the app, not the browser',
      lede: 'Chords the native shell owns, which a browser tab cannot have.',
      rows: [
        { chords: [[{ key: 'Space', mod: 'alt', from: 'nativeMenu' }]], what: 'Summon the desk from anywhere' },
        {
          chords: [[{ key: '[', mod: 'meta', from: 'nativeMenu' }], [{ key: ']', mod: 'meta', from: 'nativeMenu' }]],
          what: 'Back · forward',
        },
      ],
    },
  ];
}

/**
 * Card-specific print rules, on top of the shared app-chrome reset in `PrintStyles`.
 *
 * PRINT IS ALWAYS THE LIGHT PALETTE. Re-declaring the six tokens the card uses is
 * deliberate, and it fixes a real defect rather than being belt-and-braces: the
 * shared reset forces the page white, but the text tokens keep their dark-mode values,
 * so printing from dark mode puts near-white type on white paper. The existing print
 * path works around it by stripping `.dark` from `<html>` behind a 60ms timeout, which
 * only covers the button — a plain ⌘P still prints invisible ink. Doing it in the
 * cascade covers every route to the printer and needs no timing.
 *
 * The values are copied from `:root` in tokens.css, and cheatCard.test.tsx asserts
 * they still match it, so a retuned palette fails a test instead of a print job.
 */
function CardPrintStyles() {
  const css = `
@media print {
  :root, :root.dark {
    --navy: 30 39 97;
    --grey: 90 98 114;
    --grey-dark: 51 57 72;
    --line: 185 198 224;
    --card: 255 255 255;
    --ice-soft: 234 241 254;
  }
  /* The sheet is the paper in print — its own frame and padding would be a second
     margin inside @page's. */
  .cc-sheet { border: none !important; box-shadow: none !important; padding: 0 !important; max-width: none !important; }
  .cc-sheet, .cc-sheet * { break-inside: avoid; }
  /* The shared reset hides header/aside/footer, which misses the degraded-connection
     banner: it is a <div role="status">, so an API blip printed half a page of
     apology on top of the card. Transient status is never print content. */
  [role="status"] { display: none !important; }
  /* MEASURED, and the reason this card is one page rather than two: body carries
     min-h-screen, and in print a vh resolves to the page box — 273mm, which is EXACTLY
     the printable height once the 12mm page margins are taken. The shared reset clears
     height but not min-height, so the body stretched to fill the sheet to the pixel,
     one rounding error away from emitting a second, blank page. The card's own content
     is ~800px of a 1032px box; nothing here needs to be full height. */
  body { min-height: 0 !important; }
  /* ALSO MEASURED. The chip fill is bg-ice-soft with a dark:bg-navy-deep companion, and
     the dark class stays on the html element while printing, so pinning the tokens is
     not enough: the variant still matched and a card printed from dark mode put
     near-black chips (7 11 22) under navy key text — 1.3:1, illegible the moment a
     printer is set to render backgrounds. Pinned to the light chip token rather than to
     --navy-deep, which every on-screen dark surface still wants dark. */
  .cc-sheet kbd { background: rgb(var(--ice-soft)) !important; }
}
`;
  return <style>{css}</style>;
}

const KBD =
  // The app's kbd idiom (SessionMode, SnoozeMenu), one step up the type scale: this
  // one is read from across a desk rather than from inside a dialog.
  'inline-flex min-w-[1.4rem] items-center justify-center rounded border border-line bg-ice-soft px-1.5 font-mono text-label font-medium leading-5 text-navy dark:bg-navy-deep';

export function CheatCard() {
  const sections = cheatCard();
  // Two fixed columns, split at the seam in the data rather than by CSS `columns`:
  // a one-page guarantee cannot depend on where the browser decides to break, and
  // a semantic split (always true | this surface adds) survives a section being added
  // to either side.
  const ALWAYS_TRUE = 3;
  const left = sections.slice(0, ALWAYS_TRUE);
  const right = sections.slice(ALWAYS_TRUE);

  return (
    <div className="br-page p-5">
      <PrintStyles />
      <CardPrintStyles />

      {/* Screen only. On paper the sheet carries its own title, and a page header above
          it would print the app's furniture onto the artefact. */}
      <div className="br-no-print">
        <PageTitle
          icon={<Keyboard size={20} />}
          subtitle="One page for the wall. Every key on it is generated from the module that binds it, so it cannot quietly go stale."
          actions={
            <Button size="sm" variant="secondary" onClick={() => window.print()}>
              <Printer size={13} /> Print
            </Button>
          }
        >
          Keyboard card
        </PageTitle>
      </div>

      <div className="cc-sheet mx-auto max-w-[210mm] rounded-xl border border-line/70 bg-card p-8 shadow-card">
        <div className="mb-5 flex items-baseline justify-between gap-3 border-b border-line pb-2.5">
          <h2 className="text-lg font-bold tracking-tight text-navy">LCXOS — the keyboard grammar</h2>
          <span className="font-mono text-micro text-grey">manifest {MANIFEST_HASH}</span>
        </div>

        <div className="grid grid-cols-2 gap-x-8 gap-y-5">
          <div className="space-y-5">
            {left.map((s) => (
              <Section key={s.title} section={s} />
            ))}
          </div>
          <div className="space-y-5">
            {right.map((s) => (
              <Section key={s.title} section={s} />
            ))}
          </div>
        </div>

        <p className="mt-5 border-t border-line pt-2.5 text-micro text-grey">
          Nothing on this card was typed by hand. Destinations come from the same table the native Go menu reads; the
          verb count and the hash from the generated action manifest; every other key from the module that binds it.
        </p>
      </div>
    </div>
  );
}

function Section({ section }: { section: CardSection }) {
  return (
    <section className="br-section">
      <SectionLabel as="h3" className="text-label">
        {section.title}
      </SectionLabel>
      {section.lede && <p className="mt-0.5 text-micro text-grey">{section.lede}</p>}
      <dl className="mt-2 space-y-1">
        {section.rows.map((row) => (
          <div key={row.what} className="flex items-baseline gap-2.5">
            <dt className="flex shrink-0 items-baseline gap-1">
              {row.chords.map((chord, ci) => (
                <span key={ci} className="flex items-baseline gap-1">
                  {ci > 0 && <span className="px-0.5 text-micro text-grey">/</span>}
                  {chord.map((press, pi) => (
                    <kbd key={pi} className={KBD}>
                      {pressLabel(press)}
                    </kbd>
                  ))}
                </span>
              ))}
            </dt>
            <dd className="min-w-0 text-body text-grey-dark">{row.what}</dd>
          </div>
        ))}
      </dl>
      {section.footnote && <p className="mt-1.5 text-micro leading-snug text-grey">{section.footnote}</p>}
    </section>
  );
}
