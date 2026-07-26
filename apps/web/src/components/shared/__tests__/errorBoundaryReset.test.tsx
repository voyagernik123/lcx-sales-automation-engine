import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ErrorBoundary } from '../ErrorBoundary';

/**
 * A CRASH MUST NOT FOLLOW THE OPERATOR TO THE NEXT PAGE.
 *
 * The defect, observed in the shipped Mac app: opening one lead with a malformed
 * website URL threw, this boundary caught it (correct), and then Deal Board,
 * Exchange Gaps, Market Map and Settings all rendered the same "Module Error" —
 * because the boundary wraps the routed outlet and had no way to reset. Only a full
 * reload cleared it. The fallback's own copy, "The rest of the application remains
 * operational", was therefore false at the moment the operator was reading it.
 *
 * `resetKey` (the current pathname, passed by AppLayout) is what makes that sentence
 * true. These tests assert the behaviour, not the wiring, so they still hold if the
 * key becomes something other than a pathname.
 */

function Boom({ fail }: { fail: boolean }) {
  if (fail) throw new Error('"https://reppo foundation" cannot be parsed as a URL.');
  return <p>page content</p>;
}

describe('ErrorBoundary resets when the route changes', () => {
  beforeEach(() => {
    // React logs caught errors to console.error; silence it so the suite output
    // stays readable, and restore afterwards rather than leaking a global stub.
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('shows the fallback when a child throws', () => {
    render(
      <ErrorBoundary resetKey="/bd-pipeline/lead-1">
        <Boom fail />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Module Error')).toBeInTheDocument();
    // The operator sees the real cause, not a generic apology.
    expect(screen.getByText(/cannot be parsed as a URL/)).toBeInTheDocument();
  });

  it('clears itself when resetKey changes — the actual fix', () => {
    const { rerender } = render(
      <ErrorBoundary resetKey="/bd-pipeline/lead-1">
        <Boom fail />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Module Error')).toBeInTheDocument();

    // Navigating away: new route, and the child no longer throws.
    rerender(
      <ErrorBoundary resetKey="/deal-board">
        <Boom fail={false} />
      </ErrorBoundary>,
    );
    expect(screen.queryByText('Module Error')).not.toBeInTheDocument();
    expect(screen.getByText('page content')).toBeInTheDocument();
  });

  it('stays in the fallback on a re-render with the SAME key', () => {
    // Otherwise any parent re-render would clear a genuine error and the operator
    // would see the page flicker between broken and blank.
    const { rerender } = render(
      <ErrorBoundary resetKey="/bd-pipeline/lead-1">
        <Boom fail />
      </ErrorBoundary>,
    );
    rerender(
      <ErrorBoundary resetKey="/bd-pipeline/lead-1">
        <Boom fail={false} />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Module Error')).toBeInTheDocument();
  });

  it('still latches when the new route ALSO throws', () => {
    // Resetting must not become an infinite retry loop: if the next page is broken
    // too, the operator gets the fallback again rather than a blank screen.
    const { rerender } = render(
      <ErrorBoundary resetKey="/a">
        <Boom fail />
      </ErrorBoundary>,
    );
    rerender(
      <ErrorBoundary resetKey="/b">
        <Boom fail />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Module Error')).toBeInTheDocument();
  });

  it('the Retry button clears it without a navigation', () => {
    const { rerender } = render(
      <ErrorBoundary resetKey="/a">
        <Boom fail />
      </ErrorBoundary>,
    );
    screen.getByRole('button', { name: /retry module/i }).click();
    rerender(
      <ErrorBoundary resetKey="/a">
        <Boom fail={false} />
      </ErrorBoundary>,
    );
    expect(screen.getByText('page content')).toBeInTheDocument();
  });
});

describe('the wiring that makes the fallback copy true', () => {
  it('AppLayout passes the pathname as resetKey', async () => {
    // A behavioural test cannot see this from outside, and the promise in the
    // fallback's own words ("the rest of the application remains operational")
    // depends on it, so it is asserted at the source.
    const { readFileSync } = await import('node:fs');
    const { resolve, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const here = dirname(fileURLToPath(import.meta.url));
    const layout = readFileSync(
      resolve(here, '../../layout/AppLayout.tsx'),
      'utf8',
    );
    expect(
      /<ErrorBoundary\s+resetKey=\{location\.pathname\}/.test(layout),
      'AppLayout no longer passes the pathname to ErrorBoundary — a crash on one page will follow the operator to every other page',
    ).toBe(true);
  });
});
