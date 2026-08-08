/** S6 capture entry — the LOOK gate (3D_WORK_100X.md §6.2). */
import { buildMotionGeometry, isMotionGeometry, type MotionPayload } from '../../../apps/web/src/surfaces/sales/motionGeometry';
import { renderMotion, type MotionLabel } from '../../../apps/web/src/surfaces/sales/renderMotion';

declare global { interface Window { __MOTION__: MotionPayload } }

const canvas = document.getElementById('c') as HTMLCanvasElement;
const overlay = document.getElementById('overlay')!;
const geo = buildMotionGeometry(window.__MOTION__);

/* Stage labels sit INSIDE the plate at their own rung. Time labels go in a strip BELOW it
   — in the first capture both were positioned in the overlay and "NOT STARTED" landed on
   top of "Oct 25". Two axes cannot share one edge. */
const timeAxis = document.getElementById('timeaxis')!;
const place = (labels: MotionLabel[]) => {
  for (const l of labels) {
    const el = document.createElement('div');
    el.className = l.kind === 'stage' ? 'stage-label' : 'time-label';
    el.style.left = `${l.sx}px`;
    if (l.kind === 'stage') el.style.top = `${l.sy}px`;
    el.textContent = l.text;
    (l.kind === 'stage' ? overlay : timeAxis).appendChild(el);
  }
};

const out = renderMotion(canvas, geo, place);
const stats = document.getElementById('stats')!;
if (out.kind === 'refused') {
  stats.textContent = `refused · ${out.code} · ${out.reason}`;
} else if (isMotionGeometry(geo)) {
  const openStalls = geo.dwells.filter((d) => d.open && d.stallT > 0.99);
  stats.textContent =
    `${out.drawn} deals · ${geo.risers.length} recorded moves · ${geo.dwells.length} dwells · ` +
    `${openStalls.length} still open past the slow anchor · ` +
    `stall ramp anchored on the book's own dwell: ${geo.stallAnchors.fast.toFixed(0)}d (p25) → ${geo.stallAnchors.slow.toFixed(0)}d (p90) · ` +
    `depth = deal value, $${Math.round(geo.valueRange.min / 100_000)}k–$${Math.round(geo.valueRange.max / 100_000)}k · ` +
    `${out.hdr ? 'HDR float' : '8-bit'}`;
  const note = document.getElementById('censor')!;
  note.textContent = geo.censoredRecent > 0
    ? `${geo.censoredRecent} of ${out.drawn} deals entered within the last ${geo.stallAnchors.slow.toFixed(0)} days, so they CANNOT yet show a stall that long. The right-hand side of this figure is cooler because it is censored by the observation window, not because the desk got faster.`
    : 'Every deal drawn has been open longer than the slow anchor, so no part of this figure is censored by the observation window.';
}
document.title = 'READY';
