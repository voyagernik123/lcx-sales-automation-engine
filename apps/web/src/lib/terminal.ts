/**
 * The LCX TERMINAL bridge (Phase 1).
 *
 * The same React app runs in two containers: a browser (development, fallback)
 * and LCX TERMINAL — the native macOS shell. This module is the ONLY place that
 * knows the difference. Everything is lazily imported so the browser bundle
 * never pays for, or breaks on, the Tauri APIs.
 *
 * Credential rule: in the terminal the desk credential lives in the macOS
 * Keychain (via the shell's `secret_*` commands), not in localStorage. In a
 * browser it stays in localStorage exactly as before. The API contract is
 * unchanged either way — the credential is still `email:passcode`.
 */

// The container check lives in its own zero-import module so callers can ask
// "am I in the terminal?" WITHOUT paying to load this chunk. Re-exported here so
// existing importers keep working and there is still one definition.
export { isTerminal } from './container';
import { isTerminal } from './container';
import { MENU_ROUTES } from './destinations';
import { connectivity } from './online';

type InvokeFn = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;

/** Lazily resolve Tauri's invoke(); null in a browser. */
async function getInvoke(): Promise<InvokeFn | null> {
  if (!isTerminal()) return null;
  try {
    const core = await import('@tauri-apps/api/core');
    return core.invoke as InvokeFn;
  } catch {
    return null;
  }
}

/* ── Keychain-backed secrets (terminal) with localStorage fallback (browser) ── */

export async function secretGet(key: string): Promise<string | null> {
  const invoke = await getInvoke();
  if (invoke) {
    try {
      return (await invoke<string | null>('secret_get', { key })) ?? null;
    } catch {
      return null;
    }
  }
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export async function secretSet(key: string, value: string): Promise<void> {
  const invoke = await getInvoke();
  if (invoke) {
    try {
      await invoke('secret_set', { key, value });
      return;
    } catch {
      /* fall through to localStorage so sign-in never hard-fails */
    }
  }
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable — in-memory session only */
  }
}

