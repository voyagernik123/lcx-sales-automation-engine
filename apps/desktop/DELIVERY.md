# DELIVERY — the second target

> **What this is.** `3D_VFX_FINAL_PLAN.md` and every document it supersedes describe one delivery
> target: the deployed web build. There is a second one — the installed Mac app — and no plan
> document mentions it. This maps it. It is a **mapping exercise**: nothing here was changed, and
> two of its most important questions are answered "not established", with the procedure that
> would establish them.
>
> **Written:** 2026-08-13, against `38c01b1`. Every claim below is either a file:line, a git
> object, or a single read-only HTTP GET that is named as such.
>
> **Revised:** 2026-08-13, later the same day. It is **no longer only a mapping exercise** — §9 records
> the two things that were added, and both are in this app's own files. Three of its findings were also
> *corrected*, not extended, because the second pass went at the installed binary instead of at the
> commit log:
>
> - **§0 was wrong about `@lcx/gl` never having run in this container.** It has, since before 0.2.6.
> - **§1.1's timestamp inference is now a byte-level answer**, read out of the installed app.
> - **§4.2 gained the reason the installed app cannot be inspected**, which changes which procedure
>   closes it.
>
> HEAD has moved past `38c01b1` several times while this was written, so every claim below is pinned to
> its own git object or file, not to "the current tree".

---

## 0 · THE FINDING, IN ONE PARAGRAPH

The desktop app bundles a **copy** of the web build at package time. The version installed on
operators' machines is **0.2.6**, published **2026-08-11T08:56:05Z**. The earliest of the eight
relief views — E8 THE FORGE, which is the sign-in screen — was committed **2026-08-11T13:47:58Z**,
four hours fifty-one minutes *later*. So **zero of the eight reliefs are in the installed
application**, and no amount of web deployment changes that. They arrive only when someone cuts a
new signed release *and* each operator clicks an Install button. Two of those steps are the owner's
alone.

And the harder half — **as first written, this paragraph was wrong, and the correction matters more
than the original claim did.**

It said *"nobody has ever run a line of `@lcx/gl` in the container it ships in."* That is false.
`@lcx/gl` **is inside the installed 0.2.6 app and has been executing in that WKWebView since before
it shipped.** Established by looking at the binary rather than at the commit log (§1.1): the embedded
asset table in `/Applications/LCXOS.app/Contents/MacOS/lcx-terminal` contains
`assets/pipeline-Bzzf4T0W.js` and **two** `assets/index-*.js`, and at 0.2.6's source commit
`2b67b13` the flat-chart layer already did `await import('@lcx/gl')` for `sharedRenderer`
(`apps/web/src/components/charts/gl/useFlatChart.ts:97-98`). Every charted route therefore calls
`createStage` → `canvas.getContext('webgl2')` in WKWebView, and `~/Library/Logs/LCXOS/shell.log`
records 0.2.6 launching as recently as **2026-08-13T07:57:39Z**.

**What is still unknown is the only thing that was ever unknown: what that call returned.** Nothing
records it. `diagnostics_append` (`src-tauri/src/lib.rs:281`) has exactly one caller on the web side —
`apps/web/src/lib/terminal.ts:157` — and no GL path calls it, so the absence of any WebGL line in
that log is guaranteed by the absence of a logging call and is **not evidence about the WebView**.
The flat charts refuse to SVG silently, so a reader cannot tell either. §4.2 carries the rest.

The rest of the original paragraph stands: the web app carries at least ten WKWebView-specific notes
about focus rings, `inert`, Escape handling and JS dialogs — the WebView is plainly on this team's
radar for DOM behaviour, and has never once been considered for WebGL. The e2e suite is Chromium-only
(`apps/web/playwright.config.ts:26`) and every frame time in the programme is Chrome/ANGLE-Metal on
an M1.

---

## 1 · THE VERSIONS

| Where | Value | Evidence |
|---|---|---|
| Tauri config — stamps `CFBundleShortVersionString`, and what the updater compares | `0.2.6` | `apps/desktop/src-tauri/tauri.conf.json:4` |
| Rust crate | `0.2.6` | `apps/desktop/src-tauri/Cargo.toml:3` |
| Desktop workspace package | `0.2.6` | `apps/desktop/package.json:3` |
| Web package — the version an operator can **see** | `0.2.6` | `apps/web/package.json:3` → `__APP_VERSION__` at `apps/web/vite.config.ts:17` |
| Rendered in the footer | `v{__APP_VERSION__}` | `apps/web/src/components/layout/Footer.tsx:182` |
| Rendered on the sign-in screen | `LIVE · v{__APP_VERSION__}` | `apps/web/src/pages/SelectOperator.tsx:237` |
| Claimed on the public download page | `0.2.6` | `apps/web/src/pages/Launch.tsx:56` |
| **Served by the live update channel** | `0.2.6`, `pub_date 2026-08-11T08:56:05.383Z` | anonymous `GET` of the endpoint at `tauri.conf.json:75`, run 2026-08-13, HTTP 200 |

**They agree, and that is enforced rather than lucky.** `scripts/publish-release.mjs:80-83` refuses
to publish when `tauri.conf.json.version` and `apps/web/package.json.version` differ, because those
two fields are independent and drift is silently awful: bump only the config and the updater offers
0.2.7, the operator installs it, the app still renders v0.2.6, and they reasonably conclude the
update failed. `launch.test.tsx` pins `LCXOS_VERSION` to the config as well.

So there is **no version defect here**. The defect is that a matching version number says nothing
about matching *content* — which is §2.

### 1.1 · What 0.2.6 actually contains, and why git cannot tell you

`apps/web/dist` is gitignored (`.gitignore:2`). The bytes that shipped inside 0.2.6 are not in any
commit; they can only be reproduced by rebuilding the tree as it stood at publish time. Dating the
publish against the commit log was the first method used — **it is not the only one, and the second
subsection below replaces it with a direct read of the installed binary.** The dating is kept because
it is independent evidence and it agrees, and because the margin is not close:

| Environment | Component first committed | Commit | In 0.2.6? |
|---|---|---|---|
| E8 THE FORGE | 2026-08-11 13:47:58 UTC | `ec2c159` | **no** — 4h51m after publish |
| E5 THE SURFACE | 2026-08-12 18:07 UTC | `1b27216` | no |
| E3, E4, E6, E7 | 2026-08-12 18:50 UTC | `3ea87f8` | no |
| E1 THE THEATRE, E2 THE GLOBE | 2026-08-13 08:57 UTC | `175709c` | no |

(Author dates are `+0530`; converted to UTC to compare against `pub_date`. Re-checked against the git
objects: `ec2c159` is `2026-08-11T19:17:58+05:30` = 13:47:58 UTC. All four rows hold.)

#### The byte-level answer, which replaces the inference above

The inference was safe but it was still an inference, and §6.6 offered downloading the tarball as the
way to close it. There was a cheaper way, requiring no download: **the installed app is on this desk,
and Tauri embeds `frontendDist` into the executable with the asset PATHS stored uncompressed.** The
bodies are compressed and unreadable, but the keys are `strings`-visible, and the keys are enough —
Vite names a lazy chunk after the module that owns it.

