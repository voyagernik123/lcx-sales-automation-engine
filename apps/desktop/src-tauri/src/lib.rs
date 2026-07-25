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

    /// PROBE (temporary): what does the Keychain do with an empty value? The web
    /// side writes `secretSet(key, '')` on a failed sign-in, so this is a state
    /// the app actually reaches.
    #[test]
    fn probe_empty_value() {
        let key = "lcx_probe_empty_do_not_use";
        secret_delete(key.to_string()).unwrap();
        let set = secret_set(key.to_string(), String::new());
        eprintln!("PROBE set('') -> {set:?}");
        let got = secret_get(key.to_string());
        eprintln!("PROBE get after set('') -> {got:?}");
        secret_delete(key.to_string()).unwrap();
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
