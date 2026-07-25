import { verbsFor, blockedExplanation, type Noun, type Principal } from '@/components/command/grammar';
import { HINT_KEY } from '@/hooks/useHints';
import { DESTINATIONS } from './destinations';
import type { DismissEntry } from './dismiss';
import { GO_WINDOW_MS } from './navGrammar';
import type { ActionManifest } from './command/types';

/**
 * The living manual (TERMINAL Phase 6).
 *
 * Phase 6 is written against the satisficing research: assume nobody reads
 * anything. That has two consequences for this module, and they pull in opposite
 * directions from a normal help page.
 *
 * FIRST, IT ANSWERS "HERE", NOT "IN GENERAL". A manual that lists every shortcut in
 * the app is a document, and documents do not get read. What gets read is four lines
 * that answer the question the operator has right now: what can I do to THIS object,
 * from THIS screen, with the authority I actually hold. So the primary section is
 * generated from the object in front of them, and the global grammar comes last.
 *
 * SECOND, EVERY LINE IS DERIVED. Nothing here is a hand-written list. The verbs come
 * from `verbsFor` — the same function the command line uses, so the manual cannot
 * offer something the command line refuses or omit something it allows. Navigation
 * comes from `DESTINATIONS`, which the native menu also reads. What Escape will do
 * comes from the live dismiss stack, so it is not a claim about Escape but a report
 * of it. A hand-maintained cheat sheet is stale the first time someone adds an
 * action, and a stale manual is worse than none because it is trusted.
 *
 * The blocked verbs are included ON PURPOSE, with their reason. This is the same
 * judgement the command line makes: hiding a capability teaches the operator it does
 * not exist, showing it blocked teaches them what to request. "Why can't I do this?"
 * is the question a manual most needs to answer, and it is the one a list of
 * shortcuts never does.
 */

/**
 * The dismiss-stack label the manual registers itself under.
 *
 * Exported so `Manual.tsx` and `escapeSection` cannot disagree: if they drift, the
 * manual starts listing itself as a layer to escape from, which reads as a bug in
 * Escape rather than a bug in the manual.
 */
export const MANUAL_LABEL = 'manual';

export interface ManualEntry {
  /** Keys to press, in order. `['g', '3']` renders as two chips. */
  keys: string[];
  /** What it does, in the operator's words. */
  what: string;
  /** Why it is unavailable, or a caveat. Rendered dimmer. */
  note?: string;
  /** True when the thing is real but currently refused. */
  blocked?: boolean;
}

export interface ManualSection {
  title: string;
  /** Shown when the section is empty, instead of hiding it silently. */
  emptyNote?: string;
  entries: ManualEntry[];
}

export interface ManualContext {
  /**
   * The live dismiss stack, PASSED IN rather than read from the module.
   *
   * It used to call `dismissStack()` internally, which made this file impure in the one
   * way that mattered: the caller's `useMemo` could not declare a dependency on
   * something it never referenced, so the Escape section was a snapshot frozen at the
   * moment the manual opened — and `escapeSection`'s own comment claimed it was "a
   * report of it". ESLint was right that the dependency was "unnecessary"; the honest
   * response was to make it necessary rather than to silence the rule.
   */
  stack: readonly DismissEntry[];
  manifest: ActionManifest | null;
  principal: Principal | null;
  /** The object in front of the operator, if the surface has one. */
  noun?: Noun | null;
  /** True in LCXOS, false in a browser tab. Changes what is honest to list. */
  isTerminal: boolean;
  /**
   * Is the window wide enough for `⌘\` to do anything (T1 #12)?
   *
   * The second field on this context whose only job is to stop the manual listing a key
   * that does nothing, and it is the same argument as `isTerminal`: below
   * `SPLIT_MIN_WIDTH` the chord is inert, so a line about it would send an operator to
   * press a key and conclude the manual is wrong about the rest too. Passed in, not
   * measured here, because this module is pure and a `window.innerWidth` read would make
   * the section a snapshot the caller cannot declare a dependency on — the precise bug
   * the Escape section already had once.
   */
  canSplit: boolean;
  /** True while the evidence pane is docked, so the `⌘\` line can say which way it goes. */
  evidenceDocked: boolean;
}

/**
 * Build the manual for where the operator is standing.
 *
 * Ordered by how likely it is to be the thing they wanted, not by category. The
 * object's own verbs first, because that is the question that made them press `?`.
 */
export function manualFor(ctx: ManualContext): ManualSection[] {
  return [
    hereSection(ctx),
    escapeSection(ctx.stack),
    goSection(ctx),
    everywhereSection(ctx),
  ];
}

