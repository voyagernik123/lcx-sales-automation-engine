# W2 / W3 — the layer is built and proven. One primitive swap is NOT.

`PLATFORM_VFX_100X.md` W2 is "re-back the 13 primitives, props unchanged, SVG retained as
fallback"; W3 is the motion grammar. This records exactly what landed and what did not.

## Built, tested, and correct

**The shared renderer** (`packages/gl/src/flat/shared.ts`) — §7.3 of the plan named context
exhaustion as the constraint that decides the architecture, and it does. Browsers cap live
WebGL contexts around 8–16 and then silently kill the OLDEST one, so a context-per-chart
build works on a three-chart test page and blanks the top half of a real dashboard with
nothing thrown. There is now exactly ONE context for the app, on an offscreen canvas; each
chart owns a cheap 2-D canvas and receives a `drawImage` blit of its own region.

Blit rather than one page-sized canvas behind the DOM, because the latter has to track
scroll, stacking context, overflow clipping and modals — all of which this app has — and
breaks the moment a chart sits inside a scroll container. One texture copy per chart is a
rounding error against a frame that already runs five post-process passes.

**The hook** (`apps/web/src/components/charts/gl/useFlatChart.ts`) — owns device-pixel
sizing, the refusal fallback and the entrance. `refused` starts TRUE and only clears once a
frame has actually been drawn, so the SVG is what renders on the server, in print, without
WebGL2, and on first paint. There is no state in which a reader sees nothing.

**W3 motion** — one purpose, `entrance`, once. The bar grows from its baseline, which is the
only motion here that carries the data: the bar *arrives at* its value rather than fading in
at it. A data refresh does NOT replay it — re-animating on every poll would make a
timer-refreshed dashboard permanently in motion, which is the idle animation the policy
forbids, reached from the other direction. Under `prefers-reduced-motion` it resolves to the
final state on frame one, and an environment that cannot read the preference assumes reduced.

**Three real pipeline bugs, found by looking:**

1. `createStage` hard-coded `alpha: false`, so an overlay canvas painted an opaque black
   rectangle across the card no matter how carefully the composite cleared to zero.
2. The composite always wrote `alpha = 1`. A transparent frame has to carry the coverage the
   primitives actually drew — they already write their mask into the scene target's alpha,
   so the fix was to stop discarding it.
3. **The bright pass and the blur wrote `alpha = 1` too**, so the bloom chain reported full
   coverage over the whole frame and a transparent composite came out as a grey wash across
   its entire rectangle. Opaque frames never noticed, because they discard that alpha.

All three are fixed and all three were invisible to every test — they only appear when a
transparent layer is composited over real DOM.

## `BarChartH` is swapped, and the three bugs it took to get there

It first rendered **four bars for six rows**, stretched and misaligned. All three causes
were in code I had written, and none was visible to any test.

**1 · The viewport, and it was an architectural defect rather than a slip.** `bindTarget`
set the viewport from the TARGET's size. That is correct for a stage owning its own canvas
and silently wrong for the shared renderer, where one 1024 × 512 buffer serves many charts:
`bindTarget` re-set the viewport to the full buffer AFTER the shared renderer had scissored
the chart's 960 × 312 region, so every mark rendered 1.64× too large and the bottom rows fell
outside the copied rect. The `Stage` now has a REGION — `setRegion(w, h)` resizes the targets
and `bindTarget` reads the viewport from it, reallocating only when the size actually
changes, so a page of same-sized charts pays for one allocation.

**2 · The contact shadow did not know which way was down.** It hard-coded "below" as
decreasing y. A chart borrowing its host SVG's viewBox counts y DOWNWARD, so the shadow was
cast above each bar. The direction is now read off the projection matrix.

**3 · `fwidth(d)` — the antialiasing bug, and the best of the three.** `sdRoundRect`
contains `max(q, 0.0)` and a `length()`, so its derivative is DISCONTINUOUS along the
diagonal running out of each corner. `fwidth` spikes on that seam, the edge smoothstep fires
deep inside the shape, and a small dark speck appears on the diagonal — on two bars of six,
and on nothing else. Exactly the kind of artifact that gets blamed on the data. The feather
now comes from `fwidth(p)`: `p` is linear in the quad's coordinates, so it is constant
across the primitive and one pixel wide everywhere, including across that seam.

The scale of bug 3 is worth noting: the whole visible symptom was two marks about six pixels
across, and the cause was a real mathematical error in the primitive that would have appeared
on every rounded shape the layer ever drew.