```
/Applications/LCXOS.app/Contents/MacOS/lcx-terminal   10,369,632 B, mtime 2026-08-11 14:25 IST
  → 183 embedded asset keys, 180 of them .js
```

Stems (hash stripped) diffed against the current working-tree build. **In the current build and NOT in
installed 0.2.6 — 17 chunks:**

```
DeckReliefGl  ForgeBackdrop  GlobeReliefGl  OntologyOrreryGl  PipelineReliefGl
StormReliefGl  SurfaceReliefGl  VaultReliefGl          ← all eight relief surfaces
ao  dof  lines  lit  tonemap  volume                   ← six shared GL chunks
project  stateNarrative  useQualityTier
```

**In installed 0.2.6 and not in the current build: nothing.** So 0.2.6 is a strict subset, and the
eight relief surfaces are absent from it **by name in its own asset table** — not by dating. The
headline is now a byte-level claim.

And the same diff is what corrected §0: 0.2.6 **does** carry `pipeline` (`packages/gl/src/look/
pipeline.ts`) and a second `index-*.js`, which in the current build is the 28,204 B `@lcx/gl` chunk
that carries shader source. The GL engine shipped; the reliefs did not.

Two further facts the binary gives up, both tighter than `pub_date`:

| | |
|---|---|
| when 0.2.6 was **signed** | `2026-08-11T08:56:04Z` — the minisign trusted comment in `latest.json` reads `timestamp:1786438564`, one second before the `pub_date` |
| the **source commit** it was built from | `2b67b13` (`2026-08-11T14:22:58+05:30`), the last commit before the executable's 14:25 IST mtime |

For scale, measured on the working-tree build sitting at `apps/web/dist/assets` — **not** the 0.2.6
build, and not a claim about it: **15 lazy chunks carrying GLSL**, identified by bytes rather than by
filename. That is the whole of what a release would newly deliver, and every byte of it is lazy.

**The byte total is deliberately not restated here, and that is a correction.** This paragraph
originally said 158,845 bytes (155.1 KB) from grepping `#version 300 es`. Re-measured on the build
present later the same day with the marker `scripts/verify-live.mjs:122` uses — `precision
(highp|mediump|lowp)` or `createStage` — the same 15 chunks came to **162,739 bytes**. Two different
markers over a tree that was rebuilt in between, so neither figure is wrong; a fixed number typed into
prose is. §9.2's release record now emits the count, the names and the bytes per chunk from the build
being published, which is the only place that figure can come from without going stale — the same
lesson `docs/3d/p1/build.mjs`'s header records about seven hand-typed spine figures.

---

## 2 · `frontendDist` — THE EXACT COMMAND CHAIN

**As it stood — confirmed, every link of it:**

```
apps/desktop/src-tauri/tauri.conf.json:9   "beforeBuildCommand": "VITE_API_URL=https://lcx-sales-api.onrender.com npm run build -w @lcx/web"
apps/desktop/src-tauri/tauri.conf.json:10  "frontendDist": "../../web/dist"
```

Paths in `build` are relative to the config file's directory, so `../../web/dist` resolves to
`apps/web/dist`. `frontendDist` is a **directory Tauri copies into the app bundle**, not a URL —
the packaged app has no dev server and no Vite proxy; it serves those files over Tauri's custom
protocol. On macOS the copy is not a loose directory inside the `.app`: Tauri embeds it **into the
executable**, compressed, with the asset paths stored in the clear — which is what made §1.1's
byte-level read possible and what makes the shipped bundle unreadable by any other means.

**Does `npm run build -w @lcx/desktop` rebuild the web bundle? Yes.** That script is `tauri build`
(`apps/desktop/package.json:8`), and Tauri runs `beforeBuildCommand` before bundling — its own
`--help` says so: *"It also runs your `build.beforeBuildCommand`"* (CLI 2.11.4, checked). That same
help output has **no flag that skips it**, which is why §9.1 puts the gate there. So a desktop build
was:

```
npm run build -w @lcx/desktop
  └─ tauri build
       ├─ beforeBuildCommand:  VITE_API_URL=… vite build   (apps/web only, NO gate)
       ├─ cargo build --release                            (the Rust shell)
       └─ bundle: copy apps/web/dist → LCXOS.app, emit .dmg + .app.tar.gz + .sig
```

**and is now** (§9.1 — the only change to the chain):

```
npm run build -w @lcx/desktop   ·   npm run build:dmg -w @lcx/desktop
  └─ tauri build
       ├─ beforeBuildCommand:  npm run build-gate -w @lcx/desktop
       │    └─ apps/desktop/scripts/build-gate.mjs
       │         └─ VITE_API_URL=… npm run ci-check          (at the repo root)
       │              doctrine-lint → type-check → test → build (shared→gl→api→web)
       │              → gl-budget → perf-budget
       │         └─ assert apps/web/dist/index.html exists, print its fingerprint
       ├─ cargo build --release
       └─ bundle: copy apps/web/dist → LCXOS.app, emit .dmg + .app.tar.gz + .sig
```

There is still exactly **one** web build per desktop build: `vite build` sits inside `ci-check`, and
`perf-budget` reads `dist/index.html` immediately after it. The gate therefore measures the bundle
that is packaged, not a second one built minutes earlier.

Three consequences worth stating, because each is a way this goes wrong quietly:

1. **`beforeBuildCommand` builds `@lcx/web` only** — not `@lcx/shared`, not `@lcx/gl`. That is
   safe *here*, and for a checkable reason: both packages resolve to **source**, not to a built
   `dist` (`packages/gl/package.json:6-13`, `packages/shared/package.json:6-13` — `main`, `types`
   and `exports` all point at `./src/index.ts`). Vite compiles them from source on every build, so
   there is no stale-`dist` path into a desktop release. If either package ever gains a real build
   step in its `exports`, this line becomes a stale-bundle bug.
2. ~~**No gate runs.**~~ **FIXED — see §9.1.** As found: `tauri build` ran `vite build` and nothing
   else, so no `type-check`, no `vitest`, no `gl-budget`, no `perf-budget`, no `doctrine-lint`. The
   root `ci-check` and `gate` scripts knew nothing about the desktop app and it knew nothing about
   them, so a signed release could be cut from a tree that failed everything CI enforces — on the one
   channel whose artefact is in no commit. `beforeBuildCommand` now runs `ci-check`, the same script
   `.github/workflows/ci.yml:87` runs, and fails the build rather than warning. `audit-3d`, `lint`
   and the e2e suite are still not run here; §9.1 says why, and a web deploy does not get the first
   two either.
3. **A stale build cannot be published, but it can be built.** `publish-release.mjs:125-133` reads
   `CFBundleShortVersionString` out of the built `.app` with `plutil` and refuses if it disagrees
   with the config — the guard that stops last version's binary shipping under this version's tag.
   It does *not* and cannot check that `apps/web/dist` was rebuilt from the current tree; the
   version stamp comes from the Rust build, not from the web build. What it does check is narrower
   and still valuable: that the emitted JS contains the production API origin and no `localhost`
   (`:152-163`), a defect that shipped three times.

