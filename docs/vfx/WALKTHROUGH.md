# THE PRODUCTION — a two-minute walkthrough (draft opened 2026-09-04 in P8; closed at P9)

Open these, in this order, on https://lcx-sales-automation-engine.pages.dev. Each line says what to LOOK AT and which record backs it.
Judge by what you see; the numbers are there so the seeing can be checked.

1. **/lcxos** — the public page. The hero is the Forge itself, live: a machined disc with the LCX mark engraved into its face, a
   brushed highlight travelling across it, the brand ring on a bevelled plinth. It arrives over the still and lands on the still's own
   framing. Where the GPU refuses, the still stays. *Record: production-p6/p7 `/lcxos` (coverage 18 % dark / 20 % light — the figure
   is the hero's share of the page); the glb is 160,520 bytes, fetched after the first frame, never preloaded.*
2. **/select** — the sign-in. The same object under the form, sinking below it; the highlight never sits under the footer's text.
   *Record: `/select` 95 % / 96 % GL coverage; brand hex #2C6BFF decoded from the asset's bytes (oneObject.test).*
3. **Sign in → /command-deck** — THE ARRIVAL. Watch the top bar: the ticker reveals the watch's ranked items one per heartbeat —
   money, liability, deadline, activity — and on the same beats the rooms on the stage behind the page light in that order (look at
   the room's edge through the sidebar glass, bottom-left). Then nothing moves. *Record: production-p7 — 154 of 154 captures, steps
   equal items, at most three stage frames during the sweep, zero motion at rest.*
4. **/command-deck, the page** — the readiness gauge (five weighted dials, rig-shaded), the LP optimizer, the surface relief you can
   rotate with the viewpoint slider. *Record: surface hero 83 % / 92 % of its own rect is GL; frame at 2× on an M1: p90 6.2 ms.*
5. **/bd-kpis and /win-loss** — the charts on the engine: lit columns and bars with real depth; arriving figures bloom once and settle.
   *Record: ten of twelve chart components on the engine; two stay SVG by the 20-px resolution ruling.*
6. **Toggle the theme** (top bar, sun/moon). One re-render of the final frame; no sweep replays. In light the studio is a white
   room with brand-blue pools; in dark the room recedes and the glows are deep blue on purpose. *Record: luminance under the page:
   dark p99 .036 against the .04 ceiling; light p05 .596 against the .55 floor.*
7. **Resize to a narrow window** — the same room, framed for the width; **print preview** — the still, not the canvas: both GL
   hosts are hidden on paper. *Record: production-p8-narrow; glHostsPrintHidden.test.*
8. **Take the GPU away** (DevTools → Rendering → emulate context loss, or a laptop lid): the page says so on the stage host and stands
   as a flat surface; when the context returns the room is rebuilt once. *Record: verify-app-renders --lose-context.*

What is NOT here, by decision: idle motion of any kind; translucent cards over the room (text contrast owns that call — the desk
coverage target of 50 % is recorded as short for that reason); a third try at things the measurement refused.
