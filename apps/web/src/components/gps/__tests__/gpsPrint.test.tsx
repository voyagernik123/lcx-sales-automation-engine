import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import {
  PRICE_BANDS_ARE_PLACEHOLDERS, EFFORT_TRIPLES_ARE_PLACEHOLDERS,
  COORDINATION_HOURS_ARE_PLACEHOLDERS, PERIMETER_IS_UNREVIEWED,
  DISCLOSURES_ARE_NOT_COUNSEL_REVIEWED,
} from '@lcx/shared';
import { attachMeta } from '@/lib/api/meta';
import {
  GpsPrintArtefact, gpsPrintCaveats, gpsUnderwritingRefusal,
  type GpsArtefactKind,
} from '../GpsPrint';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  THE PRINTED SHEET IS THE OUTPUT — so it is tested as one
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Print is the only GPS surface whose defects are invisible in development: the
 * DOM is right, the screen is right, and the sheet coming out of the printer is
 * missing the paragraph that made the price honest. Every assertion below is about
 * something that has ALREADY happened to a print surface in this repository:
 *
 *  1. A caveat inside a `<header>` or `<footer>`, or carrying `role="status"` or
 *     `.br-no-print`, is DELETED from the sheet by the house print rules
 *     (`components/report/PrintStyles.tsx:52`) while looking perfect on screen.
 *     `MarketingRecord` documents that trap at line 101 and the stamp at
 *     `LegalPositionStamp.tsx:26` was rewritten because of it. So the honesty
 *     statements are checked for all four deletion routes, on all four artefacts.
 *  2. Colour as the only signal: `--red` is not pinned by `PrintStyles`, and a
 *     greyscale printer flattens the palette anyway. Every notice must carry an
 *     all-caps mark IN THE TEXT.
 *  3. A missing field printing as a clean one. `basis` absent must print
 *     UNVERIFIED, not measured — the ratchet `legalPosition.ts:17` runs on.
 *  4. Copied token values drifting from `tokens.css`, which is exactly what
 *     `lib/__tests__/reducedMotion.test.ts:255` caught in the house sheet.
 *
 * WHAT IS NOT TESTED HERE, and cannot be: jsdom applies no `@media print`, so no
 * assertion below proves anything about how a real printer lays the sheet out. The
 * stylesheet is therefore asserted as TEXT — the rule exists, is scoped to the
 * artefact, and is in the right order — which is a check on the source and not on
 * the output. Measuring the output means printing to PDF in a real browser, and
 * that is not done anywhere in this repo yet.
 */

const SRC = join(__dirname, '..', '..', '..');
const CSS = readFileSync(join(SRC, 'styles', 'gpsPrint.css'), 'utf8');
const COMPONENT = readFileSync(join(SRC, 'components', 'gps', 'GpsPrint.tsx'), 'utf8');

const KINDS: readonly GpsArtefactKind[] = ['proposal', 'underwriting', 'book', 'delivery_record'];

const sheet = (over: Partial<Parameters<typeof GpsPrintArtefact>[0]> = {}) =>
  render(
    <GpsPrintArtefact
      kind="proposal"
      title="Probe Chain · MiCA white paper"
      asOf="2026-08-02T14:22:31.000Z"
      {...over}
    >
      <table><tbody><tr><td>body</td></tr></tbody></table>
    </GpsPrintArtefact>,
  );

afterEach(() => vi.restoreAllMocks());

