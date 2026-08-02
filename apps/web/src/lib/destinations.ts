/**
 * Where the operator can go, named once (TERMINAL Phase 4).
 *
 * There are three ways to reach a workspace — the native macOS menu, a keyboard
 * chord in the webview, and the command line — and before this file each knew its
 * own copy of the route strings. The Rust menu in particular is compiled
 * separately and cannot be type-checked against the TypeScript, so a renamed route
 * would have failed silently in exactly one of the three. `destinations.test.ts`
 * reads the Rust source and asserts the two agree.
 *
 * The `id` is the native menu id, because that is the identifier that has to
 * survive the process boundary.
 */

export interface Destination {
  /** The native menu item id, and the wire format of `lcx://menu` events. */
  id: string;
  /** React Router path. */
  path: string;
  /** What the operator calls it. */
  label: string;
  /**
   * TRUE for a desk INSIDE a compartment, as opposed to a compartment itself.
   *
   * The table used to hold nothing but compartment roots, so three generators were
   * free to assume it: `tour.ts` derives one step per destination and keys it by
   * `workspaceForPath`, `CheatCard` prints a `⌘<key>` chip beside every g-chord, and
   * both were right until GPS added six desks under `/gps/*`. Left unmarked, the
   * tour emitted the GPS step SEVEN TIMES and the card printed ⌘B/⌘O/⌘U/⌘C/⌘D/⌘L —
   * accelerators the native menu does not bind, i.e. the card teaching a chord that
   * does nothing. Both were caught by their own tests, which is why this is a field
   * and not a rule someone has to remember.
   *
   * A marked row is still a first-class destination: menu item, `g` chord, cheat
   * card row, `MENU_ROUTES` entry. It just has no ⌘ mirror and is not a tour step,
   * because the tour teaches the shape of the system and there are eight
   * compartments, not sixteen.
   */
  withinWorkspace?: boolean;
  /**
   * The key pressed after the `g` prefix. Digits mirror the ⌘0-7 accelerators in
   * the native menu so the two feel like the same grammar rather than two unrelated
   * ones — EIGHT, not six: `lib.rs` binds ⌘0 to My Desk alongside ⌘1-6 for the
   * workspaces, and ⌘7 for the practice range, which is a place you can go but not
   * a workspace. This said "⌘1-6" until the cheat card was generated from it and the
   * count came out one short of the menu it claims to mirror, then "⌘0-6/SEVEN"
   * until Phase 8 added the eighth row — the same drift twice, which is the argument
   * for a count nobody has to maintain rather than a more careful sentence.
   * `destinations.test.ts` asserts each key against the accelerator on its own menu
   * line, so it verified every row and still could not catch a miscount in the prose
   * above it.
   */
  key: string;
}

