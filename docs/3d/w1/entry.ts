/**
 * W1 GATE — the SAME data, drawn twice. SVG on the left, L4 on the right.
 *
 * PLATFORM_VFX_100X.md §3: "put the before and after side by side at 2× and look at them.
 * If a stranger cannot tell which one is the instrument and which is the placeholder, the
 * change is not worth its bytes."
 *
 * The bar VALUES are byte-identical between the two panels — same array, same scale, same
 * geometry. Only the rendering differs, which is the whole claim.
 */
import {
  createStage, isStage, createBarBatch, createPipeline, plotMatrix,
  beginAdditive, endPass, BRAND, BRAND_HEX, hexToLinear, exposure,
  linearToHex, assertBrandFidelity,
} from '@lcx/gl';

const DATA = [
  { label: 'Price', value: 14 }, { label: 'Timing', value: 11 },
  { label: 'No budget', value: 9 }, { label: 'Competitor', value: 7 },
  { label: 'No decision', value: 5 }, { label: 'Compliance', value: 3 },
];
const MAX = 15;

const canvas = document.getElementById('gl') as HTMLCanvasElement;
const stage = createStage(canvas);
const out = document.getElementById('verdict')!;

if (!isStage(stage)) {
  out.textContent = `refused · ${stage.code} · ${stage.reason}`;
} else {
  const bars = createBarBatch(stage);
  const pipeline = createPipeline(stage);
  if ('kind' in bars || 'kind' in pipeline) {
    out.textContent = 'refused: could not build the batch';
  } else {
    const { gl } = stage;
    // Data space: x 0..MAX, y 0..6 (one row per bar, top-down like the SVG).
    // x domain starts below zero so the bars begin INSET, leaving a gutter the DOM labels
    // occupy — the same layout the SVG kit uses.
    const mvp = plotMatrix(-MAX * 0.115, MAX * 1.06, 0, DATA.length);
    /* EXPOSED ABOVE THE BLOOM THRESHOLD, on purpose.
       The bright-pass ramps in over luminance 0.12–0.70. Brand blue at unit exposure sits
       near 0.10, so the first pass of this gate ran the whole bloom chain and produced
       nothing — the bars were modelled but not LIT. Pushing the fill up two stops puts the
       lit edge into the bright pass, which is what makes the top of a bar catch light the
       way a physical edge does. It is exposure, not hue: all three channels scale together,
       so `assertBrandFidelity` below still reports EXACT.

       TUNED DOWN FROM +2.0 STOPS, WHICH WAS WRONG IN THE OTHER DIRECTION. At +2 the whole
       bar cleared the bright pass and the panel came out as a neon glow — unmistakably
       different from the SVG and unmistakably a gaming UI, which fails the brief as badly
       as flatness does. At +0.62 only the lit edge and the densest part of the fill reach
       the threshold, so the bar reads as a surface catching light rather than as a light
       source. The instrument is supposed to be quiet. */
    const fill = exposure(BRAND.brand, 0.62);

    stage.bindTarget(stage.scene);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    beginAdditive(gl);
    bars.draw(mvp, DATA.map((d, i) => ({
      x0: 0, x1: d.value,
      // Same 0.62 bar-height fraction the SVG kit uses, so the geometry matches.
      y0: DATA.length - i - 1 + 0.19, y1: DATA.length - i - 1 + 0.81,
      colour: fill,
    })), { orientation: 'horizontal', modelling: 0.52, edgeStops: -0.2, contact: 0.7, radius: 0.10 });
    endPass(gl);
    // Bloom pulled back to a third of the default: enough to soften the lit edge, not
    // enough to halo the whole bar.
    pipeline.resolve({ plate: hexToLinear(BRAND_HEX.plate), bloomGain: 0.30, threshold: [0.30, 1.10] });

    /* The DOM type, so the comparison is FAIR. The first capture drew only geometry and
       the L4 panel had no labels at all — which made the richer render look like the poorer
       chart. A side-by-side that omits half of one side is not a side-by-side. */
    const host = document.getElementById('labels')!;
    DATA.forEach((d, i) => {
      const rowH = 100 / DATA.length;
      const mid = (i + 0.5) * rowH;
      const name = document.createElement('span');
      name.className = 'lab';
      name.style.top = `${mid}%`;
      name.textContent = d.label;
      host.appendChild(name);
      const val = document.createElement('span');
      val.className = 'val';
      val.style.top = `${mid}%`;
      // Positioned through the SAME domain the matrix uses, so the label cannot drift from
      // the bar end when the domain changes.
      const DOM0 = -MAX * 0.115, DOM1 = MAX * 1.06;
      val.style.left = `${((d.value - DOM0) / (DOM1 - DOM0)) * 100}%`;
      val.textContent = String(d.value);
      host.appendChild(val);
    });

    // THE COLOUR GATE, on screen rather than only in a test: the fill's hue must survive
    // the pipeline unchanged, because a bar's colour is data and a reader matches it to a
    // legend swatch.
    const failures = assertBrandFidelity();
    out.textContent =
      `brand fidelity: ${failures.length === 0 ? 'EXACT across the palette' : `${failures.length} FAILED`}` +
      ` · #2C6BFF → ${linearToHex(BRAND.brand)}` +
      ` · ${stage.hdr ? 'HDR float' : '8-bit'} · linear light · analytic AA · contact shadow`;
  }
}
document.title = 'READY';