**The plain-language version: the eight relief views are in the repo and on the deployed site. They
are not in the app on anyone's Mac, and they cannot get there by any route other than a new
release.**

---

## 3 · WHAT A RELEASE REQUIRES

Order matters; each step is from `apps/desktop/README.md:31-131` and `scripts/publish-release.mjs`.

| # | Step | Command / place | Owner-only? |
|---|---|---|---|
| 0 | **Look at it in the real WebView first** | `npm run dev -w @lcx/desktop`, then §4.6 | **no** — and it is the only step that can still make the rest pointless |
| 1 | Version bump in **both** places | `tauri.conf.json:4` + `apps/web/package.json:3` (+ `LCXOS_VERSION`, `Launch.tsx:56`) | no |
| 2 | Update `LCXOS_DMG_MB` to the real DMG size | `Launch.tsx:76` | no — but only measurable after step 4 |
| 3 | Export the signing key path | `TAURI_SIGNING_PRIVATE_KEY=$HOME/.lcx-terminal/updater.key`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | **YES — the key** |
| 4 | Build both bundle targets — **this now runs the gate** (§9.1) and fails if `ci-check` fails | `npm run build:dmg -w @lcx/desktop` | **YES — needs the key from 3** |
| 5 | Dry run every guard — **this now also writes the build record** (§9.2) | `npm run release:dry -w @lcx/desktop` | no |
| 6 | Publish tag + assets + `latest.json` + build record | `npm run release -w @lcx/desktop` (needs `gh` authed to the releases repo) | **YES — credentials** |
| 7 | **Each operator clicks "Install and relaunch"** | a toast in the app; see §3.3 | **YES — every operator, individually** |
| 8 | Gatekeeper on first install for anyone new | see §5 | **YES — Apple enrollment** |

`VITE_API_URL` has left step 3: it is no longer something to remember to export, because
`build-gate.mjs` sets it (§9.1). Forgetting it was one of the two ways three releases shipped pointing
at `localhost:8791`.

**Step 7 is the one nobody had written down anywhere before this document, and it is the step that
decides whether any of the other seven mattered.** Publishing is not delivering: the app never installs
an update unattended, by a deliberate design decision recorded at `apps/web/src/lib/terminal.ts:219-226`
(the installer `remove_dir_all`s the running bundle, so an unattended install means an unexplained admin
prompt seconds after launch and a desk relaunched mid-write). So a release reaches a desk only when the
person at that desk presses a button, and a **failed** launch check is silent by design (`:227-241`).
A desk that has quietly stopped receiving updates is invisible until someone opens the menu or the log.
Neither the README's release checklist nor any plan document lists this step; it is listed here.

### 3.1 · The updater is configured, and the key it expects is not in this repo

```
tauri.conf.json:69   "createUpdaterArtifacts": true
tauri.conf.json:72-77  plugins.updater = {
                         pubkey:    "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDIxRjJGODY5NUZCRDU2NTgK…"
                         endpoints: ["https://github.com/voyagernik123/lcx-terminal-releases/releases/latest/download/latest.json"]
                       }
```

The `pubkey` decodes to a minisign public key with ID **21F2F8695FBD5658**. The matching **private**
key lives at `~/.lcx-terminal/updater.key` and is deliberately outside the repo
(`README.md:60-67`). No agent and no automation in this repo has it, can derive it, or should ask
for it. `publish-release.mjs:36-38` is explicit that the publisher never reads it — signing happens
inside `tauri build`, and the script only reads the resulting `.sig`, which is public by
construction.

**What happens if a release is published without it.** Three distinct outcomes, and they are not
equally bad:

- **The publisher refuses.** `publish-release.mjs:107-109`: no `.sig` beside the tarball means
  `TAURI_SIGNING_PRIVATE_KEY` was unset during the build, and it dies with that diagnosis. This is
  the path you actually hit, and it is the correct one.
- **If that guard were bypassed** — hand-rolled `gh release create`, which the README opens by
  forbidding (`:96`) — installed desks would **reject** the update. `tauri-plugin-updater` verifies
  the signature against the embedded `pubkey`; an unsigned or mis-signed artifact is not merely
  unverified, it is refused. The operator sees nothing (§3.3), so the channel would look healthy
  while delivering nothing.
- **If the private key is lost**, every installed client must be reinstalled by hand
  (`README.md:66-67`), because changing `pubkey` invalidates the trust root that the installed
  binaries carry. Rotating the key is not a config change; it is a re-install of the fleet.

Existing installs are never *broken* by a bad publish — the failure is always "silently stops
updating", never "stops working". That is a deliberate design property and it is also the reason a
broken channel can go unnoticed for weeks.

### 3.2 · The guards that already exist, so nobody re-derives them

`publish-release.mjs` refuses to publish on: version drift between the two sources (`:80-83`); an
endpoint not pointing at the releases repo (`:89-92`); zero or several `.app.tar.gz` (`:102-104`); a
missing `.sig` (`:107-109`); a built `.app` whose Info.plist version disagrees with the config
(`:125-133`); a `localhost` origin or a missing production origin in the emitted JS (`:152-163`); a
`LCXOS_DMG_MB` that disagrees with the real DMG (`:211-222`); an already-existing tag (`:421-430`).
After publishing it verifies the asset names, the anonymous HTTP 200 on the public download button
and on the updater endpoint, and finally that the endpoint **serves this version**, retrying for
120 s because the CDN serves the previous release for a while (`:505-525`). That last check exists
because on the 0.2.6 publish "endpoint responds" returned a false pass *and* caused a false failure
in the same run.

Two more were added with the build record (§9.2), both able to fail: a `dist` with **no `index.html`**,
and an `index.html` that **names no `index-<hash>.js` entry** — either way there is nothing to record
and nothing that could boot. And after publishing, the record asset must actually be present, asserted
the same way as the tarball and `latest.json`, because `gh release create` uploading five of six assets
fails in the only direction that matters: the tarball is there, so nothing looks wrong.

**Nothing in that list refuses on the 3-D layer, and that is now a decision rather than an omission.**
The record *reports* the count of chunks carrying shader source, by bytes, and prints
`← this release carries NO 3-D layer` when it is zero. It does not refuse, because **0.2.6 carried no
relief surfaces and was a correct release** — a `> 0` floor would have blocked it. What was actually
wrong was that nothing said so, and that is what the record fixes. A release that ships fifteen
*broken* GL chunks still passes: only `verify-live.mjs` can judge that, and only against a deployed
host, so it has no bearing on the desktop channel at all.

### 3.3 · Publishing is not delivering

`apps/web/src/lib/terminal.ts:242-270` — the launch check runs once per process, and when an update
exists it raises a toast with an **"Install and relaunch"** button. It does not install. That is
deliberate and the reasoning is on the record at `:219-226`: the installer `remove_dir_all`s the
running bundle before renaming the new one in, an operator in `/Applications` without admin rights
gets an unexplained password prompt seconds after launch, and a desk mid-governed-write would be
relaunched under it.

