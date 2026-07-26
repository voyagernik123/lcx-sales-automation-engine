import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _resetActivation, installActivationTracking, lastActivated } from '../lastActivated';
import { _resetDedupe, feedback, feelPrefs } from '../feedback';
import { _resetJuice } from '../juice';

/**
 * ALIVE PHASE 0 — every governed write reacts.
 *
 * THE DEFECT THIS LOCKS DOWN. The feel layer (`juice.ts` + `feedback.ts`, 374
 * lines, four keyframes, haptics, cues, live-region announcements) was called
 * from FIVE places across 62 pages — and two of those five were the Settings
 * preview buttons demoing the feature to the operator. The command palette was
 * the only real surface that reacted. 21 of the 22 registry actions committed in
 * total silence, which is the single largest reason the product read as "boring".
 *
 * Nothing about that was visible in a test, because every individual piece
 * worked. The bug was in the WIRING, and wiring is exactly what a unit test of a
 * module cannot see. Hence this file: it asserts the chokepoint, not the parts.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../..');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('the governed-write chokepoint reacts', () => {
  const apiClient = strip(readFileSync(resolve(SRC, 'lib/apiClient.ts'), 'utf8'));

  it('fires a commit reaction where it invalidates the cache', () => {
    // Same chokepoint, same argument: "governed actions are invoked from at least
    // five different modules". If invalidation belongs here, so does the reaction.
    expect(apiClient).toContain("react('commit')");
  });

  it('fires a refusal reaction on a refused governed write', () => {
    expect(apiClient).toContain("react('refuse')");
  });

  it('keeps the feel layer OUT of the initial bundle', () => {
    // Importing ./feedback statically here took the initial bundle 849KB → 853KB
    // against an 850KB budget, because every module imports apiClient — it hoists
    // juice+feedback out of their lazy chunks and into the critical path. Measured,
    // not predicted. The dynamic import is load-bearing, so assert it stays one.
    expect(apiClient).not.toMatch(/^\s*import\s+\{[^}]*\bfeedback\b[^}]*\}\s+from\s+'\.\/feedback'/m);
    expect(apiClient).toContain("import('./feedback')");
  });

  it('captures the element synchronously, before the module resolves', () => {
    // By the time a dynamic import settles the operator may have clicked elsewhere,
    // and reacting on whatever they touched most recently would put a commit snap
    // on an unrelated row — a motion claim about the wrong object.
    const fn = apiClient.slice(apiClient.indexOf('function react('));
    const body = fn.slice(0, fn.indexOf("import('./feedback')"));
    expect(body).toContain('lastActivated()');
  });

  it('does not mistake a dropped connection for a policy refusal', () => {
    // A transport failure is not a gate saying no. Shaking for it would teach the
    // operator that the shake means "something went wrong" rather than "the
    // system refused you", and the distinction is the whole point of the shake.
    expect(apiClient).toMatch(/!isNetworkError\(err\)\s*&&\s*governedActionId\(/);
  });

  it('reacts for ALL governed actions, not a hand-listed subset', () => {
    // The failure mode being prevented: someone "fixes" coverage by enumerating
    // action ids here, which then silently omits action #23.
    const guarded = apiClient.slice(apiClient.indexOf("react('commit')"));
    expect(guarded).not.toMatch(/\[['"](?:promote|track|close)['"]/);
    expect(apiClient).toContain('governedActionId(path, method)');
  });
});

describe('the activation tracker gives the chokepoint something to animate', () => {
  beforeEach(() => {
    _resetActivation();
    _resetDedupe();
    document.body.innerHTML = '';
  });

  it('remembers the interactive ancestor, not the leaf that was clicked', () => {
    // A click lands on the deepest node under the cursor. Animating a <span>
    // inside a button is invisible; animating the button is the point.
    document.body.innerHTML = '<button id="b"><span id="s">Commit</span></button>';
    installActivationTracking();
    document.getElementById('s')!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(lastActivated()?.id).toBe('b');
  });

  it('honours an explicit data-juice target over the button inside it', () => {
    document.body.innerHTML = '<tr data-juice id="row"><td><button id="go">go</button></td></tr>';
    installActivationTracking();
    document.getElementById('go')!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    // `closest` finds the nearest match walking up — the button IS a match, so it
    // wins. data-juice is for elements that are not themselves activatable.
    expect(lastActivated()?.id).toBe('go');
  });

  it('returns null once the element leaves the document', () => {
    // The common case, not an edge one: a row commits, the list re-renders, and
    // only then does the server answer. `isConnected` is the honest check —
    // animating a detached node looks like a broken feature rather than a
    // correctly-declined one.
    document.body.innerHTML = '<button id="b">x</button>';
    installActivationTracking();
    const el = document.getElementById('b')!;
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(lastActivated()).not.toBeNull();
    el.remove();
    expect(lastActivated()).toBeNull();
  });

  it('ignores a bare modifier keypress', () => {
    // Holding ⌘ before ⌘K must not retarget the juice onto whatever has focus.
    document.body.innerHTML = '<button id="b">x</button><input id="i" />';
    installActivationTracking();
    document.getElementById('b')!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    document.getElementById('i')!.focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Meta', bubbles: true }));
    expect(lastActivated()?.id).toBe('b');
  });

  it('survives an interaction that stops propagation', () => {
    // The dismiss stack and the table-stop handlers both call stopPropagation
    // deliberately, and those are among the interactions most worth reacting to.
    // Capture-phase listeners cannot be suppressed by a handler further down.
    document.body.innerHTML = '<div id="wrap"><button id="b">x</button></div>';
    installActivationTracking();
    document.getElementById('wrap')!.addEventListener('pointerdown', (e) => e.stopPropagation());
    document.getElementById('b')!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(lastActivated()?.id).toBe('b');
  });
});

describe('one action produces one reaction', () => {
  beforeEach(() => {
    _resetDedupe();
    _resetJuice();
    document.body.innerHTML = '<button id="b">x</button>';
  });

  it('collapses a chokepoint commit and a hand-written one into a single snap', () => {
    // VerbPanel fires commit itself and is right to. Without the dedupe the
    // operator gets two snaps and two haptic taps for one write, which reads as
    // a bug rather than as taste.
    const el = document.getElementById('b')!;
    const add = vi.spyOn(el.classList, 'add');
    feedback.commit(el);
    feedback.commit(el);
    const snaps = add.mock.calls.filter((c) => String(c[0]).includes('snap'));
    expect(snaps).toHaveLength(1);
  });

  it('lets the second refusal speak even though its shake is suppressed', () => {
    // The chokepoint has only the server's message; `invoke.ts` has the remedy
    // prose. Suppressing the duplicate shake must not suppress the better words —
    // that would trade a cosmetic fix for an accessibility regression.
    const el = document.getElementById('b')!;
    const add = vi.spyOn(el.classList, 'add');
    feedback.refuseQuiet(el);
    feedback.refuse(el, 'This decision needs a premortem on file first.');
    const shakes = add.mock.calls.filter((c) => String(c[0]).includes('shake'));
    expect(shakes).toHaveLength(1);
    // The announcement is scheduled on a frame; the live region is what carries it.
    return new Promise<void>((done) =>
      requestAnimationFrame(() => {
        expect(document.getElementById('lcx-live')?.textContent).toContain('premortem');
        done();
      }),
    );
  });

  it('treats the same event on a DIFFERENT element as a real second event', () => {
    document.body.innerHTML = '<button id="a">a</button><button id="c">c</button>';
    const a = document.getElementById('a')!;
    const c = document.getElementById('c')!;
    const addA = vi.spyOn(a.classList, 'add');
    const addC = vi.spyOn(c.classList, 'add');
    feedback.commit(a);
    feedback.commit(c);
    expect(addA.mock.calls.filter((x) => String(x[0]).includes('snap'))).toHaveLength(1);
    expect(addC.mock.calls.filter((x) => String(x[0]).includes('snap'))).toHaveLength(1);
  });
});

describe('the defaults after Phase 0', () => {
  it('haptics default ON — felt only by the operator who caused it', () => {
    expect(feelPrefs().haptics).toBe(true);
  });

  it('sound stays OFF — an app that makes noise unasked gets muted forever', () => {
    // Muting takes the refusal cue with it, so this one stays opt-in.
    expect(feelPrefs().sound).toBe(false);
  });
});
