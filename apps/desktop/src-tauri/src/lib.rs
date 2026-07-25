//! LCX TERMINAL — the native macOS shell for LCX ONE (Phase 1).
//!
//! Deliberately thin: the entire product surface is the existing LCX ONE web
//! app running in a native WebView. What the shell adds is what a browser
//! cannot give an operator instrument —
//!   • a system-wide summon key (⌥Space) so the desk is one keystroke away,
//!   • real macOS chrome (menu bar carrying our shortcuts so they're
//!     discoverable, dock presence, window-state persistence),
//!   • Keychain-backed credentials instead of browser localStorage,
//!   • signed self-updates.
//!
//! Governance is untouched: the shell never talks to the API and never holds a
//! session. It stores the desk credential in the Keychain and hands it to the
//! webview on request; every write still goes through the governed registry.

use keyring::Entry;
use tauri::{
    menu::{AboutMetadata, Menu, MenuItem, PredefinedMenuItem, Submenu},
    Emitter, Manager,
};

/// Keychain coordinates. One service, one account per credential kind, so
/// macOS shows a single sensible entry the operator can inspect or revoke.
const KEYRING_SERVICE: &str = "com.lcx.terminal";

fn entry(key: &str) -> Result<Entry, String> {
    Entry::new(KEYRING_SERVICE, key).map_err(|e| e.to_string())
}

/// Trackpad haptics (Phase 5).
///
/// The "Apple-grade detail" from the plan: a governed write landing produces a
/// physical detent under the finger, the same feedback AppKit gives when a window
/// snaps to a guide. There is no web API for this — it is the one piece of the
/// feel layer that genuinely requires the native shell, which makes it the
/// clearest answer to "why is this an app and not a tab".
///
/// Three honest limitations, all of which the caller has to tolerate rather than
/// treat as failure:
///   1. It does nothing at all without a Force Touch trackpad. An external mouse,
///      a Magic Trackpad 1, or a Mac desktop with no trackpad: silence. AppKit
///      does not report which, so neither can we.
///   2. `NSHapticFeedbackPerformanceTime::Now` is a request, not a guarantee; the
///      window server may drop it under load.
///   3. It cannot be verified from code. A test can prove this function returns
///      without crashing; only a human with a fingertip can prove a tap happened.
///      That distinction is recorded rather than papered over.
///
/// Returns whether the pattern was dispatched — false means the platform declined
/// (no performer available), not that an error occurred, so the UI never surfaces
/// it as a problem.
#[cfg(target_os = "macos")]
#[tauri::command]
fn haptic_tap(pattern: String) -> bool {
    use objc2::runtime::AnyObject;
    use objc2::{class, msg_send};

    // NSHapticFeedbackPattern, from AppKit's NSHapticFeedbackManager.h.
    //   Generic = 0, Alignment = 1, LevelChange = 2
    // `Alignment` is the crisp single detent used for snapping — the right one for
    // a commit. `LevelChange` is a lighter double tick, for a value stepping.
    let pattern_id: isize = match pattern.as_str() {
        "alignment" => 1,
        "level" => 2,
        _ => 0,
    };
    // NSHapticFeedbackPerformanceTime: Default = 0, Now = 1, DrawCompleted = 2.
    // `Now` because the visual confirmation has already been painted by the time
    // the web layer calls this; `DrawCompleted` would wait for a draw that is not
    // coming and drop the tap.
    let performance_time: usize = 1;

    // SAFETY: `defaultPerformer` is a documented AppKit class method returning an
    // object conforming to NSHapticFeedbackPerformer, or nil. Both selectors and
    // their argument types are taken from the AppKit headers, and the nil case is
    // checked before use — which is the case that actually occurs, on every Mac
    // without a Force Touch trackpad.
    unsafe {
        let cls = class!(NSHapticFeedbackManager);
        let performer: *mut AnyObject = msg_send![cls, defaultPerformer];
        if performer.is_null() {
            return false;
        }
        let _: () = msg_send![
            performer,
            performFeedbackPattern: pattern_id,
            performanceTime: performance_time
        ];
        true
    }
}

