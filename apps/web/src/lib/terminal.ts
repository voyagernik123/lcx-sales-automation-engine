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

/* ── Shell events: the native menu is a discoverability surface for shortcuts ── */

/**
 * The workspace routes come from lib/destinations, which the webview's `g` grammar
 * also reads, so the native menu and the keyboard cannot come to disagree about
 * where ⌘3 goes. `help-manual` stays local: it is a menu affordance with no
 * keyboard equivalent.
 */
const MENU_EXTRAS: Record<string, string> = {
  'help-manual': '/settings',
};

/**
 * Wire the native menu + updater to the app. Returns an unlisten function.
 * `onNavigate` and `onCommandPalette` are supplied by the shell component so
 * routing stays owned by React Router, not by the Rust side.
 */
export async function attachTerminalBridge(handlers: {
  onNavigate: (to: string) => void;
  onCommandPalette: () => void;
  onBack: () => void;
  onForward: () => void;
}): Promise<() => void> {
  if (!isTerminal()) return () => {};
  try {
    const { listen } = await import('@tauri-apps/api/event');

    const unlistenMenu = await listen<string>('lcx://menu', (e) => {
      const id = e.payload;
      if (id === 'go-command') return handlers.onCommandPalette();
      if (id === 'go-back') return handlers.onBack();
      if (id === 'go-forward') return handlers.onForward();
      if (id === 'view-reload') return window.location.reload();
      const to = MENU_ROUTES[id] ?? MENU_EXTRAS[id];
      if (to) handlers.onNavigate(to);
    });

    const unlistenUpdate = await listen('lcx://check-update', () => {
      void checkForUpdate(true);
    });

    // Silent check on launch: an operator instrument should keep itself current
    // without ever nagging. Only a found update surfaces (Tauri's own dialog).
    void checkForUpdate(false);

    return () => {
      unlistenMenu();
      unlistenUpdate();
    };
  } catch {
    return () => {};
  }

  async function checkForUpdate(interactive: boolean): Promise<void> {
    try {
      const { check: doCheck } = await import('@tauri-apps/plugin-updater');
      const update = await doCheck();
      if (update?.available) {
        await update.downloadAndInstall();
        const { relaunch } = await import('@tauri-apps/plugin-process');
        await relaunch();
      } else if (interactive) {
        // Only speak when spoken to.
        alert('LCX TERMINAL is up to date.');
      }
    } catch {
      if (interactive) alert('Update check failed — you are still on a working build.');
    }
  }
}
