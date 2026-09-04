# P9 · THE PRODUCTION GATE AND RELEASE — preparation (written 2026-09-04 during the P7 sweep)

Plan: "the finished platform, every route, both themes, in GALLERY.md next to the P0 baseline; the desktop at the same build;
a two-minute walkthrough of what to open." Built: final sweep, gallery, docs/vfx/SCORECARD.md (met / short / refused by
design, stated plainly), desktop release, LEDGER and memory closed.

## Deliverables
1. FINAL SWEEP on the P8 tree (both themes, fixtures, the controlled clock): `docs/instrument/audit/production-p9`; the fill
   prints P8 → P9 and the arrival aggregate; GALLERY.md regenerated with the phase label.
2. SCORECARD.md closed: every "pending" row gets its verdict and number; the P0 baseline row stays as the reference.
3. WALKTHROUGH (`docs/vfx/WALKTHROUGH.md`, two minutes): open /lcxos (the machined Forge live over the still), /select (the
   same object under the form), sign in → /command-deck (the arrival: the ticker turns over and the changed rooms light on the
   stage in rank order, then stillness; the readiness gauge; the surface), /bd-kpis and /win-loss (the charts on the engine, the
   arrival bloom), a theme toggle (one re-render, no sweep), print preview (the still, not the canvas). Each line says what to LOOK
   AT and which record number backs it.
4. DESKTOP RELEASE v0.5.0 at the same web build — the P4 recipe, unchanged in shape:
   0. Preconditions: the P9 web commit live (verify-live) and CI green.
   1. Bump 0.4.0 → 0.5.0 in the SIX homes: apps/desktop/package.json · apps/web/package.json ·
      apps/desktop/src-tauri/tauri.conf.json · apps/desktop/src-tauri/Cargo.toml · apps/desktop/src-tauri/Cargo.lock
      (`name = "lcx-terminal"` block) · apps/web/src/pages/Launch.tsx `LCXOS_VERSION`. Afterwards `grep -rn "0\.4\.0"` over those
      files is empty except Launch.tsx's history lines.
   2. Build with the gate (root ci-check + tauri build, ~20 min):
      `cd apps/desktop && TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.lcx-terminal/updater.key)" TAURI_SIGNING_PRIVATE_KEY_PASSWORD='' npm run build:dmg`
      (`build-gate` alone packages nothing — P4 lesson; the key has no passphrase.)
   3. THE DMG SIZE GUARD: read the DMG bytes (`ls -l apps/desktop/src-tauri/target/release/bundle/dmg/*.dmg`), set `LCXOS_DMG_MB`
      in Launch.tsx and add the 0.5.0 history line with the exact bytes (the forge.glb rides inside the app: expect +0.16 MB), then
      REBUILD so the page inside the app agrees with the file, then `npm run release:dry`. The publisher also refuses a dist whose
      API origin is not https://lcx-sales-api.onrender.com — rebuild alone, publish immediately (a concurrent root gate rewrote
      dist with .env.local once).
   4. `npm run release` → CDN-verify latest.json (version + signature bytes) from
      https://github.com/voyagernik123/lcx-terminal-releases/releases/latest/download/latest.json.
   5. Commit `release(desktop): v0.5.0 — THE PRODUCTION P9` with the DMG bytes; push; verify-live the web (the download page says
      0.5.0 and the new MB); open the CI run; install locally and open /command-deck.
5. LEDGER §2 all rows LIVE with shas; NEXT ACTION = "the program is complete; what is owner-only"; memory closed
   (`vfx-production-plan.md` → COMPLETE, with the honest shortfalls from the scorecard).

## Owner-only, unchanged by the program (for the closing note)
Cloudflare Pages dashboard (builds stall for ~30 min at times; one failed outright in P4); the GPS items; the Actions DB secret;
Apple Developer enrolment (first-install dialog). The program never needed a credential and never will.
