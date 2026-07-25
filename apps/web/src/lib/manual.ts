import { verbsFor, blockedExplanation, type Noun, type Principal } from '@/components/command/grammar';
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
  /** True in LCX TERMINAL, false in a browser tab. Changes what is honest to list. */
  isTerminal: boolean;
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
          : 'The ⌘ versions only work in the LCX TERMINAL app — a browser keeps ⌘1-9 for its own tabs.',
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
    // Qualified deliberately. The P7 audit measured that `useListNavigation` has exactly
    // one real consumer (the BD lead table): 15 of 16 tables still make every row a Tab
    // stop and ignore the arrows entirely. Promising them everywhere sends an operator
    // to press keys that do nothing, on the surface whose whole job is telling them
    // which keys work.
    {
      keys: ['↑', '↓'],
      what: 'Move between rows on the lead table; Home and End jump to its ends',
      note: 'other tables do not have this yet',
    },
    // Added because the P7 roving-tabindex fix made these the ONLY route to a row's own
    // buttons, and neither teaching surface mentioned them.
    { keys: ['←', '→'], what: 'Reach the buttons inside the row you are on' },
    { keys: ['⏎'], what: 'Open the row you are on' },
    { keys: ['⇥'], what: 'Next region. The lead table is one stop, not one per row' },
  ];
  if (ctx.isTerminal) {
    entries.push(
      { keys: ['⌥', 'space'], what: 'Summon the desk from anywhere on the Mac' },
      { keys: ['⌘', '['], what: 'Back; ⌘] forward' },
    );
  }
  return { title: 'Everywhere', entries };
}