/// Non-macOS builds have no haptics. Present so the webview can call the command
/// unconditionally instead of branching on platform.
#[cfg(not(target_os = "macos"))]
#[tauri::command]
fn haptic_tap(_pattern: String) -> bool {
    false
}

/// Persist a credential (desk email / passcode) in the macOS Keychain.
#[tauri::command]
fn secret_set(key: String, value: String) -> Result<(), String> {
    entry(&key)?.set_password(&value).map_err(|e| e.to_string())
}

/// Read a credential back. Returns None when absent (first run, or signed out).
#[tauri::command]
fn secret_get(key: String) -> Result<Option<String>, String> {
    match entry(&key)?.get_password() {
        Ok(v) => Ok(Some(v)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

/// Forget a credential (sign-out).
#[tauri::command]
fn secret_delete(key: String) -> Result<(), String> {
    match entry(&key)?.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

/// True when the frontend is running inside LCX TERMINAL rather than a browser.
#[tauri::command]
fn is_terminal() -> bool {
    true
}

/// Bring the desk forward, unconditionally. Used for every "the operator asked
/// for the app" signal: relaunching it, clicking the Dock icon, choosing it from
/// Spotlight. These must NEVER hide the window — an operator who double-clicks
/// the app expects to see it, and hiding it there reads as a crash.
fn show_main_window(app: &tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let r = win.show();
        let _ = win.unminimize();
        let f = win.set_focus();
        eprintln!(
            "[lcx-terminal] show_main_window: show={:?} focus={:?} visible_now={:?}",
            r.is_ok(),
            f.is_ok(),
            win.is_visible()
        );
    } else {
        eprintln!("[lcx-terminal] show_main_window: NO 'main' window found");
    }
}

/// Toggle the desk: bring it forward focused, or hide it if it already is.
/// This is what ⌥Space feels like — one key summons the desk, the same key puts
/// it away. Toggle semantics belong to the hotkey ONLY (see show_main_window).
fn toggle_main_window(app: &tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let visible = win.is_visible().unwrap_or(false);
        let focused = win.is_focused().unwrap_or(false);
        eprintln!("[lcx-terminal] ⌥Space: visible={visible} focused={focused}");
        if visible && focused {
            let _ = win.hide();
        } else {
            show_main_window(app);
        }
    }
}

/// How many times a crashed web content process may be reloaded automatically
/// before the shell stops trying (Phase 7).
///
/// Bounded because the alternative failure is worse than the one it fixes: a
/// deterministic crash-on-load would otherwise spin the operator's desk in an
/// endless reload with no way to read what is happening. Three attempts covers the
/// transient case (a WebKit OOM, a GPU process hiccup) and stops well short of a
/// loop. After that the window is left alone and ⌘R is the manual door — which is
/// why ⌘R had to stop depending on the JavaScript that just died.
const MAX_WEBVIEW_RELOADS: usize = 3;
static WEBVIEW_RELOADS: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);

/// The macOS menu bar. It exists for discoverability as much as for use: the
/// satisficing research says operators never find shortcuts on their own, so
/// every shortcut we add in later phases gets a menu item with its key shown.
fn build_menu(app: &tauri::AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    let app_menu = Submenu::with_items(
        app,
        "LCX TERMINAL",
        true,
        &[
            &PredefinedMenuItem::about(app, Some("About LCX TERMINAL"), Some(AboutMetadata::default()))?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, "check-update", "Check for Updates…", true, None::<&str>)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::hide(app, Some("Hide LCX TERMINAL"))?,
            &PredefinedMenuItem::hide_others(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::quit(app, Some("Quit LCX TERMINAL"))?,
        ],
    )?;

    // Edit: the standard clipboard set. Without this, ⌘C/⌘V do not work in a
    // Tauri window on macOS — a classic and very annoying omission.
    let edit_menu = Submenu::with_items(
        app,
        "Edit",
        true,
        &[
            &PredefinedMenuItem::undo(app, None)?,
            &PredefinedMenuItem::redo(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, None)?,
            &PredefinedMenuItem::copy(app, None)?,
            &PredefinedMenuItem::paste(app, None)?,
            &PredefinedMenuItem::select_all(app, None)?,
        ],
    )?;

    // Go: the shortcuts the frontend owns. The shell only announces them via
    // an event, so the web app remains the single source of navigation truth.
    let go_menu = Submenu::with_items(
        app,
        "Go",
        true,
        &[
            &MenuItem::with_id(app, "go-command", "Command Palette…", true, Some("CmdOrCtrl+K"))?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, "go-desk", "My Desk", true, Some("CmdOrCtrl+0"))?,
            &MenuItem::with_id(app, "go-ws-command", "US COMMAND", true, Some("CmdOrCtrl+1"))?,
            &MenuItem::with_id(app, "go-ws-sales", "SALES ENGINE", true, Some("CmdOrCtrl+2"))?,
            &MenuItem::with_id(app, "go-ws-intel", "INTELLIGENCE", true, Some("CmdOrCtrl+3"))?,
            &MenuItem::with_id(app, "go-ws-regulatory", "REGULATORY TOOLKIT", true, Some("CmdOrCtrl+4"))?,
            &MenuItem::with_id(app, "go-ws-distribution", "DISTRIBUTION", true, Some("CmdOrCtrl+5"))?,
            &MenuItem::with_id(app, "go-ws-governance", "GOVERNANCE", true, Some("CmdOrCtrl+6"))?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, "go-back", "Back", true, Some("CmdOrCtrl+["))?,
            &MenuItem::with_id(app, "go-forward", "Forward", true, Some("CmdOrCtrl+]"))?,
        ],
    )?;

    let view_menu = Submenu::with_items(
        app,
        "View",
        true,
        &[
            &MenuItem::with_id(app, "view-reload", "Reload", true, Some("CmdOrCtrl+R"))?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::fullscreen(app, None)?,
        ],
    )?;

    let window_menu = Submenu::with_items(
        app,
        "Window",
        true,
        &[
            &PredefinedMenuItem::minimize(app, None)?,
            &PredefinedMenuItem::maximize(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::close_window(app, None)?,
        ],
    )?;

    let help_menu = Submenu::with_items(
        app,
        "Help",
        true,
        &[&MenuItem::with_id(app, "help-manual", "LCX TERMINAL Manual", true, Some("CmdOrCtrl+/"))?],
    )?;

    Menu::with_items(
        app,
        &[&app_menu, &edit_menu, &go_menu, &view_menu, &window_menu, &help_menu],
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Round-trips a credential through the REAL macOS Keychain. This is the
    /// riskiest part of the shell — if it silently fails, every launch bounces
    /// the operator back to the sign-in gate — and it cannot be verified by
    /// driving the UI headlessly, so it is verified here.
    ///
    /// Uses a test-only key so it can never collide with a live credential.
    #[test]
    fn keychain_round_trips_a_credential() {
        let key = "lcx_test_credential_do_not_use";

        // Absent to begin with (and absence is None, not an error — the
        // first-run path depends on that distinction).
        secret_delete(key.to_string()).expect("delete of absent entry must succeed");
        assert_eq!(secret_get(key.to_string()).expect("get must not error"), None);

        secret_set(key.to_string(), "nik@lcx.com:sentinel".into()).expect("set must succeed");
        assert_eq!(
            secret_get(key.to_string()).expect("get must not error"),
            Some("nik@lcx.com:sentinel".to_string()),
        );

        // Overwrite, not duplicate — signing in twice must not leave a stale
        // credential behind that a later read could pick up.
        secret_set(key.to_string(), "sam@lcx.com:sentinel2".into()).expect("overwrite must succeed");
        assert_eq!(
            secret_get(key.to_string()).expect("get must not error"),
            Some("sam@lcx.com:sentinel2".to_string()),
        );

        // Sign-out really forgets.
        secret_delete(key.to_string()).expect("delete must succeed");
        assert_eq!(secret_get(key.to_string()).expect("get must not error"), None);

        // Deleting twice is not an error, so a double sign-out can't throw.
        secret_delete(key.to_string()).expect("idempotent delete");
    }

    /// An EMPTY value is a real, storable Keychain state — not the same thing as
    /// absence. Measured, not assumed: `set_password("")` succeeds and reads back
    /// as `Some("")`, so a caller that "clears" a credential by writing `''`
    /// leaves a present-but-empty entry behind.
    ///
    /// This matters to the web side, which resolves the credential as
    /// `memValue ?? localStorage.getItem(key)` (apps/web/src/lib/apiClient.ts).
    /// `''` is not nullish, so a present-but-empty Keychain entry silently DISABLES
    /// that localStorage fallback — the one thing that keeps the desk usable when
    /// the Keychain is unavailable. Phase 7 made `setOperatorCredentials` delete
    /// instead of writing `''`; this test pins the platform behaviour that makes
    /// that necessary, so nobody "simplifies" it back.
    #[test]
    fn an_empty_value_is_stored_not_treated_as_absence() {
        let key = "lcx_test_empty_value_do_not_use";
        secret_delete(key.to_string()).expect("clean slate");

        secret_set(key.to_string(), String::new()).expect("the Keychain accepts an empty value");
        assert_eq!(
            secret_get(key.to_string()).expect("get must not error"),
            Some(String::new()),
            "an empty write is readable as Some(\"\"), NOT as None — absence and \
             emptiness are different states and the web side must not conflate them",
        );

        secret_delete(key.to_string()).expect("delete must succeed");
        assert_eq!(secret_get(key.to_string()).expect("get must not error"), None);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    // Single instance: a second launch focuses the existing desk instead of
    // opening a duplicate (macOS users will absolutely try).
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            // Show, never toggle. Relaunching the app while it is already
            // running and focused must not make the desk disappear.
            show_main_window(app);
        }));
    }

    // A dead web content process must not leave a blank desk (Phase 7).
    //
    // WebKit runs page content out-of-process. When it dies — OOM on a heavy rollup,
    // a GPU fault, a WebKit bug — the NSWindow survives and the operator is left
    // staring at blank white with a working menu bar and no page. Tauri surfaces
    // WKWebView's `webViewWebContentProcessDidTerminate:` here; with no handler
    // nothing at all happens, in the shell or the web app, because every recovery
    // path we own lives inside the process that just died.
    //
    // Reload is the right answer (it is what Safari does) as long as it is bounded —
    // see MAX_WEBVIEW_RELOADS. A separate statement rather than a link in the
    // builder chain because the method itself is macOS/iOS-only, and `#[cfg]` cannot
    // be attached to one call in a chain.
    #[cfg(target_os = "macos")]
    {
        builder = builder.on_web_content_process_terminate(|webview| {
            let n = WEBVIEW_RELOADS.fetch_add(1, std::sync::atomic::Ordering::Relaxed) + 1;
            if n > MAX_WEBVIEW_RELOADS {
                eprintln!(
                    "[lcx-terminal] web content process died ({n}x) — not reloading again; ⌘R or ⌘Q",
                );
                return;
            }
            eprintln!("[lcx-terminal] web content process died ({n}x) — reloading");
            let _ = webview.reload();
        });
    }

    builder
        // Remember WHERE the desk was, never WHETHER it was showing. The
        // plugin's default StateFlags::all() includes VISIBLE, which means
        // putting the desk away with ⌥Space and then quitting makes the next
        // launch start with no window at all — the app looks broken and there
        // is no obvious way back. Size/position/fullscreen are worth restoring;
        // visibility is not.
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(
                    tauri_plugin_window_state::StateFlags::all()
                        - tauri_plugin_window_state::StateFlags::VISIBLE,
                )
                .build(),
        )
        // ⌘W must PUT THE DESK AWAY, not end the session (Phase 7).
        //
        // The Window menu carries a real `Close Window` item, and without this it
        // destroys the only window — at which point tauri-runtime-wry sees an empty
        // window list, emits ExitRequested, and nothing prevents it, so the whole
        // process exits (tauri-runtime-wry-2.11.4/src/lib.rs:4308-4324). Two
        // consequences, both bad:
        //   1. ⌘W is indistinguishable from ⌘Q. On macOS that is the wrong muscle
        //      memory in the most expensive direction: an in-flight governed write
        //      is killed mid-request and the operator never learns whether it
        //      committed, and every unsaved field in the app is gone.
        //   2. It breaks the invariant the three Phase 1 window fixes all rest on —
        //      that the "main" window EXISTS and is merely hidden. show_main_window,
        //      toggle_main_window and the Reopen handler all resolve the window by
        //      label and silently do nothing if it was destroyed.
        //
        // Hiding instead makes ⌘W the mouse-reachable twin of ⌥Space, and every
        // recovery path (⌥Space, Dock click → Reopen, relaunch → single-instance)
        // already knows how to bring a hidden desk back. Quitting stays ⌘Q's job.
        // The window-state plugin is unaffected: it updates its cache on
        // CloseRequested and only writes to disk on RunEvent::Exit.
        .on_window_event(|win, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if win.label() == "main" {
                    api.prevent_close();
                    let _ = win.hide();
                }
            }
        })
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            secret_set,
            secret_get,
            secret_delete,
            is_terminal,
            haptic_tap
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            app.set_menu(build_menu(&handle)?)?;

            // Menu clicks are forwarded to the frontend as one event; the web
            // app owns what they mean. The shell stays dumb on purpose.
            app.on_menu_event(move |app, event| {
                let id = event.id().0.as_str().to_string();
                if id == "check-update" {
                    let _ = app.emit("lcx://check-update", ());
                } else if id == "view-reload" {
                    // Reload NATIVELY, not by asking the page to reload itself
                    // (Phase 7). ⌘R used to be forwarded as `lcx://menu` and handled
                    // in the webview with `window.location.reload()` — which is fine
                    // right up to the one moment ⌘R exists for. WebKit runs the page
                    // in a separate content process; when that process dies the window
                    // stays up showing blank white, and the JS listener that was going
                    // to reload it died with it. So the only recovery affordance was
                    // itself a casualty of the thing it recovers from.
                    if let Some(win) = app.get_webview_window("main") {
                        WEBVIEW_RELOADS.store(0, std::sync::atomic::Ordering::Relaxed);
                        let r = win.reload();
                        eprintln!("[lcx-terminal] ⌘R native reload: ok={:?}", r.is_ok());
                    }
                } else {
                    let _ = app.emit("lcx://menu", id);
                }
            });

            // ⌥Space — summon the desk from anywhere on the machine.
            #[cfg(desktop)]
            {
                use tauri_plugin_global_shortcut::{
                    Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState,
                };
                let summon = Shortcut::new(Some(Modifiers::ALT), Code::Space);
                let gs = app.global_shortcut();
                // Registration is best-effort: if another app already owns the
                // combination, the terminal must still start normally.
                if let Err(e) = gs.on_shortcut(summon, move |app, _shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        toggle_main_window(app);
                    }
                }) {
                    eprintln!("[lcx-terminal] ⌥Space unavailable ({e}); continuing without it");
                }
            }

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building LCX TERMINAL")
        .run(|app, event| {
            // Clicking the Dock icon after ⌥Space hid the desk must bring it
            // back. Without this the window is unrecoverable by mouse: macOS
            // considers the app already active, so it sends Reopen and nothing
            // else happens. The desk would look permanently gone.
            if let tauri::RunEvent::Reopen { has_visible_windows, .. } = event {
                eprintln!("[lcx-terminal] Reopen (has_visible_windows={has_visible_windows})");
                show_main_window(app);
            }
        });
}
