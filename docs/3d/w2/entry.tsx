/** W2 gate — the REAL BarChartH, mounted live, so the hook actually runs. */
import { createRoot } from 'react-dom/client';
import { createElement as h } from 'react';
import { BarChartH } from '@/components/charts';

const DATA = [['Price',14],['Timing',11],['No budget',9],['Competitor',7],['No decision',5],['Compliance',3]]
  .map(([label, value]) => ({ label: label as string, value: value as number }));

createRoot(document.getElementById('root')!).render(
  h('div', { className: 'dark', style: { width: 760 } }, h(BarChartH, { data: DATA })),
);
// The GL frame lands a tick after mount; the capture waits on the canvas, not on this.
setTimeout(() => { document.title = 'READY'; }, 900);
