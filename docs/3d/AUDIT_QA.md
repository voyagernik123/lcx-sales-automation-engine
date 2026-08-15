# AUDIT_QA — the shipping 3-D surfaces, driven rather than read

**Subject:** `b9770fb`, entry chunk `index-C4dUaGRs.js`. `apps/web/src` and `packages/gl/src` are clean
against `HEAD` (`git status --porcelain -- apps/web/src packages/gl/src` prints nothing), so the source
below is the source that was built.

**Method.** Everything in the FINDINGS section was produced by driving the running application, not by
reading it. A local `vite` dev server on :5311 against the local API on :8791, signed in through the real
front door as `nik@lcx.com`, driven by headless Chromium through `playwright-core@1.61.1`. Where a claim
could be checked against the deployed artefact it was: three route chunks were fetched from
`https://lcx-sales-automation-engine.pages.dev/assets/` and grepped.

**Read §INSTRUMENT before believing any number here.** Four of my own measurements were wrong before they
were right, and each wrong one is recorded there with what corrected it. One negative result — "the forge
never draws" — was entirely an artefact of a hidden browser tab, exactly as warned.

---

## THE CHECKLIST, DERIVED

Not copied from a summary. The set of shipping surfaces was derived by grepping `apps/web/src` for
imports of each wrapper, which is the only edge that makes a component reachable:

| environment | wrapper | mounted at | route | control label |
|---|---|---|---|---|
| E2 THE THEATRE | `DeckRelief` | `pages/CommandDeck.tsx:22` | `/command-deck` | `Theatre view` |
| E5 THE SURFACE | `SurfaceRelief` | `components/command/CockpitPanels.tsx:8` | `/command-deck` | `Relief view` |
| E3 THE PIPELINE | `PipelineRelief` | `pages/BdPipeline.tsx:15` | `/bd-pipeline` | `Channel view` |
| E6 THE VAULT | `VaultRelief` | `pages/AuditLog.tsx:9` | `/audit-log` | `Vault view` |
| E4 THE ORRERY | `OntologyOrrery` | `pages/OntologyExplorer.tsx:8` | `/ontology` | `Orrery view` |
| E2b THE GLOBE | `GlobeRelief` | `pages/MarketMap.tsx:10` | `/market-map` | `Globe view` |
| E7 THE STORM | `StormRelief` | `pages/MarketingCrisis.tsx:80` | `/marketing/crisis` | `Storm view` |
| E8 THE FORGE | `ForgeBackdrop` | `pages/SelectOperator.tsx:151` | `/select` | (ambient, no control) |
| X1 AMBIENT | `SignatureBackdrop` | `components/layout/AppLayout.tsx:265` | every seated route | (ambient, no control) |

All seven controls were found in the live DOM by their `aria-pressed` attribute, not by name, so the list
above is confirmed from both ends.

---

## FINDINGS, ranked by what a real operator hits

### F1 · Turning E5 THE SURFACE on deletes the whole figure from the accessibility tree, and the file says it does not — **HIGH**

**Reproduction.** Sign in → `/command-deck` → press `Relief view: off`. Then:

```js
document.querySelector('[data-relief-live]').innerText            // ""
document.querySelector('[data-relief-live]').children[0].outerHTML // <canvas aria-hidden="true" …>
document.querySelector('[data-relief-print-flat]').getAttribute('aria-hidden')  // "true"
document.querySelector('[data-relief-print-flat]').style.display                // "none"
```

The figure's whole container's `innerText` after the toggle is:

> `RELIEF VIEW: ON` / `Relief is opt-in: nobody has yet timed whether it answers faster than this figure.`

**Measured against the CDP accessibility tree** (`Accessibility.getFullAXTree`, before vs after the click):
net **−118** named nodes. What is lost includes the figure's own accessible name —
`image: "Authored score (points on the workbook's 0–5 scale) over Scorecard dim…"` — its caption
`"LP bench · authored score, 10 dimensions × 9 ranked partners"`, the seven-line provenance list (`Axes:`,
`Observed: 72 of 72 cells`, `As of:`, `Source: POST /v1/command/engines/lp-rescore`, `Vertical domain:`,
`View: Axonometric projection…`, `Interpolation: No interpolation…`) and both caveats,
`Z_DOMAIN_OVERRIDDEN` and `Z_DOMAIN_EXCLUDES_ZERO`. What is gained is chrome and the word `ON`.