And `:227-241` — a **failed** launch check is silent, going to the shell log only, because the
channel used to 404 on every launch and a warning nobody can act on trains operators to ignore the
same toast layer the governance surfaces use. The cost is stated there plainly: *a desk that has
quietly stopped receiving updates is invisible until someone opens the menu or the log.*

So the delivery chain for the reliefs has one more owner-only step than "cut a release": **each
operator must click Install.** Until they do, they are on 0.2.6 and there is no 3-D anything.

---

## 4 · WOULD THE EIGHT RELIEFS WORK IN WKWEBVIEW?

**Honest headline: unknown, and knowable in about ten minutes.** What follows separates what the
repo establishes from what it does not.

### 4.1 · The eight, as they stand

| E | Component | Route | Opt-in? | Non-core extension | `webglcontextlost` handled |
|---|---|---|---|---|---|
| E1 | `DeckReliefGl` | `pages/CommandDeck.tsx` | yes, default off | — | yes |
| E2 | `GlobeReliefGl` | `pages/MarketMap.tsx` | yes, default off | — | yes |
| E3 | `PipelineReliefGl` | `pages/BdPipeline.tsx` | yes, default off | — | yes |
| E4 | `OntologyOrreryGl` | `pages/OntologyExplorer.tsx` | yes, default off | — | yes |
| E5 | `SurfaceReliefGl` | `components/command/CockpitPanels.tsx` | yes, default off | — | yes |
| E6 | `VaultReliefGl` | `pages/AuditLog.tsx` | yes, default off | — | yes |
| E7 | `StormReliefGl` | `pages/MarketingCrisis.tsx` | yes, default off | **`OES_texture_float_linear`** (`env/volume.ts:325-327`) | yes |
| E8 | `ForgeBackdrop` | `pages/SelectOperator.tsx:150-151` | **NO — unconditional** | — | **no** |

Seven of eight are behind a toggle that `useState(false)` initialises and nothing persists
(`GlobeRelief.tsx:73`), so on a desktop launch they are not merely off, they are off *again*. **E8
is the exception and it is the front door**: `SelectOperator.tsx:150-151` mounts `<ForgePlate />`
then `<Suspense fallback={null}><ForgeBackdrop /></Suspense>` on every unauthenticated launch. It
builds its own context, a 1024 shadow map, AO and DoF (`ForgeBackdrop.tsx:100` onward).

**E8 is therefore the only relief whose WKWebView behaviour matters unconditionally, and the only
one that is not the sole subject of a §7 toggle decision.** If exactly one thing gets verified in
the WebView, it is this one.

### 4.2 · Does WKWebView support WebGL2? — STILL OPEN, and here is exactly what closes it

**The verdict has not changed and I am not upgrading it. What changed is that the question is now
posed against established facts instead of guesses, and one of those facts moves it.**

#### 4.2.0 · What the second pass established

| | |
|---|---|
| **Which engine** | Apple's **system** WKWebView, bound through `wry 0.55.1` and `objc2-web-kit 0.3.2` (`src-tauri/Cargo.lock:5201`, `:2410`). Not a shipped engine, not a fork. |
| **Whether this repo configures WebGL at all** | **No, in either direction.** There is no `WebviewWindowBuilder` in `src-tauri/src/*.rs` — the window is declared in `tauri.conf.json:14-32` — and nothing sets `additional_browser_args`, a custom web context, or an initialisation script. Cargo features are `["macos-private-api", "tray-icon"]` (`Cargo.toml:17`) and nothing else. So the answer is **entirely a property of the operator's macOS**, and there is no repo-side switch that could be wrong. |
| **The supported floor** | `tauri.conf.json:51` — `macOS.minimumSystemVersion: "11.0"`. The WebKit is whatever the operator's macOS carries; it is not pinned. Any answer is a statement about a *fleet of WebKits*. |
| **This desk, measured off disk** | macOS **27.0** (build `26A5378j`), Safari **27.0**, `WebKit.framework` **22625**. Many majors past the Safari 15 that first shipped WebGL2 on by default — so if the answer here were "no context", an old engine would not be the cause. Read from `sw_vers` and the framework's `Info.plist`; **this is a version, not a WebGL measurement.** |
| **The release build cannot be inspected** | `Cargo.toml:17` does **not** enable Tauri's `devtools` feature. Tauri turns the Web Inspector on automatically in debug builds only, so the **installed 0.2.6 app has no inspector** and cannot be interrogated. This is new, and it is why §4.6's `tauri dev` path is not merely the cheapest route — it is the only one that does not involve changing a Cargo feature and cutting a build. |
| **`@lcx/gl` has already run in this container** | §0. The flat-chart layer's `await import('@lcx/gl')` (`useFlatChart.ts:97-98`) shipped inside 0.2.6 and the app has launched as recently as 2026-08-13T07:57:39Z. So `getContext('webgl2')` has been called in the shipping WKWebView, many times. |

#### 4.2.1 · Why that last row does NOT answer the question

Because **reachability is not the same as outcome, and nothing recorded the outcome.** Three links,
each verified:

1. `packages/gl/src/stage.ts:158-167` returns `stageRefusal('NO_WEBGL2')` as a *value*. It does not
   throw, does not warn, and does not log.
2. No GL path calls the one thing that would persist it. `diagnostics_append`
   (`src-tauri/src/lib.rs:281`) has exactly one caller in `apps/web` — `lib/terminal.ts:157` — and
   the Rust docstring at `:236-246` is explicit that its callers are the updater and `apiClient.ts`,
   and that `ErrorBoundary` is **not** one. So `~/Library/Logs/LCXOS/shell.log` (51 lines, spanning
   0.1.0 → 0.2.6) contains **no** GL line — and that absence is produced by the absence of a logging
   call, not by the WebView succeeding. Reading it as evidence would be exactly the error this
   programme keeps deleting.
3. The reader cannot see it either: the flat charts swap to SVG on refusal, silently and by design.

**So the honest state is: the code path is live on at least one desk, has been for days, and the
result has never been observed by anyone or anything.**

#### 4.2.2 · The change that would answer it for the FLEET — reported, not made

`apps/web` belongs to another track this session, so this is stated rather than done. It is one call,
in a file that already has the helper:

> In `apps/web`, on the **first** `NO_WEBGL2` refusal per launch, and on `stage.hdr === false`, call
> the existing `logDiagnostic` helper in `apps/web/src/lib/terminal.ts` (the wrapper around
> `invoke('diagnostics_append')` at `:157`). Once per launch, not per mount — `MAX_WEB_RECORDS = 40`
> and a 1 MB rotation are the constraints, and a chart route mounts many stages.

That puts the answer into `~/Library/Logs/LCXOS/shell.log` on **every** operator's machine — the one
file operators are already told to hand over (`lib.rs:55`) — and it also closes §4.4.1, the silent
8-bit fallback, by the same line. No release, no key and no inspector needed to read it afterwards.
Until something like it exists, "does WebGL2 work on the fleet?" is unanswerable by construction, and
§4.6 answers it for one machine at a time.

