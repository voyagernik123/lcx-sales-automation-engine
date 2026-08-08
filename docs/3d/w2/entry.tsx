/**
 * W2 FINAL GATE — the whole kit, mounted LIVE so the GL layer actually runs.
 *
 * W0's contact sheet used renderToStaticMarkup, which means `refused` stays true and every
 * panel renders its SVG fallback. That was right for auditing what shipped; it is useless
 * for proving the swap. This mounts the real components with react-dom/client.
 */
import { createRoot } from 'react-dom/client';
import { createElement as h, StrictMode } from 'react';
import { PANELS } from '../w0/sheet';

const root = document.getElementById('root')!;
createRoot(root).render(
  h(StrictMode, null,
    h('div', { className: 'dark' },
      PANELS.map((p) =>
        h('div', { key: p.name, className: 'cell' },
          h('div', { className: 'hd' },
            h('span', { className: 'nm' }, p.name),
            h('span', { className: 'no' }, p.note)),
          p.node)))),
);
// The GL frames land over the next few animation frames; the capture waits on this.
setTimeout(() => { document.title = 'READY'; }, 2200);
