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
];

/** Menu id → route, for the native bridge. */
export const MENU_ROUTES: Record<string, string> = Object.fromEntries(
  DESTINATIONS.map((d) => [d.id, d.path]),
);

/** Post-`g` key → destination, for the webview grammar. */
export const GO_KEYS: Record<string, Destination> = Object.fromEntries(
  DESTINATIONS.map((d) => [d.key, d]),
);