#### 4.2.3 · The original evidence, unchanged

There is still no evidence either way *about the outcome* in the repo, and I will not manufacture it:

- `apps/web/playwright.config.ts:26` — `projects: [{ name: 'chromium' … }]`. One browser. No WebKit
  project has ever run.
- Every frame-time figure in the programme (4.406 ms/frame, 227 fps, 11.328 ms at 2×) is
  Chrome/ANGLE-Metal on an M1. None describes WebKit.
- Grepping the whole repo for `WKWebView`/`webkit`/`Safari` returns ~20 hits — focus rings
  (`StrategicMatrix.tsx:271`), `MediaQueryList.addEventListener` (`useSplitView.ts:98`), `inert`
  (`dismiss.ts:107-108`), Escape semantics, JS dialogs (`terminal.ts:206-214`) — and **not one about
  WebGL, GPU, or a shader.**
- `apps/desktop/src-tauri/src/lib.rs` mentions the GPU exactly twice, both about the web content
  process dying (`:534`, `:1162`), never about a capability.

What I can say without leaving the repo: `tauri.conf.json:51` sets
`macOS.minimumSystemVersion: "11.0"`, so the WebKit the app runs on is whatever the operator's macOS
carries — it is not shipped with the app and it is not pinned. Any answer to "does WebGL2 work" is
therefore a statement about a *fleet of WebKits*, not about one.

Outside the repo, as background and explicitly **not** as a measurement: WebGL2 has been enabled by
default in WebKit since Safari 15, and WKWebView uses the same engine, so a `getContext('webgl2')`
is expected to succeed on any macOS 11+ machine with a reasonably current system WebKit. I did not
run it, this environment cannot run it, and *expected to succeed* is not the same claim as *the
eight reliefs render correctly* — which depends on extensions, on precision, on shader compilation
in a different driver stack, and on frame time. Treat §4.6 as the only way to close this.

**One route that looks like a shortcut and is not:** Playwright ships a WebKit target, which would
give a real `getContext('webgl2')` against a real WebKit. It is not installed here — the only browsers
in `~/Library/Caches/ms-playwright` are `chromium-1228` and `chromium_headless_shell-1228`, which is
also independent confirmation that `playwright.config.ts:26`'s single project is the whole truth. And
it would not settle this even if it were installed: Playwright's WebKit is Playwright's own build, not
Apple's system framework, and it is the system framework that the shipped app binds
(`objc2-web-kit`). Naming it here so nobody spends an afternoon producing a number about the wrong
engine.

### 4.3 · If WebGL2 is absent, does the refusal path hold? — YES, and it is traceable

This part **is** established, and it is the reason the risk here is "worse-looking" rather than
"broken".

`packages/gl/src/stage.ts:158-167` — `canvas.getContext('webgl2', …)`; a null return is
`stageRefusal('NO_WEBGL2')`, a value in a discriminated union, not a throw. The file's header states
the design intent: *"'No WebGL2 context' is a REAL STATE, not a crash"*, and the union makes the
fallback unskippable at the type level rather than a thing to remember.

For the seven opt-in reliefs, the refusal lands on the flat view. Traced on E2, which is
representative: `GlobeRelief.tsx:83-90` — `onRefused` records the code **and** sets
`wantRelief=false`, with the reason given: a canvas that failed keeps its last frame, and on a
figure whose reading is "which desks are awake right now" a frozen terminator is a *wrong* answer,
not a stale one. `:114` gates rendering on `wantRelief && refusal === null`. The flat view is passed
through as `children` and rendered unchanged, so what a reader gets on refusal is exactly what they
had before clicking.

For E8, the mechanism is different and stronger: the canvas is `display: none` until a frame has
actually been drawn (`ForgeBackdrop.tsx:306`), and `ForgePlate` — a pure CSS gradient with nothing in
it that can fail — is always underneath. `forgeBackdrop.test.tsx` asserts the plate paints with no
JavaScript beyond a div, that it sits below the renderer in the stack, that the canvas stays hidden
until ready, and that **the sign-in form is usable with the renderer absent**. So a WebView with no
WebGL2 shows the designed gradient sign-in screen and nothing is lost but the object.

**Verdict: on a total absence of WebGL2, the desktop app degrades exactly as designed.** The refusal
path is not the risk.

### 4.4 · What IS the risk: the silent degradations

Three failure modes that do not refuse, ranked by how invisible they are.

1. **`EXT_color_buffer_float` missing → silent 8-bit rendering.** `stage.ts:169-172` sets
   `fmt = float ? RGBA16F : RGBA8` and records the outcome as `stage.hdr` (`:134`, `:231`);
   `target3d.ts:66-70` and `dof.ts:152-153` follow it. Nothing refuses. The comment at
   `target3d.ts:66-69` is candid — *"then this runs in 8-bit and looks worse rather than pretending.
   A lit scene clips its specular highlight flat white in 8-bit."* The whole L2 premise (linear HDR
   working space, bloom accumulated in linear, one tone-map composite) is built on a float target,
   and in 8-bit the tone map is applied to already-clipped values. **And no reader and no log is ever
   told:** grepping consumers of `.hdr` outside `packages/gl` finds exactly one, and it is a sales
   motion surface (`apps/web/src/surfaces/sales/renderMotion.ts:148`) — **none of the eight
   reliefs reports it.** This is the one I would fix regardless of what the WebView turns out to
   support, because "the front door looks subtly worse on some machines and nothing says so" is
   precisely the class of defect this programme spends its time deleting.
2. **`OES_texture_float_linear` missing → E7 refuses cleanly.** `env/volume.ts:325-327` returns
   `MISSING_EXTENSION` with a reason naming trilinear sampling of the density grid, because without
   it a float `sampler3D` falls back to `NEAREST` and the field renders as voxel blocks *that look
   like a deliberate aesthetic*. Correct handling, and the only one of the two float extensions that
   gets it. (`env/particles.ts:373-375` does the same for `EXT_color_buffer_float`, but no relief
   uses the particle path — it lives in the `docs/3d` harnesses.)
3. **The quality ladder fails safe upward, which on an unknown WebView is the wrong direction.**
   `useQualityTier.ts:123-135` — `isSoftwareRasteriser` returns **true** when
   `WEBGL_debug_renderer_info` is unreadable, and the file's header explains the asymmetry: an
   unreadable renderer string must never *downgrade* the product, so every failure path resolves to
   `full`. That is right for the browser. In a WebView whose GL implementation nobody has timed, it
   means the app will run the most expensive tier — DoF, AO, a 1536 shadow map — on the assumption
   that a machine it could not characterise is fast. **This note has been superseded:** the file was
   uncommitted when §4.4 was written (it is not in `38c01b1`) but it landed in `ff3d007`, and
   `isSoftwareRasteriser` is still at `:123`. So it *is* in the current tree and would be in the next
   release — it is still in no *published* release, since 0.2.6 has no `useQualityTier` chunk (§1.1).

### 4.5 · Context cap, and browser APIs

