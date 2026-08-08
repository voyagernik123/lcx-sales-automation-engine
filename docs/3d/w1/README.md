# W1 · L4 FLAT — the same six numbers, drawn twice

The gate from `PLATFORM_VFX_100X.md` §3: *put the before and after side by side at 2× and
look at them. If a stranger cannot tell which is the instrument and which is the placeholder,
the change is not worth its bytes.*

```bash
node docs/3d/w1/build.mjs && node docs/3d/w1/build-page.mjs && node docs/3d/w1/capture.mjs
```

`compare.png` is the result. The bar VALUES, the scale and the bar geometry are identical
between the two panels — the left is the real `BarChartH` from the app, rendered through
`renderToStaticMarkup`. Only the rendering differs.

| gate | result |
|---|---|
| Brand hex exact through the pipeline | **EXACT across the whole palette** — `#2C6BFF → #2c6bff` |
| A stranger can tell which is the instrument | **yes**, at the third attempt |
| L4 cost | **~5 KB** — spine + L4 + this gate bundles to 13.7 KB total |
| Layer budget (§6.4) | spine 17.6 KB of 63 |

## What L4 adds, and why none of it needs a third axis

Linear-light **modelling** across the bar so it reads as a surface catching light rather than
a filled region; a **lit edge** on the near side, which is the single strongest cue that an
object has a top face; **analytic anti-aliasing** from the exact signed distance to the
rounded rectangle, so the edge is correct at any zoom and costs nothing (MSAA would cost 4×
the fill rate for a worse edge on a shape we can solve); and a **contact shadow** that is
densest where the bar meets the plate, which is why it reads as contact.

The bar's **colour is data** and is never tone mapped. Modelling, edge and shadow are
**light** and are shaped by the composite. `assertBrandFidelity()` runs in the page itself
and prints its result under the figure, so the claim is on screen rather than only in a test.

## It took three attempts, and both failures are worth keeping

**First: invisible.** The modelling was real but the bars never reached the bloom
threshold — brand blue at unit exposure has luminance ≈ 0.10 and the bright pass ramps in at
0.12, so the entire bloom chain ran and produced nothing. The bars were *modelled but not
lit*. And the panel had no type at all, because I drew only geometry — a side-by-side that
omits half of one side is not a side-by-side.

**Second: a neon gaming UI.** Pushing the fill to +2 stops cleared the bright pass across the
*whole* bar rather than just its lit edge. The difference from the SVG became unmistakable
and unmistakably wrong — loudness is not grade, and it fails the brief exactly as badly as
flatness does. The labels also landed on top of the bars, because the gutter was positioned
with a fixed `128px` offset against a canvas that scales by percentage.

**Third: +0.62 stops, bloom at 0.30, threshold raised to 0.30–1.10.** Only the lit edge and
the densest part of the fill reach the bright pass, so a bar reads as a surface catching
light rather than as a light source. The instrument is supposed to be quiet.

That loop — render, look, correct — is the method. Neither failure was visible in any test:
the first produced a correct-looking flat chart, the second produced a spectacular wrong one.
