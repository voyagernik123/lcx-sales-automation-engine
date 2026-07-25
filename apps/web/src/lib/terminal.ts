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

/* ── The rolling shell log ─────────────────────────────────────────────────── */

/**
 * Write a line into `~/Library/Logs/LCX TERMINAL/shell.log`.
 *
 * Why this exists on the web side at all: `console.error` is the only trace the
 * webview leaves, and it is readable ONLY with the inspector attached — which
 * nobody has attached at the moment something breaks on an operator's desk. The
 * shell log is the same file the Rust side writes, so a launch reads as one
 * timeline: window lifecycle, update outcome, and any React error the boundary
 * caught, in order.
 *
 * No-op in a browser, deliberately: a browser has devtools and a console that
 * persists, and there is nowhere to write a file anyway. Never throws — a
 * diagnostics call that can fail is a diagnostics call at the wrong layer.
 */
export async function logDiagnostic(line: string): Promise<void> {
  const invoke = await getInvoke();
  if (!invoke) return;
  try {
    await invoke('diagnostics_append', { line });
  } catch {
    /* the shell refused or the command is missing (older shell, newer web) */
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

/**
 * A button on a notice. The shell owns the surface; this is the shape it needs to
 * render one, defined here so lib/ does not import a component to be heard.
 */
export type NoticeAction = { label: string; onAction: () => void };

/** How the bridge speaks to the operator. Supplied by the shell component. */
export type Notice = (kind: 'info' | 'warning', message: string, action?: NoticeAction) => void;

/**
 * One update operation at a time, and INSTALL is a distinct phase from CHECK.
 *
 * Phase 7 made this a single boolean around a function that both checked and
 * installed. Splitting the install out (see below) reopened the race it was
 * closing, because the check now returns to idle while a consent notice is still
 * on screen — so two notices can exist, and the operator can click both. That
 * matters more than any other guard in this file: the macOS installer removes the
 * running `.app` before renaming the new one into place
 * (tauri-plugin-updater-2.10.1/src/updater.rs:1296-1303), so two of those racing
 * can leave NO bundle on disk. Hence a phase, not a boolean: `installing` is
 * entered once and only left by a failure.
 */
type UpdatePhase = 'idle' | 'checking' | 'installing';
let updatePhase: UpdatePhase = 'idle';

/**
 * The launch check runs once per process, not once per bridge attach. React 19
 * StrictMode mounts effects twice in development, and the attach point is a route
 * element that could be remounted; neither is a reason to ask GitHub twice.
 */
let launchCheckDone = false;

/**
 * Check for an update, and SAY WHAT HAPPENED — but only install when asked.
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
 * Two things changed here after that.
 *
 * CONSENT. The launch check used to call `downloadAndInstall()` itself. Three
 * consequences, none of them things an operator agreed to: the installer
 * `remove_dir_all`s the running bundle before renaming the new one in, so a failed
 * rename can leave nothing on disk; an operator in `/Applications` without admin
 * rights gets an unexplained password prompt seconds after launch; and a desk in
 * the middle of a governed write is relaunched under it. Installing is a decision,
 * so it is now a button. The CHECK stays silent and automatic — that part costs
 * nothing and keeps the desk honest about being behind.
 *
 * SILENCE ON A FAILED LAUNCH CHECK. The previous rule ("speak unless the network
 * is down") made the desk fire a 9-second warning toast on EVERY launch, because
 * the update repo is private with zero releases, so `latest.json` 404s and
 * `check()` throws every time. Verified at the time of writing rather than
 * assumed: `gh release list --repo voyagernik123/lcx-sales-automation-engine`
 * returns nothing, the repo's own metadata says `"private": true`, and
 * `curl -sSL .../releases/latest/download/latest.json` returns HTTP 404. A warning
 * that appears every single launch and that no operator can act on is not
 * information; it trains them to ignore the toast layer, which is the same layer
 * the governance surfaces use. So a launch-time failure now goes to the shell log
 * only, and the menu-driven check — where somebody is waiting for an answer —
 * still speaks. The cost is stated plainly: a desk that has quietly stopped
 * receiving updates is invisible until someone opens the menu or the log.
 */
async function checkForUpdate(interactive: boolean, notify: Notice): Promise<void> {
  if (updatePhase !== 'idle') return;
  updatePhase = 'checking';
  try {
    const { check: doCheck } = await import('@tauri-apps/plugin-updater');
    const update = await doCheck();
    if (!update) {
      if (interactive) notify('info', 'LCX TERMINAL is up to date.');
      return;
    }
    void logDiagnostic(`update ${update.version} available (interactive=${interactive})`);
    notify(
      'info',
      `LCX TERMINAL ${update.version} is available. Installing replaces the running app and reopens it — finish anything in flight first.`,
      { label: 'Install and relaunch', onAction: () => void installUpdate(update, notify) },
    );
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    // The only durable trace either way. `console.error` alone is readable only
    // with the inspector attached, which nobody has attached when it matters.
    void logDiagnostic(`update check failed (interactive=${interactive}): ${reason}`);
    console.error('[lcx-terminal] update check failed:', reason);
    if (interactive) {
      notify('warning', `Update check failed (${reason}). You are still on the build you launched.`);
    }
  } finally {
    // Only release the phase we took. An install started from the notice this call
    // raised owns the phase from here.
    if (updatePhase === 'checking') updatePhase = 'idle';
  }
}

/**
 * The half the operator opted into: download, install, relaunch.
 *
 * `downloadAndInstall()` shows no UI of its own — `plugins.updater.dialog` is a
 * Tauri v1 key and the v2 plugin's Config has no such field
 * (tauri-plugin-updater-2.10.1/src/config.rs:90-104), so it was silently ignored
 * and the desk simply vanished and came back mid-work. Hence the notice before it.
 *
 * The failure copy does NOT say the desk is intact, because it may not be: the
 * macOS installer removes the running bundle before renaming the replacement in.
 * "Reinstall from the DMG" is the honest instruction when a rename has failed.
 */
async function installUpdate(
  update: { version: string; downloadAndInstall: () => Promise<void> },
  notify: Notice,
): Promise<void> {
  if (updatePhase !== 'idle') return;
  updatePhase = 'installing';

  // REFUSE BEFORE DOWNLOADING, not after. Found on the first real clean-machine install:
  // the app was launched straight out of the mounted DMG — which works perfectly, so there
  // is no reason for an operator not to — and the install failed at the very last step with
  //
  //     Installing 0.1.1 failed (Cross-device link (os error 18))
  //
  // EXDEV. The macOS updater extracts to a temp directory and renames over the running
  // bundle, and `rename(2)` cannot cross filesystems; a mounted image is a separate,
  // read-only device. So it downloaded 5MB, verified a signature, and then hit a condition
  // that was knowable before any of it — and reported a POSIX errno instead of the one
  // action that fixes it.
  //
  // The Rust side probes writability of the bundle's parent rather than string-matching
  // `/Volumes`, so a locked Applications folder or any read-only mount produces the same
  // honest message. Failing here also leaves the installed app untouched, which matters:
  // the installer removes the running bundle before renaming, so the interesting failures
  // are the ones that happen mid-swap.
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('update_install_precheck');
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    void logDiagnostic(`update ${update.version} refused before download: ${reason}`);
    notify('warning', reason);
    updatePhase = 'idle';
    return;
  }

  void logDiagnostic(`installing update ${update.version}`);
  notify('info', `Installing ${update.version}. The desk will close and reopen itself.`);
  try {
    await update.downloadAndInstall();
    const { relaunch } = await import('@tauri-apps/plugin-process');
    await relaunch();
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    void logDiagnostic(`update install FAILED at ${update.version}: ${reason}`);
    console.error('[lcx-terminal] update install failed:', reason);
    notify(
      'warning',
      `Installing ${update.version} failed (${reason}). If the desk does not reopen after you quit, reinstall from the DMG.`,
    );
    // Released so a retry from the menu is possible at all. A retry does work
    // mechanically: `download_and_install` only GETS the Update resource and clones
    // it rather than consuming it (tauri-plugin-updater-2.10.1/src/commands.rs:163-165),
    // so a fresh `check()` re-downloads from scratch. What is NOT claimed here,
    // because it was not tested: that a retry recovers a bundle whose rename
    // already failed halfway. That is what the DMG sentence above is for.
    updatePhase = 'idle';
  }
}

/**
 * Wire the updater, and NOTHING that needs a signed-in shell.
 *
 * This is attached ABOVE the auth boundary (see apps/web/src/router.tsx), and that
 * is the whole point of it being a separate function. `/select` is a sibling route
 * of `AppLayout`, so while the desk is signed out `attachTerminalBridge` never runs
 * — which meant the update check did not run, and "Check for Updates…" emitted into
 * a webview with no listener. The failure mode that made it worth fixing: a build
 * that is broken AT the sign-in gate can never fix itself, because the only
 * self-heal the app has is behind the gate. A manual DMG reinstall was the only
 * road back.
 *
 * The navigation half deliberately stays inside the signed-in shell: routing
 * belongs to the router, and there is nowhere to navigate to from the front door.
 */
export async function attachUpdateBridge(notify: Notice): Promise<() => void> {
  if (!isTerminal()) return () => {};
  try {
    const { listen } = await import('@tauri-apps/api/event');

    const unlistenUpdate = await listen('lcx://check-update', () => {
      void checkForUpdate(true, notify);
    });

    // Quiet check on launch: an operator instrument keeps itself current without
    // nagging. "Quiet" now means silent on failure and consent-gated on success —
    // the only thing it does unasked is look.
    if (!launchCheckDone) {
      launchCheckDone = true;
      void checkForUpdate(false, notify);
    }

    return () => {
      unlistenUpdate();
    };
  } catch {
    return () => {};
  }
}

/**
 * Wire the native menu's NAVIGATION items to the app. Returns an unlisten function.
 * `onNavigate` and `onCommandPalette` are supplied by the shell component so
 * routing stays owned by React Router, not by the Rust side.
 *
 * The updater used to be attached here too and no longer is — it moved above the
 * auth boundary (`attachUpdateBridge`). `onNotice` is still ACCEPTED and is no
 * longer read by anything in this function: the call site
 * (components/layout/AppLayout.tsx:129) passes it as part of an object literal, and
 * TypeScript rejects excess properties on those, so removing it from this type is a
 * two-file change that belongs to whoever owns AppLayout. Handoff, not an
 * omission — see the report.
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

    return () => {
      unlistenMenu();
    };
  } catch {
    return () => {};
  }
}
