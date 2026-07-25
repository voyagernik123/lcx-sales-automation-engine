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
   * The key pressed after the `g` prefix. Digits mirror the ⌘0-6 accelerators in
   * the native menu so the two feel like the same grammar rather than two unrelated
   * ones — SEVEN, not six: `lib.rs` binds ⌘0 to My Desk alongside ⌘1-6 for the
   * workspaces. This said "⌘1-6" until the cheat card was generated from it and the
   * count came out one short of the menu it claims to mirror. `destinations.test.ts`
   * asserts each key against the accelerator on its own menu line, so it verified
   * every row and still could not catch a miscount in the prose above it.
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
];

/** Menu id → route, for the native bridge. */
export const MENU_ROUTES: Record<string, string> = Object.fromEntries(
  DESTINATIONS.map((d) => [d.id, d.path]),
);

/** Post-`g` key → destination, for the webview grammar. */
export const GO_KEYS: Record<string, Destination> = Object.fromEntries(
  DESTINATIONS.map((d) => [d.key, d]),
);
