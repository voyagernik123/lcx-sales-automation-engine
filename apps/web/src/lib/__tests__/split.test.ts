import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { canSplitAt, EVIDENCE_PANE_ATTR, EVIDENCE_PANE_WIDTH, keysBelongToSurface, SPLIT_MIN_WIDTH } from '@/lib/split';

/**
 * `⌘\` — the invariants that make the docked evidence pane safe rather than merely
 * present (T1 #12).
 *
 * The behaviour proofs live where the behaviour is: `pages/__tests__/bdPipelineSplitOwnership
 * .test.tsx` breaks the ownership guard and watches `d` aim a disqualify at the wrong
 * record, and `components/inspect/__tests__/evidencePane.test.tsx` proves the pane takes no
 * focus and is not on the dismiss stack. This file holds the pure predicate and the four
 * STRUCTURAL claims the design rests on — each one a claim about the source that would be
 * silently false the day someone changed it, and each one the reason a behaviour test above
 * is allowed to stay short.
 */

const SRC = join(__dirname, '..', '..');
const rel = (file: string) => relative(SRC, file).split(/[\\/]/).join('/');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

/** Judge what the code DOES, not what its documentation discusses — every `⌘\` in a
 * comment in `lib/split.ts` would otherwise count as a call site. */
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

const files = walk(SRC).filter((f) => !/[\\/]__tests__[\\/]/.test(f) && !/\.test\.tsx?$/.test(f));
const code = new Map(files.map((f) => [rel(f), codeOnly(readFileSync(f, 'utf8'))]));

describe('the viewport gate', () => {
  it('offers the split only at or above the derived width', () => {
    expect(canSplitAt(SPLIT_MIN_WIDTH)).toBe(true);
    expect(canSplitAt(SPLIT_MIN_WIDTH - 1)).toBe(false);
    // Named devices rather than only the boundary, so the answer to "who gets this?" is
    // legible: every current MacBook does, a half-width window and a tablet do not.
    expect(canSplitAt(1728), '16-inch MacBook Pro').toBe(true);
    expect(canSplitAt(1512), '14-inch MacBook Pro').toBe(true);
    expect(canSplitAt(1470), '13-inch MacBook Air').toBe(true);
    expect(canSplitAt(1280), 'half of a 2560 display').toBe(false);
    expect(canSplitAt(1024), "the app's own reference width").toBe(false);
    expect(canSplitAt(768)).toBe(false);
  });

  it('the breakpoint moves with the pane, because it is derived from it', () => {
    /*
     * THE ARITHMETIC OF THE COMPARATIVE CLAIM. The pane costs exactly its own width, so the
     * threshold is "the width the app already accepts for a surface, plus the pane". A pane
     * that grew without the breakpoint following it would silently start costing the
     * operator columns they had before — which is the thing the whole gate exists to
     * prevent, and it is invisible until someone opens a laptop.
     *
     * `e2e/split.spec.ts` measures the real consequence; this pins the relationship so a
     * changed pane width cannot slip through on a day nobody runs Playwright.
     */
    expect(SPLIT_MIN_WIDTH - EVIDENCE_PANE_WIDTH, 'the breakpoint no longer follows the pane width').toBe(1024);
  });
});

describe('which pane owns the keys', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('says the surface owns them when no pane exists at all', () => {
    // The everyday case, and the one that must not need a pane on screen to answer: every
    // surface in the app, on every day nobody presses ⌘\.
    document.body.innerHTML = '<button id="row">row</button>';
    document.getElementById('row')!.focus();
    expect(keysBelongToSurface()).toBe(true);
  });

  it('says the surface owns them when focus is beside the pane, not in it', () => {
    document.body.innerHTML = `<button id="row">row</button><aside ${EVIDENCE_PANE_ATTR}><a href="#x" id="ev">ev</a></aside>`;
    document.getElementById('row')!.focus();
    expect(keysBelongToSurface()).toBe(true);
  });

  it('hands them to the pane for anything nested inside it, at any depth', () => {
    document.body.innerHTML =
      `<button id="row">row</button>` +
      `<aside ${EVIDENCE_PANE_ATTR}><div><section><a href="#x" id="ev">ev</a></section></div></aside>`;
    document.getElementById('ev')!.focus();
    expect(keysBelongToSurface(), 'a keystroke in the evidence pane would land on the surface').toBe(false);
  });

  it('answers for nothing-focused without throwing', () => {
    expect(keysBelongToSurface(null)).toBe(true);
  });
});

