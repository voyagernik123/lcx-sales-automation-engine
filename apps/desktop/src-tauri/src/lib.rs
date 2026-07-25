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
use std::path::{Path, PathBuf};
use tauri::{
    menu::{AboutMetadata, Menu, MenuItem, PredefinedMenuItem, Submenu},
    Emitter, Manager,
};

/// Keychain coordinates. One service, one account per credential kind, so
/// macOS shows a single sensible entry the operator can inspect or revoke.
const KEYRING_SERVICE: &str = "com.lcx.terminal";

/* ── Diagnostics: the desk has to be able to say what happened ────────────────
 *
 * Two failures this shell could not explain at all before this pass.
 *
 * 1. Nothing it printed was ever read. An app launched the way operators launch
 *    this one — Dock, Spotlight, Finder — is started by launchd and inherits its
 *    standard descriptors from it. MEASURED, not assumed: a minimal `.app` opened
 *    through LaunchServices reports, from `lsof` on its own pid (ppid=1),
 *        0r CHR 3,2 /dev/null   1u CHR 3,2 /dev/null   2u CHR 3,2 /dev/null
 *    writes to fd 2 return success, and the unique tokens it printed to stdout and
 *    stderr appear NOWHERE in the unified log (`log show --last 3m --predicate
 *    'eventMessage CONTAINS "…"'` over the same window returned only the `log`
 *    invocation itself). So all eight `eprintln!` lifecycle diagnostics this file
 *    used to carry were written to /dev/null in every shipped build.
 *
 * 2. A panic left nothing behind. `panic = "abort"` in [profile.release] turns any
 *    Rust panic into SIGABRT: the desk vanishes with no dialog and no message,
 *    indistinguishable from a force-quit, and `strip = true` removes the symbol
 *    table so the .ips report macOS writes has no frames of ours in it.
 *
 * The answer is a rolling file the operator can be asked for, plus a panic hook
 * that writes the message and location before the abort. It is deliberately NOT
 * Sentry or any crash SaaS: three operators sit within arm's reach of each other
 * and of this repo, and a crash reporter would be the first external telemetry in
 * the app — a privacy question, a dependency, and a network egress, to learn what
 * one `open -R` now shows.
 * ───────────────────────────────────────────────────────────────────────────── */

/// `~/Library/Logs/LCX TERMINAL/shell.log` — the folder Console.app already lists
/// under "Log Reports", so the log is reachable without our help too.
const LOG_DIR_NAME: &str = "LCX TERMINAL";
const LOG_FILE_NAME: &str = "shell.log";

/// Roll at ~1MB. The shell writes on the order of ten lines per launch, so this is
/// hundreds of sessions of history — far more than any question about "what did the
/// desk do just now" needs, and small enough that the operator can open it.
const LOG_MAX_BYTES: u64 = 1_000_000;

fn diagnostics_dir() -> Option<PathBuf> {
    // `HOME` rather than a crate: `dirs`/`directories` would be a new dependency
    // for one path, and Tauri's own `app.path()` needs an AppHandle — which the
    // panic hook cannot have, because a panic during setup is exactly the case
    // this exists for.
    let home = PathBuf::from(std::env::var_os("HOME")?);
    #[cfg(target_os = "macos")]
    let dir = home.join("Library").join("Logs").join(LOG_DIR_NAME);
    #[cfg(not(target_os = "macos"))]
    let dir = home.join(".local").join("state").join(LOG_DIR_NAME);
    Some(dir)
}

fn log_file_path() -> Option<PathBuf> {
    Some(diagnostics_dir()?.join(LOG_FILE_NAME))
}

