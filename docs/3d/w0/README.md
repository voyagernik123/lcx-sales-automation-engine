# W0 · LOOK AUDIT — the finding, and how it shrank the plan

`PLATFORM_VFX_100X.md` §6 made W0 a gate that could kill or shrink the plan: capture every
chart primitive on real-shaped data at 2×, **look at it**, and find out whether the platform's
visual grade is actually the problem.

```bash
npm run build -w @lcx/web       # W0 renders against the app's REAL stylesheet
node docs/3d/w0/build.mjs
node docs/3d/w0/capture.mjs     # → sheet-light.png, sheet-dark.png
```

13 primitives, rendered through `renderToStaticMarkup` against the app's own built CSS — no
router, no auth, no API, and therefore no chance of capturing a loading skeleton, which is
the failure mode of screenshotting live pages.

---

## The finding: competent, not broken. **This is not a rescue job.**

I expected to find a weak kit. I did not.

The funnel tapers correctly and carries step-conversion percentages (100% → 76% → 59% → 64%
→ 93%). The histogram has real percentile markers with labelled rules. The gauges carry
target ticks. `CompareBars` draws Wilson confidence intervals. Typography and hierarchy are
right. Someone cared about these.

**So the plan shrinks in a specific and important way: W1/W2 must be a RENDER-BACKING SWAP
that preserves every bit of that correctness and adds only material, light and depth. Not a
rewrite.** Any change that loses a marker, a whisker or a conversion percentage is a
regression no matter how it looks.

## What is actually missing

| # | finding | where it shows |
|---|---|---|
| 1 | **No material and no light.** Every mark is a flat fill — no gradient, no lit edge, no contact shadow, nothing to ground a bar on its plate. | All 13 |
| 2 | **Monotone.** Nine of thirteen render in the same single blue. A distribution and a ranking are visually indistinguishable at a glance. | Column, Bar, Histogram, CompareBars, Funnel, Sparkline, ChartCard |
| 3 | **The gauges fail the OTHER way** — physically huge relative to every neighbour, and saturated orange/red shouting at 68 and 31, values that are not alarming. Loudness is not grade. | `GaugeChart` |
| 4 | **Dark mode is materially weaker than light.** Sparklines and `TrendDelta` nearly vanish; the categorical greens/oranges clash against the dark plate in a way they do not on white. | `Sparkline`, `TrendDelta`, `StackedBarH`, `DonutChart` |
| 5 | **No motion anywhere.** `CountUp`, `Badge` and `Button` animate. No chart does. | All 13 |

Findings 3 and 4 are **not** fixed by a new renderer — they are palette and scale decisions,
and they should be fixed in SVG regardless of whether W2 ever ships.

## Ranked by frequency × grade gap

The order W2 should follow, because it is the order an operator actually sees them in:

1. **StatCard** — on nearly every page. The most-viewed primitive in the product.
2. **Sparkline** — inside StatCards and table cells; also the worst dark-mode offender.
3. **ColumnChart / BarChartH** — the workhorses.
4. **Histogram** — the forecast, and the densest data in the app.
5. **ControlBand** — carries the refusal gap fixed in `edd2ffd`; that hole must survive W2.
6. **FunnelChart, DonutChart, StackedBarH, CompareBars** — lower frequency.
7. **GaugeChart** — needs a palette and scale decision *before* a render decision.