**file:line.**
- `apps/web/src/components/geometry/SurfaceRelief.tsx:114` — the only DOM copy of the figure is inside
  `<div data-relief-print-flat="" style={{display:'none'}} aria-hidden="true">`.
- `apps/web/src/components/geometry/SurfaceRelief.tsx:118-119` — `<div data-relief-live="">` contains
  `<SurfaceReliefGl>` and nothing else.
- `apps/web/src/components/geometry/SurfaceReliefGl.tsx:635-642` — the component returns a bare
  `<canvas aria-hidden="true">`. Its comment at `:639` reads *"the figure's own caption and the flat
  surface underneath it are what a screen reader reads."* There is no caption in this component or its
  wrapper, and the flat surface is the `aria-hidden`, `display:none` copy two lines up. **Both halves of
  that sentence are false at the same time.**

**Confirmed in the deployed build**, `assets/CommandDeck-B-8x74dw.js`:

```
data-relief-print-flat":"",style:{display:"none"},"aria-hidden":"true",children:e.jsx(E,{...i})}),
e.jsx("div",{"data-relief-live":"",children:e.jsx(Ye,{surface:i.surface,heightPx:i.heightPx??320,…})})
```

**Consequence.** A screen-reader user, a text-extraction pass and a copy-paste all get nothing from E5
while it is on. `Z_DOMAIN_EXCLUDES_ZERO` — a truncated-axis warning — disappears in exactly the reading
where a truncated vertical axis does the most damage.

**Why this is the top item and why no suite caught it.** Each half is individually correct and individually
tested: an `aria-hidden` canvas is right, and an `aria-hidden` off-screen print copy is right. The defect
only exists in the composition, and the composition lives in the parent. Every other relief keeps its text
through the same toggle — measured: E2 THE THEATRE keeps **805** characters inside `[data-relief-live]`,
E3 gains its caption paragraph, E6 and E2b project DOM labels, E2b actually *gains* 50 net a11y nodes.
E5 is the only one at zero.

**Severity: HIGH.** Not because it crashes, but because the surface silently becomes a bitmap for anyone
who cannot see it, and the code asserts the opposite in a comment a reviewer would trust.

---

### F2 · A plain ⌘P in the dark theme prints a near-black full-document canvas behind the board pack and the crisis compliance record — **HIGH**

**Reproduction.** Dark theme, signed in, `/command-deck` (or `/marketing/crisis`), then
`emulateMedia({media:'print'})` — the equivalent of ⌘P or File → Print, as distinct from the page's own
Print button.

| route | canvas under `@media print` | mean luminance, top 500 px |
|---|---|---|
| `/command-deck` (board pack) | `1440 × 5369`, `display:block` | **173.8** / 255 |
| `/marketing/crisis` (compliance record) | `1440 × 4282`, `display:block` | **160.8** / 255 |
| `/wbr` | `1440 × 2207` | 220.9 |
| `/board-report` | `1440 × 1555` | 251.1 |

The canvas is the shell's ambient layer, and note the height: `PrintStyles` unlocks `height:auto` and
`overflow:visible`, so an `absolute inset-0` layer stops being viewport-sized and covers the **entire
printed document** — every page, not the first. A capture of the result is at
`docs/3d/AUDIT_QA` reproduction step; the visible effect is white cards floating on a black ground, with
the page title printing blue-on-black and the amber `Launch anchor — UNCONFIRMED` banner on black, while
`PrintStyles` has correctly pinned the card tokens to white.

**file:line.**
- `apps/web/src/components/layout/AppLayout.tsx:265` — `<SignatureBackdrop />`, no `br-no-print`, no print
  class, no `data-relief-live`.
