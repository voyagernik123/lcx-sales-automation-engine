import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CheatCard, cheatCard, pressLabel, type Binding, type Press } from '../CheatCard';
import { DESTINATIONS } from '@/lib/destinations';
import { ACTION_MANIFEST, MANIFEST_HASH } from '@/lib/command/generated/actionManifest';
import { GO_IDLE, stepGoGrammar } from '@/lib/navGrammar';
import { isCommandChord } from '@/lib/keyboard';
import { _resetDismiss, pushDismissible } from '@/lib/dismiss';
import { useManual } from '@/hooks/useManual';
import { useSplitViewChord } from '@/hooks/useSplitView';
import { useUIStore } from '@/stores';
import { useListNavigation } from '@/hooks/useListNavigation';
import { SessionMode } from '@/components/queue/SessionMode';
import type { QueueLead } from '@/lib/api/queue';

/**
 * The ratchet that keeps the printed card true (TERMINAL Phase 6).
 *
 * A cheat card on a wall is the only artefact in this app that cannot be corrected
 * after it ships: nobody re-reads paper to check whether it is still right, they act
 * on it. So a stale card is worse than no card, and "stale" here has exactly two
 * shapes — a key the card MISSES because someone added one, and a key the card CLAIMS
 * that nothing binds any more. There is a test below for each.
 *
 * Both read the source modules off disk rather than importing them, and strip comments
 * first, for the reason focusVisible.test.ts records: a rule that cannot tell code from
 * writing about code gets silenced instead of obeyed. navGrammar.ts, dismiss.ts and the
 * Rust menu all discuss these very keys in prose at length, and every one of those
 * paragraphs would otherwise satisfy the check on its own.
 */

const SRC = join(__dirname, '..', '..');
const REPO_WEB = join(SRC, '..');

/**
 * Where each `Press.from` resolves to. The card declares provenance per key; this is
 * the other half of the contract.
 */
const BINDING_FILES: Record<Exclude<Binding, 'destinations'>, string> = {
  navGrammar: join(SRC, 'lib', 'navGrammar.ts'),
  keyboard: join(SRC, 'lib', 'keyboard.ts'),
  listNav: join(SRC, 'hooks', 'useListNavigation.ts'),
  session: join(SRC, 'components', 'queue', 'SessionMode.tsx'),
  dismiss: join(SRC, 'lib', 'dismiss.ts'),
  manual: join(SRC, 'hooks', 'useManual.ts'),
  split: join(SRC, 'hooks', 'useSplitView.ts'),
  // The one binding site no compiler can see from here: apps/desktop builds
  // separately, which is the same reason destinations.test.ts reads it.
  nativeMenu: join(REPO_WEB, '..', 'desktop', 'src-tauri', 'src', 'lib.rs'),
};

/** Verbatim from focusVisible.test.ts — judge what the module DOES, not what it says. */
function codeOnly(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => {
      const t = line.trim();
      return !t.startsWith('//') && !t.startsWith('*');
    })
    .join('\n');
}

const code = (file: string): string => codeOnly(readFileSync(file, 'utf8'));

/**
 * Resolve a `Press.from` to the file that must contain the key.
 *
 * Explicit rather than an index lookup, because the failure this replaces was a
 * `readFileSync(undefined)` stack trace — a message about the "path" argument, from a
 * test whose entire job is to tell you the card has drifted. Adding a section with a
 * new binding source is a NORMAL thing to do; being told which map to extend is the
 * whole value of the check. The typed Record already makes this unreachable through
 * TypeScript, so this guard exists for the moment when it isn't.
 */
function bindingFile(from: Exclude<Binding, 'destinations'>): string {
  const file = BINDING_FILES[from];
  if (!file) {
    throw new Error(
      `unknown binding source "${from}" — add it to BINDING_FILES in ` +
        'src/pages/__tests__/cheatCard.test.tsx, pointing at the module that binds the key.',
    );
  }
  return file;
}

function allPresses(): Press[] {
  return cheatCard().flatMap((s) => s.rows.flatMap((r) => r.chords.flat()));
}

