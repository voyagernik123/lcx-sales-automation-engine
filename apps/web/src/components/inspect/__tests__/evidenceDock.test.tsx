import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { InspectorHost } from '../InspectorHost';
import { EvidencePane } from '../EvidencePane';
import { useSplitViewChord } from '@/hooks/useSplitView';
import { useInspectorStore, useUIStore } from '@/stores';
import { _resetDismiss, dismissStack, pushDismissible } from '@/lib/dismiss';
import { EVIDENCE_PANE_ATTR, SPLIT_MIN_WIDTH } from '@/lib/split';
import { manualFor } from '@/lib/manual';
import { ACTION_MANIFEST } from '@/lib/command/generated/actionManifest';
import type { Principal } from '@/components/command/grammar';

/**
 * `⌘\` at the shell level (T1 #12): the chord, the two mutually exclusive containers, and
 * the breakpoint below which the pane must be ABSENT rather than merely unhelpful.
 *
 * The payload is stubbed for the same reason as in `bdPipelineSplitOwnership.test.tsx` —
 * this file is about the chrome and the chord, and the real payloads read an API.
 */
vi.mock('../InspectorBody', () => ({
  inspectorTitle: () => 'PROJECT',
  InspectorBody: () => <a href="#evidence">the premortem</a>,
}));

/**
 * The shell's arrangement, and it is a MIRROR of `AppLayout` rather than the thing itself:
 * AppLayout needs a router, three stores and an entitlement fetch, none of which this is
 * about. The risk of a mirror is that it drifts from the original and keeps passing —
 * `lib/__tests__/split.test.ts` closes that by asserting AppLayout really does install the
 * chord here, render the pane behind `split.docked`, and pass `docked` to InspectorHost.
 */
function Shell() {
  const split = useSplitViewChord();
  return (
    <>
      <InspectorHost docked={split.docked} />
      {split.docked && <EvidencePane />}
    </>
  );
}

const setWidth = (px: number) =>
  Object.defineProperty(window, 'innerWidth', { value: px, configurable: true, writable: true });

const pane = () => document.querySelector(`[${EVIDENCE_PANE_ATTR}]`);
const drawer = () => screen.queryByRole('dialog', { name: /project/i });

function chord() {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '\\', metaKey: true, bubbles: true, cancelable: true }));
  });
}

beforeEach(() => {
  _resetDismiss();
  setWidth(1440);
  useUIStore.setState({ evidenceDocked: false });
  useInspectorStore.setState({ stack: [{ type: 'project', id: 'p-0' }] });
});

afterEach(() => {
  _resetDismiss();
  useUIStore.setState({ evidenceDocked: false });
  useInspectorStore.setState({ stack: [] });
});