- `apps/web/src/components/report/PrintStyles.tsx:93-99` — the sheet hides `[data-relief-live]`,
  `header, aside, footer`, `[role="status"]` and `.br-no-print`. The ambient canvas matches none of them.
- `apps/web/src/components/command/SignatureBackdrop.tsx:352` — the layer renders whenever `.dark` is on
  `<html>`; `:264` is the only gate and it reads the class, not the print media.

**Why the existing mitigation cannot reach it.** The four print buttons strip `.dark` first
(`pages/CommandDeck.tsx:80-82`, `pages/BoardReport.tsx:104-109`, `pages/GpsBook.tsx:181-183`,
`pages/GpsOrigination.tsx:110-112`), which unmounts the layer through its theme subscription — so the
button path is correct and the light-theme path is correct (measured: 0 canvases visible in print). The
gap is the plain ⌘P, which `PrintStyles.tsx:28-29` already names in as many words. But the remedy that
paragraph describes is token pinning, and a token cannot repaint a `<canvas>`.

**Consequence.** The two documents this application produces for filing — the CEO board pack and a crisis
record described in its own source as *"a COMPLIANCE RECORD somebody keeps"* — print with a black ground
whenever the operator is in dark mode and uses the browser's own print command.

**Severity: HIGH.** It reaches paper, it reaches a compliance artefact, and the operator has no signal
before the print dialog that anything is wrong.

---

### F3 · Filtering `/audit-log` or `/bd-pipeline` silently discards an open relief, and the refusal machinery written for exactly this case never runs — **HIGH**

**Reproduction and proof of mechanism, without touching the source.** `useId()` mints a new identifier per
component instance, and each toggle carries it as `aria-describedby`. Same id ⇒ same instance:

```
/audit-log   closed   id=":r1:"  Vault view: off  pressed=false  canvases=0  rows=50
             open     id=":r1:"  Vault view: on   pressed=true   canvases=1  rows=0
  click "action:track" ──────────────────────────────────────────────────────────────
             filtered id=":r3:"  Vault view: off  pressed=false  aria-disabled=null
                                 role="alert" nodes: []           canvases=0  rows=50
  click "All actions" ──────────────────────────────────────────────────────────────
             unfilter id=":r5:"  Vault view: off  (does not come back)
```

The id is stable across on/off and changes on every filter change. The relief is **remounted**, not
refused: `aria-disabled` is `null`, so `refusal === null`, so `onRefused` never fired — and the GL
context was released as a deliberate `loseContext` (`deliberate: 1`, `live: 0`). The same happens on
`/bd-pipeline`: id `:r3:` while open, the control **disappears entirely** during a search that empties the
queue, and returns as `:r5:` with the channel off.

**file:line.**
- `apps/web/src/pages/AuditLog.tsx:236` — `{!loading && !error && entries.length > 0 && (<VaultRelief …>)}`
- `apps/web/src/pages/BdPipeline.tsx:831` — `{!loading && !error && (<> <PipelineRelief …/>`

Both confirmed in the deployed chunks:
`assets/AuditLog-pk4J-QxZ.js` → `!h&&!g&&r.length>0&&e.jsx(K,{entries:r,children:e.jsxs("table"…`
`assets/BdPipeline-UEXC13Pk.js` → `!u&&!z&&e.jsxs(e.Fragment,{children:[e.jsx(lt,{leads:Ee,filters:…`

**The prose that this refutes.** `apps/web/src/components/geometry/PipelineRelief.tsx:229` argues, at
length, that `role="alert"` is kept precisely because *"the reader filters this queue, so a set that WAS
drawable can become undrawable in response to their own keystroke, and an explanation that appears
silently beside a control that just went dead is a control that broke for no stated reason."* The
component is right. It is also unreachable in that scenario, because its parent unmounts it before its own
derivation can refuse. The alert count in the measured run is **0**.

**Not universal, which is what makes it a defect rather than a design.** `GlobeRelief` on `/market-map`
survives a filter change with the same instrumentation: id stays `:r3:`, `aria-pressed` stays `true`, the
canvas stays. So three surfaces behave one way and two the other.