**The cap.** The repo's own worst case is **3 live contexts**: one shared context for all flat chart
primitives, plus at most two reliefs per route (`3D_VFX_FINAL_PLAN.md` §1.1). `CommandDeck` is the
route that reaches it — `DeckRelief` plus `CockpitPanels`' `SurfaceRelief` plus the shared chart
context. **Whether WKWebView's per-process context limit differs from Chrome's 8–16 is not
established here and I could not establish it from the repo.** What *is* established is that it
degrades rather than breaks: WebKit's documented behaviour on exceeding the limit is to lose the
oldest context, and 7 of 8 reliefs listen for `webglcontextlost` and route it through the same
refusal that lands on the flat view. **`ForgeBackdrop` is the exception — zero `webglcontextlost`
listeners**, and once `ready` is true its canvas stays `display:block` with no path that hides it
again or rebuilds the context. It is created with `{ alpha: false }` (`:100`), so the always-present
`ForgePlate` gradient cannot show through it. What the compositor actually displays for a lost
context — last frame, or blank — I did not verify and will not guess; either way the sign-in *form*
stays usable, because it sits above and never depends on the canvas.

Separately, the shell handles the harder version of this: if the web content **process** dies (OOM,
GPU fault, WebKit bug) the `NSWindow` survives with a blank page, so `lib.rs:1173-1185` reloads it,
bounded at `MAX_WEBVIEW_RELOADS = 3` (`:537`), after which it logs "⌘R or ⌘Q". A GL-induced crash
therefore self-heals up to three times per launch.

**Browser APIs.** I checked the GL and relief paths for anything a WebView restricts, and the result
is clean:

- **Not used anywhere:** `OffscreenCanvas`, `createImageBitmap`, `new Worker`, `navigator.gpu`,
  `requestIdleCallback`, `IntersectionObserver`, `performance.memory`, service workers.
- **Used and guarded:** `ResizeObserver` — absent in older engines, and constructing it unguarded
  throws *inside an effect*, which React escalates to unmounting the subtree and taking the flat
  view down with it, so `GlobeRelief.tsx:96-110` measures first and observes only if the
  constructor exists. `matchMedia` — `ForgeBackdrop.tsx:247-249`, and when the preference cannot be
  read it **assumes reduced motion** rather than inventing movement. `WEBGL_debug_renderer_info` —
  guarded, see §4.4.3. `devicePixelRatio` — clamped to `[1,2]`.
- **`alert`/`confirm`/`prompt` are silent no-ops in this container** (`README.md:163-170`: wry's
  `WKUIDelegate` implements four methods and the alert panel is not one of them). No relief or GL
  path calls any of them — checked across all eight components and their `Gl` renderers.
- No component branches on the container: none of the eight references `isTerminal`, `isTauri` or
  `__TAURI__`. Whatever they do in a browser is exactly what they will attempt in the WebView.

Vite's `base` is unset (`apps/web/vite.config.ts`), so lazy chunks are requested at root-absolute
paths, which is what Tauri's custom protocol serves. No chunk-loading defect is expected from the
packaging — and if a chunk did fail to load, `ForgeBackdrop`'s dynamic `import('@lcx/gl')` has a
`.catch` that sets a reason and leaves the plate (`:67-68`), and each relief's `lazy()` sits inside a
`Suspense`.

### 4.6 · How to actually answer §4.2 — no release required

The dev path already runs the real WebView against a live web build:

```
apps/desktop/src-tauri/tauri.conf.json:7-8
  "beforeDevCommand": "npm run dev -w @lcx/web"
  "devUrl": "http://localhost:5173"
```

So `npm run dev -w @lcx/desktop` opens **WKWebView** on the current tree with hot reload, and no key,
no build, no tag and no release are involved.

**And it is not just the cheapest route, it is the only one available.** `tauri dev` is a debug build,
where Tauri enables the Web Inspector automatically; the release build does **not** — `Cargo.toml:17`
lists features `["macos-private-api", "tray-icon"]` and not `devtools`. So step 2 below is impossible
against the installed 0.2.6 app, or against any signed release, without changing a Cargo feature and
rebuilding. The dev window is where the inspector exists.

In that window:

1. The sign-in screen is E8. Does the machined disc appear, or only the gradient plate? That single
   look answers "is there a WebGL2 context in the shipping container".
2. In the inspector: `document.createElement('canvas').getContext('webgl2')` — null or not; then
   `gl.getExtension('EXT_color_buffer_float')` and `gl.getExtension('OES_texture_float_linear')`,
   which decide §4.4.1 and §4.4.2; then `gl.getParameter(gl.getExtension('WEBGL_debug_renderer_info')?.UNMASKED_RENDERER_WEBGL)`,
   which decides whether the quality ladder can characterise this machine at all.
3. Then open the seven toggles, one route at a time, and look.

That is a ten-minute pass that converts this entire section from "not established" to a set of
facts, and it can be done by anyone with the repo — it is **not** an owner-only step. It should
happen **before** any release is cut, because the alternative is discovering it on an operator's
machine, on the sign-in screen, in front of a Gatekeeper dialog (§5).

---

## 5 · FIRST INSTALL: THE MALWARE DIALOG IN FRONT OF THE FRONT DOOR

Two facts, each already recorded, that nobody has yet stated together.

**Fact one — the app is not notarized, by an owner decision.** `tauri.conf.json:52` sets
`macOS.signingIdentity: "-"`, i.e. ad-hoc. `README.md:68-92`: updater signing (minisign) is set up;
**Apple code signing / notarization is "Not set up"** — `Signature=adhoc`, `TeamIdentifier=not set`.
The consequence is that a *downloaded* DMG is quarantined, and first launch on someone else's Mac
requires right-click → Open → Open, or `xattr -dr com.apple.quarantine`. The fix is an Apple
Developer Program membership (~$99/yr) plus four env vars, after which Tauri notarizes
automatically and *nothing else changes*. This is owner-only in the strict sense: it needs a legal
entity, a payment and an Apple ID. It has been raised and answered — the standing decision on file
is **"he'll do it later. Do not chase it."** This document does not reopen it; it states the price.

`Launch.tsx:41-49` already treats this as the highest-stakes copy on the public page, and says why:
a colleague who hits the dialog, concludes the file is broken and gives up is *the single most
likely way this whole plan fails*, so the instruction sits under the download button, phrased as an
expected step, saying "once per Mac".

**Fact two — E8 THE FORGE is the sign-in screen**, mounted unconditionally
(`SelectOperator.tsx:150-151`), and it exists because sign-in is the one screen every operator and
every stranger passes through. `3D_VFX_FINAL_PLAN.md` §6.3 names it: *"The sign-in screen is the one
surface every visitor sees."*

**The interaction.** For a first-time installer the actual sequence is: download → double-click →
**"LCXOS cannot be opened because it is from an unidentified developer"** → find or be told the
right-click workaround → then, and only then, the cinematic front door. The five-second key-light
arc is spent on someone who has just been shown a malware warning. Ordering matters here in a way
that no amount of shader work can compensate for: the first impression is the dialog, and E8 is the
*second* impression.