/** What can I do to this object, right now, with the authority I hold. */
function hereSection(ctx: ManualContext): ManualSection {
  const { manifest, principal, noun } = ctx;
  if (!noun || !manifest || !principal) {
    return {
      title: 'This object',
      emptyNote:
        'Nothing is selected. Open an object from any list or press ⌘K and search for it, then press ? again.',
      entries: [],
    };
  }

  const verbs = verbsFor(manifest, noun, principal);
  return {
    title: noun.label,
    emptyNote: `No governed action applies to a ${noun.type}. That is the honest answer, not a gap — the registry has none for this object type.`,
    entries: verbs.map((v) => ({
      // Reached through the command line rather than a bespoke key. Inventing a
      // per-verb chord for 22 actions would be 22 things to remember and 22 chances
      // to collide with a page's own letters.
      keys: ['⌘K', v.action.label],
      what: v.action.description || v.action.label,
      blocked: !!v.blocked,
      note: v.blocked ? blockedExplanation(v.blocked) : undefined,
    })),
  };
}

/**
 * What Escape will actually do, read from the live stack.
 *
 * Not a description of Escape — a report of it. This is the section that would be
 * impossible to keep truthful by hand, and it is also the one that diagnoses a stuck
 * overlay: if something is on screen and not on this list, it is not dismissible and
 * that is a bug worth reporting.
 */
function escapeSection(stack: readonly DismissEntry[]): ManualSection {
  // The manual is itself on the stack — it has to be, or Escape would close the panel
  // behind it and leave the manual floating over nothing. But reporting "esc closes:
  // manual" is technically true and useless: the operator opened this to find out what
  // happens to the thing UNDERNEATH. So the manual's own entry is dropped and the
  // press count is offset by one, which is what the numbers would be by the time they
  // matter — because the first press is the one that closes this panel.
  const beneath = stack.filter((entry) => entry.label !== MANUAL_LABEL);

  if (beneath.length === 0) {
    return {
      title: 'Escape',
      emptyNote:
        'Nothing else is open, so Escape just closes this manual. It never navigates away or discards work in progress.',
      entries: [],
    };
  }

  // Top of the stack first: that is the order the presses will land in.
  const top = [...beneath].reverse();
  return {
    title: 'Escape closes, in this order',
    entries: [
      { keys: ['esc'], what: 'this manual' },
      ...top.map((entry, i) => ({
        keys: [`esc ×${i + 2}`],
        what: entry.label,
      })),
    ],
  };
}

/** Where can I go. */
function goSection(ctx: ManualContext): ManualSection {
  const seconds = Math.round(GO_WINDOW_MS / 100) / 10;
  return {
    title: 'Go somewhere',
    entries: [
      ...DESTINATIONS.map((d) => ({
        keys: ['g', d.key],
        what: d.label,
        // ⌘-digit is real in the app and impossible in a browser, so saying so is
        // the difference between a helpful note and a shortcut that does nothing.
        note: ctx.isTerminal ? `also ⌘${d.key}` : undefined,
      })),
      {
        keys: ['g'],
        what: `Press g, then a digit within ${seconds}s`,
        note: ctx.isTerminal
          ? 'The ⌘ versions are in the Go menu too.'
          : 'The ⌘ versions only work in the LCXOS app — a browser keeps ⌘1-9 for its own tabs.',
      },
    ],
  };
}

