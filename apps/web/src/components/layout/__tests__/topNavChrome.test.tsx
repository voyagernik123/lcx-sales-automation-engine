import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { TopNav, TRAFFIC_LIGHT_INSET_PX } from '../TopNav';

/**
 * The machined object's chrome: what the header does when macOS owns the top 32pt of it,
 * and what it must NOT do in a browser that has no such strip.
 *
 * WHY THIS FILE EXISTS. `tauri.conf.json` sets `titleBarStyle: "Transparent"` with
 * `hiddenTitle: true`, which hands the app the full window — including the strip where
 * macOS still draws close/minimise/zoom. Two defects shipped from that: the buttons sat
 * on top of the wordmark, and the window could not be dragged by its header at all,
 * because nothing in the repo declared a drag region (grep for `data-tauri-drag-region`
 * returned zero hits). Both are container-conditional: in a browser the same 78px inset
 * is a visible hole for every operator on the web build.
 *
 * The bell is stubbed. It opens an SSE stream and calls the API on mount, and neither is
 * what this file is about — but it is stubbed as a real `<button>` on purpose, because the
 * whole clickability question below turns on the TAG (see the drag.js contract).
 */
vi.mock('../NotificationBell', () => ({
  NotificationBell: () => <button type="button">Notifications</button>,
}));

/**
 * The container check the shell already uses (`lib/container.ts`): Tauri v2 injects
 * `__TAURI_INTERNALS__` before any app code runs. Setting it is therefore a faithful
 * simulation of the runtime, not a mock of our own detection — there is exactly one
 * definition of "am I in the terminal?" and this test goes through it.
 */