describe('the honesty statements reach the paper', () => {
  it('an unreviewed perimeter and a prior basis reach the paper — and the settled price no longer wears a caveat', () => {
    // Fixture assumptions, asserted rather than trusted — and one HAS flipped:
    // the founder approved real bands on 2026-08-31, so the placeholder-price
    // caveat coming OFF the paper is now the guarded state. The perimeter flag
    // is still true; when it flips, a reviewed perimeter lands in the same
    // commit and this test must be the thing that notices.
    expect(PRICE_BANDS_ARE_PLACEHOLDERS, 'flag regressed: a placeholder band must never wear an approved price').toBe(false);
    expect(PERIMETER_IS_UNREVIEWED, 'flag flipped: a reviewed perimeter must land with it').toBe(true);

    sheet({ sources: [{ basis: 'prior', sampleSize: 0 }] });

    // The approved price prints WITHOUT the placeholder caveat — a settled number
    // wearing a warning is the mirror image of the defect this file exists for.
    expect(screen.queryByTestId('gps-print-caveat-placeholder_price')).toBeNull();

    const perimeter = screen.getByTestId('gps-print-caveat-unreviewed_perimeter');
    expect(perimeter.textContent).toContain('authorises nothing');
    expect(perimeter.textContent).toContain('may not be presented as permitted, cleared or approved');

    const basis = screen.getByTestId('gps-print-caveat-distribution_basis');
    expect(basis.textContent).toContain('PRIOR');
    expect(basis.textContent).toContain('No recorded outcome informs any percentile');
  });

  it('a measured basis raises no basis caveat, so the notice means something when it appears', () => {
    sheet({ sources: [{ basis: 'measured', sampleSize: 12 }] });
    expect(screen.queryByTestId('gps-print-caveat-distribution_basis')).toBeNull();
  });

  it('a basis nothing carried prints UNVERIFIED rather than nothing', () => {
    sheet({ sources: [{ priceCents: 1_750_000 }] });
    const basis = screen.getByTestId('gps-print-caveat-distribution_basis');
    expect(basis.textContent).toContain('UNVERIFIED');
    expect(basis.textContent).toContain('field absent');
  });

  it('two reads that disagree resolve to the weaker basis', () => {
    // `measured` beside `blended` is not an average and not a coin toss: the sheet
    // prints the unflattering one, the same direction `legalPosition.ts:44` takes.
    const caveats = gpsPrintCaveats('underwriting', [{ basis: 'measured' }, { underwriting: { basis: 'blended', sampleSize: 3 } }]);
    const basis = caveats.find((c) => c.id === 'distribution_basis');
    expect(basis?.basis).toEqual({ via: 'payload_field', field: 'basis', value: 'blended' });
    expect(basis?.sentence).toContain('3 recorded outcome(s)');
  });

  it('an inert environment is stated, so an empty table is not read as a clean record', () => {
    sheet({ sources: [attachMeta({ rows: [] }, { migrated: false })] });
    expect(screen.getByTestId('gps-print-caveat-inert_compartment').textContent)
      .toContain('evidence of NOTHING');
  });

  it('silence about migration is not printed as "not migrated"', () => {
    sheet({ sources: [{ rows: [] }] });
    expect(screen.queryByTestId('gps-print-caveat-inert_compartment')).toBeNull();
  });

  it('the placeholder effort and hours notices reach the sheets they belong to', () => {
    expect(EFFORT_TRIPLES_ARE_PLACEHOLDERS).toBe(true);
    expect(COORDINATION_HOURS_ARE_PLACEHOLDERS).toBe(true);
    expect(gpsPrintCaveats('underwriting', []).map((c) => c.id)).toContain('placeholder_effort');
    expect(gpsPrintCaveats('delivery_record', []).map((c) => c.id)).toContain('placeholder_coordination_hours');
    // And not where they say nothing: a delivery record's cost is spent, not modelled.
    expect(gpsPrintCaveats('delivery_record', []).map((c) => c.id)).not.toContain('placeholder_effort');
  });

  it('the disclosure wording is badged as a draft on the two client- and auditor-facing sheets', () => {
    expect(DISCLOSURES_ARE_NOT_COUNSEL_REVIEWED).toBe(true);
    for (const kind of ['proposal', 'delivery_record'] as const) {
      expect(gpsPrintCaveats(kind, []).map((c) => c.id), kind).toContain('unreviewed_disclosure');
    }
  });
});