describe('the chord', () => {
  it('⌘\\ moves the evidence from a drawer over the surface to a pane beside it, and back', () => {
    render(<Shell />);
    expect(drawer(), 'the drawer is the undocked default').not.toBeNull();
    expect(pane()).toBeNull();

    chord();
    expect(pane(), '⌘\\ did not dock the evidence').not.toBeNull();
    // MUTUALLY EXCLUSIVE, and this is the assertion that matters: one target on screen
    // twice — once modal over the surface, once docked beside it — would be two
    // inspectors disagreeing about the same object, with a scrim over one of them.
    expect(drawer(), 'the drawer is still up behind the docked pane').toBeNull();

    chord();
    expect(pane()).toBeNull();
    expect(drawer()).not.toBeNull();
  });

  it('one press is one toggle', () => {
    /*
     * The bug the two-hook split exists for: when both `AppLayout` and the `?` manual
     * installed the chord, each listener read the store at press time, so the first flipped
     * false→true and the second read that `true` and flipped it back. One press, no effect,
     * nothing to see. `split.test.ts` counts the call sites; this pins the behaviour a
     * single installation must have.
     */
    render(<Shell />);
    chord();
    expect(useUIStore.getState().evidenceDocked).toBe(true);
    chord();
    expect(useUIStore.getState().evidenceDocked).toBe(false);
  });

  it('docks the evidence that is ALREADY open in a drawer — the natural moment to press it', () => {
    /*
     * THIS FAILED FIRST TIME, and the failure was the design rather than the test. The guard
     * was a flat `if (isOverlayOpen()) return`, and `InspectorDrawer` registers with the
     * dismiss stack — so the chord refused exactly when the operator is looking at the
     * evidence and wants it beside the table. The overlay it stood down for was the thing it
     * exists to move.
     */
    render(<Shell />);
    expect(drawer(), 'this test needs the drawer up to mean anything').not.toBeNull();
    expect(dismissStack(), 'the premise: the universal inspector is exactly one stack entry').toHaveLength(1);
    chord();
    expect(pane(), '⌘\\ refused to dock the drawer it exists to move').not.toBeNull();
  });

  it('stands down for an overlay it is NOT moving', () => {
    // Docking is a change to the layout BEHIND a dialog. Allowing it would reshape a surface
    // the operator cannot see and put the pane under a scrim, where it would look like the
    // chord had done nothing. The `?` manual over the drawer is the live case.
    render(<Shell />);
    act(() => {
      pushDismissible('manual', () => {});
    });
    expect(dismissStack()).toHaveLength(2); // the drawer, then the manual over it
    chord();
    expect(useUIStore.getState().evidenceDocked, '⌘\\ re-laid-out the page behind the manual').toBe(false);
  });

  it('stands down for a page’s OWN drawer, which docking would not move', () => {
    /*
     * `ReadinessStack`, `CompetitorInspector` and `ProductIntelligence` each render an
     * `InspectorDrawer` of their own, outside `useInspectorStore`. The pane cannot show
     * those, so docking behind one would leave the operator's evidence where it was and
     * silently re-lay-out the page underneath.
     */
    useInspectorStore.setState({ stack: [] });
    render(<Shell />);
    act(() => {
      pushDismissible('Wyoming SPDI inspector', () => {});
    });
    chord();
    expect(useUIStore.getState().evidenceDocked).toBe(false);
  });

  it('stands down for an overlay in the DOCKED direction too', () => {
    /*
     * THE ASYMMETRY THAT WAS A LIVE DEFECT, found by the Phase F verifier. Every case above
     * presses the chord from the UNDOCKED side, where `InspectorHost` renders its drawer and
     * that drawer's own dismiss-stack entry is what the "exactly one entry" allowance is for.
     * Docked, the host returns null and the inspector contributes ZERO entries — so the
     * allowance forgave one entry belonging to something else, and `⌘\` UNDOCKED the pane
     * behind the `?` manual's scrim. Reproduced in Chromium before the fix: pane count 1 → 0.
     *
     * Both directions or neither: reshaping a surface the operator cannot see is the same
     * mistake whichever way the layout moves.
     */
    useUIStore.setState({ evidenceDocked: true });
    render(<Shell />);
    expect(pane(), 'this test needs the pane docked to mean anything').not.toBeNull();
    expect(drawer(), 'docked means the host renders no drawer — the premise of the bug').toBeNull();

    act(() => {
      pushDismissible('manual', () => {});
    });
    expect(dismissStack(), 'the manual is the ONLY entry, because the drawer is not rendered').toHaveLength(1);

    chord();
    expect(
      useUIStore.getState().evidenceDocked,
      '⌘\\ undocked the pane behind the ? manual — it re-laid out the desk under a scrim',
    ).toBe(true);
  });

  it("stands down for a page's own drawer in the DOCKED direction too", () => {
    useUIStore.setState({ evidenceDocked: true });
    render(<Shell />);
    act(() => {
      pushDismissible('Wyoming SPDI inspector', () => {});
    });
    chord();
    expect(useUIStore.getState().evidenceDocked, '⌘\\ undocked behind a modal the operator cannot see past').toBe(true);
  });

  it('but still undocks when the pane is the only thing on screen', () => {
    // The other half: the fix must not make the chord one-way. Nothing on the dismiss stack
    // means nothing to stand down for, docked or not.
    useUIStore.setState({ evidenceDocked: true });
    render(<Shell />);
    expect(dismissStack()).toHaveLength(0);
    chord();
    expect(useUIStore.getState().evidenceDocked, '⌘\\ became a one-way trip').toBe(false);
    expect(drawer(), 'undocking lost the evidence instead of returning it to a drawer').not.toBeNull();
  });

  it('is reachable by trackpad in BOTH directions, not just by the chord', async () => {
    /*
     * KEYBOARD-FIRST, NEVER KEYBOARD-ONLY — the programme's constraint, and I had broken it.
     * The pane shipped with an undock button on it and no way IN except `⌘\`, so a trackpad
     * operator could leave the docked mode and never enter or discover it. The drawer now
     * carries a dock button; only `InspectorHost` passes it, because `⌘\` moves the universal
     * inspector and the six surfaces with their own local drawers cannot be docked.
     */
    render(<Shell />);
    const toDock = screen.getByRole('button', { name: /dock the evidence beside the surface/i });
    await act(async () => {
      toDock.click();
    });
    expect(pane(), 'the drawer’s dock button did not dock it').not.toBeNull();

    const toUndock = screen.getByRole('button', { name: /undock the evidence pane/i });
    await act(async () => {
      toUndock.click();
    });
    expect(pane()).toBeNull();
    expect(drawer(), 'undocking by trackpad lost the evidence entirely').not.toBeNull();
  });

  it('offers no dock button at a width where docking cannot happen', () => {
    // A control that does nothing is worse than no control — the same argument the manual
    // makes for omitting the line rather than dimming it.
    setWidth(SPLIT_MIN_WIDTH - 1);
    render(<Shell />);
    expect(screen.queryByRole('button', { name: /dock the evidence beside the surface/i })).toBeNull();
  });

  it('ignores ⌘⇧\\ and ⌘⌥\\, so a fumbled chord does not re-lay out the desk', () => {
    render(<Shell />);
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: '\\', metaKey: true, shiftKey: true, bubbles: true }));
      document.dispatchEvent(new KeyboardEvent('keydown', { key: '\\', metaKey: true, altKey: true, bubbles: true }));
    });
    expect(useUIStore.getState().evidenceDocked).toBe(false);
  });
});