/// Format a Unix timestamp as `YYYY-MM-DDTHH:MM:SSZ` with no dependency.
///
/// `chrono` or `time` would each be a new dependency for twenty characters of
/// output, and adding none is the constraint this pass was given. The date
/// arithmetic is Howard Hinnant's `civil_from_days` — shift the epoch to
/// 0000-03-01 so leap days fall at the end of a 400-year era and month lengths
/// become a fixed pattern. Hand-rolled calendar maths is exactly the code that is
/// wrong in February, so the test pins six values against `date -u -r`, including
/// a leap day and the day after one.
///
/// Defined only for timestamps at or after the epoch: Rust's integer division
/// truncates toward zero and the algorithm needs floor division, so a pre-1970
/// input would be silently wrong rather than out of range. `now_iso8601` clamps.
fn iso8601_utc(epoch_secs: u64) -> String {
    let days = (epoch_secs / 86_400) as i64;
    let secs_of_day = epoch_secs % 86_400;
    let (hour, minute, second) = (secs_of_day / 3600, (secs_of_day % 3600) / 60, secs_of_day % 60);

    let z = days + 719_468;
    let era = z / 146_097;
    let doe = z - era * 146_097; // day of era, [0, 146096]
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365; // year of era, [0, 399]
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100); // day of March-based year, [0, 365]
    let mp = (5 * doy + 2) / 153; // March-based month, [0, 11]
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = yoe + era * 400 + i64::from(month <= 2);

    format!("{year:04}-{month:02}-{day:02}T{hour:02}:{minute:02}:{second:02}Z")
}

fn now_iso8601() -> String {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    iso8601_utc(secs)
}

/// Append one record, rolling first if the file has reached the cap.
///
/// Takes the path so the rotation is testable without writing to the real desk log.
fn append_line_to(path: &Path, line: &str) -> std::io::Result<()> {
    use std::io::Write as _;

    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    // Roll rather than truncate, and keep exactly one generation. Truncating in
    // place would delete the ~1MB leading up to whatever filled the log — which is
    // the part that explains it — one line before writing the newest record. Total
    // on disk is bounded at ~2MB.
    if std::fs::metadata(path).map(|m| m.len()).unwrap_or(0) >= LOG_MAX_BYTES {
        let mut rolled = path.as_os_str().to_os_string();
        rolled.push(".1");
        let _ = std::fs::rename(path, PathBuf::from(rolled));
    }
    let mut file = std::fs::OpenOptions::new().create(true).append(true).open(path)?;
    // ONE write, newline included. O_APPEND makes each write land at EOF
    // atomically, so a single call per record is what keeps the panic hook and the
    // webview's `diagnostics_append` from interleaving halves of each other's lines.
    file.write_all(format!("{line}\n").as_bytes())
}

/// What replaced `eprintln!`. Fire-and-forget by design.
fn log_line(msg: &str) {
    let line = format!("{} [lcx-terminal] {msg}", now_iso8601());
    // Still stderr as well. Worthless in the shipped app (/dev/null, measured
    // above) but it is how `npm run tauri dev` shows this trace in the terminal,
    // which is where it actually gets read during development.
    eprintln!("{line}");
    if let Some(path) = log_file_path() {
        // Errors swallowed: a diagnostics writer that can fail loudly would be a
        // new crash source inside the code whose only job is to explain crashes.
        let _ = append_line_to(&path, &line);
    }
}

/// Record a panic where it can be read, then let the process die as it would have.
///
/// The hook DOES run under `panic = "abort"` — measured, not assumed: a probe built
/// with `rustc -C panic=abort` whose hook appended to a file produced the file and
/// then exited 134 (SIGABRT).
///
/// A captured backtrace was tried and REJECTED. `Backtrace::force_capture()` in a
/// binary built the way we ship (`-C strip=symbols`, what `strip = true` compiles
/// to) produced seven frames, every one of them the string `__mh_execute_header` —
/// not even addresses. The same probe unstripped produced 18 frames with file and
/// line. So a backtrace here would spend a rotation on noise; the panic MESSAGE and
/// `file:line:column` survive stripping, because the compiler bakes them in as
/// string literals rather than as symbols, and they are what names the fault.
///
/// The previous hook is chained rather than replaced, so a dev run still prints the
/// standard panic output (with a real backtrace under RUST_BACKTRACE=1) to a
/// terminal that can actually show it.
fn install_panic_hook() {
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        // `PanicHookInfo::payload_as_str()` would be tidier but is 1.81+, and this
        // crate declares rust-version 1.77.2.
        let payload = info
            .payload()
            .downcast_ref::<&str>()
            .map(|s| (*s).to_string())
            .or_else(|| info.payload().downcast_ref::<String>().cloned())
            .unwrap_or_else(|| "<non-string panic payload>".to_string());
        let location = info
            .location()
            .map(|l| format!("{}:{}:{}", l.file(), l.line(), l.column()))
            .unwrap_or_else(|| "unknown location".to_string());
        log_line(&format!(
            "PANIC — the desk is about to abort. at {location}: {payload}"
        ));
        previous(info);
    }));
}

