# DELIVERY — the second target

> **What this is.** `3D_VFX_FINAL_PLAN.md` and every document it supersedes describe one delivery
> target: the deployed web build. There is a second one — the installed Mac app — and no plan
> document mentions it. This maps it. **As first written it was a pure mapping exercise** — nothing
> changed, and its two most important questions were answered "not established", with the procedure
> that would establish them. Both of those questions are now answered (§4.2.4, §1.1), the gate and the
> record in §9 were added rather than merely described, and §10–§11 make the release runnable. What
> remains open is listed in §6 and is genuinely open.
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
>
> **Revised again: 2026-08-14, against `536b703`.** Three things changed, and the first is the one this
> document existed to leave open:
>
> - **§4.2 is CLOSED and the answer is yes.** WKWebView gives WebGL2 a context, both float extensions
>   and a readable renderer string — *measured*, not inferred, against the same
>   `/System/Library/Frameworks/WebKit.framework` binary the installed app links. The measurement is a
>   checked-in program, `scripts/webview-gl-probe.swift`, so it can be re-run per machine rather than
>   believed. §4.2.4 carries the numbers and the two things it still does not establish.
> - **§9.1's gate has now been watched failing**, in five separate ways, and `tauri build` has been
>   watched aborting on it. §9.4 records exactly what was run and what came back. Before this pass the
>   gate's central claim — *"it fails, it does not warn"* — rested on one stub test.
> - **§10 is new: the release as one copy-pasteable sequence**, and §11 states the version the next
>   release should carry without bumping anything. Step 7 of §3 (every operator clicks Install) was
>   written down but the other eight steps were spread across a table, a README and two script headers.
>
> **Revised again: 2026-08-15, against `fd7fa0d`.** Everything above was re-verified rather than
> inherited, and two things are new — one of them a defect nobody had looked for:
>
> - **§12 is new, and it is the claim this document had never actually made:** the web bundle a
>   desktop build would package **carries the 3-D programme** — 15 GL chunks, 174,422 B, identified by
>   shader bytes rather than by filename, **every one of them lazy**, measured on a real
>   `npm run build -w @lcx/web`. Until now the only route to that number was a completed, signed
>   release build; §12.3 adds `scripts/inspect-frontend-dist.mjs`, which answers it with no key and no
>   bundler, and refuses on the one thing nothing checked before.
> - **§13 is new and nobody had asked the question: what theme does a fresh desk start in?** The
>   answer is **light, always, and there is no input that can change it** — because `index.html:12`
>   reads a localStorage key that **no code in this repo has written since 2026-07-25**. Proven by
>   executing the packaged bootstrap, not by reading it. This is a defect in `apps/web`, which belongs
>   to another track; §13.4 states the one-line fix with its file:line rather than making it.
> - **Re-verified, not assumed:** the command chain and `tauri build --help` against CLI 2.11.4
>   (§2.4), all five of the gate's failure paths (§9.4 re-run), and the WKWebView GL probe, which
>   reproduced §4.2.4's JSON byte for byte on a second date (§4.2.5).

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

**What was unknown was the only thing that was ever unknown: what that call returned.** Nothing
records it. `diagnostics_append` (`src-tauri/src/lib.rs:281`) has exactly one caller on the web side —
`apps/web/src/lib/terminal.ts:157` — and no GL path calls it, so the absence of any WebGL line in
that log is guaranteed by the absence of a logging call and is **not evidence about the WebView**.
The flat charts refuse to SVG silently, so a reader cannot tell either.

**That is now answered by measurement rather than by the log that could never hold it.** The call
returns a context: WebGL 2.0, GLSL ES 3.00, `Apple GPU`, with `EXT_color_buffer_float` and
`OES_texture_float_linear` both present, on the same WebKit binary the installed app links. §4.2.4 is
the measurement and §4.2.2's fleet-wide logging change is still the thing that would answer it for
*every* desk rather than for the ones somebody probes. The rest of §4.2 is kept as written because it
is the record of what was and was not knowable from the repo alone.

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

### 2.4 · The chain, re-verified against the CLI rather than against this document

Re-run 2026-08-15 at `fd7fa0d`, because a chain described once and then quoted three times is a
chain nobody has checked twice. Every link read out of the file or the tool, not out of §2:

| Link | Read from | Value |
|---|---|---|
| `npm run build -w @lcx/desktop` | `apps/desktop/package.json:8` | `tauri build` |
| `npm run build:dmg -w @lcx/desktop` | `apps/desktop/package.json:9` | `tauri build --bundles app,dmg` |
| the hook | `tauri.conf.json:9` | `npm run build-gate -w @lcx/desktop` |
| the gate | `apps/desktop/package.json:10` | `node scripts/build-gate.mjs` |
| what it runs | `build-gate.mjs:92` + root `package.json` | `npm run ci-check` at the repo root |
| `ci-check` | root `package.json:ci-check` | `doctrine-lint → type-check → test → build → gl-budget → perf-budget -w @lcx/web` |
| where the web build sits inside it | root `package.json:build` | `… && npm run build -w @lcx/web`, which is `vite build` (`apps/web/package.json:8`) |
| what gets copied | `tauri.conf.json:10` | `../../web/dist` → `apps/web/dist` |

**Does the gate run BEFORE anything is packaged, and does a failure STOP the build?** Yes to both,
and neither is inferred:

- `npx tauri build --help` (**CLI 2.11.4**, run 2026-08-15) opens with *"It also runs your
  `build.beforeBuildCommand`"*, and its full option list — `--runner`, `--verbose`, `--debug`,
  `--target`, `--features`, `--bundles`, `--no-bundle`, `--config`, `--ci`, `--skip-stapling`,
  `--ignore-version-mismatches`, `--no-sign`, `--help`, `--version` — contains **no flag that skips
  it**. `--no-bundle` skips the *bundler*, not the hook. `-c/--config` remains the one deliberate
  bypass (§9.1).
- The gate **fails, it does not warn**: `build-gate.mjs:157-167` propagates `ci-check`'s exit code,
  and `tauri build` treats a non-zero `beforeBuildCommand` as a fatal error before `cargo build`
  (watched, §9.4). All five of the script's own paths were re-exercised on 2026-08-15 against a
  throwaway repo root, and all five reproduced: **A** missing `ci-check` → exit 1 naming the release
  artefact; **B** `ci-check` exits 7 → **exit 7, not flattened to 1**, with the sentinel confirming it
  ran at the repo root with `VITE_API_URL=https://lcx-sales-api.onrender.com` and
  `npm_config_workspace=undefined`; **C** `ci-check` green but no `dist/index.html` → exit 1;
  **D** all well → exit 0, printing `gated bundle /assets/index-ABC12345.js`; **E** `--explain` →
  exit 0 **and the sentinel was never written**, so it is a diagnostic and not a bypass.

**One consequence of the ordering that is easy to get backwards, and matters for §12:** the gate
proves the bundle is *checked*, and `build-gate.mjs:179-186` proves an `index.html` *exists*. Neither
of them looks inside the bundle. Nothing in the desktop path had ever asked whether the thing being
packaged contains the 3-D layer at all — that is §12.

---

## 3 · WHAT A RELEASE REQUIRES

Order matters; each step is from `apps/desktop/README.md:31-131` and `scripts/publish-release.mjs`.

> **This table is the map. §10 is the runnable version** — every command copy-pasteable and checked
> against the script it invokes, including the ordering trap in step 2 below, which this table records
> only as a parenthesis.

| # | Step | Command / place | Owner-only? |
|---|---|---|---|
| 0 | **Look at it in the real WebView first** | `scripts/webview-gl-probe.swift` for the capability (§4.2.4), then `npm run dev -w @lcx/desktop` for the look (§4.6) | **no** — and it is the only step that can still make the rest pointless |
| 1 | Version bump in **both** places | `tauri.conf.json:4` + `apps/web/package.json:3` (+ `LCXOS_VERSION`, `Launch.tsx:56`) | no |
| 2 | Update `LCXOS_DMG_MB` to the real DMG size | `Launch.tsx:76` | no — but only measurable after step 4, **and it then needs a rebuild**: §10 step 4 |
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

**Honest headline: the container supports them — measured (§4.2.4) — and whether they *look* right
there is still unobserved.** What follows separates what the repo establishes from what it does not,
and §4.2 is the part that moved.

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

