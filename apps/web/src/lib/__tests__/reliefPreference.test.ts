/**
 * THE DECISION TABLE IS A DECISION — dated, owned, and pinned so it cannot drift back to the
 * doctrine it replaced. On 2026-08-20 the owner turned six reliefs on by default after §7(b)
 * was refused as unmeasurable (docs/3d/e9/TRIAL_REFUSED.md). Storm stays off because its feed
 * does not exist — an empty storm shown by default is an absence rendering as a reading.
 *
 * The behavioural pins matter more than the table: a stored `false` must beat a default `true`
 * (the case `||` gets wrong), and a machine refusal must never be remembered as the operator's
 * choice — one lost GL context turning a surface off forever, silently, is precisely the class
 * of quiet lie this programme spent thirteen days rooting out.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  RELIEF_DEFAULT_ON,
  reliefInitiallyOn,
  useReliefPreference,
  type ReliefSurface,
} from '../reliefPreference';
import { scopedKey } from '../persistence';

const ALL: ReliefSurface[] = ['deck', 'globe', 'pipeline', 'orrery', 'surface', 'vault', 'storm'];

beforeEach(() => { localStorage.clear(); });

describe('the decision table, as decided 2026-08-20', () => {
  it('six reliefs default ON; storm alone stays opt-in', () => {
    expect(RELIEF_DEFAULT_ON).toEqual({
      deck: true, globe: true, pipeline: true, orrery: true, surface: true, vault: true,
      storm: false,
    });
  });

  it('covers every surface exactly once — a new surface must take a position here', () => {
    expect(Object.keys(RELIEF_DEFAULT_ON).sort()).toEqual([...ALL].sort());
  });
});

describe('the stored choice outranks the table, in BOTH directions', () => {
  it('a stored false beats a default true — the case `||` gets wrong', () => {
    localStorage.setItem(scopedKey('relief:pipeline'), 'false');
    expect(reliefInitiallyOn('pipeline')).toBe(false);
  });

  it('a stored true beats a default false', () => {
    localStorage.setItem(scopedKey('relief:storm'), 'true');
    expect(reliefInitiallyOn('storm')).toBe(true);
  });
});

describe('the hook', () => {
  it('reports the default ON only after hydration — a server render never sees it', async () => {
    // renderHook runs effects, so `on` is true by the time we can observe it; the pre-effect
    // state is pinned by reliefFallback.test.tsx's SSR census, which renders with NO effects
    // and asserts zero canvases. Here: the post-hydration value matches the table.
    const { result } = renderHook(() => useReliefPreference('deck'));
    expect(result.current.on).toBe(true);
  });

  it('choose() persists; a fresh mount starts from the remembered choice', () => {
    const first = renderHook(() => useReliefPreference('vault'));
    act(() => first.result.current.choose(false));
    expect(first.result.current.on).toBe(false);
    first.unmount();
    const second = renderHook(() => useReliefPreference('vault'));
    expect(second.result.current.on).toBe(false);
  });

  it('revoke() turns the surface off WITHOUT recording a preference', () => {
    const { result, unmount } = renderHook(() => useReliefPreference('orrery'));
    act(() => result.current.revoke());
    expect(result.current.on).toBe(false);
    /* The whole point: nothing was written, so the next visit retries from the real default
       rather than inheriting one bad afternoon's lost context as a permanent choice. */
    expect(localStorage.getItem(scopedKey('relief:orrery'))).toBeNull();
    unmount();
    const again = renderHook(() => useReliefPreference('orrery'));
    expect(again.result.current.on).toBe(true);
  });

  it('a choice made, revoked by the machine, is still the choice next mount', () => {
    const first = renderHook(() => useReliefPreference('globe'));
    act(() => first.result.current.choose(true));
    act(() => first.result.current.revoke());
    expect(first.result.current.on).toBe(false);
    first.unmount();
    expect(reliefInitiallyOn('globe')).toBe(true);
  });
});