export async function secretDelete(key: string): Promise<void> {
  const invoke = await getInvoke();
  if (invoke) {
    try {
      await invoke('secret_delete', { key });
    } catch {
      /* ignore */
    }
  }
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/* ── Shell events: the native menu is a discoverability surface for shortcuts ── */

/**
 * The workspace routes come from lib/destinations, which the webview's `g` grammar
 * also reads, so the native menu and the keyboard cannot come to disagree about
 * where ⌘3 goes. `help-manual` stays local: it is a menu affordance with no
 * keyboard equivalent.
 */
const MENU_EXTRAS: Record<string, string> = {};

/** How the bridge speaks to the operator. Supplied by the shell component. */
export type Notice = (kind: 'info' | 'warning', message: string) => void;

/**
 * Only one update check/install may be in flight (Phase 7).
 *
 * `attachTerminalBridge` runs from a React effect, and an effect's dependency
 * list is one careless edit away from being unstable — which is exactly what had
 * happened: `AppLayout` depended on the whole object returned by `useManual()`,
 * a fresh literal every render, so the bridge re-attached and re-checked for
 * updates on every re-render of the shell. With an update actually available that
 * means CONCURRENT `downloadAndInstall()` calls, and the macOS installer removes
 * the running `.app` before renaming the new one into place
 * (tauri-plugin-updater-2.10.1/src/updater.rs:1296-1303) — two of those racing can
 * leave no bundle on disk at all. The dependency is fixed; this guard means a
 * future regression there costs a wasted call instead of the operator's app.
 */
let updateInFlight = false;

/**
 * Check for an update, and SAY WHAT HAPPENED.
 *
 * What this replaced, and why it had to be replaced: both arms used `alert()`.
 * wry's `WKUIDelegate` implements exactly four methods — file-open panel, media
 * capture, new-window and windowWillClose
 * (wry-0.55.1/src/wkwebview/class/wry_web_view_ui_delegate.rs) — and
 * `runJavaScriptAlertPanelWithMessage:` is not one of them, in wry or in Tauri.
 * WKWebView presents no panel when the delegate declines to, so **every**
 * `alert()` in the packaged terminal is silent. "Check for Updates…" was a menu
 * item that did nothing observable in all three outcomes.
 *
 * The launch check also swallowed every failure identically: network down,
 * malformed `latest.json`, the 404 the README warns about from GitHub rewriting
 * spaces in asset names, a signature that does not verify, an interrupted
 * download, a failed install. A desk that has quietly stopped receiving fixes
 * looks exactly like a desk that is up to date, which is the worst of the
 * available outcomes.
 */
async function checkForUpdate(interactive: boolean, notify: Notice): Promise<void> {
  if (updateInFlight) return;
  updateInFlight = true;
  try {
    const { check: doCheck } = await import('@tauri-apps/plugin-updater');
    const update = await doCheck();
    if (!update) {
      if (interactive) notify('info', 'LCX TERMINAL is up to date.');
      return;
    }
    // Announce BEFORE installing. `downloadAndInstall()` shows no UI of its own —
    // `plugins.updater.dialog` is a Tauri v1 key and the v2 plugin's Config has no
    // such field (tauri-plugin-updater-2.10.1/src/config.rs:90-104), so it was
    // silently ignored and the desk simply vanished and came back mid-work.
    notify('info', `Update ${update.version} found — installing, then the desk will relaunch.`);
    await update.downloadAndInstall();
    const { relaunch } = await import('@tauri-apps/plugin-process');
    await relaunch();
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    // Always recorded, even when not shown: this is the only trace a failed
    // update leaves anywhere. (Note it is only readable with the webview
    // inspector attached — a Rust-side `eprintln!` would go nowhere at all for an
    // app launched from the Dock.)
    console.error('[lcx-terminal] update failed:', reason);
    // On a dead network the OfflineBanner is already saying so and the failure is
    // transient by nature, so a second voice adds noise, not information. A check
    // that fails while the network is FINE is the interesting one — a bad
    // latest.json, a 404, a signature mismatch — and it is permanent until
    // someone is told.
    if (interactive || connectivity() === 'online') {
      notify('warning', `Update failed (${reason}). You are still on the build you launched.`);
    }
  } finally {
    updateInFlight = false;
  }
}

/**
 * Wire the native menu + updater to the app. Returns an unlisten function.
 * `onNavigate` and `onCommandPalette` are supplied by the shell component so
 * routing stays owned by React Router, not by the Rust side. `onNotice` is how
 * the bridge reaches the operator — the shell owns the toast surface, so lib/
 * does not have to import a component to be heard.
 */
export async function attachTerminalBridge(handlers: {
  onNavigate: (to: string) => void;
  onCommandPalette: () => void;
  onBack: () => void;
  onForward: () => void;
  onManual: () => void;
  onNotice: Notice;
}): Promise<() => void> {
  if (!isTerminal()) return () => {};
  try {
    const { listen } = await import('@tauri-apps/api/event');

    const unlistenMenu = await listen<string>('lcx://menu', (e) => {
      const id = e.payload;
      if (id === 'go-command') return handlers.onCommandPalette();
      if (id === 'go-back') return handlers.onBack();
      if (id === 'go-forward') return handlers.onForward();
      if (id === 'help-manual') return handlers.onManual();
      // `view-reload` is deliberately absent: since Phase 7 the shell reloads the
      // webview natively and never emits it. ⌘R exists for the case where the web
      // content process has died, and a JS listener cannot reload a dead JS context.
      const to = MENU_ROUTES[id] ?? MENU_EXTRAS[id];
      if (to) handlers.onNavigate(to);
    });

    const unlistenUpdate = await listen('lcx://check-update', () => {
      void checkForUpdate(true, handlers.onNotice);
    });

    // Quiet check on launch: an operator instrument keeps itself current without
    // nagging. "Quiet" is not "silent" — a found update and a failed check both
    // speak now (see checkForUpdate).
    void checkForUpdate(false, handlers.onNotice);

    return () => {
      unlistenMenu();
      unlistenUpdate();
    };
  } catch {
    return () => {};
  }
}