/// Help ▸ Reveal Diagnostics… — put the folder in front of the operator.
///
/// The point is that an operator on a call with whoever is debugging can produce
/// the log without being told a path to type, and without us shipping a viewer.
#[cfg(target_os = "macos")]
fn reveal_diagnostics() {
    let Some(dir) = diagnostics_dir() else {
        log_line("reveal diagnostics: no HOME in the environment, nowhere to reveal");
        return;
    };
    // Create it first: on a desk that has not logged anything yet, `open` on a
    // missing directory fails and the menu item would look broken.
    let _ = std::fs::create_dir_all(&dir);
    let file = dir.join(LOG_FILE_NAME);
    // Absolute path: this process inherited whatever PATH launchd handed it.
    let mut cmd = std::process::Command::new("/usr/bin/open");
    if file.exists() {
        // -R reveals AND selects the file, which is what "Reveal" means on macOS.
        cmd.arg("-R").arg(&file);
    } else {
        cmd.arg(&dir);
    }
    if let Err(e) = cmd.spawn() {
        log_line(&format!("reveal diagnostics: `open` failed to spawn ({e})"));
    }
}

/// Present so the menu item is not a compile-time platform branch. The shipped
/// product is macOS-only (bundle targets are dmg and app); this arm exists so the
/// crate still builds elsewhere, not as a feature.
#[cfg(not(target_os = "macos"))]
fn reveal_diagnostics() {
    log_line("reveal diagnostics: not implemented on this platform");
}

/// The web layer's door into the same log.
///
/// One command, not a logging framework. Two callers need somewhere durable:
/// `ErrorBoundary`, which today catches a React error into a devtools console
/// nobody has open, and the updater, whose launch-time failures are now silent on
/// purpose (apps/web/src/lib/terminal.ts).
///
/// Clipped at 2000 characters because a render loop can call this as fast as React
/// can re-render, and an un-clipped React component stack is a meaningful fraction
/// of a rotation. Embedded newlines are kept: a stack trace is worth more readable
/// than greppable, and every record still starts with a timestamp.
#[tauri::command]
fn diagnostics_append(line: String) {
    log_line(&format!("[web] {}", clip_web_line(&line)));
}

/// Can an update actually be installed where this app is running from?
///
/// FOUND ON THE FIRST REAL CLEAN-MACHINE INSTALL, which is the whole argument for doing
/// one. The operator downloaded the DMG, launched the app straight out of the mounted
/// image without dragging it to Applications — an entirely reasonable thing to do, since
/// it runs perfectly — pressed Check for Updates, and got:
///
///     Installing 0.1.1 failed (Cross-device link (os error 18))
///
/// EXDEV. The macOS updater extracts the new bundle to a temp directory and renames it
/// over the running one, and `rename(2)` cannot cross filesystems. A mounted DMG is a
/// separate, READ-ONLY device, so the rename could never have worked. The error is
/// accurate and completely useless: it names a POSIX errno and says nothing about the
/// only thing the operator needs to do, which is drag the app to Applications.
///
/// Worse, it fails at the LAST step, after downloading 5MB and verifying a signature —
/// so the desk spends thirty seconds looking like it is updating and then does not.
///
/// This is checked BEFORE `downloadAndInstall()` so the refusal is instant and explains
/// itself. Deliberately a writability probe on the PARENT directory rather than a
/// `starts_with("/Volumes")` string test: a DMG is the case that bit us, but a read-only
/// mount, a locked Applications folder, or a bundle sitting somewhere an operator lacks
/// write permission all fail identically, and all deserve the same message. Testing the
/// property beats enumerating the causes.
#[tauri::command]
fn update_install_precheck() -> Result<(), String> {
    let exe = std::env::current_exe().map_err(|e| format!("cannot locate the running app: {e}"))?;

    // …/LCX TERMINAL.app/Contents/MacOS/lcx-terminal → …/LCX TERMINAL.app
    let bundle = exe
        .ancestors()
        .find(|p| p.extension().is_some_and(|x| x == "app"))
        .ok_or_else(|| "the running binary is not inside an .app bundle".to_string())?;
    let parent = bundle
        .parent()
        .ok_or_else(|| "the app bundle has no parent directory".to_string())?;

    // Probe by creating and removing a file. `metadata().permissions().readonly()` reports
    // the mode bits, which say nothing about whether the VOLUME is mounted read-only —
    // and the volume is exactly what is wrong in the DMG case.
    let probe = parent.join(".lcx-terminal-update-probe");
    match std::fs::write(&probe, b"") {
        Ok(()) => {
            let _ = std::fs::remove_file(&probe);
            Ok(())
        }
        Err(e) => Err(format!(
            "LCX TERMINAL is running from a location it cannot update itself in ({}). \
             Quit, drag the app into your Applications folder, and open it from there. \
             (Running from the disk image works, but an update has to replace the app, \
             and a mounted image is read-only.) [{}]",
            parent.display(),
            e.kind()
        )),
    }
}

