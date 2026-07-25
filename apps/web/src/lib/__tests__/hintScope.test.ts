import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HINT_LAYER_Z, HINT_OVERLAY_SELECTOR, resolveHintScope } from '../hints';
import { _resetDismiss, pushDismissible } from '../dismiss';

/**
 * WHERE `f` IS ALLOWED TO LOOK (hint-layer scope).
 *
 * `useHints` no longer refuses `f` while an overlay is open — it refuses only while the
 * TOP entry does not confine Tab — because the blanket refusal cost the feature the
 * surface it was worth most on: 24 Tab stops on the partner dossier, measured by
 * e2e/keyboardday.spec.ts as the biggest contributor to a 52-press RFI flow.
 *
 * That trade is only safe because `resolveHintScope` narrows the query to the open
 * overlay, and that function rests on TWO CLAIMS ABOUT THE REST OF THE APP which are
 * assertions about files it does not own. Both are enumerated here rather than trusted:
 *
 *  1. every overlay that confines Tab declares itself with overlay ARIA, so the scope's
 *     selector can find it. (`dismissRegistration.test.ts` ratchets the converse — every
 *     file that declares overlay ARIA registers on the stack — which is not the same
 *     claim and would not catch a trapping panel with no `role`.)
 *  2. every such overlay paints BELOW the hint layer, or the layer refuses it. Chips at
 *     `z-[110]` under a dialog at `z-[120]` are a status pill and no visible tags — a
 *     feature that looks broken rather than one that is honestly absent.
 *
 * The honest weakness of (2) is that stacking is read off the Tailwind class, per FILE and
 * by maximum. That is coarse — it would trip on a big z-index anywhere in the file — and
 * coarse in the safe direction: it over-reports rather than blessing an overlay the layer
 * would paint under.
 */

const SRC = join(__dirname, '..', '..');
const rel = (file: string) => relative(SRC, file).split(/[\\/]/).join('/');

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
 * Strip comments before matching, for the reason `dismissRegistration.test.ts` gives: this
 * has to judge what the app DOES, not what its prose discusses. Half these files contain
 * the words `role="dialog"` inside a paragraph explaining why they do or do not use it.
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

/** Split an argument list on TOP-LEVEL commas only — every call here has arrow arguments. */
function splitArgs(text: string): string[] {
  const args: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) depth--;
    else if (c === ',' && depth === 0) {
      args.push(text.slice(start, i).trim());
      start = i + 1;
    }
  }
  args.push(text.slice(start).trim());
  return args;
}

/**
 * The container ref names each file passes to `useDismissible` — i.e. every overlay in the
 * app that confines Tab and is therefore something `f` may now arm inside.
 */
function trapRefs(code: string): string[] {
  const out: string[] = [];
  const call = 'useDismissible(';
  for (let i = code.indexOf(call); i !== -1; i = code.indexOf(call, i + 1)) {
    let depth = 0;
    let end = -1;
    for (let j = i + call.length - 1; j < code.length; j++) {
      if (code[j] === '(') depth++;
      else if (code[j] === ')') {
        depth--;
        if (depth === 0) {
          end = j;
          break;
        }
      }
    }
    if (end === -1) continue;
    const args = splitArgs(code.slice(i + call.length, end));
    if (args.length >= 4 && /^[A-Za-z_$][\w$]*$/.test(args[3]!)) out.push(args[3]!);
  }
  return out;
}

/**
 * The opening tag that carries `ref={name}`, so the ARIA check is about the element the
 * ref is attached to rather than about anything else in the file.
 *
 * Bounded by the nearest `<` either side: an opening tag's attributes contain no `<` once
 * comments are stripped, while `=>` in an inline handler contains no `<` either — so this
 * window is the whole tag and only the tag, whether the ARIA is written before or after
 * the ref.
 */
function openingTagWith(code: string, refName: string): string | null {
  const at = code.indexOf(`ref={${refName}}`);
  if (at === -1) return null;
  const start = code.lastIndexOf('<', at);
  const nextTag = code.indexOf('<', at);
  const end = nextTag === -1 ? code.length : nextTag;
  return start === -1 ? null : code.slice(start, end);
}