### 4.2 · Does WKWebView support WebGL2? — **ANSWERED: yes, and measured**

**The answer is in §4.2.4 and it is a measurement, not an upgrade of a guess:
`getContext('webgl2')` returns a context in Apple's system WKWebView, both float extensions are
present, `WEBGL_debug_renderer_info` is readable, a `#version 300 es` program compiles and links, and
the drawn pixel reads back. The RGBA16F framebuffer the HDR path allocates is `FRAMEBUFFER_COMPLETE`.**

§4.2.0 through §4.2.3 are **kept exactly as they were written**, because they are the record of what
the repo could and could not establish on its own, and because §4.2.2 — the one-call change that
answers this for the whole fleet instead of for one machine — is still not done and is still the
right thing to do. Read them as the road to the answer, not as the answer.

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

> **Still true, and still worth doing — read it against §4.2.4.** The measurement closed the question
> for one WebKit; it did not build the mechanism that answers it for a desk nobody visits, and this
> paragraph is that mechanism. What has changed is only the cheap per-machine route: not §4.6's
> inspector, but `scripts/webview-gl-probe.swift`, which needs no dev server and works against a
> release build.

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

#### 4.2.4 · THE MEASUREMENT THAT CLOSED IT

§4.2.3 says the only settling routes are `tauri dev` by eye or a fleet-wide log line. **That was
wrong by omission, and the thing it missed is that WKWebView is a public class anyone can
instantiate.** The shipped app's WebView is not special: it is `WKWebView` from the operator's own
`WebKit.framework`. So the capability question can be asked directly, by a 200-line program, without
Tauri, without a build, without the key, and without a release.

That program is now checked in at **`apps/desktop/scripts/webview-gl-probe.swift`**, so this is
re-runnable per machine rather than a number in prose:

```bash
swiftc -O -o /tmp/webview-gl-probe apps/desktop/scripts/webview-gl-probe.swift \
  -framework Cocoa -framework WebKit && /tmp/webview-gl-probe
```

**Result on this desk — macOS 27.0 (`26A5378j`), WebKit 22625.1.22.11.4, run three times identically:**

```json
{"ok":true,"webgl2":true,"version":"WebGL 2.0","glsl":"WebGL GLSL ES 3.00",
 "vendor":"WebKit","renderer":"WebKit WebGL","debug_renderer_info":true,
 "unmasked_renderer":"Apple GPU","unmasked_vendor":"Apple Inc.",
 "EXT_color_buffer_float":true,"OES_texture_float_linear":true,"EXT_float_blend":true,
 "EXT_texture_filter_anisotropic":true,"KHR_parallel_shader_compile":true,
 "MAX_TEXTURE_SIZE":16384,"MAX_SAMPLES":4,"MAX_3D_TEXTURE_SIZE":2048,"extension_count":36,
 "vs_compiled":true,"fs_compiled":true,"linked":true,
 "pixel":[0,255,0,255],"drew_green":true,"rgba16f_framebuffer_complete":true,"gl_error":0}
```

**Why this is a statement about the shipping container and not about a lookalike.** Three checks, each
run rather than assumed:

| | |
|---|---|
| **Same engine binary** | `otool -L` on the probe and on `/Applications/LCXOS.app/Contents/MacOS/lcx-terminal` both print `/System/Library/Frameworks/WebKit.framework/Versions/A/WebKit`, **current version 625.1.22** — the same file, the same version. Not Playwright's WebKit (§4.2.3's named trap), not a bundled engine. |
| **Same configuration** | The probe uses a stock `WKWebViewConfiguration()`. wry 0.55.1 sets six things on the config and preferences — `allowsPictureInPictureMediaPlayback`, `fullScreenEnabled`, `tabFocusesLinks`, `developerExtrasEnabled`, `drawsBackground`, `allowsInlineMediaPlayback` — and **grepping `~/.cargo/registry/src/*/wry-0.55.1/src/wkwebview/mod.rs` finds no WebGL-related key at all.** §4.2.0 already established that `src-tauri` adds nothing. So there is no repo-side or wry-side switch that could make the app's answer differ. |
| **A context is not a frame** | Capability queries can all pass on a stack that then fails to compile GLSL ES 3.00 or never reaches the GPU process. The probe compiles a real `#version 300 es` pair, links, draws one point and `readPixels` it back: `[0,255,0,255]`. The GPU path works, not just the constructor. |

**The probe was falsified before its result was believed**, because a probe that can only print `true`
is not evidence:

| Induced fault | Reported |
|---|---|
| `getContext('webgl2')` → `getContext('webgl9')` (a context name that cannot exist) | `{"ok":true,"webgl2":false}` — a refusal is reported as a refusal, cleanly, with no throw and no hang |
| fragment shader emits red instead of green | `pixel=[255,0,0,255]`, `drew_green=false` — the draw assertion is live, not decorative |

**What this does NOT establish, and the second row is the one that matters:**

1. **That the eight reliefs look right.** The probe compiles two lines of GLSL, not `lit.ts`. Shadow
   bias, tone mapping, the anisotropic look and frame time are all untouched. **§4.6 still owns that
   question and is still a step worth taking before a release** — its role has changed from *"is there
   a context"* to *"does the object render correctly"*, which is the harder half and the one an
   inspector query was never going to answer.
2. **The fleet.** This is one WebKit — 22625, on macOS 27. `tauri.conf.json:51` sets a macOS **11**
   floor, and the engine is the operator's, not shipped with the app. As background and explicitly not
   as measurement: WebGL2 has been on by default in WebKit since Safari 15, so a Big Sur desk that
   never updated Safari past 14 is the one plausible shape of a `false` here. **That is exactly the
   population §4.2.2's one `logDiagnostic` call would cover**, and this measurement does not remove the
   reason to make it — it removes the reason to *fear* it. Run the probe on the machine in question,
   or land that call.
3. **Frame time.** Unmeasured in WKWebView at any tier, on any machine. §6.4 stands unchanged.

#### 4.2.5 · Re-run on a second date, because a single run is an anecdote

`swiftc -O … && /tmp/webview-gl-probe`, run again **2026-08-15** at `fd7fa0d`, on the same desk. The
JSON is **identical to §4.2.4's, field for field** — `webgl2:true`, `WebGL 2.0`, `WebGL GLSL ES 3.00`,
`unmasked_renderer:"Apple GPU"`, `EXT_color_buffer_float:true`, `OES_texture_float_linear:true`,
`EXT_float_blend`, `EXT_texture_filter_anisotropic`, `KHR_parallel_shader_compile`,
`MAX_TEXTURE_SIZE:16384`, `MAX_SAMPLES:4`, `MAX_3D_TEXTURE_SIZE:2048`, `extension_count:36`,
`vs_compiled`/`fs_compiled`/`linked` all true with **empty compile and link logs**,
`pixel:[0,255,0,255]`, `rgba16f_framebuffer_complete:true`, `gl_error:0`.

**So the WebGL2 question does not need a new experiment and this document does not invent one.** The
answer is a measurement, it is checked in as a program rather than as a number, and it reproduces. The
residual is exactly what §4.2.4 said it was — **scope, not doubt**: one WebKit (22625) against a macOS
11 floor, and the two ways to widen it are unchanged and both cheap:

| To answer for | Do this | Cost |
|---|---|---|
| **any one desk** | `swiftc -O -o /tmp/webview-gl-probe apps/desktop/scripts/webview-gl-probe.swift -framework Cocoa -framework WebKit && /tmp/webview-gl-probe` | ~25 s, no key, no build, no release, no repo checkout beyond that one file |
| **every desk, forever** | the one `logDiagnostic` call in §4.2.2 — first `NO_WEBGL2` refusal per launch, and `stage.hdr === false` | one call in `apps/web/src/lib/terminal.ts`, still not made, still belongs to another track |