describe('below the breakpoint the split is absent, not merely unhelpful', () => {
  it('the chord does nothing and no pane renders', () => {
    /*
     * A split narrower than this is worse than the drawer it replaces: the surface is left
     * side-scrolling a table to reach the column it is being triaged on. So the answer is
     * absence, not a squeezed pane — and specifically NOT "toggles a preference with no
     * visible effect", because a chord whose only feedback is silence teaches the operator
     * that it is broken.
     */
    setWidth(SPLIT_MIN_WIDTH - 1);
    render(<Shell />);
    chord();
    expect(pane(), 'the pane rendered at a width where it makes the surface unusable').toBeNull();
    expect(drawer(), 'the evidence should still be reachable — as the drawer').not.toBeNull();
  });

  it('a preference set on a wide desk survives a narrow window instead of being forgotten', () => {
    /*
     * The other half of the same decision. The flag is the operator's INTENT; the viewport
     * decides whether it can be honoured. Clearing the intent because a window was briefly
     * narrow would be a second, quieter surprise — the operator widens the window again and
     * their layout is gone.
     */
    setWidth(SPLIT_MIN_WIDTH - 1);
    useUIStore.setState({ evidenceDocked: true });
    const { unmount } = render(<Shell />);
    expect(pane()).toBeNull();
    expect(useUIStore.getState().evidenceDocked, 'the narrow window cleared the operator’s preference').toBe(true);
    unmount();

    setWidth(SPLIT_MIN_WIDTH);
    render(<Shell />);
    expect(pane(), 'the preference did not come back with the width').not.toBeNull();
  });

  it('the manual does not list a key that cannot do anything', () => {
    // The `?` manual's whole job is telling operators the truth about keys, so the ⌘\ line
    // is omitted rather than dimmed at widths where the chord is inert.
    const approver: Principal = {
      role: 'approver',
      entitlements: { sales: 'approve', command: 'approve', intel: 'approve', regulatory: 'approve', distribution: 'approve', governance: 'approve' },
    };
    const base = { stack: dismissStack(), manifest: ACTION_MANIFEST, principal: approver, noun: null, isTerminal: false };
    const narrow = manualFor({ ...base, canSplit: false, evidenceDocked: false }).find((s) => s.title === 'Everywhere')!;
    expect(narrow.entries.some((e) => e.keys.includes('\\'))).toBe(false);

    const wide = manualFor({ ...base, canSplit: true, evidenceDocked: false }).find((s) => s.title === 'Everywhere')!;
    const line = wide.entries.find((e) => e.keys.includes('\\'));
    expect(line, 'the manual is silent about ⌘\\ on a desk where it works').toBeDefined();
    // The one thing about this key that will surprise someone has to be IN the note.
    expect(line!.note).toMatch(/Escape does not close the pane/i);
    expect(line!.what).toMatch(/dock/i);

    // And it says which direction the press goes, read from the live flag rather than
    // described in general — "dock" and "undock" are different sentences.
    const docked = manualFor({ ...base, canSplit: true, evidenceDocked: true }).find((s) => s.title === 'Everywhere')!;
    expect(docked.entries.find((e) => e.keys.includes('\\'))!.what).toMatch(/^Undock/);
  });
});
