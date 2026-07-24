/**
 * Which container are we running in?
 *
 * This lives alone, with ZERO imports, for one reason: it must be answerable
 * synchronously and without loading anything. `lib/terminal.ts` is a separate
 * lazily-loaded chunk (it pulls in the Tauri APIs), so asking it "are we in the
 * terminal?" costs a network round-trip — and measured on Cloudflare Pages that
 * was ~240ms of blank screen on every BROWSER boot, waiting for a 2KB module
 * that immediately answers "no".
 *
 * So: check the container here first, and only then reach for the Tauri bridge.
 * Because both `apiClient.ts` and `terminal.ts` import this statically, there is
 * exactly one definition and it lands in the main bundle — no extra request,
 * nothing to drift.
 */

/**
 * True when running inside LCX TERMINAL. The Tauri v2 webview injects
 * `__TAURI_INTERNALS__` into `window` before any app code runs, so this is
 * reliable at module-evaluation time — no await, no probing.
 */
export function isTerminal(): boolean {
  try {
    return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
  } catch {
    // A hardened/sandboxed context can throw on window access. Assume browser:
    // the browser path is always the safe fallback — it degrades to
    // localStorage rather than failing.
    return false;
  }
}