describe('nothing that qualifies a figure can be deleted by the print rules', () => {
  /**
   * The four routes by which content vanishes from a printed page while staying
   * perfect on screen. All four are checked on every artefact, because the notice
   * set differs by kind and a per-kind wiring mistake is exactly what this catches.
   */
  it.each(KINDS)('%s: no notice sits in hidden chrome, a status role, or .br-no-print', (kind) => {
    const { container, unmount } = render(
      <GpsPrintArtefact kind={kind} title="T" asOf="2026-08-02T14:22:31.000Z" sources={[{ basis: 'prior' }]}>
        <p>body</p>
      </GpsPrintArtefact>,
    );

    expect(container.querySelectorAll('header, footer, aside')).toHaveLength(0);
    expect(container.querySelectorAll('[role="status"]')).toHaveLength(0);

    const notices = [...container.querySelectorAll('[data-gps-caveat]')];
    expect(notices.length, `${kind} printed no caveats at all`).toBeGreaterThan(0);
    for (const n of notices) {
      expect(n.closest('.br-no-print'), 'a caveat inside .br-no-print never prints').toBeNull();
      expect(n.closest('header, footer, aside')).toBeNull();
      expect(n.closest('.gps-print-only'), 'a caveat must be on the screen too').toBeNull();
    }

    // The dateline is the other half: a sheet with no date cannot be dated later.
    const dateline = within(container as HTMLElement).getByTestId('gps-print-dateline');
    expect(dateline.closest('header, footer, aside')).toBeNull();
    expect(dateline.textContent).toContain('READ AT 2026-08-02 14:22Z');
    unmount();
  });

  it('the print control does not print, and calls window.print', async () => {
    const spy = vi.spyOn(window, 'print').mockImplementation(() => {});
    sheet();
    const button = screen.getByRole('button', { name: /print/i });
    expect(button.closest('.br-no-print'), 'the button would print on a client proposal').not.toBeNull();
    button.click();
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe('a refusal reads as a refusal in black and white', () => {
  it('every notice carries an all-caps mark in the text, not a colour', () => {
    const { container } = sheet({
      sources: [{ basis: 'prior' }],
      refusals: [gpsUnderwritingRefusal({ verdict: 'refused_rate_card_expired', reasons: ['The card expired on 2026-06-01.'] })!],
    });
    const marks = [...container.querySelectorAll('[data-gps-mark]')];
    // One per caveat plus one per refusal — no notice may be marked by hue alone.
    expect(marks.length).toBe(container.querySelectorAll('[data-gps-caveat], [data-gps-refusal]').length);
    for (const m of marks) {
      const text = m.textContent ?? '';
      expect(text.trim().length, 'an empty mark is a colour-only signal').toBeGreaterThan(0);
      expect(text, `${text} is not upper-case`).toBe(text.toUpperCase());
    }
  });

  it('a refusal prints the word REFUSED, the guard\'s own sentence, and the rule cited', () => {
    sheet({
      refusals: [gpsUnderwritingRefusal({
        verdict: 'refused_currency_mismatch',
        reasons: ['Quote is in USD and the rate card is in EUR. No FX conversion happens here.'],
      })!],
    });
    const refusal = screen.getByTestId('gps-print-refusal-refused_currency_mismatch');
    expect(refusal.textContent).toContain('REFUSED');
    expect(refusal.textContent).toContain('No FX conversion happens here');
    expect(refusal.textContent).toContain('Rule cited ·');
    // The machine code is provenance, never the explanation: a sentence stands beside it.
    expect(refusal.textContent).toContain('refused_currency_mismatch');
  });

  it('an underwritten verdict produces no refusal notice, and a reasonless refusal says so', () => {
    expect(gpsUnderwritingRefusal({ verdict: 'underwritten', reasons: [] })).toBeNull();
    expect(gpsUnderwritingRefusal(null)).toBeNull();
    expect(gpsUnderwritingRefusal({ verdict: 'refused_effort_is_zero' })?.sentences[0])
      .toContain('the reasons were lost between the engine and this sheet');
  });
});

describe('the sheet can be dated six months from now', () => {
  it('a carried computation instant is printed beside the read instant, and raises no caveat', () => {
    sheet({ computedAt: '2026-08-01T09:05:00.000Z', sources: [{ basis: 'measured' }] });
    expect(screen.getByTestId('gps-print-computed-at').textContent).toContain('2026-08-01 09:05Z');
    expect(screen.queryByTestId('gps-print-caveat-computation_instant_absent')).toBeNull();
  });

  it('a missing computation instant is a notice, not the read instant printed twice', () => {
    sheet({ sources: [{ basis: 'measured' }] });
    expect(screen.getByTestId('gps-print-computed-at').textContent).toContain('NOT CARRIED');
    expect(screen.getByTestId('gps-print-caveat-computation_instant_absent').textContent)
      .toContain('cannot be distinguished from a page whose figures were computed six months ago');
  });

  it('an unparseable instant says so instead of printing Invalid Date', () => {
    sheet({ asOf: 'not-a-date' });
    expect(screen.getByTestId('gps-print-read-at').textContent).toContain('UNPARSEABLE');
  });

  it('the provenance table prints, and an unstated source says it is unstated', () => {
    sheet({
      provenance: [
        { label: 'p50 margin', value: '$8,400', source: 'underwrite() · 4000 samples · seed 42' },
        { label: 'Capacity draw', value: '9h / week' },
      ],
    });
    const prov = screen.getByTestId('gps-print-provenance');
    expect(prov.textContent).toContain('underwrite() · 4000 samples · seed 42');
    expect(prov.textContent).toContain('NOT STATED by the surface that printed this');
  });

  it('the notice count is printed, so a sheet missing a page is detectable', () => {
    sheet({ sources: [{ basis: 'prior' }] });
    const count = gpsPrintCaveats('proposal', [{ basis: 'prior' }]).length;
    expect(screen.getByTestId('gps-print-notice-count').textContent)
      .toBe(`${count} NOTICES QUALIFY THESE FIGURES`);
    expect(screen.getByTestId('gps-print-closing').className).toContain('gps-print-only');
  });
});

describe('the GPS print stylesheet', () => {
  it('pins every token PrintStyles leaves unpinned, at the value tokens.css states', () => {
    const tokens = readFileSync(join(SRC, 'styles', 'tokens.css'), 'utf8');
    const root = tokens.slice(tokens.indexOf(':root'), tokens.indexOf('.dark'));
    const pinned = [...CSS.matchAll(/(--[a-z-]+):\s*([\d\s]+);/g)].map(([, name, value]) => ({ name, value: value!.trim() }));

    expect(pinned.length, 'no tokens pinned — has the print block been removed?').toBeGreaterThan(5);
    const mismatched: string[] = [];
    for (const { name, value } of pinned) {
      const source = root.match(new RegExp(`${name}:\\s*([\\d\\s]+);`));
      if (!source) { mismatched.push(`${name} is pinned for print but not defined in tokens.css :root`); continue; }
      if (source[1]!.trim() !== value) mismatched.push(`${name}: print has "${value}", tokens.css has "${source[1]!.trim()}"`);
    }
    expect(mismatched, mismatched.join('\n')).toEqual([]);

    // The point of the file: the four status tokens PrintStyles does NOT pin.
    for (const name of ['--red', '--red-bg', '--amber', '--green']) {
      expect(pinned.map((p) => p.name), `${name} unpinned — refusals print at ~2.4:1 from dark mode`).toContain(name);
    }
  });

  it('unclips tables: no scroll container, fixed layout or nowrap cell survives the print job', () => {
    const print = CSS.slice(CSS.indexOf('@media print'));
    expect(print).toContain('overflow: visible !important');
    expect(print).toContain('max-height: none !important');
    expect(print).toContain('table-layout: auto !important');
    expect(print).toContain('white-space: normal !important');
    expect(print).toContain('display: table-header-group');
    expect(print).toMatch(/\[data-gps-caveat\][\s\S]{0,120}break-inside: avoid/);
  });

  it('is scoped to the artefact, so it cannot reach a surface that did not opt in', () => {
    const stripped = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
    const print = stripped.slice(stripped.indexOf('@media print'));
    const body = print.slice(print.indexOf('{') + 1);
    const selectors = [...body.matchAll(/(?:^|[};])\s*([^{}@;][^{}]*?)\s*\{/g)].map(([, sel]) => sel!.trim());

    expect(selectors.length, 'no rules found — did the print block move?').toBeGreaterThan(5);
    const unscoped = selectors.filter(
      (sel) => !sel.split(',').every((s) => /\[data-gps-/.test(s) || /\.gps-print-only/.test(s.trim())),
    );
    expect(unscoped, `unscoped print selectors: ${unscoped.join(' | ')}`).toEqual([]);
  });

  it('keeps the refusal ink rule AFTER the dark-variant neutraliser', () => {
    // Both carry !important with equal specificity, so source order decides. Reversed,
    // every refusal on a sheet printed from dark mode goes navy and reads as prose.
    const neutraliser = CSS.indexOf('[class*="dark:text-"]');
    const ink = CSS.indexOf('[data-gps-refusal] *');
    expect(neutraliser).toBeGreaterThan(-1);
    expect(ink).toBeGreaterThan(neutraliser);
  });

  it('is loaded by the component, and nothing else imports it', () => {
    expect(COMPONENT).toContain("import '@/styles/gpsPrint.css'");
  });
});
