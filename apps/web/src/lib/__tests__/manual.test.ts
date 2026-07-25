import { afterEach, describe, expect, it } from 'vitest';
import { MANUAL_LABEL, manualFor } from '../manual';
import { DESTINATIONS } from '../destinations';
import { _resetDismiss, dismissStack, pushDismissible } from '../dismiss';
import { ACTION_MANIFEST } from '../command/generated/actionManifest';
import type { Principal } from '@/components/command/grammar';

/**
 * The living manual's content (TERMINAL Phase 6).
 *
 * The claim being defended is "every line is derived", and the way that claim dies is
 * quietly: someone adds a seventh workspace, or a governed action, and the manual keeps
 * listing six and twenty-two. A stale manual is worse than no manual, because paper and
 * help text are trusted more than the UI they describe. So the assertions here are
 * mostly of the form "the manual and its source agree", not "the manual says X".
 */

const approver: Principal = {
  role: 'approver',
  entitlements: { sales: 'approve', command: 'approve', intel: 'approve', regulatory: 'approve', distribution: 'approve', governance: 'approve' },
};

afterEach(() => _resetDismiss());

const section = (title: RegExp | string, ctx = base()) =>
  manualFor(ctx).find((s) => (typeof title === 'string' ? s.title === title : title.test(s.title)));

function base() {
  // `stack` is read live from the module here so the existing pushDismissible-based tests
  // keep exercising the real thing; production passes React's subscribed snapshot.
  // `canSplit: false` is the DEFAULT for this fixture on purpose: it is the state of a
  // narrow window, and it keeps every assertion below about a section's exact contents
  // ("the Everywhere section is these N entries") measuring what it was written to
  // measure. The `⌘\\` line has its own tests, which turn it on explicitly.
  return { stack: dismissStack(), manifest: ACTION_MANIFEST, principal: approver, noun: null, isTerminal: false, canSplit: false, evidenceDocked: false };
}

describe('the manual is generated, not written', () => {
  it('lists every destination, so a seventh workspace cannot go undocumented', () => {
    const go = section('Go somewhere')!;
    for (const d of DESTINATIONS) {
      const entry = go.entries.find((e) => e.what === d.label);
      expect(entry, `${d.label} is a destination with no manual line`).toBeTruthy();
      expect(entry!.keys).toEqual(['g', d.key]);
    }
  });

  it('offers the ⌘-digit alternative only in the terminal', () => {
    // ⌘1-9 are reserved by the browser for tab switching and are never delivered to
    // the page, so advertising them in a browser tab would document a key that does
    // nothing — the precise failure this phase is meant to prevent.
    const inBrowser = section('Go somewhere', { ...base(), isTerminal: false })!;
    // Precisely: no per-destination "also ⌘N" line. The trailing explainer DOES
    // mention ⌘ — it exists to say those keys are unavailable in a browser — and a
    // cruder assertion caught that sentence and called it a bug.
    expect(inBrowser.entries.filter((e) => e.note?.startsWith('also ⌘'))).toHaveLength(0);
    expect(inBrowser.entries.at(-1)!.note).toMatch(/only work in the LCX TERMINAL app/i);

    const inTerminal = section('Go somewhere', { ...base(), isTerminal: true })!;
    expect(inTerminal.entries.filter((e) => e.note?.startsWith('also ⌘'))).toHaveLength(DESTINATIONS.length);
  });

  it('explains rather than hides an empty object section', () => {
    const here = manualFor(base())[0];
    // A hidden section reads as a missing feature. An explained one answers the
    // question that made the operator press `?`.
    expect(here.entries).toEqual([]);
    expect(here.emptyNote).toMatch(/Nothing is selected/i);
  });

  it('names the object it is describing', () => {
    const withNoun = manualFor({
      ...base(),
      noun: { type: 'project', id: 'p1', label: 'Acme Chain' },
    })[0];
    expect(withNoun.title).toBe('Acme Chain');
  });

  it('shows blocked verbs WITH their reason, rather than hiding them', () => {
    // The same judgement the command line makes: hiding a capability teaches the
    // operator it does not exist; showing it blocked teaches what to request. "Why
    // can't I do this?" is the question a manual most needs to answer.
    //
    // Subject type matters, and my first attempt at this test got it wrong: no action
    // in the registry accepts a `project` that is also gated (`create_task` and
    // `track` are both open), so the test found zero blocked verbs and looked like a
    // bug in the manual. `command_decision` carries `command_reopen_decision`, which
    // needs BOTH the approver role and the `command` workspace — so a view-only
    // operator is refused on two independent grounds, which is the case worth showing.
    const operatorOnly: Principal = { role: 'operator', entitlements: { command: 'view' } };
    const here = manualFor({
      stack: dismissStack(),
      manifest: ACTION_MANIFEST,
      principal: operatorOnly,
      noun: { type: 'command_decision', id: 'd1', label: 'Launch decision 19' },
      isTerminal: false,
      canSplit: false,
      evidenceDocked: false,
    })[0];
    const blocked = here.entries.filter((e) => e.blocked);
    expect(blocked.length, 'a view-only operator should see something refused').toBeGreaterThan(0);
    for (const e of blocked) expect(e.note, 'a blocked verb with no reason is just a locked door').toBeTruthy();
  });
});

