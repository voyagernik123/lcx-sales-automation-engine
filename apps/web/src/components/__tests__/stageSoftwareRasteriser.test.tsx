import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/**
 * THE STAGE HANDS A SOFTWARE RASTERISER'S CONTEXT BACK BEFORE IT COMPILES A SHADER (2026-09-14).
 *
 * Found through CI rather than a screenshot: `tablestops.spec` and `hints.spec` went red with `[data-list-row]`
 * and `[data-hint-tag]` "not found" at 6 s. Measured on a cold dev server with the seat seeded: headless Chromium
 * IS SwiftShader, and the Stage's synchronous setup held the main thread 1.3 s on an M1 (4–8 s on the 2-vCPU
 * runner) — the route's rows arrived at 1.7 s where blocking the Stage module put them at 0.39 s. So the Stage
 * now asks `isKnownSoftwareRasteriser` first and refuses with a name.
 *
 * WHAT THIS PROVES, AND HOW. jsdom has no WebGL2 at all, so `createStage` is mocked to hand back a context whose
 * ONLY behaviour is the renderer string, and `createPresenter` — the first shader work in `start()` — is mocked
 * to record the call and stop. The assertions are then about ORDER: on a software string the presenter is never
 * reached and the context is disposed exactly once; on a hardware string, a hidden string, or with the instrument
 * override set, the presenter IS reached. The gate is the string, not the mock.
 *
 * WHAT IT CANNOT SHOW: that the desk's content actually arrives sooner. That is the measurement in the Stage's
 * own comment, taken in a real browser; jsdom paints nothing.
 */

const H = vi.hoisted(() => ({
  renderer: null as string | null,
  dispose: vi.fn(),
  createPresenter: vi.fn(() => { throw new Error('stop here: fake gl has no shaders'); }),
}));

vi.mock('@lcx/gl/stage.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('@lcx/gl/stage.js')>();
  const gl = {
    getExtension: (name: string) =>
      name === 'WEBGL_debug_renderer_info' && H.renderer !== null ? { UNMASKED_RENDERER_WEBGL: 0x9246 } : null,
    getParameter: (p: number) => (p === 0x9246 ? H.renderer : 0),
  };
  return {
    ...real,
    createStage: () => ({ gl, dispose: H.dispose }),
    isStage: (o: unknown) => !!o && typeof o === 'object' && 'dispose' in (o as object),
  };
});

vi.mock('@lcx/gl/look/present.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@lcx/gl/look/present.js')>()),
  createPresenter: H.createPresenter,
}));

import { Stage } from '@/components/stage/Stage';

const SWIFTSHADER = 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0) (0x0000C0DE)), SwiftShader driver)';
const METAL = 'ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)';
const flag = globalThis as { __LCX_GL_SOFTWARE_OK?: unknown };

function mount() {
  return render(
    <MemoryRouter initialEntries={['/competition']}>
      <Stage />
    </MemoryRouter>,
  );
}
const stateOf = (container: HTMLElement) => container.querySelector('[data-stage]')?.getAttribute('data-stage') ?? null;

beforeEach(() => {
  H.dispose.mockClear();
  H.createPresenter.mockClear();
  delete flag.__LCX_GL_SOFTWARE_OK;
});

describe('the Stage on a software rasteriser', () => {
  it('refuses SwiftShader before a single shader compiles, hands the context back once, hides the canvas, and says why', async () => {
    H.renderer = SWIFTSHADER;
    const { container, unmount } = mount();
    await waitFor(() => expect(stateOf(container)).toBe('refused:SOFTWARE_RASTERISER'), { timeout: 8000 });
    expect(H.createPresenter, 'the presenter is the first shader work in start(); it must never be reached').not.toHaveBeenCalled();
    expect(H.dispose, 'the context is handed straight back').toHaveBeenCalledTimes(1);
    /* `alpha:false` composites an undrawn buffer as opaque black — over the whole desk, behind the content. */
    expect((container.querySelector('canvas') as HTMLCanvasElement).style.display).toBe('none');
    /* The disposer must cope with a teardown that never built anything. */
    expect(() => unmount()).not.toThrow();
    expect(H.dispose, 'and must not dispose the same context twice').toHaveBeenCalledTimes(1);
  });

  it('a hardware renderer string proceeds into the engine — the gate is the string, not the mock', async () => {
    H.renderer = METAL;
    const { container } = mount();
    await waitFor(() => expect(H.createPresenter).toHaveBeenCalledTimes(1), { timeout: 8000 });
    /* The fake context cannot compile anything, so the engine's own failure path takes over from there. */
    await waitFor(() => expect(stateOf(container)).toBe('refused:LOAD_FAILED'), { timeout: 8000 });
    expect(stateOf(container)).not.toBe('refused:SOFTWARE_RASTERISER');
  });

  it('a hidden renderer string keeps the room — "unknown" is hardware on the refusal side', async () => {
    H.renderer = null;
    mount();
    await waitFor(() => expect(H.createPresenter).toHaveBeenCalledTimes(1), { timeout: 8000 });
  });

  it('the instrument override keeps the room under SwiftShader, so the headless harnesses still capture it', async () => {
    flag.__LCX_GL_SOFTWARE_OK = true;
    H.renderer = SWIFTSHADER;
    mount();
    await waitFor(() => expect(H.createPresenter).toHaveBeenCalledTimes(1), { timeout: 8000 });
  });
});