And the thing worth restating in front of a release decision, because it changes what "bad" means:
**the refusal path holds (§4.3).** If a desk somewhere returns `webgl2:false`, that desk shows the
**flat views and a working gradient sign-in screen** — not blank canvases, not a crash. The risk being
managed is *"the reliefs are invisible on that desk"*, and it is the whole content of the next release
becoming invisible there, which is expensive. It is not *"the app breaks"*, and treating it as the
latter would buy insurance against the wrong failure.

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
   **Measured on this desk (§4.2.4): `EXT_color_buffer_float` is PRESENT, and the RGBA16F
   framebuffer `target3d.ts` allocates comes back `FRAMEBUFFER_COMPLETE`.** So the front door renders
   in HDR here. That narrows the risk to machines nobody has probed and **does not close it** — the
   defect was never "it will be 8-bit", it was "if it is 8-bit, nothing says so", and that is still
   true on every desk. The fix is unchanged and still worth making.
2. **`OES_texture_float_linear` missing → E7 refuses cleanly.** `env/volume.ts:325-327` returns
   `MISSING_EXTENSION` with a reason naming trilinear sampling of the density grid, because without
   it a float `sampler3D` falls back to `NEAREST` and the field renders as voxel blocks *that look
   like a deliberate aesthetic*. Correct handling, and the only one of the two float extensions that
   gets it. (`env/particles.ts:373-375` does the same for `EXT_color_buffer_float`, but no relief
   uses the particle path — it lives in the `docs/3d` harnesses.)
   **Measured (§4.2.4): `OES_texture_float_linear` is PRESENT, so E7 does not refuse on this WebKit.**
   Its `R32F` `TEXTURE_3D` (`volume.ts:399`) also fits: `MAX_3D_TEXTURE_SIZE` is 2048 and the grid is
   built from `nx/ny/nz` floored at 2 (`:379-381`), orders of magnitude below the cap.
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
   **And the premise it worried about does not hold here (§4.2.4): `WEBGL_debug_renderer_info` IS
   readable in WKWebView and returns `Apple GPU` / `Apple Inc.`** `isSoftwareRasteriser`
   (`useQualityTier.ts:123-135`) tests `/swiftshader|llvmpipe|software/i`, which `Apple GPU` does not
   match, so it returns **false** — the machine is characterised as hardware on evidence rather than
   defaulted to `full` on an unreadable string. Worth knowing anyway: `Apple GPU` is far coarser than
   Chrome's `ANGLE (Apple, Apple M1, …)`, so **the WebView cannot tell an M1 from an M4**. Nothing in
   that file matches on a model — the tier is picked from a measured frame, not from the string — so
   this costs nothing today, and would cost a great deal to anything that later tried to shortcut the
   measurement by reading the model out of the renderer name.

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

### 4.6 · Seeing them render — no release required

> **Retitled, because §4.2 is answered.** This section was *"how to actually answer §4.2"*, and
> §4.2.4 answered the capability half in 25 seconds without any of the machinery below. What is left
> is the harder half and the reason this step still belongs in front of a release: **a context is not
> a picture.** Step 2's inspector queries are now redundant (run `scripts/webview-gl-probe.swift`
> instead — it needs no dev server and works against a release build too). **Steps 1 and 3 are not**,
> and they are the ones that were always the point.

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

1. The sign-in screen is E8. **Does the machined disc appear, and does it look like the approved
   look?** The key-light arc, the shadow, the tone map. A context is guaranteed (§4.2.4); a *correct
   picture* is not, and this is the only place that gets checked.
2. ~~In the inspector: `getContext('webgl2')`, then the two float extensions, then
   `WEBGL_debug_renderer_info`.~~ **Superseded by `scripts/webview-gl-probe.swift`**, which asks all
   of it in 25 seconds, needs no dev server, prints JSON you can paste, and — unlike the inspector —
   works against a release build, where Tauri's `devtools` feature is absent (§4.2.0).
3. Then open the seven toggles, one route at a time, and look.

That is a ten-minute pass, and after §4.2.4 it is aimed at the harder question: not *"is the
capability there"* but *"is the picture right, in a GL implementation nothing in this programme has
ever measured a frame on"*. It can be done by anyone with the repo — it is **not** an owner-only
step. It should happen **before** any release is cut, because the alternative is discovering it on an
operator's machine, on the sign-in screen, in front of a Gatekeeper dialog (§5).

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

1. ~~**Whether the shipping WKWebView provides a WebGL2 context.**~~ **CLOSED — see §4.2.4.** It
   does: WebGL 2.0 / GLSL ES 3.00 / `Apple GPU`, a `#version 300 es` program compiles, links, draws
   and reads back, measured against the same `WebKit.framework` binary (625.1.22) the installed app
   links, with a stock configuration matching wry's. **The residual is scope, not doubt:** one
   WebKit (22625) against a macOS 11 floor. §4.2.2's one `logDiagnostic` call is still the only thing
   that answers it for desks nobody probes, and `scripts/webview-gl-probe.swift` answers it for any
   desk in two minutes. The paragraph below is the state *before* that measurement, kept because it
   is the honest record of what the repo alone could support:

   > Established: the engine is the operator's *system* WKWebView (`Cargo.lock` `wry 0.55.1` +
   > `objc2-web-kit 0.3.2`); **nothing in this repo enables or disables WebGL** — no
   > `WebviewWindowBuilder`, no `additional_browser_args`, features are `["macos-private-api",
   > "tray-icon"]` only — so the answer is purely a property of the operator's macOS; the floor is
   > macOS 11 (`tauri.conf.json:51`); this desk runs macOS 27.0 / Safari 27.0 / WebKit 22625; and the
   > `@lcx/gl` code path **already executes there** and has since before 0.2.6 (§0). Not established:
   > what `getContext('webgl2')` returned, because `stage.ts` returns `NO_WEBGL2` as a value and no GL
   > path calls `diagnostics_append`, so no log anywhere holds the answer (§4.2.1). Background
   > knowledge says a context should be available on macOS 11+ with a current WebKit; **I did not run
   > it and this environment cannot run WKWebView.** Two things settle it: §4.6 for one machine (and
   > note per §4.2.0 that only a `tauri dev` build has an inspector — the release build omits Tauri's
   > `devtools` feature), or the one-call change in §4.2.2 for the whole fleet.

   **The sentence that was wrong is the last one.** "This environment cannot run WKWebView" was
   assumed, not tested. `WKWebView` is a public class, `swiftc` is on the machine, and the framework
   is the same one the app links — so the environment could run it all along, and a 25-second program
   answered in one go what two documents had deferred to a future session. **The lesson is not about
   WebGL:** a capability was declared unavailable without the one command that would have checked.
2. ~~**Whether `EXT_color_buffer_float` and `OES_texture_float_linear` are present there.**~~
   **CLOSED — see §4.2.4. Both present**, plus `EXT_float_blend`,
   `EXT_texture_filter_anisotropic`, `KHR_parallel_shader_compile` and a readable
   `WEBGL_debug_renderer_info` (36 extensions total). So on this WebKit the front door renders in HDR
   and E7 does not refuse. Same scope caveat as item 1: one WebKit, not the fleet — and §4.4.1's real
   defect (**nothing reports an 8-bit fallback to anyone**) is untouched by a machine where the
   fallback does not happen.
3. **WKWebView's per-process WebGL context limit.** Not in the repo. The repo's worst case is 3, and
   loss is handled by 7 of 8 components, so I expect degradation rather than breakage — but "expect"
   is the right verb and I am not upgrading it.
4. **Frame time in WKWebView, at any tier, on any machine.** Every number in this programme is
   Chrome/ANGLE-Metal on an M1 (and `3D_VFX_FINAL_PLAN.md` §6.6 already notes M2/M3 have never been
   measured either). A different GL implementation is a different measurement. **The one part of this
   that has moved: the ladder is no longer flying blind here** — `WEBGL_debug_renderer_info` is
   readable in WKWebView and returns `Apple GPU`, so `isSoftwareRasteriser` answers on evidence rather
   than falling back to "assume fast" (§4.4.3). It still has no frame time from that engine.
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

**Two entries were retired on 2026-08-15, and one of them was never on this list because nobody had
asked the question:**

8. ~~**Whether the bundle a desktop build packages carries the 3-D programme.**~~ **CLOSED — §12.** It
   does: 15 GL chunks, 174,422 B, 8 renderer surfaces + 7 shared, found by shader bytes, and **none of
   them in the eager set**. Re-takeable in five seconds with
   `node apps/desktop/scripts/inspect-frontend-dist.mjs`, where before it cost a signed build. What
   this does **not** say is that they render — §4.6 still owns that.