describe('the Escape section reports rather than claims', () => {
  it('says nothing else is open when the manual is the only layer', () => {
    pushDismissible(MANUAL_LABEL, () => {});
    const esc = section(/^Escape$/)!;
    expect(esc.entries).toEqual([]);
    expect(esc.emptyNote).toMatch(/Nothing else is open/i);
  });

  it('never lists itself as a layer to escape from', () => {
    pushDismissible('deal drawer', () => {});
    pushDismissible(MANUAL_LABEL, () => {});
    const esc = section(/Escape closes/)!;
    // Reporting "esc closes: manual" is true and useless — the operator opened this to
    // learn what happens to the thing underneath. The manual's own entry is dropped
    // and the press count offset by one.
    expect(esc.entries[0]).toMatchObject({ keys: ['esc'], what: 'this manual' });
    expect(esc.entries[1]).toMatchObject({ keys: ['esc ×2'], what: 'deal drawer' });
    expect(esc.entries.filter((e) => e.what === MANUAL_LABEL)).toHaveLength(0);
  });

  it('reports the stack top-down, in the order the presses will land', () => {
    pushDismissible('inspector', () => {});
    pushDismissible('snooze menu', () => {});
    pushDismissible(MANUAL_LABEL, () => {});
    const esc = section(/Escape closes/)!;
    expect(esc.entries.map((e) => e.what)).toEqual(['this manual', 'snooze menu', 'inspector']);
  });
});

describe('the everywhere section', () => {
  it('teaches both ways into the manual, and why there are two', () => {
    const everywhere = section('Everywhere')!;
    const bare = everywhere.entries.find((e) => e.keys.join('') === '?');
    const chord = everywhere.entries.find((e) => e.keys.join('') === '⌘/');
    expect(bare, '? must be documented').toBeTruthy();
    // ⌘/ exists because `?` correctly yields to typing — including in the command
    // line's own autofocused search field. Documenting only `?` would leave an
    // operator stuck inside the one surface they most need help with.
    expect(chord, '⌘/ must be documented').toBeTruthy();
    expect(chord!.note).toMatch(/search box|typing/i);
  });

  it('claims the ⌥Space summon only where it exists', () => {
    expect(section('Everywhere', { ...base(), isTerminal: false })!.entries.some((e) => e.keys.includes('⌥'))).toBe(false);
    expect(section('Everywhere', { ...base(), isTerminal: true })!.entries.some((e) => e.keys.includes('⌥'))).toBe(true);
  });
});