/// Separate from the command so the clipping is testable without writing to the
/// real desk log. Marked when it clips, so nobody reads a cut-off stack as a
/// complete one. Counts CHARACTERS, not bytes — slicing a String by byte offset
/// panics mid-codepoint, and the webview can hand us any UTF-8 it likes.
const MAX_WEB_LINE_CHARS: usize = 2000;

fn clip_web_line(line: &str) -> String {
    let mut clipped: String = line.chars().take(MAX_WEB_LINE_CHARS).collect();
    if clipped.len() < line.len() {
        clipped.push_str(" …[truncated]");
    }
    clipped
}

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
        log_line(&format!(
            "show_main_window: show={:?} focus={:?} visible_now={:?}",
            r.is_ok(),
            f.is_ok(),
            win.is_visible()
        ));
    } else {
        log_line("show_main_window: NO 'main' window found");
    }
}

/// Toggle the desk: bring it forward focused, or hide it if it already is.
/// This is what ⌥Space feels like — one key summons the desk, the same key puts
/// it away. Toggle semantics belong to the hotkey ONLY (see show_main_window).
fn toggle_main_window(app: &tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let visible = win.is_visible().unwrap_or(false);
        let focused = win.is_focused().unwrap_or(false);
        log_line(&format!("⌥Space: visible={visible} focused={focused}"));
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
            // Not a workspace — the sandbox (Phase 8). Below a separator because it
            // is a different KIND of place, and on ⌘7 because the web grammar's
            // `g 7` has to mirror it: destinations.ts is the one table both read,
            // and destinations.test.ts fails if this line and that row disagree.
            &MenuItem::with_id(app, "go-practice", "PRACTICE RANGE", true, Some("CmdOrCtrl+7"))?,
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
        &[
            &MenuItem::with_id(app, "help-manual", "LCX TERMINAL Manual", true, Some("CmdOrCtrl+/"))?,
            &PredefinedMenuItem::separator(app)?,
            // No accelerator: nothing about this is worth a key, and every key we
            // spend is one the operator has to hold in their head.
            &MenuItem::with_id(app, "help-diagnostics", "Reveal Diagnostics…", true, None::<&str>)?,
        ],
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

    /* ── Diagnostics ───────────────────────────────────────────────────────────
     * What these can and cannot prove, stated up front: they cover the date
     * arithmetic and the rotation, which are the two places this code can be
     * silently WRONG. They do not prove the panic hook fires under
     * `panic = "abort"` — cargo forces the test profile to unwind (it ignores a
     * `panic` setting for test targets), so the shipped configuration is not the one
     * under test here. That was measured separately instead: a probe built with
     * `rustc -C panic=abort` whose hook appended to a file produced the file and
     * exited 134. Nor do they prove anything about /dev/null; see the module
     * comment for that measurement.
     * ──────────────────────────────────────────────────────────────────────── */

    /// Six timestamps, each taken from `date -u -r <secs>` rather than from my
    /// arithmetic — including a leap day and the day after one, because that is
    /// where a hand-rolled calendar breaks.
    #[test]
    fn iso8601_matches_the_system_date_command() {
        for (secs, expected) in [
            (0_u64, "1970-01-01T00:00:00Z"),
            (1_000_000_000, "2001-09-09T01:46:40Z"),
            (1_753_420_000, "2025-07-25T05:06:40Z"),
            (1_767_225_599, "2025-12-31T23:59:59Z"),
            (951_782_400, "2000-02-29T00:00:00Z"),
            (1_583_020_800, "2020-03-01T00:00:00Z"),
        ] {
            assert_eq!(iso8601_utc(secs), expected, "epoch {secs}");
        }
    }

    /// The cap has to roll, not truncate — and the record written immediately after
    /// a roll has to survive, because the most likely reason the log just hit 1MB is
    /// that something is going wrong right now.
    #[test]
    fn the_log_rolls_at_the_cap_and_keeps_the_previous_generation() {
        let dir = std::env::temp_dir().join(format!("lcx-diag-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let path = dir.join("shell.log");
        let rolled = dir.join("shell.log.1");

        // Under the cap: plain append, no rotation, nothing created beside it.
        append_line_to(&path, "first").expect("append must create the file and its folder");
        append_line_to(&path, "second").expect("append must append");
        let body = std::fs::read_to_string(&path).expect("readable");
        assert_eq!(body, "first\nsecond\n", "each record is one line");
        assert!(!rolled.exists(), "nothing to roll yet");

        // At the cap: the old file moves aside, the new record lands in a fresh one.
        std::fs::write(&path, "x".repeat(LOG_MAX_BYTES as usize)).expect("fill to the cap");
        append_line_to(&path, "after the roll").expect("append must still succeed");
        assert_eq!(
            std::fs::read_to_string(&path).expect("readable"),
            "after the roll\n",
            "the new file holds the record written after the roll, not an empty file",
        );
        assert_eq!(
            std::fs::metadata(&rolled).expect("the previous generation is kept").len(),
            LOG_MAX_BYTES,
            "rolling preserves the 1MB that led up to the cap; truncating would have lost it",
        );

        let _ = std::fs::remove_dir_all(&dir);
    }

    /// Pins the location, because it is the one thing an operator gets told over the
    /// phone and it appears in the Help menu's promise.
    #[test]
    #[cfg(target_os = "macos")]
    fn the_log_lives_under_library_logs() {
        let path = log_file_path().expect("HOME is set in any environment that runs tests");
        assert!(
            path.ends_with("Library/Logs/LCX TERMINAL/shell.log"),
            "unexpected diagnostics path: {}",
            path.display(),
        );
    }

    /// A runaway caller in the webview must not be able to write a rotation's worth
    /// of log per call, and a multi-byte boundary must not be a panic — this code
    /// runs on the crash path, so it is the last place that may crash.
    #[test]
    fn a_long_web_line_is_clipped_and_says_so() {
        let short = "ReferenceError: x is not defined";
        assert_eq!(clip_web_line(short), short, "a normal line passes through whole");

        let long = "y".repeat(MAX_WEB_LINE_CHARS + 3000);
        let clipped = clip_web_line(&long);
        assert!(clipped.ends_with("…[truncated]"), "clipping must announce itself");
        assert_eq!(
            clipped.chars().take_while(|c| *c == 'y').count(),
            MAX_WEB_LINE_CHARS,
        );

        // 4-byte codepoints: 2000 CHARS is 8000 bytes, and a byte-offset slice here
        // would panic inside the panic-adjacent path.
        let emoji = "🧊".repeat(MAX_WEB_LINE_CHARS + 10);
        let clipped = clip_web_line(&emoji);
        assert_eq!(clipped.chars().filter(|c| *c == '🧊').count(), MAX_WEB_LINE_CHARS);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // FIRST, before anything that can fail. A panic inside `setup` (a menu that
    // will not build, a plugin that will not init) is the crash with no window and
    // therefore no other way to leave a trace.
    install_panic_hook();
    log_line(&format!(
        "launch — LCX TERMINAL {} on {}",
        env!("CARGO_PKG_VERSION"),
        std::env::consts::OS,
    ));

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
                log_line(&format!(
                    "web content process died ({n}x) — not reloading again; ⌘R or ⌘Q",
                ));
                return;
            }
            log_line(&format!("web content process died ({n}x) — reloading"));
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
            haptic_tap,
            diagnostics_append,
            update_install_precheck
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
                } else if id == "help-diagnostics" {
                    // Handled natively, not forwarded: the webview has no way to
                    // open Finder, and this item has to work in exactly the
                    // situation where the web layer is the thing that is broken.
                    reveal_diagnostics();
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
                        log_line(&format!("⌘R native reload: ok={:?}", r.is_ok()));
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
                    log_line(&format!("⌥Space unavailable ({e}); continuing without it"));
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
                log_line(&format!("Reopen (has_visible_windows={has_visible_windows})"));
                show_main_window(app);
            }
        });
}