**Consequence.** An operator triaging the BD queue with the channel open loses it on any filter action that
refetches, with no message, and must re-open it. On the audit log the same click also throws away the GL
context and the corridor's position.

**Severity: HIGH.** It is on the two highest-traffic relief routes, it is reachable by the most ordinary
interaction those pages have, and it silently converts a documented, tested refusal path into nothing.

---

### F4 · E6 THE VAULT carries **zero** record labels in the default light theme — **HIGH (information)**

Measured with the vault open, reading the surface's own printed horizon:

| theme | viewport | records carrying text | readable-to | withheld |
|---|---|---|---|---|
| light | 1280×800 | **0 of 50** | *nothing on this frame clears 4.5:1* | `BELOW_READABLE_CONTRAST 19 · LINE_TOO_LONG_TO_SHOW 1 · STACK_WRAPPED 8 · EDGE_ON 22` |
| light | 1440×900 | **0 of 50** | *nothing on this frame clears 4.5:1* | identical |
| light | 1920×1080 | **0 of 50** | *nothing on this frame clears 4.5:1* | identical |
| dark | 1280×800 | 8 of 50 | `0.07 d` | `OCCLUDED 11 · LINE_TOO_LONG_TO_SHOW 1 · STACK_WRAPPED 8 · EDGE_ON 22` |
| dark | 1440×900 | 8 of 50 | `0.07 d` | identical |
| dark | 1920×1080 | 8 of 50 | `0.07 d` | identical |

Viewport makes no difference at all — the binding term is contrast, not size. In light, 19 of 50 records
are withheld specifically for `BELOW_READABLE_CONTRAST`, a category that does not appear in dark.

**file:line.** `apps/web/src/components/geometry/VaultReliefGl.tsx` — the `FRAME_TEXT[plan.theme]` palette
and the `readableToDays` computation that prints the horizon. The surface is *honest*: it states its own
failure on the frame, which is more than most. The defect is that it ships in the state where the number
is zero, on the theme that is the default (`stores/useUIStore.ts:28`, `darkMode: false`).

**Consequence.** On the default theme, E6 is fifty unlabelled slabs, and even in dark it is readable
across the most recent **1.7 hours** of the audit spine. Depth-is-time with no legible time.

**Severity: HIGH for the claim, MEDIUM for the harm** — the flat table beside it is unaffected and is the
default, so nothing is lost; what is lost is the environment's reason to exist on the default theme.

---

### F5 · Three of the five openable reliefs print the canvas instead of the data — **MEDIUM**

Under `@media print`, with the relief open:

| route | `PrintStyles` mounted | canvas visible in print | flat copy present | tables left on page |
|---|---|---|---|---|
| `/command-deck` · Theatre | yes | **0** | `display:block` | — |
| `/command-deck` · Relief | yes | **0** | `display:block` | — |
| `/bd-pipeline` · Channel | **no** | `1160 × 460` | none | **0** |
| `/audit-log` · Vault | **no** | `1184 × 460` | none | **0** |
| `/market-map` · Globe | **no** | `598 × 504` | none | — |

**file:line.** `PipelineRelief.tsx` and `VaultRelief.tsx` and `GlobeRelief.tsx` set neither
`data-relief-live` nor `data-relief-print-flat` (only `DeckRelief.tsx:149-150`, `SurfaceRelief.tsx:114-118`
and `StormRelief.tsx:160-165` do), and none of those three pages mounts `<PrintStyles />`.

`PrintStyles.tsx:41-47` states the scoping decision explicitly — *"Three surfaces actually reach paper"* —
so this is a declared boundary rather than an oversight. It is reported because the declaration is a
judgement about operator behaviour, not a property of the code, and because the audit log is a governance
record: ⌘P on `/audit-log` with the vault open produces a picture of fifty boxes where fifty records were,
with the rows not in the document at all.

**Severity: MEDIUM.** Reachable by one keystroke, real information loss on paper, but on routes with no
print affordance and behind an opt-in that defaults off.

---

### F6 · E4 THE ORRERY cannot be opened below roughly 940 CSS px of viewport height — **MEDIUM (reachability)**

