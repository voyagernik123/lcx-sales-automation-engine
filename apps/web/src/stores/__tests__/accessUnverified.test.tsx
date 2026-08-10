import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import { WORKSPACES } from '@lcx/shared';
import { useAccessStore, useCan, useMyWorkspaces, useAccessUnverified } from '../useAccessStore';
import { AccessUnverifiedBanner } from '@/components/layout/AccessUnverifiedBanner';
import type { AccessMe } from '@/lib/api/access';

/**
 * THE EMPTY WORKSPACE LAUNCHER, AND WHY THE OBVIOUS FIX WOULD HAVE BEEN WORSE.
 *
 * On 2026-08-10 `/v1/access/me` 500'd on an unreachable grants table, `me` stayed null, and
 * `useMyWorkspaces()` returned `[]` — the operator signed in and was shown no compartments at
 * all. The server fix makes the route answer with an EMPTY entitlement map plus an explicit
 * `entitlementsUnavailable`.
 *
 * Reading that empty map strictly on the client would have traded one lie for its mirror
 * image: instead of "you belong to nothing" the shell would say "you are not entitled to
 * anything", on every route, when the truth is that nobody knows. Three states, never
 * collapsed — a grant, no grant, and NOT KNOWN — and the third one has to be visible or the
 * optimistic shell becomes a different kind of dishonesty.
 */

const meWith = (over: Partial<AccessMe>): AccessMe => ({
  memberId: 'nik',
  role: 'approver',
  entitlements: {},
  profile: null,
  workspaces: WORKSPACES.map((w) => ({
    id: w.id, name: w.name, mission: w.mission, icon: w.icon,
    defaultLanding: w.defaultLanding, sensitivity: w.sensitivity,
  })),
  dbLive: true,
  ...over,
});

const UNAVAILABLE = { code: 'ENETUNREACH', reason: 'The access database is unreachable, so your grants could not be read.' };

beforeEach(() => {
  useAccessStore.setState({ me: null, loaded: false, activeWorkspace: null });
});

describe('grants unknown is not the same as grants absent', () => {
  it('useMyWorkspaces shows the compartments instead of returning [] — the empty launcher', () => {
    useAccessStore.setState({
      me: meWith({ entitlements: {}, entitlementsUnavailable: UNAVAILABLE, dbLive: false }),
      loaded: true,
    });
    const { result } = renderHook(() => useMyWorkspaces());
    expect(result.current.length).toBe(WORKSPACES.length);
  });

  it('useCan stays optimistic, so an outage cannot lock an operator out of their own desk', () => {
    /* The store's own docstring: it "only shapes the shell" and the API is the enforcer. A
       client-side lockout adds no security and removes the whole application. */
    useAccessStore.setState({
      me: meWith({ entitlements: {}, entitlementsUnavailable: UNAVAILABLE, dbLive: false }),
      loaded: true,
    });
    const { result } = renderHook(() => useCan('sales', 'view'));
    expect(result.current).toBe(true);
  });

  it('but it does NOT go optimistic when the grants were read successfully', () => {
    // The whole point of the flag: it changes behaviour only in the unknown state. If a real
    // empty map started granting access, this fix would be a hole.
    useAccessStore.setState({ me: meWith({ entitlements: {} }), loaded: true });
    const { result } = renderHook(() => useCan('sales', 'view'));
    expect(result.current).toBe(false);
  });

  it('and a successfully-read map is still filtered exactly as before', () => {
    useAccessStore.setState({
      me: meWith({ entitlements: { [WORKSPACES[0]!.id]: 'operate' } }),
      loaded: true,
    });
    const { result } = renderHook(() => useMyWorkspaces());
    expect(result.current.map((w) => w.id)).toEqual([WORKSPACES[0]!.id]);
  });

  it('useAccessUnverified reports null when the grants are known', () => {
    useAccessStore.setState({ me: meWith({ entitlements: { sales: 'view' } }), loaded: true });
    const { result } = renderHook(() => useAccessUnverified());
    expect(result.current).toBeNull();
  });
});

describe('the operator is TOLD, rather than left to infer it from a suspiciously full sidebar', () => {
  it('names the reason and carries the driver code', () => {
    useAccessStore.setState({
      me: meWith({ entitlementsUnavailable: UNAVAILABLE, dbLive: false }),
      loaded: true,
    });
    render(<AccessUnverifiedBanner />);
    expect(screen.getByText(/Access unverified/i)).toBeInTheDocument();
    expect(screen.getByText(/unreachable/i)).toBeInTheDocument();
    // The code is what distinguishes the causes for whoever fixes it.
    expect(screen.getByText(/ENETUNREACH/)).toBeInTheDocument();
  });

  it('says explicitly that being shown a compartment is not the same as holding it', () => {
    /* Without this sentence the fix is a confident-looking lie in the opposite direction:
       every compartment on screen, nothing saying it is a guess. */
    useAccessStore.setState({
      me: meWith({ entitlementsUnavailable: UNAVAILABLE, dbLive: false }),
      loaded: true,
    });
    render(<AccessUnverifiedBanner />);
    expect(screen.getByText(/not because you hold them/i)).toBeInTheDocument();
    expect(screen.getByText(/server still checks/i)).toBeInTheDocument();
  });

  it('renders nothing at all when access is verified', () => {
    useAccessStore.setState({ me: meWith({ entitlements: { sales: 'view' } }), loaded: true });
    const { container } = render(<AccessUnverifiedBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing before the first load resolves', () => {
    const { container } = render(<AccessUnverifiedBanner />);
    expect(container).toBeEmptyDOMElement();
  });
});
