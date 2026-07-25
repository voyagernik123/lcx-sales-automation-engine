import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CheatCard, cheatCard, pressLabel, type Binding, type Press } from '../CheatCard';
import { DESTINATIONS } from '@/lib/destinations';
import { ACTION_MANIFEST, MANIFEST_HASH } from '@/lib/command/generated/actionManifest';

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
 * Is this key still bound where the card says it is?
 *
 * Webview bindings all spell the key as a quoted `KeyboardEvent.key` literal —
 * `case 'ArrowDown':`, `e.key === 'g'`, `e.key !== 'Escape'` — so one quoted-literal
 * search covers every TypeScript module without the test needing to know each one's
 * control flow. The native menu spells accelerators its own way, so it gets its own
 * two rules and nothing more.
 */
function isBound(press: Press): boolean {
  if (press.from === 'destinations') {
    return DESTINATIONS.some((d) => d.key === press.key);
  }
  const src = code(bindingFile(press.from));
  if (press.from === 'nativeMenu') {
    if (press.mod === 'alt') return src.includes('Modifiers::ALT') && src.includes(`Code::${press.key}`);
    return src.includes(`CmdOrCtrl+${press.key}`);
  }
  return src.includes(`'${press.key}'`);
}

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
      expect(chips, `${d.label}: the g-chord digit ${d.key} is not on the card`).toContain(d.key);
      expect(chips, `${d.label}: the ⌘${d.key} mirror is not on the card`).toContain(`⌘${d.key}`);
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
        if (!isBound(p)) {
          problems.push(`${pressLabel(p)} — declared from '${p.from}', which no longer spells ${JSON.stringify(p.key)}`);
        }
      } catch (err) {
        problems.push(`${pressLabel(p)} — ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    expect(problems, problems.join('\n')).toEqual([]);
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
