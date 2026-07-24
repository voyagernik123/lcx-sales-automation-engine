# LCX TERMINAL

The native macOS container for LCX ONE. Same React app as the web build — the
shell adds what a browser cannot give an operator instrument.

| | Browser | LCX TERMINAL |
|---|---|---|
| Summon | find the tab | **⌥Space**, from anywhere on the machine |
| Credential | `localStorage` | **macOS Keychain** (sign-out actually forgets) |
| Shortcuts | invisible | listed in a real **menu bar** with their keys |
| Updates | hard refresh | **signed self-update** on launch |
| Second launch | second tab | focuses the desk you already have |

## Build

```bash
# Dev — hot reload, points at the local API through Vite's proxy
npm run dev -w @lcx/desktop

# Release — .app + .dmg + signed updater artifact
export VITE_API_URL=https://lcx-sales-api.onrender.com
export TAURI_SIGNING_PRIVATE_KEY="$HOME/.lcx-terminal/updater.key"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD=""
npm run build:dmg -w @lcx/desktop
```

Output lands in `src-tauri/target/release/bundle/`:

- `dmg/LCX TERMINAL_<version>_aarch64.dmg` — what people install
- `macos/LCX TERMINAL.app.tar.gz` + `.sig` — what the updater consumes

`VITE_API_URL` is **compiled into the bundle**. The desktop app has no Vite
proxy, so a build without it will silently ship an app that talks to `/api` on
its own origin and fails every request.

Build both `app` and `dmg` targets (the `build:dmg` script does). With
`--bundles dmg` alone Tauri warns *"configured to create updater artifacts but
no updater-enabled targets were built"* and produces no `.tar.gz` — the DMG
installs fine but can never self-update.

## Signing

Two independent signatures, often confused:

1. **Updater signing** (minisign, `TAURI_SIGNING_PRIVATE_KEY`) — proves an
   update came from us. Already set up. The **public** key is in
   `tauri.conf.json`; the **private** key lives at `~/.lcx-terminal/updater.key`
   and must never enter the repo. It is the only thing between an operator's
   machine and a forged auto-update. Lose it and every installed client must be
   reinstalled by hand.

2. **Apple code signing / notarization** — proves to *Gatekeeper* that the app
   is safe to open. **Not set up.** Builds are currently ad-hoc signed
   (`Signature=adhoc`, `TeamIdentifier=not set`).

Consequence of (2): the DMG runs perfectly when built locally, but once it has
been **downloaded** macOS quarantines it. First launch on someone else's Mac:

```
right-click LCX TERMINAL.app → Open → Open
```
or, if macOS refuses outright:
```bash
xattr -dr com.apple.quarantine "/Applications/LCX TERMINAL.app"
```

To remove that friction, an Apple Developer Program membership (~$99/yr) is
needed for a *Developer ID Application* certificate, then:

```bash
export APPLE_SIGNING_IDENTITY="Developer ID Application: … (TEAMID)"
export APPLE_ID=…  APPLE_PASSWORD=…  APPLE_TEAM_ID=…   # app-specific password
```

Tauri notarizes automatically when those are present. Nothing else changes.

## Release

The updater endpoint is a static `latest.json` on the repo's latest GitHub
Release. To cut one:

```bash
V=0.1.0
B=apps/desktop/src-tauri/target/release/bundle
gh release create "terminal-v$V" \
  "$B/dmg/LCX TERMINAL_${V}_aarch64.dmg" \
  "$B/macos/LCX TERMINAL.app.tar.gz" \
  latest.json \
  --repo voyagernik123/lcx-sales-automation-engine \
  --title "LCX TERMINAL $V" --notes "…"
```

`latest.json` shape (the `signature` field is the **contents** of the `.sig`
file, not a path):

```json
{
  "version": "0.1.0",
  "notes": "…",
  "pub_date": "2026-07-25T00:00:00Z",
  "platforms": {
    "darwin-aarch64": {
      "signature": "<contents of LCX TERMINAL.app.tar.gz.sig>",
      "url": "https://github.com/…/releases/download/terminal-v0.1.0/LCX.TERMINAL.app.tar.gz"
    }
  }
}
```

GitHub rewrites spaces in asset filenames to dots, so the URL says
`LCX.TERMINAL.app.tar.gz` while the local file has a space. Getting this wrong
produces a 404 on update check that fails silently.

Only `darwin-aarch64` is published — everyone on the desk is on Apple Silicon.
An Intel Mac needs an `x86_64` build and a second platform entry.

## Architecture

`src-tauri/src/lib.rs` is deliberately thin and knows nothing about LCX:

- Keychain commands `secret_set` / `secret_get` / `secret_delete`
- `toggle_main_window` — the ⌥Space behaviour (show focused, or hide if already
  focused, so the same key puts it away)
- `build_menu` — App / Edit / Go / View / Window / Help. The **Edit** menu is
  not decorative: without it ⌘C/⌘V do not work in a Tauri window on macOS.
- menu clicks are re-emitted as one `lcx://menu` event; the web app decides what
  they mean, so routing has a single owner (React Router)

The shell never talks to the API and never holds a session. It hands the desk
credential to the webview on request; every write still goes through the
governed action registry. **Governance is unchanged by going native.**

`apps/web/src/lib/terminal.ts` is the only web module that knows which container
it is in. Everything Tauri is lazily imported, so the browser bundle neither
pays for nor breaks on it.

### Why credentials hydrate before first render

Keychain reads are async; `getApiKey()` is synchronous and called on every
request. So `main.tsx` awaits `hydrateCredentials()` into an in-memory cache
*before* mounting React. Skip that and the first API calls fire unauthenticated
and bounce the operator to the sign-in gate on every single launch.

### CORS

`tauri://localhost` and `http://tauri.localhost` are appended to `corsOrigins`
**unconditionally** in `apps/api/src/lib/env.ts` — not as a default. `CORS_ORIGINS`
*is* set on Render, so a default would have been overridden and every request
from the terminal refused. No Render dashboard change is needed.
