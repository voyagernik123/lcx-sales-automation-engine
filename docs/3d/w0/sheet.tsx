/**
 * W0 · THE LOOK AUDIT — every chart primitive, on one page, at 2×.
 *
 * `PLATFORM_VFX_100X.md` §6 makes this a real gate that can shrink or kill the plan: the
 * thesis is that the platform's visual grade is set by 13 primitives across 79 pages, and
 * the honest way to test that is to put all 13 in front of a human before writing a byte of
 * the new render layer.
 *
 * ── WHY STATIC MARKUP AND NOT A DEV SERVER ──────────────────────────────────────────
 * These are pure presentational components over data props. Rendering them through
 * `renderToStaticMarkup` against the app's REAL built stylesheet gets the true pixels with
 * no router, no auth, no API and no page state — and it cannot accidentally capture a
 * loading skeleton, which is the failure mode of screenshotting live pages.
 *
 * The data is shaped like the app's own: the funnel is the real stage ladder, the histogram
 * is a lumpy Monte Carlo support rather than a smooth bell, and the control band carries a
 * NULL day so the refusal path (fixed in edd2ffd) appears in the sheet rather than only in
 * a test.
 */
import { createElement as h } from 'react';
import {
  Sparkline, ColumnChart, BarChartH, StackedBarH, DonutChart, GaugeChart,
  FunnelChart, TrendDelta, StatCard, ChartCard, Histogram, ControlBand, CompareBars,
} from '../../../apps/web/src/components/charts';

const usd = (v: number) => `$${Math.round(v / 1000)}k`;

/* A lumpy support, not a bell: the real forecast totals are sums of subsets of a small
   price ladder, and a smooth curve would flatter every renderer equally. */
const counts = Array.from({ length: 28 }, (_, i) => {
  const x = (i - 11) / 5;
  const smooth = Math.exp(-x * x) * 160;
  return Math.max(0, Math.round(smooth * (i % 4 === 0 ? 1.7 : i % 3 === 0 ? 0.45 : 1)));
});

const trend = [12, 15, 14, 19, 23, 21, 28, 31, 29, 36, 41, 44];

export interface Panel { readonly name: string; readonly note: string; readonly node: JSX.Element }