function enterTerminal() {
  (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = { invoke: () => {} };
}
function leaveTerminal() {
  delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
}

function mount(onOpenSearch = () => {}) {
  const { container } = render(
    <MemoryRouter initialEntries={['/deal-board']}>
      <TopNav onOpenSearch={onOpenSearch} />
    </MemoryRouter>,
  );
  const header = container.querySelector('header');
  if (!header) throw new Error('the header did not render');
  return { container, header };
}

afterEach(() => {
  leaveTerminal();
  vi.restoreAllMocks();
});

describe('the header under LCXOS', () => {
  it('insets its content past the traffic lights and declares a deep drag region', () => {
    enterTerminal();
    const { header } = mount();

    // `deep`, not a bare attribute. tauri-2.11.5/src/window/scripts/drag.js:66 —
    // a bare/`true` attribute drags ONLY on a direct hit on that element, which in a
    // flex header means the gaps between children and nothing else. `deep` (line 64)
    // walks the composed path up, so the breadcrumb and the empty middle drag too.
    expect(header.getAttribute('data-tauri-drag-region')).toBe('deep');
    expect(header.style.paddingLeft).toBe(`${TRAFFIC_LIGHT_INSET_PX}px`);
  });

  it('leaves the controls clickable inside the drag region', () => {
    enterTerminal();
    const onOpenSearch = vi.fn();
    const { header } = mount(onOpenSearch);

    fireEvent.click(screen.getByRole('button', { name: /Search or type a command/i }));
    expect(onOpenSearch).toHaveBeenCalledTimes(1);

    // The mechanism, pinned rather than assumed. drag.js:32-40 + 58 blocks the drag when
    // the composed path hits a CLICKABLE_TAG (A/BUTTON/INPUT/SELECT/TEXTAREA/LABEL/SUMMARY)
    // or an interactive role before it reaches the region — so every control in this header
    // must BE one of those tags, or carry its own override. A div-with-onClick would both
    // drag the window and fire, which is the failure this asserts against.
    const controls = [...header.querySelectorAll('button, a[href]')];
    expect(controls.length).toBeGreaterThan(3);
    for (const el of controls) {
      expect(['BUTTON', 'A']).toContain(el.tagName);
      expect(el.hasAttribute('data-tauri-drag-region')).toBe(false);
    }
  });

  it('blocks the drag on the subtrees that open panels', () => {
    enterTerminal();
    const { header } = mount();

    // A dropdown is a large surface of TEXT sitting inside the drag region. Without an
    // explicit `false` the walk would pass straight through the panel's own divs to the
    // header and move the window while the operator was reading it (drag.js:62).
    const blocked = header.querySelectorAll('[data-tauri-drag-region="false"]');
    // S4 added the watch strip: ranked text with its own buttons, sitting in the drag region.
    expect(blocked.length).toBe(4); // workspace switcher, watch strip, bell, operator menu
  });
});

describe('the same header in a browser', () => {
  it('has no inset and no drag region at all', () => {
    const { header, container } = mount();

    // NEGATIVE assertions, deliberately outside any barrier — this render is synchronous.
    expect(header.style.paddingLeft).toBe('');
    expect(container.querySelectorAll('[data-tauri-drag-region]').length).toBe(0);
  });

  it('still opens the palette from the omnisearch control', () => {
    const onOpenSearch = vi.fn();
    mount(onOpenSearch);
    fireEvent.click(screen.getByRole('button', { name: /Search or type a command/i }));
    expect(onOpenSearch).toHaveBeenCalledTimes(1);
  });
});

const DESKTOP = resolve(__dirname, '..', '..', '..', '..', '..', 'desktop');
const CONF = join(DESKTOP, 'src-tauri', 'tauri.conf.json');

describe('the window style the inset depends on', () => {
  it('is Overlay, because the inset is a hole under anything else', () => {
    const conf = JSON.parse(readFileSync(CONF, 'utf8'));
    const main = conf.app.windows.find((w: { label: string }) => w.label === 'main');

    /*
     * The one coupling in this lane worth a test of its own. MEASURED with AppKit under
     * each style's real mask, on this macOS:
     *
     *   Transparent  contentTop=32  (webview starts BELOW a real transparent title strip)
     *   Overlay      contentTop=0   (webview owns the full window; buttons draw over it)
     *
     * and upstream agrees — `TitleBarStyle::Transparent` sets `titlebarAppearsTransparent`
     * with `fullsize_content_view(false)` (tauri-runtime-wry-2.11.4/src/lib.rs:1207-1210),
     * while only `FullSizeContentView` lifts the content view
     * (tao-0.35.3/src/platform_impl/macos/window.rs:242-243).
     *
     * So under `Transparent` there was nothing to inset past and the strip above dragged
     * the window natively; TRAFFIC_LIGHT_INSET_PX would have been 78px of dead header.
     * Whoever changes this value back must delete the inset in the same commit.
     */
    expect(main.titleBarStyle).toBe('Overlay');
    expect(main.hiddenTitle).toBe(true);
  });
});

/* ── the installer plate: the config and the file have to agree ───────────────── */

describe('the DMG plate', () => {
  const conf = JSON.parse(readFileSync(CONF, 'utf8'));
  const dmg = conf.bundle.macOS.dmg;

  it('is named by the config and present on disk', () => {
    expect(typeof dmg.background).toBe('string');
    // Resolved the way the bundler resolves it: relative to the config's own directory,
    // which is the same idiom `build.frontendDist` ("../../web/dist") already uses. A
    // `background` key naming a missing image is the default white window with extra steps.
    const plate = resolve(dirname(CONF), dmg.background);
    expect(() => readFileSync(plate)).not.toThrow();
  });

  it('carries 2x pixels for the window size it will be shown at', () => {
    const plate = resolve(dirname(CONF), dmg.background);
    const png = readFileSync(plate);
    // IHDR: width/height are the two big-endian u32s after the 8-byte signature and the
    // 8-byte chunk header. No decoder needed for the only two numbers that matter.
    expect(png.readUInt32BE(16)).toBe(dmg.windowSize.width * 2);
    expect(png.readUInt32BE(20)).toBe(dmg.windowSize.height * 2);

    // And the density stamp that makes those pixels mean `windowSize` POINTS. Without it
    // macOS reads 1320x840 as points and the installer shows a quarter of the plate.
    const pHYs = png.indexOf('pHYs');
    expect(pHYs).toBeGreaterThan(0);
    const perMetre = png.readUInt32BE(pHYs + 4);
    expect(Math.round(perMetre * 0.0254)).toBe(144);
  });

  it('is generated from the approved artwork rather than redrawn', () => {
    // The brand book: "Do not attempt to redraw or recreate any element of the logotype."
    // Both generators must READ `apps/web/public/lcx-mark.svg`; a copy of the coordinates
    // inside a script is a copy that can drift from the artwork, and `docs/brand-make-icons.py`
    // is the precedent (it holds its own inline copy). The tell is the first vertex.
    for (const script of ['make-icons.mjs', 'make-dmg-plate.mjs']) {
      const src = readFileSync(join(DESKTOP, 'scripts', script), 'utf8');
      expect(src).not.toMatch(/M97\.722/);
      expect(src).toMatch(/lcx-mark\.svg|readMark/);
    }
  });

  /* AN ISOLATED CHROME BAR MUST CARRY A POSITIVE Z-INDEX (2026-09-04). `isolate` gives the bar its own stacking context so the glass
     ::before can sit behind its content; with `z-index: auto` that whole context — the workspace switcher's open list included — painted
     under the page panel that follows it in the DOM, and only slivers of the menu showed through the gutter. Read from source, like the
     other pins here: the two bars that take GLASS_CHROME_LAYER_CLASS each carry a `z-N` alongside it. */
  it('every chrome bar that isolates for its glass layer also lifts itself above the page', () => {
    const files = ['../TopNav.tsx', '../Sidebar.tsx'];
    for (const f of files) {
      const src = readFileSync(resolve(__dirname, f), 'utf8');
      const lines = src.split('\n').filter((l) => l.includes('GLASS_CHROME_LAYER_CLASS') && /className/.test(l));
      expect(lines.length, `${f}: no className line carries GLASS_CHROME_LAYER_CLASS`).toBeGreaterThan(0);
      for (const l of lines) expect(l, `${f}: an isolated bar with no z-index paints under the page — its menus vanish`).toMatch(/\bz-(?!\[?-)\d+/);
    }
  });
});
