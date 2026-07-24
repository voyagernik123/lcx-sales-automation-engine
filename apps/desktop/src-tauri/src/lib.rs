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

/// Toggle the desk: bring it forward focused, or hide it if it already is.
/// This is what ⌥Space feels like — the desk appears, and gets out of the way.
fn toggle_main_window(app: &tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let visible = win.is_visible().unwrap_or(false);
        let focused = win.is_focused().unwrap_or(false);
        if visible && focused {
            let _ = win.hide();
        } else {
            let _ = win.show();
            let _ = win.unminimize();
            let _ = win.set_focus();
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    // Single instance: a second launch focuses the existing desk instead of
    // opening a duplicate (macOS users will absolutely try).
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            toggle_main_window(app);
        }));
    }

    builder
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            secret_set,
            secret_get,
            secret_delete,
            is_terminal
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
        .run(tauri::generate_context!())
        .expect("error while running LCX TERMINAL");
}
