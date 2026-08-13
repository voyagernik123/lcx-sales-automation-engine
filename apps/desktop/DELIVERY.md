# DELIVERY — the second target

> **What this is.** `3D_VFX_FINAL_PLAN.md` and every document it supersedes describe one delivery
> target: the deployed web build. There is a second one — the installed Mac app — and no plan
> document mentions it. This maps it. It is a **mapping exercise**: nothing here was changed, and
> two of its most important questions are answered "not established", with the procedure that
> would establish them.
>
> **Written:** 2026-08-13, against `38c01b1`. Every claim below is either a file:line, a git
> object, or a single read-only HTTP GET that is named as such.

---

## 0 · THE FINDING, IN ONE PARAGRAPH

The desktop app bundles a **copy** of the web build at package time. The version installed on
operators' machines is **0.2.6**, published **2026-08-11T08:56:05Z**. The earliest of the eight
relief views — E8 THE FORGE, which is the sign-in screen — was committed **2026-08-11T13:47:58Z**,
four hours fifty-one minutes *later*. So **zero of the eight reliefs are in the installed
application**, and no amount of web deployment changes that. They arrive only when someone cuts a
new signed release *and* each operator clicks an Install button. Two of those steps are the owner's
alone.

And the harder half: **nobody has ever run a line of `@lcx/gl` in the container it ships in.** The
web app carries at least ten WKWebView-specific notes about focus rings, `inert`, Escape handling
and JS dialogs — the WebView is plainly on this team's radar for DOM behaviour, and has never once
been considered for WebGL. The e2e suite is Chromium-only (`apps/web/playwright.config.ts:26`) and
every frame time in the programme is Chrome/ANGLE-Metal on an M1.

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

**They agree, and that is enforced rather than lucky.** `scripts/publish-release.mjs:75-78` refuses
to publish when `tauri.conf.json.version` and `apps/web/package.json.version` differ, because those
two fields are independent and drift is silently awful: bump only the config and the updater offers
0.2.7, the operator installs it, the app still renders v0.2.6, and they reasonably conclude the
update failed. `launch.test.tsx` pins `LCXOS_VERSION` to the config as well.

So there is **no version defect here**. The defect is that a matching version number says nothing
about matching *content* — which is §2.

### 1.1 · What 0.2.6 actually contains, and why git cannot tell you

`apps/web/dist` is gitignored (`.gitignore:2`). The bytes that shipped inside 0.2.6 are not in any
commit; they can only be reproduced by rebuilding the tree as it stood at publish time. Dating the
publish against the commit log is therefore the only available method, and it is sufficient here
because the margin is not close:

| Environment | Component first committed | Commit | In 0.2.6? |
|---|---|---|---|
| E8 THE FORGE | 2026-08-11 13:47:58 UTC | `ec2c159` | **no** — 4h51m after publish |
| E5 THE SURFACE | 2026-08-12 18:07 UTC | `1b27216` | no |
| E3, E4, E6, E7 | 2026-08-12 18:50 UTC | `3ea87f8` | no |
| E1 THE THEATRE, E2 THE GLOBE | 2026-08-13 08:57 UTC | `175709c` | no |

(Author dates are `+0530`; converted to UTC to compare against `pub_date`.)

For scale, measured on the working-tree build now sitting at `apps/web/dist/assets` — **not** the
0.2.6 build, and not a claim about it: **15 lazy chunks carrying GLSL, 158,845 bytes (155.1 KB)**,
identified by grepping the emitted JS for `#version 300 es` rather than by filename. That is the
whole of what a release would newly deliver, and every byte of it is lazy.

---

## 2 · `frontendDist` — THE EXACT COMMAND CHAIN

```
apps/desktop/src-tauri/tauri.conf.json:9   "beforeBuildCommand": "VITE_API_URL=https://lcx-sales-api.onrender.com npm run build -w @lcx/web"
apps/desktop/src-tauri/tauri.conf.json:10  "frontendDist": "../../web/dist"
```

Paths in `build` are relative to the config file's directory, so `../../web/dist` resolves to
`apps/web/dist`. `frontendDist` is a **directory Tauri copies into the app bundle**, not a URL —
the packaged app has no dev server and no Vite proxy; it serves those files over Tauri's custom
protocol.

**Does `npm run build -w @lcx/desktop` rebuild the web bundle? Yes.** That script is `tauri build`
(`apps/desktop/package.json:8`), and Tauri runs `beforeBuildCommand` before bundling. So a desktop
build is:

```
npm run build -w @lcx/desktop
  └─ tauri build
       ├─ beforeBuildCommand:  VITE_API_URL=… vite build   (apps/web only)
       ├─ cargo build --release                            (the Rust shell)
       └─ bundle: copy apps/web/dist → LCXOS.app, emit .dmg + .app.tar.gz + .sig
```

Three consequences worth stating, because each is a way this goes wrong quietly:

1. **`beforeBuildCommand` builds `@lcx/web` only** — not `@lcx/shared`, not `@lcx/gl`. That is
   safe *here*, and for a checkable reason: both packages resolve to **source**, not to a built
   `dist` (`packages/gl/package.json:6-13`, `packages/shared/package.json:6-13` — `main`, `types`
   and `exports` all point at `./src/index.ts`). Vite compiles them from source on every build, so
   there is no stale-`dist` path into a desktop release. If either package ever gains a real build
   step in its `exports`, this line becomes a stale-bundle bug.