export const DESTINATIONS: readonly Destination[] = [
  { id: 'go-desk', path: '/', label: 'MY DESK', key: '0' },
  { id: 'go-ws-command', path: '/command-deck', label: 'US COMMAND', key: '1' },
  { id: 'go-ws-sales', path: '/bd-pipeline', label: 'SALES ENGINE', key: '2' },
  { id: 'go-ws-intel', path: '/command', label: 'INTELLIGENCE', key: '3' },
  { id: 'go-ws-regulatory', path: '/regulatory-dashboard', label: 'REGULATORY TOOLKIT', key: '4' },
  { id: 'go-ws-distribution', path: '/distribution', label: 'DISTRIBUTION', key: '5' },
  { id: 'go-ws-governance', path: '/wbr', label: 'GOVERNANCE', key: '6' },
  /**
   * NOT a workspace — a place to go that is deliberately not production
   * (TERMINAL Phase 8, T1 #20). It is in this table rather than reachable only from
   * a sidebar link because everything that makes a destination discoverable is
   * generated from here: the `g 7` chord, the ⌘7 menu item, the `?` manual's "Go
   * somewhere" section, and the printed cheat card. A sandbox nobody can find is a
   * sandbox nobody practises in, and the plan's own research says to assume nobody
   * reads anything — so it has to be in the grammar an operator already knows.
   */
  { id: 'go-practice', path: '/practice', label: 'PRACTICE RANGE', key: '7' },
  /**
   * The seventh compartment (2026-07-31), APPENDED rather than slotted in beside
   * the other workspaces — deliberately.
   *
   * Grouping it after DISTRIBUTION would read better and would have cost every
   * existing operator their muscle memory: GOVERNANCE would slide from `g 6` to
   * `g 7` and PRACTICE RANGE from 7 to 8. A keyboard accelerator someone has
   * already learned is a promise; re-ordering this table silently breaks it, and
   * the operator's hand is faster than their reading of a changelog.
   *
   * So new destinations go on the end, and the number is the order it was added
   * in rather than a taxonomy. Everything discoverable is generated from this
   * table — the `g 8` chord, the ⌘8 menu item, the `?` manual, the cheat card,
   * and (per `lib/tour.ts`) the first-run tour step — so this one line is the
   * whole wiring.
   */
  { id: 'go-ws-marketing', path: '/marketing', label: 'LCX MARKETING', key: '8' },
  /**
   * The eighth compartment (GPS Phase 1). APPENDED, for the reason spelled out on
   * the row above and not repeated here: the number is the order it was added in,
   * not a taxonomy, and re-ordering this table silently rebinds accelerators an
   * operator has already learned.
   *
   * `lib/tour.ts` derives the first-run tour from `WORKSPACE_IDS` and finds its
   * step here, so `tour.test.ts:161` fails until this row exists — that test, not
   * this comment, is what makes the wiring mandatory.
   */
  { id: 'go-ws-gps', path: '/gps', label: 'GLOBAL SERVICES', key: '9' },
  /**
   * ── GPS PHASES 6-12: SIX DESKS INSIDE THE EIGHTH COMPARTMENT ────────────────
   *
   * APPENDED, and the existing ten rows are untouched. Nothing above moved, so no
   * accelerator anyone has learned changed meaning.
   *
   * THE KEYS ARE LETTERS AND THEY HAVE NO ⌘ ACCELERATOR. Two reasons, and the
   * second is the real one:
   *
   *  1. There is no digit left. `go-ws-gps` took ⌘9, which the native menu already
   *     recorded as "the last single-digit accelerator available"
   *     (`apps/desktop/src-tauri/src/lib.rs:548`). A sequence like `g 1 0` would be
   *     a second grammar bolted onto the first — `stepGoGrammar` reads exactly one
   *     key after the prefix and a two-key form would need a timeout nobody can
   *     feel.
   *  2. These are not compartments. ⌘0-9 mean "go to a workspace", and giving a
   *     desk inside GPS the same class of accelerator would make the menu claim
   *     there are sixteen compartments when there are eight. `g b` reads as "go,
   *     book" and mirrors the initial of the label, which is a grammar an operator
   *     can extend by guessing rather than by consulting this file.
   *
   * `destinations.test.ts` still requires a native menu item for every row (a
   * destination reachable by chord but absent from the menu is a hidden feature),
   * so each has one — under a GLOBAL SERVICES submenu, with no accelerator. The
   * "g-key digits match the ⌘ accelerators" assertion is satisfied because it only
   * fires when the menu line HAS an accelerator; these deliberately do not, which
   * is the difference between agreeing with the menu and having nothing to disagree
   * about.
   */
  { id: 'go-gps-book', path: '/gps/book', label: 'GPS · THE BOOK', key: 'b' , withinWorkspace: true },
  { id: 'go-gps-origination', path: '/gps/origination', label: 'GPS · ORIGINATION', key: 'o' , withinWorkspace: true },
  { id: 'go-gps-underwriting', path: '/gps/underwriting', label: 'GPS · UNDERWRITING', key: 'u' , withinWorkspace: true },
  { id: 'go-gps-conflict', path: '/gps/conflict', label: 'GPS · THE CONFLICT WALL', key: 'c' , withinWorkspace: true },
  { id: 'go-gps-delivery', path: '/gps/delivery', label: 'GPS · DELIVERY DESK', key: 'd' , withinWorkspace: true },
  { id: 'go-gps-loop', path: '/gps/loop', label: 'GPS · THE LOOP', key: 'l' , withinWorkspace: true },
  /**
   * LCX MARKETING's three surfaces, on exactly the terms recorded above the GPS block:
   * `withinWorkspace: true`, so they get a menu line and a `g` chord but no ⌘ mirror and
   * no tour step. There are eight compartments, not nineteen destinations.
   *
   * APPENDED, and the keys are unused letters rather than mnemonic ones. `d` and `c` were
   * the obvious picks for the desk and the crisis room, and both are already bound to GPS
   * DELIVERY DESK and THE CONFLICT WALL — rebinding an accelerator an operator has already
   * learned is worse than a less memorable letter.
   *
   * `k` IS ALSO SPOKEN FOR, less obviously: it is the command palette's ⌘K
   * (`pages/CheatCard.tsx:151`). A g-chord `g k` would not have collided functionally,
   * but the printable cheat card renders a chip per chord and cannot tell the palette's
   * ⌘K from a ⌘ mirror this row never claimed — so `cheatCard.test.tsx` reads the card as
   * inventing an accelerator for a `withinWorkspace` destination, and it is right to. The
   * card is the artefact an operator learns the system from; a letter that makes it
   * ambiguous is the wrong letter.
   */
  { id: 'go-marketing-desk', path: '/marketing/desk', label: 'MARKETING · THE DESK', key: 'y', withinWorkspace: true },
  { id: 'go-marketing-record', path: '/marketing/record', label: 'MARKETING · THE RECORD', key: 'r', withinWorkspace: true },
  { id: 'go-marketing-crisis', path: '/marketing/crisis', label: 'MARKETING · CRISIS ROOM', key: 'm', withinWorkspace: true },
];

/** Menu id → route, for the native bridge. */
export const MENU_ROUTES: Record<string, string> = Object.fromEntries(
  DESTINATIONS.map((d) => [d.id, d.path]),
);

/** Post-`g` key → destination, for the webview grammar. */
export const GO_KEYS: Record<string, Destination> = Object.fromEntries(
  DESTINATIONS.map((d) => [d.key, d]),
);