This does not argue against E8 and it does not, by itself, argue for spending $99. It argues that
**the ordering is now a fact worth deciding about**, and it sharpens two of the plan's open
questions:

- The value of E8 in the desktop channel is capped by the dialog until notarization happens. In the
  *browser* channel — `/lcxos`, a shared link, no install — E8 has no such tax, and that is where
  its §7(a) "a stranger stops scrolling" case is strongest.
- Conversely, if notarization is going to happen anyway, doing it **before** the release that first
  carries E8 is free ordering: the same work, spent so that the first impression is the object
  rather than the warning.

---

## 6 · WHAT I COULD NOT ESTABLISH

Stated plainly, because an honest gap is worth more than a confident guess about a WebView I cannot
run.

1. **Whether the shipping WKWebView provides a WebGL2 context.** STILL OPEN, and §4.2.0 narrowed it
   without closing it. Established: the engine is the operator's *system* WKWebView (`Cargo.lock`
   `wry 0.55.1` + `objc2-web-kit 0.3.2`); **nothing in this repo enables or disables WebGL** — no
   `WebviewWindowBuilder`, no `additional_browser_args`, features are `["macos-private-api",
   "tray-icon"]` only — so the answer is purely a property of the operator's macOS; the floor is
   macOS 11 (`tauri.conf.json:51`); this desk runs macOS 27.0 / Safari 27.0 / WebKit 22625; and the
   `@lcx/gl` code path **already executes there** and has since before 0.2.6 (§0). Not established:
   what `getContext('webgl2')` returned, because `stage.ts` returns `NO_WEBGL2` as a value and no GL
   path calls `diagnostics_append`, so no log anywhere holds the answer (§4.2.1). Background knowledge
   says a context should be available on macOS 11+ with a current WebKit; **I did not run it and this
   environment cannot run WKWebView.** Two things settle it: §4.6 for one machine (and note per §4.2.0
   that only a `tauri dev` build has an inspector — the release build omits Tauri's `devtools`
   feature), or the one-call change in §4.2.2 for the whole fleet.
2. **Whether `EXT_color_buffer_float` and `OES_texture_float_linear` are present there.** These
   decide, respectively, whether the front door renders in HDR or silently in 8-bit, and whether E7
   works at all. Both are a one-line inspector query away (§4.6).
3. **WKWebView's per-process WebGL context limit.** Not in the repo. The repo's worst case is 3, and
   loss is handled by 7 of 8 components, so I expect degradation rather than breakage — but "expect"
   is the right verb and I am not upgrading it.
4. **Frame time in WKWebView, at any tier, on any machine.** Every number in this programme is
   Chrome/ANGLE-Metal on an M1 (and `3D_VFX_FINAL_PLAN.md` §6.6 already notes M2/M3 have never been
   measured either). A different GL implementation is a different measurement, and the quality
   ladder currently resolves to `full` when it cannot characterise a machine (§4.4.3).
5. **What the compositor shows for a lost context under `ForgeBackdrop`'s opaque canvas.** The
   absence of a `webglcontextlost` handler is certain; the visual outcome is not.
6. ~~**The exact contents of the shipped 0.2.6 web bundle.**~~ **CLOSED — see §1.1.** The chunk
   *manifest* of 0.2.6 was read directly out of the installed executable's embedded asset table (183
   keys, 180 of them `.js`), and stem-diffed against the current build: 0.2.6 is a strict subset
   missing exactly the eight relief surfaces and six shared GL chunks. What remains genuinely
   unavailable is the chunk **bodies** — Tauri stores them compressed, so per-chunk bytes and hashes
   for 0.2.6 cannot be recovered from the installed app, and they are in no commit either. **That is
   the gap §9.2 closes going forward:** every future release publishes a record carrying a sha256 per
   emitted file, so this diff will never again need archaeology. For 0.2.6 itself the only route to
   the bodies is still to download the published tarball.
7. **Whether any operator other than the owner has 0.2.6 installed, or is on something older.**
   Nothing in the repo records installed versions; there is no telemetry, by design. What *is* now
   readable, per desk, is `~/Library/Logs/LCXOS/shell.log` — on this one it holds 51 lines from
   `0.1.0` (2026-07-26T06:56:03Z) to `0.2.6` (2026-08-13T07:57:39Z). That is one desk, by hand, and it
   is not a fleet answer.

---

## 7 · WHAT THIS ADDS TO THE PLAN'S OPEN QUESTIONS

Not new work items — the plan is a closing plan and this does not reopen it. Four things it should
know:

1. **§4.1's §7(b) trial measures the deployed web build.** Whatever verdict it returns describes
   Chrome. The desktop channel is a second population running a different GL stack, and the trial
   does not cover it. One line in the write-up is enough to keep that honest.
2. **§6.3 says the anisotropic fix "will alter a look you have already approved."** In the desktop
   channel the approved look is not installed at all — 0.2.6 has no E8. The fix changes nothing that
   anyone on a Mac app has seen, which makes it *cheaper* there, not riskier.
3. **The silent 8-bit fallback (§4.4.1) deserves a line in the plan's defect list**, alongside
   `shadowTaps` (§4.2) and the anisotropic discontinuity (§4.3). It is the same species: a
   configuration that promises something it may not deliver, with nothing that says so. And it is
   the one of the three whose blast radius is the front door.
4. **The ten-minute WebView pass (§4.6) should gate the first release that carries any relief.**
   Cutting a release is the expensive, owner-only, irreversible-tag operation; looking at
   `npm run dev -w @lcx/desktop` first costs nothing and is not owner-only.

---

## 8 · THE ONE-PARAGRAPH ANSWER, IF THAT IS ALL ANYONE READS

The installed Mac app is **0.2.6**, published 2026-08-11, and it contains **none** of the eight
relief views — read out of the installed binary's own asset table, not inferred — and the desktop app
bundles a copy of the web build rather than fetching it. Getting them onto a desk requires a full release: bump two
versions, build with the **minisign private key that only the owner has**, publish with `gh` to the
separate releases repo, and then have **each operator click "Install and relaunch"** — the app never
installs an update unattended. If the reliefs get there, the refusal path is sound: no WebGL2 means
the flat views and a usable sign-in screen, traceably, and that is tested. What nobody has checked
is whether they *render* — the shipping container is WKWebView, the e2e suite is Chromium-only, every
frame time in the programme is Chrome/ANGLE, and the two float extensions the HDR path depends on
degrade **silently** to 8-bit with nothing reported to the reader. That is answerable in ten minutes
with `npm run dev -w @lcx/desktop`, which needs no key and no release, and it should happen before
the release rather than after. And whatever it says, the first thing a new installer sees is still
an unsigned-binary warning, because notarization is a standing owner decision that has been
deferred — which means E8's five-second key-light arc is currently the *second* impression, after a
malware dialog. Two things about that release are no longer true as of §9: **it cannot be cut from a
tree that fails CI** (`tauri build` now runs `ci-check` and aborts before packaging), and **it writes
down what it packaged** — commit, dirty flag, entry fingerprint, a sha256 per emitted file and the GL
chunk count — published beside the tarball, because `apps/web/dist` is in no commit and until now the
tag said nothing about the bytes on the desk.