/**
 * Does the module named in `from` still SPELL this key?
 *
 * Webview bindings all spell the key as a quoted `KeyboardEvent.key` literal —
 * `case 'ArrowDown':`, `e.key === 'g'`, `e.key !== 'Escape'` — so one quoted-literal
 * search covers every TypeScript module without the test needing to know each one's
 * control flow. It is the cheap half of the check, and it is the half that ties a
 * press to a FILE: `Press.from` is a provenance claim, and provenance is what makes
 * the card auditable rather than merely correct today.
 *
 * `destinations` is a table, not a keyboard handler, so it is checked against the
 * table. `nativeMenu` spells accelerators in Rust, so it has no quoted `key` literal
 * to find and its whole check lives in `CLAIMS` below.
 */
function spellsKey(press: Press): boolean {
  if (press.from === 'destinations') return DESTINATIONS.some((d) => d.key === press.key);
  if (press.from === 'nativeMenu') return true;
  const src = code(bindingFile(press.from));
  /*
   * THE ONE KEY WHOSE RAW VALUE IS NOT ITS SOURCE SPELLING. `Press.key` stores the literal
   * `KeyboardEvent.key`, which for ⌘\ is a single backslash — and no TypeScript file can
   * contain `'\'`, because that is an unterminated escape. `hooks/useSplitView.ts` spells it
   * `'\\'`, as it must. The quoted-literal search therefore reported the ⌘\ row as unbound
   * the first time it was added, which is the check being right about the mechanism and wrong
   * about the key; both spellings are accepted rather than the card storing a pre-escaped
   * value that `pressLabel` would then have to un-escape for print.
   */
  return src.includes(`'${press.key}'`) || src.includes(`'${JSON.stringify(press.key).slice(1, -1)}'`);
}

/* ── The modifier half ───────────────────────────────────────────────────────
 * WHAT THIS FIXES, AND IT WAS BAD. Until Phase 7 the check above WAS the whole
 * check for a webview press, and it never looked at `press.mod`. MEASURED: flip the
 * modifier on all 24 webview presses — every bare key to ⌘, every ⌘ to ⌥ — and
 * 24/24 still validated, because `'k'` is spelled in keyboard.ts whether the card
 * prints K or ⌘K or ⌥K. Only the `nativeMenu` branch read the modifier at all. So
 * the card could have told an operator ⌥K while the app bound ⌘K and the guard
 * would have passed — on the one surface whose entire job is being trustworthy
 * enough to print and stick on a wall.
 *
 * A grep cannot fix this. `useManual` spells `'?'` and `'/'` in the same twenty
 * lines, one bare and one behind ⌘, and no line-scoped heuristic tells them apart
 * without encoding each module's control flow into this file — which is the kind of
 * check that fails on a refactor and gets deleted.
 *
 * So the modifier is compared BEHAVIOURALLY: build the real KeyboardEvent the card
 * describes, hand it to the module the card names, and ask whether the module CLAIMS
 * it. Claiming is the one signal every binding here has in common — each calls
 * `preventDefault()` when it acts (`stepGoGrammar` returns it as `claim`), which is
 * precisely the assertion "this chord belongs to me and not to the browser".
 *
 * This is strictly stronger than a modifier-aware grep would have been: it also
 * proves the module reaches the key at all, rather than merely mentioning it.
 */

function keyEvent(press: Press): KeyboardEvent {
  return new KeyboardEvent('keydown', {
    key: press.key,
    metaKey: press.mod === 'meta',
    altKey: press.mod === 'alt',
    bubbles: true,
    cancelable: true,
  });
}

/**
 * Dispatch at a target and report whether anything claimed the press.
 *
 * Inside `act` because a claimed key usually sets state (the manual opens, the session
 * advances), and an unwrapped update buries the one line this test exists to print
 * under a screenful of React warnings. A guard whose failure message cannot be found
 * is a guard nobody acts on.
 */
function claimedOn(target: EventTarget, press: Press): boolean {
  const e = keyEvent(press);
  act(() => {
    target.dispatchEvent(e);
  });
  return e.defaultPrevented;
}