Measured across twelve viewports, clicking the toggle and reading the refusal:

```
1366 × 768   refused — smallest entity 7.1 px against a floor of 9
1280 × 800   refused — 7.4 px
1440 × 900   refused — 8.9 px
1440 × 920   refused — 8.9 px
1512 × 900   refused — 8.9 px
1440 × 940   DREW      canvas 1184 × 795
1440 × 950   DREW      1512 × 982  DREW      1728 × 1117 DREW      1920 × 1080 DREW
1440 × 900, sidebar collapsed (aside 56 px)   still refused — 8.9 px
```

The binding dimension is **height**, not width: collapsing the sidebar at 1440×900 gives the canvas 128 px
more width and changes the number not at all.

**file:line.** `apps/web/src/components/geometry/orrery/orreryLayout.ts:720-724`, against
`BODY_PX_FLOOR = 9` at `:223`.

**The refusal itself is correct and well-formed** — it names the code, the measured value, the floor, the
reason (*"a size encoding on an anti-aliased dot is not an encoding"*) and the remedy (*"either fewer
entities or a larger window"*), and it keeps focus on the control. The finding is the reachability fact,
not the behaviour: on the shipped ontology, a 13-inch MacBook at default scaling and a 1366×768 laptop —
the two most common laptop viewports there are — can never see E4 at all, and no document in `docs/3d`
states a viewport floor.

**Severity: MEDIUM.** No wrong information is shown and the operator is told what to do; but an
environment that a large share of the desk cannot reach is not delivered to them, and the record does not
say so.

---

### F7 · The pre-hydration theme read and the runtime store resolve the stored preference by different rules — **LOW**

`apps/web/index.html:33-36` tries three keys in order: `lcx-os:<email>:ui:v1`, then `lcx-os:anon:ui:v1`,
then the legacy unscoped `lcx-os:ui:v1`. `apps/web/src/lib/persistence.ts:69-97` (`storage.get`) reads
**only** the scoped key. Measured on `/select`:

| stored state | pre-hydration `<html>` class | after hydration | flash |
|---|---|---|---|
| nothing | `""` | `""` | no |
| corrupt JSON (`{"state":{"darkMode":tru`) | `""` | `""` | no |
| `{state:{darkMode:"true"}}` (string) | `dark` | `dark` | no |
| `{darkMode:true}` (no `state`) | `""` | `""` | no |
| legacy `lcx-os:ui:v1` only | `dark` | `dark` | no |
| `lcx-os:anon:ui:v1` only | `dark` | `dark` | no |

The last two rows are the disagreement: the class is on, the store says light. Inside the shell
`AppLayout.tsx:118` re-synchronises the class from the store on every render, so the app corrects itself;
`/select` and `/lcxos` are siblings of that layout and never do. A signed-in dark operator was verified
clean end to end (`preHydration="dark" → settled="dark" → afterSignIn="dark"`, no flash).

**Severity: LOW.** Corrupt and malformed states are all handled without a crash and without a flash, and
the reachable path to an `anon`-scoped preference is narrow. Recorded because it is the same class of
defect as the one `b9770fb` fixed — two spellings of one rule — and because the fallback that fixed the
dead read is itself the second spelling.

---

## CATEGORIES THAT CAME BACK CLEAN — reported explicitly, because a silent category is data

**Rule 2 · no idle animation — CLEAN on all seven.** App-requested `requestAnimationFrame` calls were
counted separately from the probe loop's own. With a relief settled: **0** app frames in a 2.5 s window on
Theatre, Relief, Channel, Vault, Globe; **0** at baseline with every relief off; and the canvas region
byte-identical across 1.8 s on all five. E8 THE FORGE's arc requests 7 frames between t≈385 ms and
t≈5518 ms and then stops, with no trailing frame. The theatre's focus rack — a state transition rule 2
permits — requests **0** frames: it is a single redraw, not an animation.

**Rule 3 · reduced motion resolves to the final frame — CLEAN.** Under
`prefers-reduced-motion: reduce`, E8 requests **zero** rAF (`render(1)` is called directly) and the canvas
is shown. Compared against the normal-motion frame after the arc completes, over the whole 1440×900
viewport: **mean absolute channel difference 0.003 / 255**. Not "no frame", not "a faster arc" — the final
frame.

**Rule 7 · one shared GL context, as a runtime fact — CLEAN, and the leak the doctrine feared is closed.**
Live contexts were counted through `WeakRef`s to the context objects with `isContextLost()` checks, which
perturbs nothing, plus a wrapper on `WEBGL_lose_context.loseContext` so a deliberate release is
distinguishable from a browser eviction.

| exercise | created | `loseContext` calls | live at end | *"Too many active WebGL contexts"* |
|---|---|---|---|---|
| 8 off/on cycles, each of Theatre / Relief / Channel / Vault / Globe | 9 | 8 | **1** | 0 |
| 14 fast cycles on a **dark** `/bd-pipeline` (ambient layer + relief + charts) | 15 | 14 | **1** | 0 |
| 5 SPA navigations away **mid-mount**, ~120 ms after the toggle | 5 | 5 | **0** | 0 |
| 5 viewport resizes with the channel open | 1 | 0 | **1** | 0 |

The brief's premise that `stage.dispose()` does not call `loseContext()` is **out of date**:
`packages/gl/src/stage.ts:565-566` calls it, gated on `canvas.isConnected` at `:557`. The gate holds in
practice — every one of the 8-cycle runs shows exactly one `loseContext` per teardown. Note that
`apps/web/src/components/__tests__/glContextBudget.test.ts:55` still documents the old behaviour in a
comment.

**Rule 1 · the flat fallback on a machine with no WebGL at all — CLEAN.** Denied for real, before any app
code, by returning `null` from `HTMLCanvasElement.prototype.getContext` for every `webgl*` string and
deleting `WebGL2RenderingContext` and `WebGLRenderingContext` from `window` (positive control: a normal
context reports `webgl2:true, hasCtor:"function"`; the denied one reports `webgl2:false,
hasCtor:"undefined"`). Result, activating each control **with the keyboard**:

| surface | code | focus after the refusal | `aria-describedby` resolves to | flat surface |
|---|---|---|---|---|
| Theatre | `NO_WEBGL2` | stays on the button | the refusal text | 61 tables/svgs intact |
| Relief | `NO_WEBGL2` | stays on the button | the refusal text | intact |
| Channel | `NO_WEBGL2` | stays on the button | the refusal text | 87 intact |
| Vault | `NO_WEBGL2` | stays on the button | the refusal text | 26 intact |
| Globe | `NO_WEBGL2` | stays on the button | the refusal text | 33 intact |
| Orrery | refuses earlier, on data | stays on the button | the refusal text | 113 intact |
| Storm | already refusing | focusable | the refusal text | intact |

Zero page errors on all seven. `/select` renders its full sign-in form with the canvas at `display:none`
and the flat plate behind it. The `aria-disabled`-rather-than-`disabled` decision the wrappers argue for
at length is doing exactly what it claims: focus is retained through the refusal in every case.

**Rule 6 · absent data refuses rather than drawing zero — CLEAN where it could be exercised.** E7 THE
STORM refuses before it is ever offered — `aria-disabled="true"` at first paint, with
`NO_FORWARD_RISK_FEED` and a paragraph explaining that no forward risk feed exists in the system. E4
refuses on legibility (F6). E6 refuses `NO_OBSERVED_RECORDS` / `NO_RECORD_CARRIES_A_USABLE_TIMESTAMP`.
No surface was observed drawing a zero in place of a missing value.

**Theme correctness at the boundaries — CLEAN.** Within one session and one dataset,
light → dark → light → dark, comparing the canvas with the DOM overlay hidden:

| surface | light-1 == light-3 | dark-2 == dark-4 | mid-mount theme flip settles correctly |
|---|---|---|---|
| E2 Theatre | byte-identical | byte-identical | yes, byte-identical to a native dark mount |
| E5 Relief | byte-identical | byte-identical | yes |
| E3 Channel | byte-identical | byte-identical | yes |
| E6 Vault | 0.15 % of pixels differ | — | — |
| E2b Globe | 0.04 % of pixels differ | — | — |

The two that are not byte-identical are **not stale frames**. Against the light↔dark difference on the
same surfaces (mean absolute 130.5 and 105.4, 99.99 % and 98.9 % of pixels changed) the return trip is
0.019 and 0.010. The mechanism is a clock read in the draw path — `VaultReliefGl.tsx:357` rebuilds the
corridor from `Date.now()` on every draw, and `GlobeReliefGl.tsx:577` re-aims the sun from it — so two
seconds of wall clock legitimately moves a few pixels. Toggling the theme mid-mount, 60 ms after the
relief is opened, settles on the correct theme on every surface tested.

**Keyboard reachability and focus indication inside a projected surface — CLEAN.** Tabbing from the skip
link, the theatre's three projected panel buttons are reachable in the normal tab order with
`tabIndex 0`, they report `:focus-visible` under real `Tab` presses, and each shows a
`solid 2px rgb(8, 145, 178)` outline. `aria-pressed` flips correctly on activation. (A first pass reported
`outlineStyle:"none"` — that was a programmatic `.focus()`, which does not satisfy `:focus-visible`. See
§INSTRUMENT.)

**Name / pressed-state agreement — CLEAN on all seven.** Every toggle reads `<Surface> view: on|off` with
`aria-pressed` matching, so the accessible name and the state bit never contradict (WCAG 2.5.3).

**X1 THE AMBIENT LAYER — behaves exactly as its own file documents.** Light: **0 canvases, 0 GL contexts**
on every route. Dark: 1 canvas at 1440×900, 1 context. `SignatureBackdrop.tsx:128-136` already records
that `glContextBudget.test.ts`'s census is theme-blind and overcounts this layer; the measurement agrees
with the file, not with the census. (Its print behaviour is F2.)

---

## INSTRUMENT — what was wrong before it was right

Four measurements in this audit were wrong first. Each is recorded because the correction is the useful
part.

1. **A hidden tab never fires rAF, exactly as the brief warned.** The Claude browser pane reports
   `document.visibilityState === "hidden"`. E8's canvas sat at `display:none` with 2 `requestAnimationFrame`
   requests and **0** fires; the component looked dead. It was not — a `screenshot` call drives ~4 frames,
   after which the canvas showed `display:block` and `data-quality-tier="full"`. **Every runtime number in
   this document comes from headless Chromium where `document.hidden === false`, verified per run.**

2. **A naive rAF counter measures its own loop.** A first pass reported "121 rAF fires in 2 s" for a
   settled relief and called it an idle animation. The 121 were the probe's. The counter used above splits
   `window.__raf.app` from `window.__raf.probe` with a flag, so an idle surface reports 0 and a live one
   does not.

3. **A "31 contexts created, 6 lost" leak was my own probe.** The probe had allocated 24 fresh contexts to
   test for free slots and counted them. Chromium does not refuse a 25th context, it evicts the oldest and
   logs a warning — so "how many can I still create" measures nothing. Replaced with `WeakRef` +
   `isContextLost()`, and the real answer is **1 live context after 8 or 14 churn cycles**.

4. **`page.screenshot()` is not a valid sample of a mid-animation WebGL frame.** Screenshots of E8 taken at
   0.7 s and at 9 s were identical to 0.01 % of pixels, which would have supported a claim that the
   five-second arc changes nothing. Reading the drawing buffer with `gl.readPixels` inside the same rAF
   turn as the app's own callback shows the highlight travelling across seven frames —
   `71,81,99 → 168,184,210 → 154,170,195 → 89,100,119 → 62,71,88 → 57,66,82 → 56,65,82` at one sample
   point. **That claim is withdrawn.** Screenshot comparisons were retained only for *settled* frames,
   where the last drawn frame has been stable for seconds, and always with the DOM overlay hidden — the
   shell carries a per-second clock and a rotating ticker, and `VaultRelief` and `GlobeRelief` print a live
   timestamp and a per-frame millisecond figure over their own canvases, so a page-region screenshot can
   never be stable.

5. **A programmatic `.focus()` does not satisfy `:focus-visible`.** It reported `outlineStyle:"none"` on the
   theatre's projected panels and nearly produced a WCAG 2.4.7 finding. Real `Tab` presses show a 2 px
   outline.

---

## UNVERIFIED — stated as such

- **Nothing was measured against production data.** `/select` is public and was checked; every seated route
  was driven against a **local** database. F2, F4, F5 and F6 depend on the shape of the data (record count,
  entity count, contrast of real values), so their exact numbers may differ on production. F1 and F3 do
  not: both were confirmed by grepping the deployed chunks (`assets/CommandDeck-B-8x74dw.js`,
  `assets/AuditLog-pk4J-QxZ.js`, `assets/BdPipeline-UEXC13Pk.js`).
- **No performance claim is made.** Headless Chromium renders through SwiftShader at roughly 1.3 fps for
  E8's arc. Frame times here mean nothing about an M1.
- **Print was emulated, not printed.** `emulateMedia({media:'print'})` applies the print stylesheet; it does
  not run a real print job or a PDF export. The mean-luminance figures in F2 are of the on-screen render
  under print media, and a browser's *"print background graphics"* setting was not varied — a `<canvas>` is
  content rather than a background, so it should be unaffected, but that was not confirmed against a real
  spool.
- **Clause (b) of §7 is still unmeasured.** I did not run `docs/3d/e9/task.html`, and could not: this audit
  is not an operator trial. Every surface still ships behind a toggle that defaults off saying so, which is
  what §7 requires.
- **The desktop (Tauri) webview was not tested.** All results are browser-side.
- **`StormReliefGl` has no `beforeprint` listener and no theme observer**, unlike the other six
  (`grep -n beforeprint` finds it in Deck / Orrery / Vault / Pipeline / Surface / Globe and not in Storm).
  Its header at `:45-73` argues at length that E7 deliberately keeps the dark calibration in both themes,
  with measured numbers, so the absence looks intentional. **It could not be exercised**: E7 refuses
  `NO_FORWARD_RISK_FEED` before it ever draws, on this dataset, so no frame exists to check the claim
  against. Recorded as an open item rather than a finding.
- **E4's viewport floor was measured on one ontology.** A different entity count moves the threshold in
  either direction; the 940 px figure is specific to the dataset that shipped.
- **Only five reliefs could be opened.** E7 refuses up front and E4 refuses below 940 px, so the state,
  theme, print and context experiments cover Theatre, Relief, Channel, Vault and Globe, plus E4 above the
  floor where noted.

---

## ONE-LINE LEDGER

| # | finding | severity | route(s) |
|---|---|---|---|
| F1 | E5 relief-on removes the entire figure from the a11y tree; the source comment asserts the opposite | HIGH | `/command-deck` |
| F2 | plain ⌘P in dark prints a near-black full-document canvas behind the board pack and the crisis record | HIGH | every seated route |
| F3 | filtering silently remounts and discards an open relief; the written refusal path never runs | HIGH | `/audit-log`, `/bd-pipeline` |
| F4 | E6 carries 0 of 50 record labels in the default light theme, by its own printed measurement | HIGH | `/audit-log` |
| F5 | 3 of 5 openable reliefs print the canvas instead of the rows | MEDIUM | `/bd-pipeline`, `/audit-log`, `/market-map` |
| F6 | E4 unreachable below ~940 CSS px of viewport height, including 1440×900 and 1366×768 | MEDIUM | `/ontology` |
| F7 | pre-hydration theme read falls back to `anon` and the legacy key; the store does not, and `/select` never corrects it | LOW | `/select`, `/lcxos` |

Clean, and stated so on purpose: rule 2 on all seven; rule 3 on E8; rule 7 as a runtime count on five
surfaces plus the dark ambient layer; rule 1 with WebGL fully denied on all seven; rule 6 where
exercisable; theme-change completeness on five; keyboard reachability and focus indication inside the
projected theatre; name/`aria-pressed` agreement on all seven.
