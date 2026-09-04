// P5 fill: P6 → P7 aggregates, the desk-route table (with figures = "did content render"), hero panels held, fade hits, redraw.
import { readFileSync } from 'node:fs';
const a = JSON.parse(readFileSync(process.argv[2], 'utf8')), b = JSON.parse(readFileSync(process.argv[3], 'utf8'));
const __reached = (x) => (x.routes ?? []).some((r) => r.runtime && Object.values(r.runtime).some((t) => t && typeof t === 'object' && t.reached === 'REACHED'));
if (!__reached(b)) { console.error('REFUSED: the second baseline has no capture that reached a page (every route ✗) — a failed instrument, not a measurement.'); process.exit(2); }
const cov = (r, t) => r.runtime?.[t]?.visibility?.coverage ?? 0;
const med = (xs) => { const s = [...xs].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const pct = (x) => `${Math.round(x * 100)}%`;
const line = (t) => { const A = a.routes.map((r) => cov(r, t)), B = b.routes.map((r) => cov(r, t));
  return `${t}: GL visible on ${A.filter((x) => x > .05).length} → ${B.filter((x) => x > .05).length} of 79 · median ${pct(med(A))} → ${pct(med(B))} · ≥ 50% on ${A.filter((x) => x >= .5).length} → ${B.filter((x) => x >= .5).length} · ≥ 35% on ${A.filter((x) => x >= .35).length} → ${B.filter((x) => x >= .35).length} · ≥ 20% on ${A.filter((x) => x >= .2).length} → ${B.filter((x) => x >= .2).length}`; };
const DESK = ['/bd-kpis', '/win-loss', '/forecast', '/scorecard', '/command-deck', '/bd-pipeline', '/command', '/regulatory-dashboard', '/distribution', '/marketing', '/gps', '/wbr'];
const desk = DESK.map((p) => { const r = b.routes.find((x) => x.path === p), q = a.routes.find((x) => x.path === p); if (!r) return `    ${p.padEnd(22)} (not in sweep)`;
  return `    ${p.padEnd(22)} dark ${pct(cov(q ?? r, 'dark')).padStart(4)} → ${pct(cov(r, 'dark')).padStart(4)} · light ${pct(cov(q ?? r, 'light')).padStart(4)} → ${pct(cov(r, 'light')).padStart(4)} · figures ${r.runtime?.dark?.figures ?? '—'} · errors ${(r.runtime?.dark?.errors ?? []).length + (r.runtime?.light?.errors ?? []).length}`; }).join('\n');
const heroes = {}; for (const r of b.routes) for (const t of ['dark', 'light']) for (const [k, v] of Object.entries(r.runtime?.[t]?.visibility?.panels ?? {})) { heroes[k] ??= {}; heroes[k][t] = v; }
const panels = Object.entries(heroes).map(([k, h]) => `${k} ${h.dark == null ? '—' : pct(h.dark)}/${h.light == null ? '—' : pct(h.light)}`).join(' · ');
const fadeHits = b.routes.flatMap((r) => ['dark', 'light'].map((t) => r.runtime?.[t]?.chromeFade?.textHits ?? 0)).reduce((x, y) => x + y, 0);
const rd = b.routes.flatMap((r) => [r.runtime?.dark?.stageRedrawMs, r.runtime?.light?.stageRedrawMs]).filter((x) => typeof x === 'number' && x >= 0); const srt = [...rd].sort((x, y) => x - y);
const A = a.totals.runtime, B = b.totals.runtime;
console.log(`  THE SWEEP (docs/instrument/audit/production-p5; 79 routes × 2 themes, fixtures incl. heroes and desk charts, one-page-load pairs,
    warm-up ${b.totals.warmup ? `${b.totals.warmup.routes} routes / ${Math.round(b.totals.warmup.ms / 1000)} s` : 'none'}):
    ${line('dark')}
    ${line('light')}
    DESK ROUTES (P6 → P7; "figures" says whether content rendered — with the fixtures the desks are opaque cards over the plate):
${desk}
    Hero panels held: ${panels}. Chrome-fade text hits: ${fadeHits}. Stage redraw: n ${rd.length}, median ${med(rd)} ms, p90 ${srt[Math.floor(rd.length * .9)]}, max ${Math.max(...rd)}, over 8: ${rd.filter((x) => x > 8).length}.
    Standing: continuity ${A.routesWithContinuity} → ${B.routesWithContinuity} · motion at rest ${A.routesWithMotionAtRest} → ${B.routesWithMotionAtRest} · max intervals ${A.maxLiveIntervals} → ${B.maxLiveIntervals} · rAF loops ${A.routesWithRafLoop} → ${B.routesWithRafLoop} · GL contexts ${A.routesWithGlContext} → ${B.routesWithGlContext} · page errors ${A.routesWithPageErrors} → ${B.routesWithPageErrors}.`);

// P7 · THE ARRIVAL AS ONE BOUNDED SEQUENCE — per capture: steps === items and framesDuringSweep ≤ items + 1.
{
  const caps = (b.routes ?? []).flatMap((r) => Object.values(r.runtime ?? {}).filter((t) => t && t.reached === 'REACHED' && t.objects && t.objects.arrival).map((t) => ({ path: r.path, a: t.objects.arrival })));
  const withItems = caps.filter((c) => c.a.items > 0);
  const complete = withItems.filter((c) => c.a.steps === c.a.items && c.a.sweeping === false);
  const bounded = withItems.filter((c) => c.a.framesDuringSweep <= c.a.items + 1);
  const worst = withItems.reduce((m, c) => Math.max(m, c.a.framesDuringSweep ?? 0), 0);
  console.log(`    THE ARRIVAL (P7): ${withItems.length} captures saw the watch arrive with ${withItems[0]?.a.items ?? 0} ranked items · sweep complete at rest (steps === items) on ${complete.length} · frames during the sweep ≤ items+1 on ${bounded.length} (worst ${worst}) · rAF at rest: ${caps.filter((c) => true).length ? 'see Standing' : '—'}`);
  const stalled = withItems.filter((c) => !(c.a.steps === c.a.items && c.a.sweeping === false)).map((c) => c.path);
  if (stalled.length) console.log(`      NOT complete: ${[...new Set(stalled)].join(', ')}`);
}