/** The handful that work everywhere. */
function everywhereSection(ctx: ManualContext): ManualSection {
  const entries: ManualEntry[] = [
    { keys: ['⌘K'], what: 'The command line — find any object, then act on it' },
    { keys: ['?'], what: 'This manual, for wherever you are standing' },
    {
      keys: ['⌘', '/'],
      what: 'This manual, even while you are typing',
      note: '? is a character in a search box, so it yields — this never does',
    },
    // The Phase 7 hint layer, and a line that has already been narrowed once.
    //
    // WHAT IS TRUE AND IS WHY THIS SITS UNDER "EVERYWHERE": there is no per-control and
    // no per-page wiring. Targets are found by querying the DOM at press time, so this
    // works on a surface nobody wired it into, including one built after this line was
    // written — that is the property the whole mechanic exists for.
    //
    // WHAT WAS NOT TRUE. This read "Tag EVERY control in view", which is a universal
    // claim on the one surface whose entire job is telling operators the truth about
    // keys, and it fails in three measured ways:
    //  - `f` refused to arm while ANY overlay was on the dismiss stack, as well as while
    //    you are typing, and the old note listed only the typing case — under a heading
    //    called "Everywhere". (Past tense as of the scope work below: that refusal is now
    //    a scope, and only the cases it cannot resolve still refuse.)
    //  - the selector reaches controls, not click SURFACES. A chart that decodes where
    //    inside it you clicked (`src/pages/WinLoss.tsx:82 columnIndexFromClick` reads
    //    `e.clientX`; `src/components/kpi/FunnelSection.tsx:24` reads `e.target`) cannot
    //    be driven by a tag at all — a synthetic click carries no coordinates — so those
    //    are deliberately not tagged rather than tagged and inert.
    //  - visibility is judged against the VIEWPORT, not against clipping ancestors, so a
    //    control scrolled out of a short `max-h-*` scroller can still be tagged. See the
    //    limits note on `isHintable` in `src/lib/hints.ts`.
    // "The controls in view" is what the code delivers, so it is what the line says.
    //
    // AND THE NOTE HAS NOW MOVED AGAIN, because the behaviour it described was fixed. The
    // first bullet above was narrowed this morning to "not while you are typing or while a
    // dialog is open"; `f` now DOES arm inside a dialog that confines Tab, and tags only
    // that dialog's own controls (useHints.ts + `resolveHintScope` in lib/hints.ts). A note
    // that still said "or while a dialog is open" would send an operator to Tab through 24
    // fields on the partner dossier rather than press two keys — the precise cost this
    // change exists to remove, re-imposed by a stale sentence on the surface that is
    // supposed to be the one place they can trust.
    //
    // "MOST dialogs" rather than "a dialog", and rather than a list of the exceptions.
    // Three cases still refuse — the top overlay does not confine Tab, two overlays are
    // open at once, or the overlay paints above the layer (which is this manual itself) —
    // and all three are one-way: the layer draws nothing rather than drawing the wrong
    // thing. Spelling them out would be a paragraph inside a keys table, and it would be a
    // paragraph the operator reads at the wrong moment. The layer says which one applies
    // AT the moment it applies, in its own status line ("no tag scope for what is open"),
    // so the manual states the capability and the surface states the exception.
    {
      keys: [HINT_KEY],
      what: 'Tag the controls in view — type a tag to activate one',
      note: 'works on every screen, and inside most dialogs; not while you are typing',
    },
    // Qualified deliberately, and RE-qualified once. The P7 audit measured exactly one
    // consumer of `useListNavigation` (the BD lead table), so this line named only that
    // table. T1 #11 then adopted the hook on three more — product intelligence
    // (`ProductGrid`), competition (`CompetitorGrid`) and the registry ledger
    // (`ProductMatrix`) — which made "other tables do not have this yet" false about
    // precisely those three. Promising the arrows everywhere sends an operator to press
    // keys that do nothing; denying them where they work is the same defect pointed the
    // other way, on the surface whose whole job is telling them which keys work.
    //
    // Still a hand-maintained list, and that is the honest weakness of this entry: it is
    // not derived from the hook's call sites, so the fifth adopter has to remember to
    // come here. Deriving it would mean a build-time scan of `useListNavigation`
    // consumers, which does not exist yet.
    {
      keys: ['↑', '↓'],
      what: 'Move between rows on a ranked table; Home and End jump to its ends',
      note: 'the lead table, product intelligence, competition and the registry ledger — not every table yet',
    },
    // Added because the P7 roving-tabindex fix made these the ONLY route to a row's own
    // buttons, and neither teaching surface mentioned them. The note is not padding: of
    // the four ranked tables above, only the lead table puts controls in a row (measured
    // 0 focusable descendants per row on the other three), so on those three these keys
    // are real but have nothing to reach — and a manual that implies otherwise sends an
    // operator to press a key that does nothing.
    { keys: ['←', '→'], what: 'Reach the buttons inside the row you are on', note: 'only the lead table has buttons in a row' },
    { keys: ['⏎'], what: 'Open the row you are on' },
    { keys: ['⇥'], what: 'Next region. A ranked table is one stop, not one per row' },
  ];
  /*
   * `⌘\` (T1 #12), and three things this entry has to get right or it is worse than
   * absent.
   *
   * OMITTED, NOT DIMMED, when the window is too narrow. Below `SPLIT_MIN_WIDTH` the chord
   * is genuinely inert; listing it greyed out would still be a key an operator tries.
   *
   * THE NOTE NAMES THE COST, because it is the one thing about this key that will surprise
   * someone: Escape does not close the pane. That is a deliberate trade argued in
   * lib/split.ts (registering with the dismiss stack is what would silence the row keys
   * the pane exists to preserve), and the surface whose job is telling operators the truth
   * about keys is exactly where it has to be said. The pane's own header repeats it.
   *
   * IT SAYS WHICH DIRECTION THE PRESS GOES, read from the live flag rather than described
   * in general — "dock" and "undock" are different sentences and the operator wants the
   * one that applies.
   */
  if (ctx.canSplit) {
    entries.push({
      keys: ['⌘', '\\'],
      what: ctx.evidenceDocked
        ? 'Undock the evidence — it goes back to a drawer over the surface'
        : 'Dock the evidence beside the surface, so the row keys keep working while you read it',
      note: 'Escape does not close the pane — ⌘\\ does. It owns no keys, so ↑↓, ⏎ and the queue letters stay on the surface',
    });
  }
  if (ctx.isTerminal) {
    entries.push(
      { keys: ['⌥', 'space'], what: 'Summon the desk from anywhere on the Mac' },
      { keys: ['⌘', '['], what: 'Back; ⌘] forward' },
    );
  }
  return { title: 'Everywhere', entries };
}