9. ~~**What theme a fresh desk starts in.**~~ **ANSWERED, and the answer is a defect — §13.** Light,
   always, for every operator, because `apps/web/index.html:12` reads `lcx-os:ui:v1` while
   `persistence.ts:38` has written `lcx-os:<scope>:ui:v1` since `241ef55` (2026-07-25). Proven by
   executing the packaged bootstrap against a negative control that fires. The preference itself
   **does** survive relaunches — `tauri://localhost` has a real on-disk `localstorage.sqlite3`
   (§13.2) — it is simply never read before paint, and `/select` is a sibling of `AppLayout`, so
   nothing else applies it at the front door either. The one-line fix is in `apps/web` and is stated
   at §13.4 rather than made. **What remains genuinely open there is the product half**: whether a
   returning operator's theme *should* be honoured on a shared desk's sign-in screen at all (§13.4).

---

## 7 · WHAT THIS ADDS TO THE PLAN'S OPEN QUESTIONS

Not new work items — the plan is a closing plan and this does not reopen it. Six things it should
know, and the sixth is new on 2026-08-15:

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
   `npm run dev -w @lcx/desktop` first costs nothing and is not owner-only. It is now step 0b of §10,
   with the *capability* half of it split out as step 0a — a 25-second program (§4.2.4) rather than a
   thing to remember to type into an inspector.
5. **The programme's WebKit risk register is one item shorter and the remaining items are sharper.**
   WebGL2, both float extensions, anisotropic filtering and a readable renderer string are all
   present in the shipping container (§4.2.4). What is left is frame time in that engine, the
   per-process context cap, and `ForgeBackdrop`'s missing `webglcontextlost` handler — three specific
   things, rather than one large "does any of this work on a Mac app".
6. **The light branch of `theme.ts` is the ONLY branch the front door will ever execute (§13), and
   the theme work happening right now does not know it.** `ForgeBackdrop.tsx:128` reads
   `document.documentElement.classList.contains('dark')` on the one route where that class is never
   set on a cold launch, so E8's dark variant is unreachable on a fresh desk in either channel. Two
   consequences for a track designing against it right now: light is the case to get right *first* for
   that surface, and the dark variant **cannot be checked by looking at the running app** until
   §13.4's one line lands. Cheapest item here, and the only one with a deadline.

---

## 8 · THE ONE-PARAGRAPH ANSWER, IF THAT IS ALL ANYONE READS

The installed Mac app is **0.2.6**, published 2026-08-11, and it contains **none** of the eight
relief views — read out of the installed binary's own asset table, not inferred — and the desktop app
bundles a copy of the web build rather than fetching it. Getting them onto a desk requires a full release: bump two
versions, build with the **minisign private key that only the owner has**, publish with `gh` to the
separate releases repo, and then have **each operator click "Install and relaunch"** — the app never
installs an update unattended. If the reliefs get there, the refusal path is sound: no WebGL2 means
the flat views and a usable sign-in screen, traceably, and that is tested — **and it will not be
needed on a current Mac, because WKWebView does give WebGL2 a context**: measured, on the same
`WebKit.framework` the installed app links, with both float extensions present and an RGBA16F target
complete (§4.2.4, re-runnable via `scripts/webview-gl-probe.swift`). What nobody has checked is
whether the eight *look* right there — the e2e suite is Chromium-only and every frame time in the
programme is Chrome/ANGLE — which is ten minutes with `npm run dev -w @lcx/desktop`, needs no key and
no release, and should happen before the release rather than after. And whatever it says, the first thing a new installer sees is still
an unsigned-binary warning, because notarization is a standing owner decision that has been
deferred — which means E8's five-second key-light arc is currently the *second* impression, after a
malware dialog. Two things about that release are no longer true as of §9: **it cannot be cut from a
tree that fails CI** (`tauri build` now runs `ci-check` and aborts before packaging), and **it writes
down what it packaged** — commit, dirty flag, entry fingerprint, a sha256 per emitted file and the GL
chunk count — published beside the tarball, because `apps/web/dist` is in no commit and until now the
tag said nothing about the bytes on the desk. **And two more, as of §12 and §13:** the bundle a desktop
build would copy **does** carry the whole 3-D programme — 15 GL chunks, 174,422 B, all lazy, none of
it fetched before first paint — verified by shader bytes on a real build and re-checkable in five
seconds without the key; while the front door it would ship **always starts in light**, for every
operator, because the pre-hydration theme read has been pointed at a key nothing writes since
2026-07-25, and the sign-in screen is the one route the shell's theme effect never reaches.

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
  the bundler — so no `.app`, no `.dmg` and no `.sig` exist to be published. **Both halves of that
  sentence have now been watched happening rather than reasoned about — §9.4.**
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
- **On 2026-08-15, the same again, and it now includes a defect this pass found rather than
  inherited.** `apps/web/index.html:12`'s dead theme key (§13.4) is a one-line fix in `apps/web`; it
  is stated with its file:line and left. `apps/desktop/package.json` was not touched either — it
  carries a `version` field this pass is forbidden to change, so the one line it wants
  (`"inspect-dist": "node scripts/inspect-frontend-dist.mjs"`) is written out in §12.3 and not
  applied. **The only file added is `apps/desktop/scripts/inspect-frontend-dist.mjs`**, which reads a
  directory and writes nothing.

### 9.4 · The gate, watched failing — because a gate nobody has seen fail is a gate nobody has tested

§9.1 claimed three failure paths were "demonstrated against the real script". They were re-run from
scratch, all five paths this time, plus the link that actually matters and that no script test can
cover: **whether `tauri build` stops.**

**The script's own paths.** Run against a throwaway repo root (a `package.json`, a copy of
`build-gate.mjs` at the same relative depth, an `apps/web/` to write into), so the real tree was never
touched. The stub `ci-check` writes a sentinel file recording its cwd and environment, which is what
makes "it ran" and "it ran *there*" separable claims:

