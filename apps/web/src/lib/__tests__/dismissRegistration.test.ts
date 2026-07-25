import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * COMPLETENESS ratchet for the one Escape owner (TERMINAL Phase 4 / P7 ledger T1 #15).
 *
 * `lib/dismiss.ts` is the single document listener, the LIFO stack and the focus
 * restoration. `lib/__tests__/dismiss.test.ts` proves the STACK behaves — last-opened
 * wins, focus goes back, Escape is claimed only when something is open. What no test
 * proved is the thing that was actually broken: whether every overlay in the app is ON
 * that stack. Two were not (`pages/AccessControl.tsx`, `pages/DistributionCampaigns.tsx`),
 * Escape did nothing on either, and the `?` manual — which READS the stack and reports it
 * to the operator as fact — could not name them.
 *
 * A spot-check of those two would be worth nothing: the next overlay someone adds is the
 * same bug again. So this enumerates.
 *
 * ── WHY AN ALLOWLIST AND NOT A CLEVERER GREP ─────────────────────────────────────────
 *
 * The obvious check — "every file containing role=dialog must also contain
 * useDismissible" — is WRONG, and confidently so. `components/command/CommandBody.tsx`
 * carries the dialog role while `components/shared/CommandPalette.tsx` does the
 * registering: the role lives in the child and the registration in the parent, which is
 * correct, because one overlay must produce exactly ONE stack entry. Acting on that
 * false positive would add a second entry for the command line, and then one Escape
 * would pop half of it and leave a ghost — and the manual would report a stack that does
 * not exist. A per-file co-location grep cannot see the difference between "unregistered"
 * and "registered by my parent".
 *
 * Reasoning about the render TREE statically was the alternative considered. It fails
 * open in the direction that matters: propagating "an ancestor registers something" down
 * to every descendant would bless a page that registers overlay A while its second,
 * unregistered overlay B sits in the same subtree — exactly the shape of the two defects
 * this file exists to have caught.
 *
 * So: a curated exemption list, where each entry NAMES its registering parent and the
 * test VERIFIES the claim — the parent exists, the parent registers, and the parent
 * really does render the child. An unverified allowlist is just a mute button. This one
 * fails if the parent stops registering, if the parent stops rendering the child, or if
 * the entry becomes stale.
 *
 * The honest limit: the enumeration recognises an overlay by the ARIA it declares
 * (`role="dialog"`, `role="alertdialog"`, `aria-modal`). Something that takes over the
 * screen while declaring none of those is invisible here — and is also invisible to a
 * screen reader, which is a separate bug this ratchet would not be the right place to
 * catch.
 */

const SRC = join(__dirname, '..', '..');
const rel = (file: string) => relative(SRC, file).split(/[\\/]/).join('/');

/** What this ratchet counts as "an overlay declares itself". */
const DECLARES_OVERLAY = /role=["'](?:dialog|alertdialog)["']|aria-modal/;

/** Registration with the one owner, by either door. */
const REGISTERS = /\buseDismissible\s*\(|\bpushDismissible\s*\(/;

/**
 * Overlays whose registration lives in a parent, with the parent named so it can be
 * checked. Keep the reason concrete: "why is it not here?" must be answerable without
 * re-deriving it.
 */
const REGISTERED_BY_PARENT: Record<string, { parent: string; component: string; why: string }> = {
  'components/command/CommandBody.tsx': {
    parent: 'components/shared/CommandPalette.tsx',
    component: 'CommandBody',
    why:
      'CommandBody is the command line’s BODY — the palette that owns the open/close state ' +
      'registers it as one entry labelled "command line". Registering here as well would put ' +
      'two entries on the stack for one overlay, so one Escape would leave a ghost entry and ' +
      'the ladder the manual reports would start lying.',
  },
};

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry === '__tests__') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (entry.endsWith('.tsx')) out.push(full);
  }
  return out;
}

/**
 * Strip comments before matching, so this judges what the app DOES rather than what its
 * documentation talks about — the same reason `focusVisible.test.ts` does it. The prose
 * above names both `role="dialog"` and `useDismissible`; without this, a file could
 * "register" by discussing registration.
 */
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

const files = walk(SRC);
const code = new Map(files.map((f) => [rel(f), codeOnly(readFileSync(f, 'utf8'))]));
const overlays = [...code.entries()].filter(([, text]) => DECLARES_OVERLAY.test(text)).map(([f]) => f);
const registers = (file: string) => REGISTERS.test(code.get(file) ?? '');

describe('every overlay is on the one Escape stack', () => {
  it('found overlays to check at all', () => {
    // A silent zero here would look like a pass and mean nothing — the failure mode of
    // every static scan. There were 15 declared overlays when this was written.
    expect(overlays.length, 'the scan matched no overlays, so it proves nothing').toBeGreaterThan(10);
  });

  it('each one either registers itself or names the parent that does', () => {
    const unregistered = overlays.filter((f) => !registers(f) && !REGISTERED_BY_PARENT[f]);
    expect(
      unregistered,
      `these overlays are not on the dismiss stack, so Escape does nothing on them and the ` +
        `\`?\` manual cannot report them:\n  ${unregistered.join('\n  ')}\n\n` +
        `Fix by calling useDismissible(open, close, 'label'[, containerRef]) where the OPEN ` +
        `state lives — or, if a parent already registers this overlay, add it to ` +
        `REGISTERED_BY_PARENT in this file with the parent named.`,
    ).toEqual([]);
  });

  describe('the exemptions are verified, not asserted', () => {
    for (const [child, { parent, component, why }] of Object.entries(REGISTERED_BY_PARENT)) {
      it(`${child} is registered by ${parent}`, () => {
        expect(code.has(child), `${child} no longer exists — drop this exemption (${why})`).toBe(true);
        expect(overlays, `${child} no longer declares an overlay — drop this exemption`).toContain(child);
        // A self-registering child on this list would mean TWO entries for one overlay:
        // the exact false positive the naive grep would have created.
        expect(
          registers(child),
          `${child} now registers itself AND is exempted as a child of ${parent} — one overlay, two stack entries`,
        ).toBe(false);

        const parentCode = code.get(parent);
        expect(parentCode, `${parent} does not exist`).toBeDefined();
        expect(
          REGISTERS.test(parentCode!),
          `${parent} no longer registers anything, so ${child} is now unreachable by Escape`,
        ).toBe(true);
        // The edge itself: the named parent must actually render this child, or the
        // exemption is about a relationship that no longer exists.
        expect(
          new RegExp(`<${component}\\b`).test(parentCode!),
          `${parent} no longer renders <${component}>, so it cannot be the thing that registers it`,
        ).toBe(true);
        // `from '…'` or `import('…')`: CommandBody is lazy-loaded so it stays out of the
        // initial bundle, and a check that only understood static imports would report the
        // relationship as broken the moment someone code-splits an overlay.
        expect(
          new RegExp(`(?:from|import\\()\\s*['"][^'"]*${component}['"]`).test(parentCode!),
          `${parent} no longer imports ${component}, statically or lazily`,
        ).toBe(true);
      });
    }
  });

  it('the two drawers this ledger item names are registered where they are rendered', () => {
    // Named explicitly, because a ratchet that only counts is satisfied by a wrong fix:
    // moving the role attribute out of these files would also make the check above pass.
    for (const page of ['pages/AccessControl.tsx', 'pages/DistributionCampaigns.tsx']) {
      expect(overlays, `${page} no longer declares its drawer as a dialog`).toContain(page);
      expect(registers(page), `${page} does not register its drawer with lib/dismiss`).toBe(true);
    }
  });

  it('no overlay installs its own Escape listener', () => {
    /*
     * The house rule the stack exists to enforce. Before it there were sixteen claimants,
     * three of them capture-phase with stopPropagation and a comment conceding "one Escape
     * closes two things at once". A new overlay that adds its own listener would pass every
     * check above while re-creating the original defect.
     *
     * Narrow on purpose: only a keydown listener in the SAME file that mentions Escape.
     * SnoozeMenu legitimately installs a window listener for its 1/3/7 quick keys, and
     * HintTags for its alphabet; neither touches Escape.
     */
    const offenders = overlays.filter((f) => {
      const text = code.get(f)!;
      return /addEventListener\(\s*['"]keydown['"]/.test(text) && /['"]Escape['"]/.test(text);
    });
    expect(
      offenders,
      `these overlays listen for Escape themselves instead of registering with lib/dismiss:\n  ${offenders.join('\n  ')}`,
    ).toEqual([]);
  });
});
