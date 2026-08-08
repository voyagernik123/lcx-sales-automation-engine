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

## NOT landed: the `BarChartH` swap

The integration renders **four bars for six rows**, misaligned with their labels. I did not
isolate it, so it is reverted rather than shipped.

What is ruled out, measured in the live page: canvas backing 960 × 312, CSS 760 × 247, SVG
`viewBox="0 0 480 156"`, all 12 text nodes present, GL layer drawing, zero SVG fallback
paths. The geometry the two layers agree on is right. The standalone bars in `docs/3d/w1`
render correctly from the same primitive with the same matrix, which narrows it to the
integration — the memoised `rects`, the colour-token resolution pass, or the instance
buffer — and not to `flat/bars.ts`.

**The layer is ready; one caller is not.** Shipping a chart that drops a third of its rows
would be strictly worse than the flat SVG it replaced, and W0's finding was explicitly that
these primitives are correct and must not be made worse.