describe('the structural claims the design rests on', () => {
  it('exactly one file installs the ⌘\\ chord', () => {
    /*
     * The bug this exists for was written and measured, not imagined. `useSplitView` began
     * as ONE hook that both installed the listener and returned the state; the `?` manual
     * then needed the state, and calling it there installed a second `document` keydown
     * listener. Both fired on one press and each read the store: the first flipped
     * false→true, the second read that `true` and flipped it back. One press, two toggles,
     * no visible effect — and nothing in the app or the type system objected.
     *
     * Counting call sites rather than trusting the comment, because the comment is what
     * failed the first time.
     */
    const callers = [...code.entries()].filter(([, text]) => /\buseSplitViewChord\s*\(/.test(text)).map(([f]) => f);
    expect(callers.sort(), 'the ⌘\\ chord must be installed once; two listeners cancel each other out').toEqual([
      'components/layout/AppLayout.tsx',
      'hooks/useSplitView.ts', // its own definition
    ]);
  });

  it('the shell wires the two containers the way the component tests assume', () => {
    /*
     * `components/inspect/__tests__/evidenceDock.test.tsx` cannot render `AppLayout` — it
     * needs a router, three stores and an entitlement fetch — so it renders a four-line
     * MIRROR of the arrangement. The standing risk of a mirror is that the original changes
     * and the mirror keeps passing. These three facts are what that file assumes, checked
     * against the real shell:
     *   - the pane renders only when docked (otherwise it eats 400px on every surface);
     *   - `InspectorHost` is TOLD whether it is docked (otherwise the drawer and the pane
     *     are both up, one target on screen twice with a scrim over half of it);
     *   - and the pane is a flex SIBLING of the content rather than a child of it, or the
     *     surface never reflows and this is the drawer with extra steps.
     */
    const shell = code.get('components/layout/AppLayout.tsx')!;
    expect(shell).toBeDefined();
    expect(/\{\s*split\.docked\s*&&\s*<EvidencePane\s*\/>\s*\}/.test(shell), 'the pane is no longer gated on docked').toBe(true);
    expect(/<InspectorHost\s+docked=\{split\.docked\}/.test(shell), 'InspectorHost is no longer told it is docked').toBe(true);
    /*
     * The pane must sit INSIDE the `flex flex-1` row, as a sibling of MainContent.
     *
     * My first version of this check compared the pane's index against `<Footer`'s and was a
     * DECORATION: moving the pane out of the row to just above `<Footer />` — which puts it
     * outside the flex context entirely, so the surface never narrows and the pane stacks
     * under the content — left it green, because the pane was still before the footer.
     * Measured by doing exactly that. The row's own closing tag is the boundary that
     * matters, and it is the last `</div>` before the footer.
     */
    const row = shell.slice(shell.indexOf('flex flex-1 overflow-hidden'));
    const footerAt = row.indexOf('<Footer');
    const rowEnd = row.lastIndexOf('</div>', footerAt);
    const paneAt = row.indexOf('<EvidencePane');
    expect(paneAt, 'EvidencePane is no longer rendered by the shell at all').toBeGreaterThan(0);
    expect(
      paneAt,
      'EvidencePane left the `flex flex-1` row, so the surface no longer reflows around it — ' +
        'the pane stacks under the content instead of beside it',
    ).toBeLessThan(rowEnd);
  });

  it('the evidence pane never takes focus', () => {
    /*
     * THE LOAD-BEARING ABSENCE. `InspectorDrawer` focuses its panel on mount and must,
     * because it is modal. The pane must not: the operator peeks with Space, focus stays on
     * the row, and `j`/`k`/`s`/`d`/`e` keep working. A pane that grabbed focus would hand
     * the keyboard away on every peek — the ownership guard would then be standing the
     * surface down constantly, and the docked mode would be strictly worse than the drawer
     * it replaces, while looking like it worked.
     *
     * An absence is exactly the kind of thing a behaviour test forgets to assert once it
     * passes, so it is a ratchet on the source too.
     */
    const pane = code.get('components/inspect/EvidencePane.tsx')!;
    expect(pane).toBeDefined();
    expect(/\.focus\s*\(/.test(pane), 'EvidencePane focuses something — see the pane-ownership rule').toBe(false);
    expect(/autoFocus/.test(pane), 'EvidencePane autofocuses a control').toBe(false);
  });

  it('the evidence pane declares no dialog role', () => {
    /*
     * Three mechanisms read that ARIA and all three would be made to lie:
     * `dismissRegistration.test.ts` enumerates overlays BY it and would demand this pane
     * register with the dismiss stack (which is what silences the keys it exists to
     * preserve); `resolveHintScope` counts displayed dialog nodes and refuses to draw hint
     * tags when it finds more than one, so `f` would go dead on every drawer opened while
     * the pane is docked; and `aria-modal` would tell a screen reader the surface beside it
     * no longer exists.
     */
    const pane = code.get('components/inspect/EvidencePane.tsx')!;
    expect(/role=["'](?:dialog|alertdialog)["']|aria-modal/.test(pane)).toBe(false);
  });

  it('useListNavigation stays container-bound, so ITS consumers need no pane guard', () => {
    /*
     * WHAT THIS PINS, AND — CORRECTED BY THE PHASE F VERIFIER — WHAT IT DOES NOT.
     *
     * It was titled "the row arrows are scoped by the container they are bound to, not by a
     * guard", and it read as covering the BD queue's arrows. IT DOES NOT.
     * `pages/BdPipeline.tsx` does not use this hook — `components/bd/LeadTable.tsx` does,
     * while the PAGE handles `ArrowDown`/`ArrowUp`, `Enter` and `' '` on its own `window`
     * listener (BdPipeline.tsx:596). Those arrows are pane-scoped by `keysBelongToSurface()`
     * exactly like the letters are. MEASURED: delete that one line and
     * `pages/__tests__/bdPipelineSplitOwnership.test.tsx` reports "an arrow pressed in the
     * evidence pane moved the queue cursor" alongside the three verb failures.
     *
     * What it DOES pin is the other three consumers — `ProductGrid`, `CompetitorGrid`,
     * `ProductMatrix` — which have no global listener of their own and are pane-scoped by
     * `containerProps` alone. The hook is READ-ONLY for this item; if it ever moved its
     * binding to `window` (the obvious "fix" for arrows that feel unresponsive) those three
     * would silently start moving a cursor in the pane the operator is reading, with no guard
     * anywhere to stop it. The surface this does NOT speak for is named above, so the next
     * reader does not inherit the reassurance the old title handed out.
     */
    const hook = code.get('hooks/useListNavigation.ts')!;
    expect(hook).toBeDefined();
    expect(/containerProps/.test(hook), 'useListNavigation no longer exposes containerProps').toBe(true);
    expect(
      /addEventListener\(\s*['"]keydown['"]/.test(hook),
      'useListNavigation now binds keydown globally — the arrows are no longer pane-scoped, and ' +
        'pages/BdPipeline.tsx needs the keysBelongToSurface() guard extended to them',
    ).toBe(false);
  });

  it('the one ambiguous listener in the app carries the guard', () => {
    /*
     * A `window`/`document` letter listener is the only thing a docked pane makes ambiguous,
     * and there is exactly one that mutates records. Enumerated rather than spot-checked:
     * the next page that adds bare-letter verbs on a global listener is the same defect
     * again, and this fails until it either carries the guard or is named here.
     *
     * SessionMode is exempt and the exemption is verified below: it is a modal that
     * registers with the dismiss stack, so `isOverlayOpen()` is true while it is up and the
     * pane cannot be reached at all.
     */
    const MUTATING_LETTERS = /case '[sde]':/;
    const GLOBAL_LISTENER = /(?:window|document)\.addEventListener\(\s*['"]keydown['"]/;
    const offenders = [...code.entries()]
      .filter(([, text]) => GLOBAL_LISTENER.test(text) && MUTATING_LETTERS.test(text))
      .filter(([, text]) => !/keysBelongToSurface\s*\(/.test(text))
      .map(([f]) => f);
    expect(
      offenders,
      `these surfaces bind mutating bare letters to a global listener without asking which pane ` +
        `owns the keyboard, so with the evidence pane docked a keystroke aimed at the pane would ` +
        `mutate the highlighted record:\n  ${offenders.join('\n  ')}\n\n` +
        `Fix by adding \`if (!keysBelongToSurface()) return;\` — or, if the surface is a modal that ` +
        `registers with lib/dismiss, add it to SURFACE_EXEMPT in this test with the reason.`,
    ).toEqual(SURFACE_EXEMPT);
  });

  it('the exempt surface really is a registered modal', () => {
    for (const file of SURFACE_EXEMPT) {
      const text = code.get(file);
      expect(text, `${file} no longer exists — drop the exemption`).toBeDefined();
      expect(
        /\buseDismissible\s*\(/.test(text!),
        `${file} is exempt from the pane-ownership guard because it registers with the dismiss ` +
          `stack, and it no longer does — its letter keys are now live while the evidence pane ` +
          `has focus`,
      ).toBe(true);
    }
  });
});

/**
 * Surfaces with mutating bare letters on a global listener that do NOT need the guard,
 * each because it is a modal on the dismiss stack: `isOverlayOpen()` is true whenever it is
 * on screen, so the docked pane is unreachable and there is no second pane to be in.
 */
const SURFACE_EXEMPT = ['components/queue/SessionMode.tsx'];