export const PANELS: Panel[] = [
  { name: 'StatCard', note: 'Seen on nearly every page. The most-viewed primitive in the app.',
    node: h('div', { className: 'grid grid-cols-3 gap-3' },
      h(StatCard, { key: 'a', label: 'Open pipeline', value: '$1.24m', delta: 12.4, deltaLabel: 'vs last month', trend }),
      h(StatCard, { key: 'b', label: 'Win rate', value: '31%', delta: -2.1, deltaLabel: 'vs last month', goodIsUp: true, trend: [...trend].reverse() }),
      h(StatCard, { key: 'c', label: 'Deals in flight', value: '49', delta: 4, deltaLabel: 'new this week', trend: trend.map((t) => t * 0.7) }),
    ) },
  { name: 'Sparkline', note: 'Embedded in table cells and stat cards. Smallest mark in the system.',
    node: h('div', { className: 'flex items-center gap-6' },
      h(Sparkline, { key: 'a', data: trend, width: 120, height: 32 }),
      h(Sparkline, { key: 'b', data: [...trend].reverse(), width: 120, height: 32, good: false }),
      h(Sparkline, { key: 'c', data: trend, width: 120, height: 32, area: true }),
    ) },
  { name: 'TrendDelta', note: 'Inline delta chip.',
    node: h('div', { className: 'flex items-center gap-6' },
      h(TrendDelta, { key: 'a', value: 12.4 }), h(TrendDelta, { key: 'b', value: -3.8 }),
      h(TrendDelta, { key: 'c', value: 0 }), h(TrendDelta, { key: 'd', value: null }),
    ) },
  { name: 'ColumnChart', note: 'Time series by category.',
    node: h(ColumnChart, { data: ['Oct','Nov','Dec','Jan','Feb','Mar','Apr','May'].map((label, i) => ({ label, value: [340,290,410,380,520,470,610,580][i]! })), formatValue: usd, showValues: 'max' }) },
  { name: 'BarChartH', note: 'Ranked lists — loss reasons, partners, channels.',
    node: h(BarChartH, { data: [['Price', 14],['Timing', 11],['No budget', 9],['Competitor', 7],['No decision', 5],['Compliance', 3]].map(([label, value]) => ({ label: label as string, value: value as number })) }) },
  { name: 'StackedBarH', note: 'Composition of a single total.',
    node: h(StackedBarH, { segments: [{ label: 'Listing', value: 420000 },{ label: 'Marketing', value: 260000 },{ label: 'Liquidity', value: 180000 },{ label: 'Custom', value: 90000 }], formatValue: usd }) },
  { name: 'DonutChart', note: 'Share of a whole.',
    node: h(DonutChart, { data: [{ label: 'Won', value: 13 },{ label: 'Lost', value: 7 },{ label: 'Open', value: 29 }], centerLabel: 'Deals', centerValue: '49' }) },
  { name: 'GaugeChart', note: 'One value against a target.',
    node: h('div', { className: 'flex gap-8' },
      h(GaugeChart, { key: 'a', value: 68, label: 'Coverage', target: 80 }),
      h(GaugeChart, { key: 'b', value: 31, label: 'Win rate', target: 35 }),
    ) },
  { name: 'FunnelChart', note: 'The real stage ladder, with the real drop-off.',
    node: h(FunnelChart, { stages: [{ label: 'Not started', value: 49 },{ label: 'Contacted', value: 49 },{ label: 'Discovery', value: 37 },{ label: 'Proposal', value: 22 },{ label: 'Negotiating', value: 14 },{ label: 'Won', value: 13 }] }) },
  { name: 'Histogram', note: 'The Monte Carlo forecast. Lumpy support, three percentile markers.',
    node: h(Histogram, { domain: [0, 600000] as [number, number], series: [{ label: 'Simulated quarters', counts }],
      markers: [{ label: 'p10', value: 103000 },{ label: 'p50', value: 222000 },{ label: 'p90', value: 351000 }],
      formatX: usd }) },
  { name: 'ControlBand', note: 'Forecast vs landed. CARRIES A REFUSED DAY — the null must read as a hole, not a zero.',
    node: h(ControlBand, { data: ['Mar 1','Mar 8','Mar 15','Mar 22','Mar 29','Apr 5','Apr 12','Apr 19'].map((x, i) => (
      i === 4
        ? { x, lo: null, hi: null, mid: null, actual: null }
        : { x, lo: [180,190,205,210,0,240,250,265][i]! * 1000, hi: [320,335,345,360,0,395,410,430][i]! * 1000, mid: [240,255,270,280,0,310,325,340][i]! * 1000, actual: i < 5 ? [150,170,195,215,0][i]! * 1000 : null })),
      formatValue: usd, bandLabel: 'P10–P90 called', midLabel: 'Expected', actualLabel: 'Landed' }) },
  { name: 'CompareBars', note: 'Rates with confidence intervals.',
    node: h(CompareBars, { data: [{ label: 'Email', rate: 0.31, n: 420 },{ label: 'LinkedIn', rate: 0.22, n: 180 },{ label: 'Intro', rate: 0.54, n: 40 },{ label: 'Inbound', rate: 0.44, n: 95 }] }) },
  { name: 'ChartCard', note: 'The frame every chart above sits inside.',
    node: h(ChartCard, { title: 'Called vs landed', subtitle: 'Daily forecast snapshots against closed-won revenue' },
      h(ColumnChart, { data: ['W1','W2','W3','W4','W5','W6'].map((label, i) => ({ label, value: [120,180,150,220,260,240][i]! })), formatValue: usd })) },
];