/** Minimum viable lead — SessionMode's letter grammar is inert without one. */
const PROBE_LEAD: QueueLead = {
  id: 'probe-1',
  name: 'Probe Co',
  ticker: null,
  website: null,
  source: 'probe',
  chain: null,
  jurisdiction: null,
  category: null,
  listedOnLcx: null,
  euScore: 0,
  usPreScore: 0,
  usPostScore: 0,
  band: 'watch',
  peopleCount: 0,
  verifiedContactCount: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  hasContact: false,
  marketTag: null,
};

function ManualProbe() {
  useManual();
  return null;
}

/**
 * `⌘\`. The chord refuses below `SPLIT_MIN_WIDTH`, so the probe has to stand on a wide desk
 * or it would report the key as unbound for a reason the card is not claiming anything about.
 * jsdom's `window.innerWidth` is 1024 and its `matchMedia` is undefined, so the width is the
 * only input — see `useEvidenceDock`.
 */
function SplitProbe() {
  useSplitViewChord();
  return null;
}

function ListNavProbe() {
  const nav = useListNavigation({ count: 3, onActivate: () => {} });
  return (
    <div data-testid="probe-list" {...nav.containerProps}>
      {[0, 1, 2].map((i) => (
        <div key={i} {...nav.rowProps(i)} />
      ))}
    </div>
  );
}

/** Regex-safe: destination keys are digits but `[` and `]` are not. */
const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Per-binding: does this module claim exactly this chord?
 *
 * A `Record` over the union rather than a lookup with a fallback, so adding a
 * `Binding` is a type error here instead of a press that silently validates.
 *
 * Every probe resets the dismiss stack first. `stepGoGrammar` and `useListNavigation`
 * both go quiet while an overlay is up (correctly — typing `g` inside a dialog must
 * not navigate the page out from under it), so a leaked stack entry from an earlier
 * probe would make those two report "not bound" for reasons that have nothing to do
 * with the card.
 */
const CLAIMS: Record<Binding, (press: Press) => boolean> = {
  // The `g` prefix itself: does this press arm the grammar?
  navGrammar: (p) => {
    _resetDismiss();
    return stepGoGrammar(GO_IDLE, keyEvent(p), 0).claim;
  },
  // The second key of the sequence, with `g` already down. Deliberately routed
  // through the grammar rather than read out of DESTINATIONS: the digit's modifier
  // is only meaningful in terms of what the reducer does with it, and the reducer
  // disarms on any modifier — so ⌥2 can never complete a `g` sequence.
  destinations: (p) => {
    _resetDismiss();
    return stepGoGrammar({ armed: true, armedAt: 0 }, keyEvent(p), 0).go?.key === p.key;
  },
  keyboard: (p) => isCommandChord(keyEvent(p)),
  split: (p) => {
    _resetDismiss();
    const width = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', { value: 1440, configurable: true, writable: true });
    useUIStore.setState({ evidenceDocked: false });
    const view = render(<SplitProbe />);
    try {
      return claimedOn(document, p);
    } finally {
      view.unmount();
      useUIStore.setState({ evidenceDocked: false });
      Object.defineProperty(window, 'innerWidth', { value: width, configurable: true, writable: true });
    }
  },
  manual: (p) => {
    _resetDismiss();
    const view = render(<ManualProbe />);
    try {
      return claimedOn(document, p);
    } finally {
      view.unmount();
    }
  },
  dismiss: (p) => {
    _resetDismiss();
    // Escape with an empty stack is correctly a no-op, so the probe has to be
    // standing in front of something dismissible for the question to mean anything.
    pushDismissible('probe', () => {});
    try {
      return claimedOn(document, p);
    } finally {
      _resetDismiss();
    }
  },
  listNav: (p) => {
    _resetDismiss();
    const view = render(<ListNavProbe />);
    try {
      // fireEvent returns false when the handler called preventDefault.
      return !fireEvent.keyDown(view.getByTestId('probe-list'), {
        key: p.key,
        metaKey: p.mod === 'meta',
        altKey: p.mod === 'alt',
      });
    } finally {
      view.unmount();
    }
  },
  session: (p) => {
    _resetDismiss();
    const view = render(
      <SessionMode
        leads={[PROBE_LEAD]}
        splitLabel="probe"
        clarityEnacted={false}
        onClose={() => {}}
        onSnooze={async () => true}
        onDisqualify={async () => true}
        onEnroll={async () => true}
        onOpen={() => {}}
      />,
    );
    try {
      // SessionMode listens on `window`, not `document` — dispatching at the
      // document would also reach lib/dismiss and attribute its claim to this
      // module. Same reason each probe mounts fresh: `s`/`d`/`e` open sub-dialogs,
      // and an open sub-dialog makes the module stop claiming letters.
      return claimedOn(window, p);
    } finally {
      view.unmount();
      _resetDismiss();
    }
  },
  /**
   * The other side of this comparison is Rust, and apps/desktop builds separately —
   * so it is read as text, the way destinations.test.ts reads it. No behavioural
   * probe is possible from here, and that is the honest limit of this ratchet: it
   * proves the menu DECLARES the accelerator, not that Tauri delivers it.
   *
   * The ALT rule is one expression rather than the two file-wide greps it replaces
   * (`Modifiers::ALT` anywhere && `Code::<key>` anywhere), which would have accepted
   * ⌥ paired with any key the file happened to mention elsewhere.
   */
  nativeMenu: (p) => {
    const src = code(bindingFile('nativeMenu'));
    if (p.mod === 'alt') {
      return new RegExp(`Shortcut::new\\(\\s*Some\\(Modifiers::ALT\\)\\s*,\\s*Code::${esc(p.key)}\\s*\\)`).test(src);
    }
    if (p.mod === 'meta') return src.includes(`CmdOrCtrl+${p.key}`);
    // Every accelerator in the menu carries a modifier. A bare one would be a
    // native menu item stealing a letter from the webview's own grammar.
    return false;
  },
};