| # | Induced state | Observed |
|---|---|---|
| A | root `package.json` has no `ci-check` script | **exit 1**, message names the release artefact and points at `GATE_SCRIPT`, not at a missing npm script |
| B | `ci-check` exits 7 | **exit 7** — *the code is propagated, not flattened to 1.* Sentinel confirms it ran, `cwd` = the repo root, `VITE_API_URL=https://lcx-sales-api.onrender.com`, and `npm_config_workspace=undefined` (the hazard the script's §132-144 comment reproduced on a minimal workspace — still absent under this npm) |
| C | `ci-check` exits 0 but `apps/web/dist/index.html` is absent | **exit 1** — the stale/empty-bundle guard, the one that catches the root `build` composition drifting away from `npm run build -w @lcx/web` |
| D | `ci-check` exits 0, `dist/index.html` present with an entry script | **exit 0**, prints `gated bundle /assets/index-<hash>.js` |
| E | `--explain` | **exit 0**, prints `GATE NOT RUN`, **and the sentinel file was not created** — so it is a diagnostic, not a bypass, by observation rather than by intent |

**The link that matters: does a failing hook actually stop the build?** Run against the real app, with
the hook replaced *for that one invocation only* via the documented config merge — nothing in the repo
was edited:

```bash
cd apps/desktop
npx tauri build --no-bundle -c '{"build":{"beforeBuildCommand":"exit 7"}}'
```

```
Running beforeBuildCommand `exit 7`
beforeBuildCommand `exit 7` failed with exit code 7
       Error beforeBuildCommand `exit 7` failed with exit code 7
```

`tauri build` **exited 1**, and — the part worth checking rather than assuming — the output contains
**zero** lines matching `Compiling`, `Finished` or `Bundling`, and no new artefact appeared under
`src-tauri/target/release/bundle` (its newest contents are still 0.2.6's, dated 2026-08-11 14:26).
So the abort is genuinely *before* `cargo build --release` and before the bundler, which is the
property §9.1 asserted.

Also confirmed in the same pass, against CLI **2.11.4**: `tauri build --help` lists `--no-bundle`,
`-b/--bundles`, `-c/--config`, `-d/--debug`, `-t/--target` and eleven others, and **none of them skips
`beforeBuildCommand`** — the help text says outright that `tauri build` *"also runs your
`build.beforeBuildCommand`"*. `-c` remains the one deliberate bypass, and it is the mechanism used
above: powerful enough to disable the gate, which is exactly why it is named in §9.1 as a decision
rather than left as a discovery.

**What this still does not prove.** That `ci-check` itself passes on the current tree — it was not run
end to end here (it is the long one: doctrine-lint, three type-check passes, four test suites, four
builds, two budgets), and it is the parent gate's job. The five rows above prove the gate *transmits*
that verdict. Whether the verdict is green on any given day is §10 step 4's problem, and it will be
loudly obvious.

---

## 10 · THE RELEASE, AS ONE SEQUENCE

> **Why this section exists when §3 already has a table.** §3 is a *map* of what a release requires —
> what is owner-only and why. It is not runnable: two of its cells say "see §4.6" and "see §3.3", the
> commands live in three other places (this document, `README.md:95-131`, and two script headers), and
> the ordering constraint that actually bites (step 4 below) is recorded in §3 as a parenthesis. This
> is the runnable version. **Every command was checked against the script it invokes, not described
> from memory**, and the two that need a credential are marked in the only way that matters — they
> will not work without it.
>
> Run from the **repo root** unless a line says otherwise. Paths are repo-relative.

### Step 0 · Preflight — no key, no tag, nothing irreversible

```bash
# 0a · does the WebView on THIS machine still give WebGL2 a context?  (~25 s)
swiftc -O -o /tmp/webview-gl-probe apps/desktop/scripts/webview-gl-probe.swift \
  -framework Cocoa -framework WebKit && /tmp/webview-gl-probe

# 0b · do the eight reliefs LOOK right in WKWebView?  (§4.6 — the half 0a cannot answer)
npm run dev -w @lcx/desktop        # ⌘Q when done

# 0c · the one CI job the build gate deliberately does NOT run  (§9.1)
npm run e2e -w @lcx/web            # needs `npx playwright install chromium` once per machine

# 0d · does the bundle tauri would COPY actually carry the 3-D layer?  (§12 — ~5 s)
npm run build -w @lcx/web          # only if you have not built since your last edit
node apps/desktop/scripts/inspect-frontend-dist.mjs
```

`0a` should print `"webgl2":true` and `"drew_green":true`. If it prints `"webgl2":false`, **stop and
read §4.3 before deciding anything**: the app will not break, it will show the flat views and a
gradient sign-in screen, but the entire content of this release becomes invisible on that machine and
the release is worth less than it looks.

`0c` is skipped by the gate on purpose (§9.1: `-chromium-darwin` baselines would fail a release build
for a font difference), which is exactly why it belongs here instead.

`0d` should end in `✓ the bundle is intact and every GL chunk is lazy` and list **15 chunks — 8
renderer surfaces + 7 shared, ~174 KB** (§12.2). It is here, at step 0, rather than left to step 5,
because the same number out of `release:dry` costs a full **signed** build first — `publish-release.mjs`
dies at `:96`, `:102`, `:108` and `:132` long before it walks the dist, and `:108` needs the owner's
key. Reading `(none) ← this build carries NO 3-D layer` *here* costs five seconds; reading it at step 5
costs the build, and reading it after step 6 costs a version number. Add
`-- --expect-gl-chunks 15` if you want it to fail rather than inform. Note the count is legitimately
allowed to move (§12.4).

### Step 1 · Version — five files, and only two of them are enforced

§11 recommends the number. **This document does not set it.** When you do:

| File | Line | Enforced by |
|---|---|---|
| `apps/desktop/src-tauri/tauri.conf.json` | `4` | the source of truth: stamps `CFBundleShortVersionString`, names the tag, fills `latest.json` |
| `apps/web/package.json` | `3` | `publish-release.mjs:80-83` **refuses to publish** on a mismatch — this is the version an operator can *see*, via `__APP_VERSION__` |
| `apps/web/src/pages/Launch.tsx` (`LCXOS_VERSION`) | `56` | `launch.test.tsx:37-43` reads `tauri.conf.json` and asserts equality — so this one fails **step 3's gate**, before anything is signed |
| `apps/desktop/package.json` | `3` | **nothing.** Sync by hand. |
| `apps/desktop/src-tauri/Cargo.toml` | `3` | **nothing** — `tauri.conf.json`'s `version` is what stamps the bundle, so this one is hygiene, not function. `cargo` rewrites `Cargo.lock` itself on the next build. |

The two unenforced rows are the ones to get wrong, and neither is load-bearing — which is precisely
why nobody would notice them drifting for six versions.

### Step 2 · The signing key — **OWNER ONLY, and the only step no agent can do**

```bash
export TAURI_SIGNING_PRIVATE_KEY="$HOME/.lcx-terminal/updater.key"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD=""
```

Exactly as `README.md:39-40`. `TAURI_SIGNING_PRIVATE_KEY` is a **path**, not key material — the file
at that path is the secret and it is deliberately outside the repo (§3.1). This key has no passphrase,
hence the empty second variable; that is a fact about this key, not a recommendation. **Must be the
same shell as step 3** — signing happens inside `tauri build`, not in the publisher
(`publish-release.mjs:36-38`).

Skip this and step 3 still produces a DMG that installs. What it will not produce is a `.sig`, and
`publish-release.mjs:107-109` then refuses with that diagnosis — the correct failure, hit early.

### Step 3 · Build — this is where the gate runs

```bash
npm run build:dmg -w @lcx/desktop
```

`tauri build --bundles app,dmg`. The chain is §2's: `beforeBuildCommand` → `build-gate.mjs` →
`npm run ci-check` at the root (doctrine-lint → type-check → test → build → gl-budget → perf-budget,
with `VITE_API_URL` pinned to production) → `cargo build --release` → bundle. Long: the full test
matrix plus a release Rust build.

**If the gate fails, nothing is packaged** — no `.app`, no `.dmg`, no `.sig` (§9.4 watched this).
Fix the failure; do not reach for `-c` to route around it.

### Step 4 · The DMG size — the one field that cannot be set before the build

```bash
node -e "const fs=require('fs'),d='apps/desktop/src-tauri/target/release/bundle/dmg';\
for(const f of fs.readdirSync(d))if(f.endsWith('.dmg'))\
console.log(f, (fs.statSync(d+'/'+f).size/1e6).toFixed(1)+' MB')"
```

That arithmetic is `publish-release.mjs:214`'s, character for character — bytes ÷ 1,000,000, one
decimal — so it prints the exact string the publisher will compare against `LCXOS_DMG_MB`
(`Launch.tsx:76`).

**If it differs, update `Launch.tsx:76` and then RUN STEP 3 AGAIN.** This is the ordering trap, and
it is a real one: the publisher compares the *source constant* against the DMG on disk, so editing
`Launch.tsx` after the build makes the guard pass while the bundle you are about to ship still renders
the old figure. Rebuilding costs another gate run and shifts the DMG by a few KB — which the rounding
to 0.1 MB absorbs. If the number already matches, skip both.

For scale: 0.2.6's DMG is 4,070,367 B → `4.1 MB`, and `LCXOS_DMG_MB` is `4.1`, so 0.2.6 needed no
edit. **The next release will**: it adds the eight relief surfaces and six shared GL chunks (§1.1).

### Step 5 · Dry run — every guard, plus the build record

```bash
npm run release:dry -w @lcx/desktop
```

Runs all eight refusal paths of §3.2 and writes `LCXOS_<version>_build-record.json` **without
publishing anything**. Read three lines of its output before continuing:

- `api origin … ← verified present in the built bundle` — the defect that shipped three times (§2.3).
- `commit …` with `⚠ DIRTY TREE` if the tree is dirty. Not a refusal (§9.2), but it decides whether
  the tag identifies these bytes or whether only the hashes do.
- `gl chunks N carrying shader source (M renderer surfaces + …)`. **This is the line that answers
  "does this release actually carry the 3-D layer?"** — 0.2.6's answer was 0 and nothing said so.
  Expect roughly 15 / 8 (§9.2 measured 15 of which 8 surfaces on the working-tree build). If it prints
  `← this release carries NO 3-D layer`, step 3 packaged the wrong `dist` and publishing is pointless.

### Step 6 · Publish — **needs `gh` credentials for the releases repo**

```bash
gh auth status                      # must cover voyagernik123/lcx-terminal-releases
npm run release -w @lcx/desktop
```

Creates the tag, uploads six assets (`latest.json`, the versioned tarball, its `.sig`, the build
record, the versioned DMG and the fixed `LCXOS-macOS-arm64.dmg` alias), then verifies the asset names,
an **anonymous** HTTP 200 on the public download button and on the updater endpoint, and finally that
the endpoint serves *this* version — retrying for up to 120 s, because the CDN serves the previous
release for a while and asking "does it respond" instead of "does it serve this version" produced both
a false pass and a false failure on the 0.2.6 publish (`:492-525`).

An existing tag is refused, not overwritten (`:421-430`). If you need to redo a published version, the
answer is a new version number, not `--force`.

### Step 7 · The public page — it is a *web* deploy, not part of the release

`LCXOS_VERSION` and `LCXOS_DMG_MB` render on `/lcxos` from the **deployed site**, not from anything
step 6 uploaded. Until the step-1 commit reaches the site, the download button hands out the new DMG
under the old version number and the old size. Push it, then:

```bash
node scripts/verify-live.mjs https://lcx-sales-automation-engine.pages.dev --expect-gl-chunks 15
# add --expect-changed-from <the fingerprint step 5 printed> to prove the deploy actually moved
```

**Pass the URL explicitly even though the script has a default, and this is not style.** Its argument
parser is `args.find((a) => !a.startsWith('--'))` (`scripts/verify-live.mjs:30`), so the first
non-flag token wins — and in `--expect-gl-chunks 15` that token is **`15`**. Run without a URL, it
tries to fetch `15`. Measured, not reasoned:

```
$ node scripts/verify-live.mjs --expect-gl-chunks 15
  INCONCLUSIVE: could not reach 15 (Failed to parse URL from 15). This says nothing about the deploy.
```

It fails safe — INCONCLUSIVE (exit 2), not a false pass — which is the whole point of that script
having three exit codes rather than two. **Exit 2 is not a pass.** Reported rather than fixed:
`scripts/verify-live.mjs` belongs to another track.

### Step 8 · **Each operator clicks "Install and relaunch"** — and this is where releases die

Publishing is not delivering (§3.3). The app **never** installs unattended, by a decision recorded at
`apps/web/src/lib/terminal.ts:219-226`: the installer `remove_dir_all`s the running bundle, so an
unattended install means an unexplained admin prompt seconds after launch and a desk relaunched
mid-governed-write.

So, per desk, tell them:

- The toast appears **once per launch**, with an **"Install and relaunch"** button.
- If they miss it, the menu item is **"Check for Updates…"** (`src-tauri/src/lib.rs:551`).
- **A failed check says nothing at all** (`terminal.ts:227-241`) — it goes to
  `~/Library/Logs/LCXOS/shell.log` only. A desk that has quietly stopped updating looks exactly like a
  desk that is current. That file is the one to ask for when a desk seems stuck.

Until an operator presses that button they are on 0.2.6, and on 0.2.6 there is no 3-D anything (§1.1).
There is no telemetry (§6.7), so **nobody can tell you who has installed it** — if it matters, ask.

### Step 9 · First-time installers only

An unsigned download is quarantined (§5). Right-click → **Open** → **Open**, or:

```bash
xattr -dr com.apple.quarantine "/Applications/LCXOS.app"
```

Once per Mac. This is the standing owner decision not to spend $99 on notarization, and it means E8's
five-second key-light arc is the *second* impression, after a malware dialog.

### The whole thing, if the versions are already bumped and the size is unchanged

```bash
swiftc -O -o /tmp/webview-gl-probe apps/desktop/scripts/webview-gl-probe.swift -framework Cocoa -framework WebKit && /tmp/webview-gl-probe
npm run build -w @lcx/web && node apps/desktop/scripts/inspect-frontend-dist.mjs
export TAURI_SIGNING_PRIVATE_KEY="$HOME/.lcx-terminal/updater.key"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD=""
npm run build:dmg   -w @lcx/desktop
npm run release:dry -w @lcx/desktop
npm run release     -w @lcx/desktop
```

Six commands, one of which needs the key and one of which needs `gh`; **the first two need neither and
are the two that can save the other four.** It is still not one command, and it should not be: step 4
cannot be known before step 3, and step 5 exists so that a human reads the GL chunk count before a tag
becomes permanent. The second line is the same question step 5 answers, asked before anything has been
built or signed — if it says `NO 3-D layer`, stop there rather than ten minutes and one credential
later.

**Every command in §10 was executed or resolved against the script it invokes on 2026-08-15**, not
described from memory: `dev`/`build`/`build:dmg`/`release`/`release:dry` read out of
`apps/desktop/package.json:7-13`, `e2e` out of `apps/web/package.json:15`, the probe and the inspector
both actually run (§4.2.5, §12.2). The two that were **not** run are the two that cannot be:
`build:dmg` needs the owner's key, and `release` creates a permanent tag.

---

## 11 · THE VERSION THE NEXT RELEASE SHOULD CARRY — stated, not made

**Recommendation: `0.3.0`.** Nothing in this pass touched a version field, and nothing should have —
the bump is the owner's, and it is step 1 of §10.

**Why a minor bump rather than `0.2.7`.** The question is not how much work happened; it is what an
operator receives. Between installed 0.2.6 and the current tree, read off the byte-level diff in §1.1
rather than off the commit log:

| | |
|---|---|
| **Eight new relief surfaces** | `DeckReliefGl`, `GlobeReliefGl`, `PipelineReliefGl`, `OntologyOrreryGl`, `SurfaceReliefGl`, `VaultReliefGl`, `StormReliefGl`, `ForgeBackdrop` — all absent from 0.2.6's asset table |
| **Six new shared GL chunks** | `ao`, `dof`, `lines`, `lit`, `tonemap`, `volume` |
| **Three more** | `project`, `stateNarrative`, `useQualityTier` |
| **A changed front door** | E8 mounts **unconditionally** on the sign-in screen (`SelectOperator.tsx:150-151`). This is not an opt-in feature behind a toggle like the other seven: every operator's first screen changes appearance on install. |
| **New capability surface, not a fix** | Nine environments now exist where 0.2.6 had none. `0.2.7` would describe this as a patch. |

The last two rows are the argument. Seven reliefs are `useState(false)` and nothing persists them, so
they are invisible until someone clicks — but **E8 is the front door and it is not optional**, which
makes this the first release since 0.2.6 that changes what an operator sees before they have done
anything. A patch number would say the opposite.

`0.3.0` also leaves `0.2.x` meaning what it has meant: the pre-3-D shell, of which `0.2.0` → `0.2.6`
are seven published releases sitting in `bundle/publish/`.

**Not `1.0.0`**, and it is worth saying why so it is a decision rather than a default: notarization is
not done (§5), so first install still shows a malware dialog; the WebView's *frame time* is unmeasured
at any tier (§6.4); §7 of `3D_VFX_FINAL_PLAN.md` has open toggle-default decisions on the seven
opt-in reliefs; and `ForgeBackdrop` has no `webglcontextlost` handler (§4.5). None of those blocks a
`0.3.0`. All of them argue against a `1.0.0`.

**What the owner has to do with this number:** the five files in §10 step 1. Two of them are enforced
and will stop the build or the publish; three are not, and `apps/desktop/package.json` plus
`Cargo.toml` will silently disagree forever if missed.

---

## 12 · THE BUNDLE THE DESKTOP WOULD PACKAGE — measured, not asserted

> **Why this is a section and not a sentence in §2.** §2 proves the *plumbing*: `beforeBuildCommand`
> rebuilds the web bundle, so a desktop build picks up current web code. That is a claim about a
> mechanism. **Nobody had ever looked at the output of it.** §1.1 measured the *installed* 0.2.6 app
> and measured *a* working-tree build in passing, twice, with two different markers, and then wrote
> down — correctly — that a fixed number typed into prose goes stale. This section takes the
> measurement properly and, more usefully, leaves behind the command that retakes it.

### 12.1 · What was run

```bash
VITE_API_URL=https://lcx-sales-api.onrender.com npm run build -w @lcx/web   # exit 0, 6.36 s
node apps/desktop/scripts/inspect-frontend-dist.mjs
```

That is the same command and the same `VITE_API_URL` the gate hands to `vite build`
(`build-gate.mjs:91`, `:148`), so the directory inspected is the directory Tauri would copy — not a
lookalike built with different environment. `frontendDist` is read out of `tauri.conf.json` by the
inspector rather than hardcoded, so it resolves the same path the bundler does: `apps/web/dist`.

**Run at `fd7fa0d` with a dirty tree** — five relief renderers and `packages/gl` are being edited by
other tracks in the same session, which is the normal state here (§9.2's `dirty` field exists for
exactly this) and is why the fingerprint below is a fact about a moment, not about a commit.

### 12.2 · The result — 15 GL chunks, 174,422 B, all of them lazy

```
files          209, 4,000,621 B total
entry          /assets/index-DKDuj6bH.js          fingerprint DKDuj6bH

eager set (7) — fetched before first paint:
  /assets/index-DKDuj6bH.js        /assets/react-vendor-CQviXG0h.js   /assets/vendor-BnQvR7HC.js
  /assets/vendor-Fd0xVSp_.css      /assets/index-DKw9bXJx.css
  /fonts/InterVariable.woff2       /fonts/JetBrainsMono-Regular.woff2
```

| GL chunk | bytes | eager? |
|---|---:|---|
| `assets/DeckReliefGl-DDGpt9fZ.js` — E1 | 14,996 | lazy |
| `assets/GlobeReliefGl-B5DCkCJo.js` — E2 | 15,450 | lazy |
| `assets/PipelineReliefGl-CBQT-5FB.js` — E3 | 8,184 | lazy |
| `assets/OntologyOrreryGl-Boj1EBDJ.js` — E4 | 19,971 | lazy |
| `assets/SurfaceReliefGl-DVSe5yJ4.js` — E5 | 6,400 | lazy |
| `assets/VaultReliefGl-Dax6TLNd.js` — E6 | 16,282 | lazy |
| `assets/StormReliefGl-ClVlguFb.js` — E7 | 8,216 | lazy |
| `assets/ForgeBackdrop-CMz2Nb7m.js` — **E8, the front door** | 5,608 | lazy |
| `assets/index-B0ETvld5.js` — the `@lcx/gl` barrel | 28,593 | lazy |
| `assets/lit-BnO01UHw.js` | 28,873 | lazy |
| `assets/volume-CCGbbHj-.js` | 6,639 | lazy |
| `assets/ao-DWeUly1N.js` | 5,622 | lazy |
| `assets/pipeline-PE27Ky0P.js` | 4,221 | lazy |
| `assets/dof-DiVKLD_L.js` | 3,566 | lazy |
| `assets/lines-2mdvi6qE.js` | 1,801 | lazy |
| **15 chunks — 8 renderer surfaces + 7 shared** | **174,422** | **0 eager** |

**All eight environments are present, and E8 among them** — which is the one that matters most,
because it is the only one that mounts without a click (§4.1). Every one is non-empty; the smallest is
`lines` at 1,801 B, and the *shortest string the marker can match* is 14 bytes, so "matched the marker"
is itself the non-emptiness proof rather than a second check bolted on beside it.

**They are found by shader bytes, not by name, and that is not pedantry here.** Vite content-hashes
every filename in that table, so a name match proves nothing about contents; and the *set* of names is
not derivable by hand either — `*ReliefGl` misses E8 (it ships as `ForgeBackdrop`) and misses all seven
shared chunks, and a missing shared chunk breaks every toggle depending on it while the relief chunk
loads perfectly. The marker is `verify-live.mjs:122`'s, character for character:
`precision\s+(?:highp|mediump|lowp)|createStage`. A desk build and a deployed site are therefore judged
by one rule, not by two that can drift.

**None of the 15 is in the eager set, and that is the load-bearing half.** The seven things this
document fetches before first paint are the entry chunk, two vendor chunks, two stylesheets and two
font preloads. The entire 3-D programme — 174 KB — is behind `import()`, so a desk that never opens a
toggle and never signs in **never downloads a byte of it**, and the sign-in screen pays for E8's
5,608 B only after the rest of the page is up.

### 12.3 · The command that retakes this, and what it refuses on

`apps/desktop/scripts/inspect-frontend-dist.mjs` is new. The GL chunk count was *already* computed —
by `publish-release.mjs:314-326`, for the build record — but it arrived far too late to be useful,
and the ordering is the whole point:

```
publish-release.mjs:96   no bundle at src-tauri/target/release/bundle   → needs a completed tauri build
                  :102   expected exactly 1 .app.tar.gz                 → needs the bundler
                  :108   no signature at <tarball>.sig                  → NEEDS THE OWNER'S MINISIGN KEY
                  :132   STALE BUILD — Info.plist disagrees             → needs cargo build --release
                  :255+  …only now is the dist walked and gl_chunks computed
```

So "does this build carry the 3-D layer?" was gated behind the one credential no agent has and a
ten-minute release build. It is now a five-second question that anyone with the repo can ask, which is
what puts it in §10 as step **0d** — *before* the version bump, not after the tag.

**It refuses on exactly one thing, and it is the thing nothing checked before: a GL chunk in the eager
set.** The build record lists `eager` and lists `gl_chunks` and never intersects them. One static
import of a relief from a routed module moves its whole subgraph into the entry chunk — the sign-in
screen would then pay for `lit` and the volumetric raymarcher before it paints, on the one route whose
§7(b) case is *"a stranger stops scrolling"* — and a bundle-size budget need not catch it, because the
bytes did not appear from nowhere, **they moved**.

**It deliberately does NOT refuse on a zero GL chunk count**, which is `publish-release.mjs:379`'s
decision repeated rather than re-litigated: **0.2.6 carried no relief surfaces and was a correct
release**, so a `> 0` floor would have blocked it. Zero prints loudly and passes. `--expect-gl-chunks N`
exists for a caller who does have an expectation.

**Proven able to fail, in seven ways, against a mock tree** — because a check that only ever prints ✓
is not a check:

| Induced state | Result |
|---|---|
| a shader-carrying chunk moved into the eager set via `modulepreload` | **exit 1**, naming the chunk, its bytes, and that the sign-in screen now pays before first paint |
| the same, with `--json` | **exit 1** with `ok:false` and the chunk in `gl_chunks_eager` — the machine-readable path fails too, rather than reporting success |
| `--expect-gl-chunks 15` against a dist with 1 | **exit 1**, `expected 15 GL chunks, found 1` |
| `index.html` naming no `index-<hash>.js` entry | **exit 1** — malformed, and no fingerprint to record |
| `frontendDist` pointing at a directory that does not exist | **exit 1**, telling the caller to run the web build, since this reads a bundle and never creates one |
| `tauri.conf.json` with no `frontendDist` at all | **exit 1** — it cannot say what would be packaged, so it does not guess |
| `--expect-gl-chunks abc` | **exit 1** — an unparseable expectation is not silently dropped, which would turn the assertion into a no-op |
| control: the real `apps/web/dist`, unmodified | **exit 0**, the table above |

**One change it needs that is NOT in this app's files and was therefore not made.** The npm script
line, so §10 can say `npm run …` like every other step:

```
apps/desktop/package.json:10  after  "build-gate": "node scripts/build-gate.mjs",
                              add    "inspect-dist": "node scripts/inspect-frontend-dist.mjs",
```

`apps/desktop/package.json` carries a `version` field this pass is forbidden to touch, so it was left
alone entirely rather than edited around. Until that line exists, the invocation in §10 step 0d is the
direct `node apps/desktop/scripts/inspect-frontend-dist.mjs`, which works today and needs nothing.

### 12.4 · What §12 does not establish

- **That these chunks RENDER.** They are present, non-empty, lazily reachable and they carry GLSL.
  Whether the picture is right in WKWebView is §4.6, unchanged and still the thing to do before a
  release.
- **That this exact bundle is what a release would ship.** The tree was dirty; another `vite build`
  five minutes later produces different hashes and, while other tracks are mid-edit, possibly
  different bytes. That is what §9.2's per-file `sha256` record is for, and it is why the number to
  trust is the one **step 0d prints on the day**, not the one in this table.
- **That the count is stable.** It is 15 today and it was 15 when §9.2 measured it independently, but
  a new environment or a new shared module changes it legitimately. `--expect-gl-chunks` is an
  assertion the caller opts into, not a ratchet this document sets.

---

## 13 · THE THEME QUESTION — a fresh desk starts LIGHT, and nothing can change that

> **Nobody had asked this.** It became load-bearing on 2026-08-15, when another track began making the
> 3-D surfaces theme-correct: `packages/gl/src/look/theme.ts` gives light mode a *stronger key, weaker
> ambient, weaker shadows*, and each renderer branches on `th.name === 'dark'`. Which branch a fresh
> desk executes is therefore a question about the product, not about CSS. The answer turned out to be
> a defect.

### 13.1 · How the theme is meant to work

Three mechanisms, and only three:

| # | Where | What it does |
|---|---|---|
| 1 | `apps/web/index.html:12` + `:16` | a **pre-hydration** inline script: read `localStorage`, and if the stored state says `darkMode`, `document.documentElement.classList.add('dark')` before React exists. Its stated purpose is that *"dark-mode users never see a white flash"* |
| 2 | `apps/web/src/components/layout/AppLayout.tsx:118` | `useEffect` → `classList.toggle('dark', darkMode)` — the authoritative one, after hydration |
| 3 | `apps/web/src/stores/useUIStore.ts:30` | `toggleDarkMode` flips the class and the persisted flag together |

The preference is persisted by `zustand/persist` through `lib/persistence`, under
`STORAGE_KEYS.UI = 'ui'` (`lib/storage.ts`).

### 13.2 · Does the preference survive a relaunch of the packaged app? — **YES, and it is on disk**

Established from bytes on this machine, not from documentation about WKWebView:

```
~/Library/WebKit/com.lcx.terminal/WebsiteData/Default/<origin-hash>/<origin-hash>/
   origin                      →  tauri  localhost      (i.e. the origin is tauri://localhost)
   LocalStorage/localstorage.sqlite3       24,576 B, last written 2026-08-13 20:34
                localstorage.sqlite3-wal   16,512 B, last written 2026-08-13 20:35
```

Three things follow, each of which had to be true and none of which was checked before:

1. **The data store is persistent, not ephemeral.** wry uses the default `WKWebsiteDataStore`; a
   non-persistent one would leave nothing on disk. The directory was created **2026-07-25** and was
   still being written **2026-08-13** — across the `0.1.0 → 0.2.6` span `shell.log` records (§6.7).
2. **The origin is stable across launches.** `tauri://localhost`, written into the store's own
   `origin` file. This is the fact that could have gone the other way: a custom URL scheme that
   WebKit treated as opaque would give every launch a fresh, unique origin and localStorage would
   appear to work perfectly *within* a session and be empty on the next one — the exact shape of bug
   that survives every test and is only ever seen by an operator.
3. So `localStorage` in the packaged app behaves like `localStorage` in a browser profile. **Whatever
   the app writes, it will read back on the next launch.**

*The contents of that database were deliberately not read.* It is one operator's persisted state on
their own desk; the file's existence, its origin and its mtimes answer the question, and the values
inside it would not add anything the code does not already say.

### 13.3 · What a FIRST launch shows — **light, and no stored preference can change it**

**The pre-hydration script is dead. It reads a key that nothing has written since 2026-07-25.**

```
apps/web/index.html:12       localStorage.getItem('lcx-os:ui:v1')
apps/web/src/lib/persistence.ts:38   const mk = (k) => `${PREFIX}${scope()}:${k}:${VERSION}`
                                     →  lcx-os:anon:ui:v1        before sign-in
                                     →  lcx-os:<email>:ui:v1     after sign-in
```

`241ef55` (*"scope local persistence per operator; make sign-out actually sign out"*, 2026-07-25)
put the operator into every key, for a real reason it documents at length — on a shared Mac the next
person inherited the previous person's workspace. It even anticipated the migration cost: *"this
changes key names, so pre-existing local UI preferences are not carried over."* **It accounted for the
stored data and not for the one reader that lives outside the module** — the inline script in
`index.html`, written 2026-07-09 in `1de80f0`, sixteen days earlier. Grepped across the whole tree:
`lcx-os:ui:v1` appears in exactly one place, and that place is the read.

**Measured rather than reasoned**, by cutting the bootstrap out of the **built** `apps/web/dist/index.html`
— the bytes that would ship — and executing it against each key shape:

```
stored under lcx-os:anon:ui:v1          → .dark added?  false
stored under lcx-os:nik@lcx.com:ui:v1   → .dark added?  false
stored under lcx-os:ui:v1               → .dark added?  true    ← negative control
```

The control fires, so the harness is live and the two `false`s are the finding rather than a broken
test. **And the script ships verbatim in the packaged bundle** — confirmed present in
`apps/web/dist/index.html` after the §12.1 build, so this is the desktop app's behaviour and not just
the dev server's.

**The second half is structural, and it is why nothing downstream repairs it.** `/select` — the
sign-in screen, and E8 THE FORGE — is a **sibling of `AppLayout`, not a child**
(`router.tsx:207` beside `router.tsx:210`, and the file says so itself at `:128-129`: *"`/select` is a
SIBLING of `AppLayout`, not a child, so nothing inside `AppLayout` runs while the desk is signed
out"*). So mechanism 2, the authoritative one, **is not mounted on the front door**. On a cold launch
the class list starts empty, mechanism 1 cannot add `dark`, and mechanism 2 is not there.

| Moment | `.dark` present? | Why |
|---|---|---|
| **cold launch → sign-in screen (E8)** | **never** | bootstrap reads a dead key; `AppLayout` not mounted |
| after sign-in, anywhere in the shell | **yes, if the operator's stored preference says so** | `AppLayout.tsx:118` runs on mount |
| sign out → back at `/select`, same session | yes — stale | the class is on `documentElement` and nothing removes it |
| relaunch | back to **light** | a new process starts with an empty class list |

**So: E8 THE FORGE renders in the LIGHT branch on every launch, for every operator, on desktop and in
the browser alike, no matter what they have chosen.** A dark-mode operator additionally gets the white
flash the bootstrap was written to prevent, on every route, every launch — the shell only goes dark
once `AppLayout` mounts and its effect runs.

One more fact worth having, since the desktop shell is the thing that could in principle disagree:
`tauri.conf.json:30` sets `"theme": null`, so the **native window chrome** follows macOS. Nothing in
`apps/web` reads `prefers-color-scheme` — grepped, zero hits — so the **content** does not. On a Mac
in Dark Mode the title bar is dark and the app inside it is light, and that is the designed behaviour
of a product with its own theme switch, not a bug. It is simply not a route by which a fresh desk
could come up dark.

### 13.4 · The fix, stated and not made — it is in `apps/web`

One line, in a file this pass must not touch:

> `apps/web/index.html:12` — replace the literal `'lcx-os:ui:v1'` with a read that matches
> `persistence.ts`'s `mk('ui')`. The bootstrap runs before any module, so it cannot import
> `scopedKey`; it must inline the same construction — read `lcx_operator_email` (the constant at
> `persistence.ts:25`, which must match `EMAIL_KEY` in `lib/apiClient.ts`), lowercase and trim it,
> fall back to `anon`, and read `` `lcx-os:${scope}:ui:v1` ``.

**And a second decision, which is a product question and not a bug fix:** even with that key
corrected, the **sign-in screen still starts light on a cold launch**, because the scope before
sign-in is `anon` and a signed-in operator's preference is stored under their email. Making E8 honour
a returning operator's theme means the bootstrap would have to read the *last* operator's preference
before knowing who is at the desk — which is precisely the inheritance `241ef55` removed on purpose.
**A shared desk is the stated deployment.** So the honest options are: leave the front door light by
design and say so, or persist a single unscoped `theme` key that is deliberately *not* operator data.
That is an owner call; this document records it rather than making it.

**Why this belongs in a desktop delivery document at all.** In a browser tab, a stale theme on one
screen is a flicker between navigations. In the packaged app **every launch is a cold launch** — there
is no back button to a warm tab, no second tab already dark, and the front door is the first and often
the only unauthenticated screen an operator sees. And it is the screen carrying the one relief that
mounts without a click. If the light branch of `theme.ts` is not right, **the desktop channel is where
it will be seen first and most often.**
