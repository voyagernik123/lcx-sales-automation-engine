import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ForgeBackdrop } from '../ForgeBackdrop';
import { ForgePlate } from '../ForgePlate';

/**
 * E8 ON THE FRONT DOOR — and the two properties that make that defensible.
 *
 * Sign-in is the one screen every operator and every stranger passes through, so a renderer here
 * has less margin for error than anywhere else in the platform. What makes it safe is not that the
 * renderer is good. It is that NOTHING on the screen depends on it, and that its cost is not paid
 * until after the screen is usable.
 *
 * jsdom has no WebGL2 at all, so these tests exercise the exact path a machine without it takes —
 * which is the path that actually matters.
 */

describe('the plate is eager, cheap, and cannot fail', () => {
  it('paints a gradient with no JavaScript beyond a div', () => {
    /* Ten lines of CSS, no dependencies. It is the permanent fallback for server render, print, no
       WebGL2 and a refused float target — and it cannot fail because there is nothing in it to
       fail. It is also what covers the frame before the renderer chunk has been fetched. */
    const { container } = render(<ForgePlate />);
    expect(container.querySelector('div[style*="radial-gradient"]')).not.toBeNull();
  });

  it('is scenery: aria-hidden and click-through', () => {
    const { container } = render(<ForgePlate />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.getAttribute('aria-hidden')).toBe('true');
    expect(el.className).toContain('pointer-events-none');
  });

  it('sits BELOW the renderer in the stack', () => {
    // -z-20 against the renderer's -z-10. If these ever invert, the plate covers the GL frame and
    // the whole layer silently stops being visible while every test still passes.
    const { container } = render(<ForgePlate />);
    expect((container.firstElementChild as HTMLElement).className).toContain('-z-20');
  });
});

describe('the renderer degrades without WebGL2 instead of breaking', () => {
  it('hides its canvas until a frame has actually been drawn', () => {
    /* display:none until ready. An unpainted canvas would put a black rectangle over the plate,
       which is worse than not having the layer at all. */
    const { container } = render(<ForgeBackdrop />);
    const canvas = container.querySelector('canvas');
    expect(canvas).not.toBeNull();
    expect(canvas?.style.display).toBe('none');
  });

  it('renders no gradient of its own — the plate owns that', () => {
    // Duplicating the gradient in both files is how they drift apart, and a drifted fallback shows
    // as a visible colour step the moment the renderer refuses.
    const { container } = render(<ForgeBackdrop />);
    expect(container.querySelector('div[style*="radial-gradient"]')).toBeNull();
  });

  it('is scenery: aria-hidden and click-through', () => {
    const { container } = render(<ForgeBackdrop />);
    const host = container.firstElementChild as HTMLElement;
    expect(host.getAttribute('aria-hidden')).toBe('true');
    expect(host.className).toContain('pointer-events-none');
  });

  it('unmounts without throwing, so a route change cannot leak a GL context', () => {
    // Sixty leaked contexts exhaust an 8 GB M1. The cleanup path has to survive a REFUSAL too,
    // where there is no stage to dispose — which is exactly the jsdom case.
    const { unmount } = render(<ForgeBackdrop />);
    expect(() => unmount()).not.toThrow();
  });
});

describe('and it is actually MOUNTED on the sign-in route', () => {
  it('SelectOperator renders the plate behind its card', async () => {
    /* Asserting on a component in isolation proves nothing about whether anyone mounted it. This is
       the test that catches "built it, forgot to wire it" — which happened to W5 in this repo,
       where a finished component sat unreferenced.
       The PLATE is asserted rather than the renderer, because the renderer is lazy and so is not
       present on the first synchronous render. That is the intended behaviour, not a gap. */
    vi.stubGlobal('__APP_VERSION__', '0.0.0-test');
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
      matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn(),
    }));
    const { SelectOperator } = await import('@/pages/SelectOperator');
    const { container } = render(<MemoryRouter><SelectOperator /></MemoryRouter>);
    expect(screen.getByText(/Sign in to the desk/i)).toBeInTheDocument();
    expect(
      container.querySelector('div[style*="radial-gradient"]'),
      'the sign-in screen must mount ForgePlate',
    ).not.toBeNull();
  });

  it('and the sign-in form is usable with the renderer absent', async () => {
    // The point of the whole arrangement: the front door works when the GL layer does not.
    vi.stubGlobal('__APP_VERSION__', '0.0.0-test');
    const { SelectOperator } = await import('@/pages/SelectOperator');
    render(<MemoryRouter><SelectOperator /></MemoryRouter>);
    expect(screen.getByRole('button', { name: /sign in/i })).toBeEnabled();
  });
});