2. **No gate runs.** `tauri build` does not run `type-check`, `vitest`, `gl-budget`, `perf-budget`,
   `doctrine-lint`, `audit-3d` or the e2e suite. The root `ci-check` and `gate` scripts
   (`package.json`) know nothing about the desktop app, and the desktop app knows nothing about
   them. A release can be cut from a tree that fails all of them.
3. **A stale build cannot be published, but it can be built.** `publish-release.mjs:120-128` reads
   `CFBundleShortVersionString` out of the built `.app` with `plutil` and refuses if it disagrees
   with the config — the guard that stops last version's binary shipping under this version's tag.
   It does *not* and cannot check that `apps/web/dist` was rebuilt from the current tree; the
   version stamp comes from the Rust build, not from the web build. What it does check is narrower
   and still valuable: that the emitted JS contains the production API origin and no `localhost`
   (`:147-158`), a defect that shipped three times.

**The plain-language version: the eight relief views are in the repo and on the deployed site. They
are not in the app on anyone's Mac, and they cannot get there by any route other than a new
release.**

---

## 3 · WHAT A RELEASE REQUIRES

Order matters; each step is from `apps/desktop/README.md:31-131` and `scripts/publish-release.mjs`.

| # | Step | Command / place | Owner-only? |
|---|---|---|---|
| 1 | Version bump in **both** places | `tauri.conf.json:4` + `apps/web/package.json:3` (+ `LCXOS_VERSION`, `Launch.tsx:56`) | no |
| 2 | Update `LCXOS_DMG_MB` to the real DMG size | `Launch.tsx:76` | no — but only measurable after step 4 |
| 3 | Export the signing key path and API origin | `TAURI_SIGNING_PRIVATE_KEY=$HOME/.lcx-terminal/updater.key`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, `VITE_API_URL` | **YES — the key** |
| 4 | Build both bundle targets | `npm run build:dmg -w @lcx/desktop` | **YES — needs the key from 3** |
| 5 | Dry run every guard | `npm run release:dry -w @lcx/desktop` | no |
| 6 | Publish tag + assets + `latest.json` | `npm run release -w @lcx/desktop` (needs `gh` authed to the releases repo) | **YES — credentials** |
| 7 | Each operator installs | a button in the app; see §3.3 | **YES — every operator, individually** |
| 8 | Gatekeeper on first install for anyone new | see §5 | **YES — Apple enrollment** |

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
for it. `publish-release.mjs:31-33` is explicit that the publisher never reads it — signing happens
inside `tauri build`, and the script only reads the resulting `.sig`, which is public by
construction.

**What happens if a release is published without it.** Three distinct outcomes, and they are not
equally bad:

- **The publisher refuses.** `publish-release.mjs:102-104`: no `.sig` beside the tarball means
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

`publish-release.mjs` refuses to publish on: version drift between the two sources (`:75-78`); an
endpoint not pointing at the releases repo (`:84-87`); zero or several `.app.tar.gz` (`:97-99`); a
missing `.sig` (`:102-104`); a built `.app` whose Info.plist version disagrees with the config
(`:120-128`); a `localhost` origin or a missing production origin in the emitted JS (`:147-158`); a
`LCXOS_DMG_MB` that disagrees with the real DMG (`:206-217`); an already-existing tag (`:256-265`).
After publishing it verifies the asset names, the anonymous HTTP 200 on the public download button
and on the updater endpoint, and finally that the endpoint **serves this version**, retrying for
120 s because the CDN serves the previous release for a while (`:330-348`). That last check exists
because on the 0.2.6 publish "endpoint responds" returned a false pass *and* caused a false failure
in the same run.

Nothing in that list looks at the 3-D layer. A release that ships zero GL chunks, or fifteen broken
ones, passes every guard.

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

### 4.2 · Does WKWebView support WebGL2? — NOT ESTABLISHED FROM THIS REPO

There is no evidence either way in the repo, and I will not manufacture it:

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
   that a machine it could not characterise is fast. Note that this file is **uncommitted in the
   working tree** at the time of writing (it is not in `38c01b1`), so it is not in any release and
   the line numbers may move.

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
no build, no tag and no release are involved. In that window:

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

1. **Whether the shipping WKWebView provides a WebGL2 context.** No repo evidence exists in either
   direction. Background knowledge says yes on macOS 11+ with a current WebKit; I did not measure
   it and this environment cannot. §4.6 is the procedure.
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
6. **The exact contents of the shipped 0.2.6 web bundle.** `apps/web/dist` is gitignored, so this is
   inferred from commit timestamps versus the channel's `pub_date`. The margin (4h51m on the
   earliest component) makes the conclusion safe, but it is an inference, not a byte comparison. A
   byte comparison is available if wanted: download the published 0.2.6 tarball and grep its JS for
   `#version 300 es`.
7. **Whether any operator other than the owner has 0.2.6 installed, or is on something older.**
   Nothing in the repo records installed versions; there is no telemetry, by design.

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
relief views — they were all committed after it was packaged, and the desktop app bundles a copy of
the web build rather than fetching it. Getting them onto a desk requires a full release: bump two
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
malware dialog.