const DECLARES_OVERLAY = /role=["'](?:dialog|alertdialog)["']|aria-modal/;

/** The largest stacking level the file states as a Tailwind class. */
function maxZ(code: string): number {
  let max = 0;
  for (const m of code.matchAll(/(?:^|[\s"'`])z-(?:\[(\d+)\]|(\d+))(?=[\s"'`]|$)/g)) {
    max = Math.max(max, Number(m[1] ?? m[2]));
  }
  return max;
}

const files = walk(SRC);
const code = new Map(files.map((f) => [rel(f), codeOnly(readFileSync(f, 'utf8'))]));
const trapping = [...code.entries()]
  .map(([file, text]) => ({ file, refs: trapRefs(text), z: maxZ(text) }))
  .filter((e) => e.refs.length > 0);

/**
 * The one overlay the layer deliberately will not scope to, named so the exemption can be
 * checked rather than assumed. `f` and `?` are already mutually exclusive in the other
 * direction — `stepHint` closes hint mode on `?` — so this is the same rule, symmetric.
 */
const PAINTS_ABOVE_THE_LAYER = 'components/help/Manual.tsx';

describe('the scope rests on two claims about overlays this module does not own', () => {
  it('found the trapping overlays at all', () => {
    /*
     * A silent zero is the failure mode of every static scan, so the seven that existed
     * when this was written are named. Deliberately a SUBSET assertion rather than an
     * equality: the eighth trapping overlay someone adds should be picked up by the two
     * checks below — which is the point — not rejected here by a list that has to be
     * edited before the real guards get to run. What must never silently shrink is the
     * scan's reach, and that is what naming these seven holds.
     */
    const found = trapping.map((t) => t.file);
    for (const file of [
      'components/command/PartnerDossier.tsx',
      'components/help/Manual.tsx',
      'components/report/EmailRecipientsDialog.tsx',
      'components/ui/InspectorDrawer.tsx',
      'components/ui/Modal.tsx',
      'pages/AccessControl.tsx',
      'pages/DistributionCampaigns.tsx',
    ]) {
      expect(found, `${file} no longer registers a container ref, or the scan stopped seeing it`).toContain(file);
    }
  });

  it('every trapping container declares overlay ARIA, or the scope cannot find it', () => {
    const silent: string[] = [];
    for (const { file, refs } of trapping) {
      for (const ref of refs) {
        const tag = openingTagWith(code.get(file)!, ref);
        if (tag === null || !DECLARES_OVERLAY.test(tag)) silent.push(`${file} (${ref})`);
      }
    }
    expect(
      silent,
      `these overlays confine Tab but do not declare role="dialog"/"alertdialog"/aria-modal on ` +
        `the element they confine it to, so \`f\` inside them resolves no scope and draws ` +
        `nothing:\n  ${silent.join('\n  ')}`,
    ).toEqual([]);
  });

  it('every one the layer will scope to paints below the layer', () => {
    const above = trapping.filter((t) => t.z >= HINT_LAYER_Z && t.file !== PAINTS_ABOVE_THE_LAYER);
    expect(
      above.map((t) => `${t.file} (z-${t.z})`),
      `these overlays paint at or above the hint layer's z-${HINT_LAYER_Z}, so \`f\` inside them ` +
        `would draw chips nobody can see. Either lower them, or raise the layer and this ` +
        `constant together`,
    ).toEqual([]);
  });

  it('the one exemption is not stale', () => {
    // If the manual ever drops below the layer, this exemption stops being a statement
    // about reality and starts being a mute button.
    const manual = trapping.find((t) => t.file === PAINTS_ABOVE_THE_LAYER);
    expect(manual, `${PAINTS_ABOVE_THE_LAYER} no longer confines Tab — drop the exemption`).toBeDefined();
    expect(
      manual!.z,
      `${PAINTS_ABOVE_THE_LAYER} now paints below z-${HINT_LAYER_Z}, so it no longer needs exempting ` +
        `and \`f\` could tag it`,
    ).toBeGreaterThanOrEqual(HINT_LAYER_Z);
  });

  it('the constant matches the class the chips actually render with', () => {
    // Tailwind needs the literal in the source, so this number exists twice. The runtime
    // comparison in `resolveHintScope` is worthless if the two drift.
    const layer = readFileSync(join(SRC, 'components/help/HintTags.tsx'), 'utf8');
    expect(
      new RegExp(`z-\\[${HINT_LAYER_Z}\\]`).test(layer),
      `HINT_LAYER_Z is ${HINT_LAYER_Z} but HintTags.tsx renders no z-[${HINT_LAYER_Z}]`,
    ).toBe(true);
  });
});

describe('resolveHintScope', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });
  afterEach(() => _resetDismiss());

  const dialog = (className = 'z-40') => {
    const wrap = document.createElement('div');
    wrap.className = `fixed inset-0 ${className}`;
    const panel = document.createElement('div');
    panel.setAttribute('role', 'dialog');
    wrap.appendChild(panel);
    document.body.appendChild(wrap);
    return panel;
  };

  it('is the whole document when nothing is open', () => {
    expect(resolveHintScope()).toEqual({ kind: 'page', root: document });
  });

  it('is the single open overlay, not the document', () => {
    const panel = dialog();
    pushDismissible('dossier', () => {}, () => panel);
    expect(resolveHintScope()).toEqual({ kind: 'overlay', root: panel });
  });

  it('refuses on ambiguity, on an undeclared overlay, and on one that paints over the layer', () => {
    pushDismissible('lead session', () => {});
    expect(resolveHintScope().kind, 'nothing declared itself').toBe('unscoped');

    dialog();
    dialog('z-50');
    expect(resolveHintScope().kind, 'two candidates').toBe('unscoped');

    document.body.innerHTML = '';
    dialog(`z-[${HINT_LAYER_Z}]`);
    expect(resolveHintScope().kind, 'level equal to the layer is still a refusal').toBe('unscoped');
  });

  it('names the attributes it looks for, so the selector cannot quietly narrow', () => {
    // Read off the constant rather than restated, but each one asserted to be there: this
    // is the list `dismissRegistration.test.ts` already holds the app to.
    for (const attr of ['[role="dialog"]', '[role="alertdialog"]', '[aria-modal="true"]']) {
      expect(HINT_OVERLAY_SELECTOR).toContain(attr);
    }
  });
});