---

## 9 · WHAT WAS ADDED — a gate and a record

Two defects, one shape: **a release artefact that (a) no gate checked and (b) nothing recorded.**
Both changes are inside `apps/desktop`. Nothing was versioned, tagged, published or signed.

### 9.1 · The gate — `apps/desktop/scripts/build-gate.mjs`, wired into `beforeBuildCommand`

```
tauri.conf.json:9   "beforeBuildCommand": "npm run build-gate -w @lcx/desktop"
package.json        "build-gate": "node scripts/build-gate.mjs"
```

It runs **`npm run ci-check` at the repo root** — the same script `.github/workflows/ci.yml:87` runs,
composed rather than re-listed, so a tightening of CI's definition of "checked" reaches the desktop
build with no edit here. That chain is `doctrine-lint → type-check → test → build (shared→gl→api→web)
→ gl-budget → perf-budget`, and its order is why this **replaces** the old `vite build` rather than
running beside it: `vite build` is inside it, `perf-budget` reads `dist/index.html` right after, so
there is exactly one web build per desktop build and the budgets measured the bundle that shipped.

Four things worth knowing:

- **Where, and why there.** `tauri build --help` (CLI 2.11.4) has no flag that skips
  `beforeBuildCommand`, and both `build` and `build:dmg` are `tauri build` — whereas an npm `prebuild`
  hook would have been absent from `build:dmg`, which is the command that cuts releases. The one
  remaining bypass is `tauri build -c <config>` merging a replacement command; named so it is a
  decision, not a discovery.
- **It fails, it does not warn.** A non-zero `ci-check` exits with *that* code (verified: a stub
  exiting 7 makes the gate exit 7, not 1), which aborts `tauri build` before `cargo build` and before
  the bundler — so no `.app`, no `.dmg` and no `.sig` exist to be published.
- **`VITE_API_URL` moved out of `tauri.conf.json` and into the script.** The config no longer shows the
  origin, which is a small legibility cost paid for a real reason: it now sits next to the account of
  why it exists, and `publish-release.mjs:152-163` still asserts the *result* in the emitted JS, so a
  drift between the two constants makes the publisher refuse rather than ship.
- **Three failure paths, each demonstrated against the real script before this was written:** the root
  `ci-check` script missing (exit 1, with the diagnosis naming the release rather than a missing npm
  script); `ci-check` failing (exit propagated); and `ci-check` passing but leaving no
  `apps/web/dist/index.html` (exit 1) — that last one guards the case where the root `build`
  composition stops ending in the web build, `perf-budget` reads a stale dist, and Tauri packages it.
  Chain resolution was checked from four working directories, since Tauri's hook cwd is undocumented.

**What it does not run, so nobody overreads it:** the e2e suite (CI runs it as a second job,
`ci.yml:91-136`; it needs `playwright install`, it binds port 5173, and its baselines are
`-chromium-darwin`, so a font difference would fail a release build for a pixel — and a gate that
fails for unrelated reasons is a gate that gets bypassed). `lint` and `audit-3d` are in the root
`gate` script, not `ci-check`, so a web deploy does not get them either; parity with the deploy is the
bar. And without `DATABASE_URL` the API DB suites skip, so a local desktop build proves less of the
API suite than CI does — which does not affect the bundle Tauri copies, but "it ran CI's checks"
would be an overstatement without this sentence.

### 9.2 · The record — `publish-release.mjs`, published as a release asset

`apps/web/dist` is gitignored, so the tag identifies the Rust shell and says nothing about the web
bytes it carries. Answering "which build is on this desk?" for 0.2.6 took `strings` on an installed
binary (§1.1) and still could not recover per-chunk bytes. So a release now writes
`LCXOS_<version>_build-record.json` and **uploads it beside the tarball it describes**:

| field | what it answers |
|---|---|
| `source.commit`, `committed_at`, `branch` | which tree |
| `source.dirty`, `dirty_paths` | **whether that commit is a lie of precision.** Recorded, not refused — a dirty tree is the normal state here, and the hashes below identify the bundle regardless. Refusing would have blocked 0.2.6, which was a correct release. The console prints `⚠ DIRTY TREE` so it is not missed. |
| `bundle.fingerprint`, `bundle.entry` | the `index-<hash>.js` stem, read the way `verify-live.mjs:98-99` reads it off a *deployed* document — so a desk build and a deploy are comparable without translation, and it feeds `verify-live --expect-changed-from` directly |
| `bundle.eager` | the entry script, every modulepreload, every stylesheet and every preloaded font |
| `bundle.files{path: {bytes, sha256}}` | the durable identity of the bundle. Walked **recursively**, not `assets/` only, because `public/` lands in the dist root — the directory `check-bundle.mjs` records a 40 MB payload being able to hide in |
| `bundle.gl_chunk_count`, `gl_chunks` | did this release carry the 3-D layer? Judged **by bytes** with `verify-live.mjs:122`'s marker, not by filename, because name matching misses E8 (it ships as `ForgeBackdrop`) and all seven shared chunks |
| `artifacts.*.sha256` | the exact tarball and DMG that left this machine |
| `toolchain` | node and `@tauri-apps/cli` versions |

It is published rather than committed: it describes a gitignored directory, so committing it would put
a fact about untracked bytes into the code repo while the bytes stayed unreachable. As an asset it sits
next to the tarball, and `release:dry` writes it too, so the numbers are visible before anything is
published.

**Verified against the real dist before this was written**, by executing the section's own source text
out of `publish-release.mjs` (cut from the file, not retyped) against `apps/web/dist`: 210 files,
3,991,250 B, fingerprint `RnBH-5IQ`, **15 GL chunks of which 8 are renderer surfaces** — which matches
the count arrived at independently by hand, and matches `verify-live.mjs`'s own measured figure of 15
on the deployed graph. Both new refusal paths were exercised too (no `index.html`; an `index.html`
naming no entry chunk).

**And it caught a defect in itself, which is the reason to write the number down.** The first version
of the eager-set reader matched `rel="preload"[^>]+as="font"[^>]+href=` — an attribute order Vite does
not emit. Run against the real `dist/index.html` it found the entry, two modulepreloads and two
stylesheets and **missed both font preloads: 434 KB, the single largest item in first load** per
`apps/web/scripts/check-bundle.mjs`, absent from a record whose only job is to say what shipped.
Attributes are now parsed order-independently.

### 9.3 · What was deliberately not done

- **No version bump, no tag, no publish, no signing.** The updater key was not touched or asked for.
- **No new gate invented.** `ci-check` already existed and is what CI runs.
- **No floor on GL chunk count** (§3.2 has the reasoning: it would have refused 0.2.6).
- **Nothing in `apps/web`, `packages/`, `docs/3d/`, `Cargo.toml` or the updater block.** The one change
  outside this app that would materially help is written out in full in §4.2.2 — a single
  `logDiagnostic` call on the first `NO_WEBGL2` refusal and on `stage.hdr === false` — and it is
  reported there rather than made, because those files belong to another track this session.