const claims = (press: Press): boolean => CLAIMS[press.from](press);

describe('the printable cheat card', () => {
  /**
   * THE ANTI-STALENESS ASSERTION. Adding a seventh workspace to DESTINATIONS must fail
   * a test, not silently print a card that is missing a row — the operator has no way
   * to tell an incomplete card from a complete one, and the paper is what they trust.
   *
   * It checks the destination three ways on purpose: the label (so the row exists), the
   * `g` chord, and the ⌘ mirror. A row that rendered its label but lost one of its two
   * chords is exactly the half-broken state a label-only check would pass.
   */
  it('prints every destination, with both of its chords', () => {
    render(<CheatCard />);
    const chips = screen.getAllByText((_, el) => el?.tagName === 'KBD').map((el) => el.textContent);

    expect(DESTINATIONS.length).toBeGreaterThan(0);
    for (const d of DESTINATIONS) {
      expect(screen.getByText(d.label), `${d.label} is a destination with no row on the card`).toBeInTheDocument();
      // `renderChord` upper-cases a single character (CheatCard.tsx:103), which is
      // invisible for the digit keys and load-bearing for the letter keys the GPS
      // desks use.
      const printed = d.key.length === 1 ? d.key.toUpperCase() : d.key;
      expect(chips, `${d.label}: the g-chord key ${printed} is not on the card`).toContain(printed);
      // THE ⌘ MIRROR IS ASSERTED ONLY WHERE THE NATIVE MENU BINDS ONE. Compartment
      // roots have ⌘<digit>; desks inside a compartment (`withinWorkspace`) do not,
      // and the card must not print a chord the menu never claimed — the assertion
      // below it in this file would catch that, and this is the same rule stated
      // from the side that decides what to draw.
      if (d.withinWorkspace) {
        expect(chips, `${d.label} has no ⌘ accelerator; the card must not invent one`)
          .not.toContain(`⌘${printed}`);
      } else {
        expect(chips, `${d.label}: the ⌘${printed} mirror is not on the card`).toContain(`⌘${printed}`);
      }
    }
  });

  /**
   * THE OTHER DIRECTION: nothing may appear as a key on the card unless a source module
   * still binds it.
   *
   * Deliberately scoped to `<kbd>` chips rather than to all the card's text. Chips are
   * the load-bearing claims — an operator presses those, and a chip that no longer works
   * is the failure that destroys trust in the whole card. The prose is prose: the
   * footnote about a browser reserving ⌘0-9 for its tabs is a true sentence containing
   * something chord-shaped, and a check that flagged it would be a check somebody
   * deletes. Reviewers can read six footnotes; nobody can review 21 chips by eye every
   * time the grammar moves.
   */
  it('claims no key that its named module does not bind', () => {
    // Every press is checked before anything is reported, including the ones that throw
    // for an unresolvable source: a card that has drifted has usually drifted in more
    // than one place, and stopping at the first means as many runs as there are faults.
    const problems: string[] = [];
    for (const p of allPresses()) {
      try {
        if (!spellsKey(p)) {
          problems.push(`${pressLabel(p)} — declared from '${p.from}', which no longer spells ${JSON.stringify(p.key)}`);
        }
      } catch (err) {
        problems.push(`${pressLabel(p)} — ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    expect(problems, problems.join('\n')).toEqual([]);
  });

  /**
   * THE MODIFIER, which until Phase 7 nothing compared for a webview press.
   *
   * Two assertions per press, and the second is the one that catches a printed
   * modifier that is merely decorative:
   *
   *  SUFFICIENT — the module claims the chord exactly as printed. Flip ⌘K to ⌥K, or
   *    bare G to ⌘G, and the module stops claiming it.
   *
   *  NECESSARY — for a press that prints a modifier, the same key WITHOUT it must NOT
   *    be claimed. Some handlers ignore modifiers entirely (lib/dismiss takes any
   *    Escape; useListNavigation takes any ArrowDown), so sufficiency alone would let
   *    the card print ⌘esc and pass. An operator reading ⌘esc would conclude bare
   *    Escape does nothing, which is the opposite of true.
   */
  it('claims no MODIFIER its named module does not require', () => {
    const problems: string[] = [];
    for (const p of allPresses()) {
      const printed = pressLabel(p);
      try {
        if (!claims(p)) {
          problems.push(
            `${printed} — '${p.from}' does not claim that chord. The card prints ` +
              `${p.mod ? `${printed} but the module may bind the bare key` : `a bare ${printed} but the module may want a modifier`}.`,
          );
          continue;
        }
        if (p.mod && claims({ ...p, mod: undefined })) {
          problems.push(
            `${printed} — '${p.from}' claims a bare ${p.key} too, so the printed modifier is ` +
              `not required. The card overstates what the operator has to press.`,
          );
        }
      } catch (err) {
        problems.push(`${printed} — ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    expect(problems, problems.join('\n')).toEqual([]);
  });

  /**
   * ANTI-VACUITY, because the check above is only worth what its probes are worth.
   *
   * A probe that returned `true` unconditionally — a mounted component that never
   * unmounted, a `defaultPrevented` read off the wrong event — would make the
   * modifier assertion pass on any card at all, and it would pass quietly forever.
   * So every probe is shown rejecting something: a key nothing binds, in each of the
   * three modifier states.
   */
  it('its probes can say no — no binding claims a key nothing binds', () => {
    const froms = Object.keys(CLAIMS) as Binding[];
    const wrong: string[] = [];
    for (const from of froms) {
      for (const mod of [undefined, 'meta', 'alt'] as const) {
        // F7 is bound nowhere in this app, on any surface, with any modifier.
        const press: Press = { key: 'F7', mod, from };
        if (claims(press)) wrong.push(`${from} claims ${pressLabel(press)}, which nothing binds — the probe is vacuous`);
      }
    }
    expect(wrong, wrong.join('\n')).toEqual([]);
  });

  it('has modifiers to compare in the first place', () => {
    // If a refactor ever left the card with no modified chord on it, the assertion
    // above would still pass — on nothing. This says out loud what it depends on.
    const presses = allPresses();
    expect(presses.filter((p) => p.mod).length, 'no press on the card carries a modifier').toBeGreaterThan(0);
    expect(presses.filter((p) => !p.mod).length, 'every press on the card carries a modifier').toBeGreaterThan(0);
  });

  it('renders exactly the chips it declares — no chip is hand-typed into the JSX', () => {
    render(<CheatCard />);
    const rendered = screen
      .getAllByText((_, el) => el?.tagName === 'KBD')
      .map((el) => el.textContent)
      .sort();
    const declared = allPresses().map(pressLabel).sort();
    // Multiset equality both ways: a surplus chip is an unproven claim, a missing one
    // is a row that lost its keys. Neither is visible on screen at a glance.
    expect(rendered).toEqual(declared);
  });

  it('has no literal key text inside a <kbd> in its source', () => {
    // The previous test compares the CARD to its own data, so it cannot notice a chip
    // that was typed straight into the markup AND added to the data. This one closes
    // that door: every chip's text must come from `pressLabel`.
    const src = readFileSync(join(SRC, 'pages', 'CheatCard.tsx'), 'utf8');
    const offenders = [...src.matchAll(/<kbd\b[^>]*>([\s\S]*?)<\/kbd>/g)]
      .map((m) => m[1].trim())
      .filter((inner) => !inner.startsWith('{'));
    expect(offenders, `hand-typed <kbd> content: ${offenders.join(' | ')}`).toEqual([]);
  });

  it('reports the manifest it was generated from, and the real verb count', () => {
    render(<CheatCard />);
    // The hash is what makes a card on a wall checkable against a running app. Without
    // it the reader has no way to ask whether their copy is current.
    // Twice, deliberately: in the header where a wall copy is checked at a glance, and
    // in the footnote that says what to do about it.
    expect(screen.getAllByText(new RegExp(MANIFEST_HASH)).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(new RegExp(`${ACTION_MANIFEST.actions.length} governed verbs`))).toBeInTheDocument();
  });

  it('does not list the 22 verbs individually', () => {
    // Phase 6's premise is that nobody reads anything. Twenty-two verb labels is the
    // wall of text the card exists instead of, and it would also not fit on one page.
    render(<CheatCard />);
    const text = document.body.textContent ?? '';
    const listed = ACTION_MANIFEST.actions.filter((a) => text.includes(a.label));
    expect(listed.map((a) => a.label)).toEqual([]);
  });

  it('installs no keyboard listener of its own', () => {
    // lib/dismiss owns Escape for the entire app — one listener, one stack,
    // last-opened-wins. A page that describes Escape must not also claim it.
    const src = code(join(SRC, 'pages', 'CheatCard.tsx'));
    expect(src).not.toMatch(/addEventListener/);
  });

  it('pins the light palette for print, with the values tokens.css actually has', () => {
    // Printing from dark mode is the defect this guards: the shared print reset forces
    // the paper white but leaves the text tokens at their dark values, which prints
    // near-white type on white. The card re-declares the six tokens it uses inside
    // `@media print`; copied values rot, so they are checked against the source here.
    const card = readFileSync(join(SRC, 'pages', 'CheatCard.tsx'), 'utf8');
    const tokens = readFileSync(join(SRC, 'styles', 'tokens.css'), 'utf8');
    const lightBlock = tokens.slice(tokens.indexOf(':root {'), tokens.indexOf('}', tokens.indexOf(':root {')));

    const printBlock = card.slice(card.indexOf('@media print'));
    const pinned = [...printBlock.matchAll(/(--[a-z-]+):\s*([\d\s]+);/g)];
    expect(pinned.length, 'the print block pins no tokens at all').toBeGreaterThanOrEqual(6);

    for (const [, name, value] of pinned) {
      const actual = new RegExp(`${name}:\\s*([\\d\\s]+);`).exec(lightBlock);
      expect(actual, `${name} is pinned for print but is not a :root token`).toBeTruthy();
      expect(
        value.trim(),
        `${name} pinned as "${value.trim()}" but tokens.css :root says "${actual![1].trim()}" — print would not match the app`,
      ).toBe(actual![1].trim());
    }
  });

  it('is reachable: the route and the sidebar entry agree', () => {
    // A page nobody can find is a page that does not exist. Both files are plain
    // source here rather than a rendered router, because the assertion is about the
    // wiring being present at all.
    const router = readFileSync(join(SRC, 'router.tsx'), 'utf8');
    const sidebar = readFileSync(join(SRC, 'components', 'layout', 'Sidebar.tsx'), 'utf8');
    expect(router).toContain("path: 'cheat-card'");
    expect(sidebar).toContain("to: '/cheat-card'");
  });
});
