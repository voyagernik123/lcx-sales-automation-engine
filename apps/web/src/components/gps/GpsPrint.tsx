import type { ReactNode } from 'react';
import { Printer } from 'lucide-react';
import { clsx } from 'clsx';
import {
  PRICE_BANDS_ARE_PLACEHOLDERS,
  EFFORT_TRIPLES_ARE_PLACEHOLDERS,
  COORDINATION_HOURS_ARE_PLACEHOLDERS,
  PERIMETER_IS_UNREVIEWED,
  PERIMETER_UNREVIEWED_REASON,
  DISCLOSURES_ARE_NOT_COUNSEL_REVIEWED,
  DISCLOSURES_UNREVIEWED_REASON,
  BASIS_LABEL,
  MIN_OUTCOMES_FOR_MEASURED,
  UNDERWRITE_VERDICT_LABEL,
  isRefusal,
  type UnderwriteVerdict,
  type UnderwritingBasis,
} from '@lcx/shared';
import { Button } from '@/components/ui';
import { PrintStyles } from '@/components/report/PrintStyles';
import { responseMeta } from '@/lib/api/meta';
import { readLegalPosition } from './legalPosition';
import '@/styles/gpsPrint.css';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  THE PRINTED GPS ARTEFACT — a proposal, a verdict, the book, a delivery record
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * A GPS proposal is the thing that actually reaches a client and a delivery record
 * is the thing that reaches an auditor, so paper is an OUTPUT of this compartment
 * and not a screenshot of it. This component is what the four printable surfaces
 * wrap their body in; it owns the three parts of an artefact that a screen does
 * not need and a sheet of paper cannot do without.
 *
 *  1. THE DATELINE. What this is, when it was read, and when its figures were
 *     COMPUTED — two different instants, printed separately, because a page found
 *     in a drawer in six months is worthless unless it can be dated. When nothing
 *     behind the artefact carried a computation instant, the dateline says so and
 *     a caveat is raised; it never quietly prints the read time in its place.
 *  2. THE NOTICES. See below — this is the whole point on paper.
 *  3. THE PROVENANCE. What produced each figure, printed as a table rather than
 *     kept behind an inspector, because on paper there is nothing to click (D1).
 *
 * ══ THE HONESTY REQUIREMENT ═══════════════════════════════════════════════════
 * A number that looks authoritative on a page a client is holding is the most
 * dangerous form this data can take. On screen a placeholder price is one hover
 * from its own caveat; on paper it is just a price, in a document with a date and
 * a logo on it, being read by someone who was not in the room. So three things
 * MUST appear on the face of the sheet, and `gpsPrintCaveats` derives them rather
 * than leaving them to whoever wired the surface:
 *   · a placeholder price (`PRICE_BANDS_ARE_PLACEHOLDERS`),
 *   · an unreviewed perimeter position (`PERIMETER_IS_UNREVIEWED`, plus what the
 *     payload itself said via `readLegalPosition`),
 *   · a distribution whose basis is `prior` or `blended` rather than `measured`.
 * Plus the four adjacent ones a printed sheet is equally exposed to: placeholder
 * effort, placeholder coordination hours, unreviewed disclosure wording, and an
 * inert environment where an empty table is evidence of nothing.
 *
 * ══ NO COLOUR-ONLY SIGNALLING ═════════════════════════════════════════════════
 * Every caveat and every refusal carries a `mark` — an all-caps word rendered in
 * the text (`data-gps-mark`), not a hue, not an icon and not a border. A greyscale
 * printer flattens `--red`, `--amber` and `--green` to within a few percent of
 * each other, and the ink rules in `styles/gpsPrint.css` only stop the notice
 * disappearing; the WORD is what makes a refusal read as a refusal. The test
 * asserts a non-empty mark on every notice, so a future caveat cannot be added
 * that relies on its colour.
 *
 * ══ WHAT THIS FILE DOES NOT DO, and must not be read as doing ═════════════════
 *  · It does not mount itself, and ONE of the four kinds is mounted. This said "NO
 *    GPS surface wraps its body in `GpsPrintArtefact`" until Phase 11's wiring pass,
 *    which wrapped the underwriting answer (`pages/GpsUnderwriting.tsx`) — and took
 *    that page's own `.dark`-stripping print dance out with it, since this component
 *    argues against the dance and pins the tokens instead. `kind: 'proposal'`,
 *    `'book'` and `'delivery_record'` are still apparatus with tests and nothing on
 *    paper: `Gps.tsx`'s engagement card, `GpsBook.tsx` and `GpsDelivery.tsx` do not
 *    call this. Saying which is cheaper than someone concluding from the tests that a
 *    GPS proposal already prints this way.
 *  · It does not compute, re-derive or round any figure. Everything printed is
 *    either passed in, read off a payload, or a compiled constant — a printer that
 *    recomputes is a second opinion nobody reconciles.
 *  · It cannot promise a caveat for a defect nobody has modelled. It reports the
 *    eight conditions in `GpsCaveatId` — the seven above plus an absent
 *    computation instant — and is silent about everything else, which is why the
 *    dateline prints the read instant even when it prints nothing else: a reader
 *    can always tell how old the sheet is.
 *
 * HOUSE PRINT RULES OBSERVED (learned the hard way elsewhere, not rediscovered):
 *  · NO `<header>`, `<footer>` OR `<aside>` ANYWHERE, and no `role="status"`.
 *    `PrintStyles` hides all four (`components/report/PrintStyles.tsx:52`), so the
 *    dateline and the notices — the two parts that matter most — would vanish from
 *    the sheet. They are `<div>`s and `<section>`s with `role="note"`.
 *    `__tests__/gpsPrint.test.tsx` fails if any of them appears.
 *  · The print control itself is inside `.br-no-print`. A button printed on a
 *    client proposal is the tell that nobody ever printed it.
 *  · `window.print()` is called directly, with no `.dark`-stripping timer. Wbr
 *    removed exactly that dance (`pages/Wbr.tsx:60`) because it cannot help a
 *    plain ⌘P and restores the class under a blocking print job; the tokens are
 *    pinned inside the media query instead, and the `dark:` VARIANTS that survive
 *    are neutralised inside the artefact by `styles/gpsPrint.css`.
 */

/* ════════ what is being printed ════════ */

export type GpsArtefactKind = 'proposal' | 'underwriting' | 'book' | 'delivery_record' | 'dossier' | 'invoice';

/** Printed under the title. Says who the sheet is for, since that governs its tone. */
export const GPS_ARTEFACT_LABEL: Record<GpsArtefactKind, string> = {
  proposal: 'GPS proposal · the artefact a client receives',
  underwriting: 'GPS underwriting verdict · internal, and not a client document',
  book: 'GPS book · the position of the whole book at one instant',
  delivery_record: 'GPS delivery record · the artefact an auditor receives',
  dossier: 'GPS research dossier · a MODEL DRAFT, cited or refused — internal, never a client document',
  invoice: 'GPS invoice · a demand for payment, traced to an acceptance',
};

/* ════════ the honesty ceiling, in a type ════════ */

/**
 * HOW THIS SHEET KNOWS THE CAVEAT APPLIES. Modelled on `MarketingNounReach`
 * (`components/command/marketingGrammar.ts:116`): the variant is on the row, so a
 * reader is never left to guess whether a notice describes the build or the
 * payload — and the third variant exists so that a MISSING field prints as a
 * notice rather than as silence.
 *
 *  compiled_flag  a constant in `@lcx/shared` says so, for every artefact this
 *                 build prints, whatever the payload contains. `constant` and
 *                 `source` name it so the reader can check it.
 *  payload_field  read off THIS artefact's own payload. `field` is the key and
 *                 `value` is what it said, verbatim, so the caveat is checkable.
 *  field_absent   no read carried the field. Reported as UNVERIFIED, never as
 *                 clean: a field that goes missing must not remove a notice, which
 *                 is the same one-way ratchet `legalPosition.ts:17` runs on.
 */
export type GpsCaveatBasis =
  | { readonly via: 'compiled_flag'; readonly constant: string; readonly source: string }
  | { readonly via: 'payload_field'; readonly field: string; readonly value: string }
  | { readonly via: 'field_absent'; readonly field: string; readonly read: string };

export type GpsCaveatId =
  | 'inert_compartment'
  | 'placeholder_price'
  | 'distribution_basis'
  | 'placeholder_effort'
  | 'placeholder_coordination_hours'
  | 'unreviewed_perimeter'
  | 'unreviewed_disclosure'
  | 'computation_instant_absent';

/** One sentence a reader of the paper must not be able to miss. */
export interface GpsPrintCaveat {
  readonly id: GpsCaveatId;
  /** The all-caps word that carries the meaning without colour. Never empty. */
  readonly mark: string;
  /** What is wrong, as a claim about this sheet. */
  readonly headline: string;
  /** What it means for the figures beside it, in sentences an operator can act on. */
  readonly sentence: string;
  /** The rule or constant that produced the notice, with its file and line. */
  readonly rule: string;
  readonly basis: GpsCaveatBasis;
}

/* ════════ reading the payloads, defensively ════════ */

const asRecord = (v: unknown): Record<string, unknown> | undefined =>
  typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : undefined;

/**
 * The objects worth searching, one level deep only — the same discipline as
 * `legalPosition.ts:103`. A recursive walk would find a `basis` on some unrelated
 * nested row and print a caveat about the wrong figure.
 */
const SUB_OBJECTS = ['underwriting', 'blend', 'quote', 'engagement', 'record', 'book', 'summary'] as const;

function candidates(source: unknown): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const push = (v: unknown) => { const r = asRecord(v); if (r) out.push(r); };
  push(source);
  push(responseMeta(source));
  for (const base of [...out]) for (const key of SUB_OBJECTS) push(base[key]);
  return out;
}

const BASES: readonly UnderwritingBasis[] = ['prior', 'blended', 'measured'];

/** The underwriting basis, and the sample size behind it when a read carried one. */
function readBasis(sources: readonly unknown[]): { basis: UnderwritingBasis | null; sampleSize: number | null } {
  let basis: UnderwritingBasis | null = null;
  let sampleSize: number | null = null;
  for (const source of sources) {
    for (const c of candidates(source)) {
      const v = c.basis;
      // A weaker basis anywhere wins: two reads that disagree resolve to the
      // unflattering one, exactly as `compiled_placeholder` beats a `true` in
      // `legalPosition.ts:44`.
      if (typeof v === 'string' && (BASES as readonly string[]).includes(v)) {
        const found = v as UnderwritingBasis;
        if (basis === null || BASES.indexOf(found) < BASES.indexOf(basis)) basis = found;
      }
      if (sampleSize === null && typeof c.sampleSize === 'number' && Number.isFinite(c.sampleSize)) {
        sampleSize = c.sampleSize;
      }
    }
  }
  return { basis, sampleSize };
}

/** `false` only when a read said so. Silence is not a migration (`meta.ts:96`). */
function statedNotMigrated(sources: readonly unknown[]): boolean {
  for (const source of sources) {
    if (responseMeta(source)?.migrated === false) return true;
    for (const c of candidates(source)) if (c.migrated === false) return true;
  }
  return false;
}

/* ════════ the notices ════════ */

const KINDS_ALL: readonly GpsArtefactKind[] = ['proposal', 'underwriting', 'book', 'delivery_record', 'dossier', 'invoice'];

/**
 * WHICH SHEETS EACH NOTICE APPLIES TO, as data rather than as `if` statements
 * scattered through the render, so the coverage can be read in one place and
 * asserted in one test. Price applies to the book because a book of margins built
 * on placeholder bands is a book of placeholder margins.
 */
const CAVEAT_KINDS: Record<GpsCaveatId, readonly GpsArtefactKind[]> = {
  inert_compartment: KINDS_ALL,
  /*
   * NOT on `invoice`, and that omission is deliberate rather than an oversight. An
   * invoice's amount is a figure a NAMED HUMAN typed and an approver issued against an
   * accepted deliverable; it does not inherit the catalogue's placeholder bands, and
   * stamping "PLACEHOLDER PRICE" across a demand for payment would make a true document
   * unusable. The dossier carries it because a dossier discusses the offer.
   */
  placeholder_price: ['proposal', 'underwriting', 'book', 'dossier'],
  distribution_basis: ['proposal', 'underwriting', 'book'],
  placeholder_effort: ['proposal', 'underwriting'],
  placeholder_coordination_hours: ['book', 'delivery_record'],
  /* The perimeter governs what may be sold and to whom, so it qualifies every sheet —
     including an invoice, whose subject is work that was performed somewhere. */
  unreviewed_perimeter: KINDS_ALL,
  unreviewed_disclosure: ['proposal', 'delivery_record'],
  computation_instant_absent: KINDS_ALL,
};

/**
 * Every notice that must appear on the face of this sheet, in the order a reader
 * needs them: what makes the figures wrong first, what makes them undated last.
 *
 * `computedAt` is the instant the SERVER computed the figures, not the instant the
 * browser read them. Passing `null` is not an error — most GPS payloads carry no
 * such field today — but it produces the `computation_instant_absent` notice,
 * because an undated figure on paper is the defect this whole slice exists for.
 */
export function gpsPrintCaveats(
  kind: GpsArtefactKind,
  sources: readonly unknown[],
  opts: { computedAt?: string | null } = {},
): readonly GpsPrintCaveat[] {
  const out: GpsPrintCaveat[] = [];
  const applies = (id: GpsCaveatId) => CAVEAT_KINDS[id].includes(kind);

  if (applies('inert_compartment') && statedNotMigrated(sources)) {
    out.push({
      id: 'inert_compartment',
      mark: 'INERT ENVIRONMENT',
      headline: 'This sheet was printed from an environment where the GPS tables do not exist',
      sentence:
        'The API reports Global Services as not migrated here, so 0047_gps.sql is not applied and there are no engagement, conflict or deliverable rows to read. An empty table on this sheet is therefore evidence of NOTHING — not of a clean record, and not of a desk with nothing outstanding — and it must not be handed to anyone as either.',
      rule: 'meta.migrated === false (apps/web/src/lib/api/meta.ts:104) · D2, a refusal states its reason',
      basis: { via: 'payload_field', field: 'meta.migrated', value: 'false' },
    });
  }

  if (applies('placeholder_price') && PRICE_BANDS_ARE_PLACEHOLDERS) {
    out.push({
      id: 'placeholder_price',
      mark: 'PLACEHOLDER PRICE',
      headline: 'Every price on this sheet is a PLACEHOLDER and is not a quote',
      sentence:
        'The bands were derived from a stated $10–25k engagement range and nothing else, and the vendor costs from no rate card at all. The margin arithmetic is correct and UNCALIBRATED — two different claims, and only one of them is a defect. Nothing here has been agreed by LCX, nothing here is an offer, and no figure on this sheet may be relied on as a price. Real bands land in one place, packages/shared/src/gps/catalogue.ts, and this notice disappears with them.',
      rule: 'PRICE_BANDS_ARE_PLACEHOLDERS (packages/shared/src/gps/catalogue.ts:58) · D8, no claim without a mechanism',
      basis: {
        via: 'compiled_flag',
        constant: 'PRICE_BANDS_ARE_PLACEHOLDERS',
        source: 'packages/shared/src/gps/catalogue.ts:58',
      },
    });
  }

  if (applies('distribution_basis')) {
    const { basis, sampleSize } = readBasis(sources);
    const n = sampleSize === null ? 'an unreported number of' : `${sampleSize}`;
    if (basis === null) {
      out.push({
        id: 'distribution_basis',
        mark: 'BASIS UNVERIFIED',
        headline: 'This sheet cannot say whether its distribution was measured or assumed',
        sentence:
          'No read behind this artefact carried an underwriting basis, so the basis is printed as UNVERIFIED rather than as measured. That direction is deliberate: a field that goes missing must not print as a measurement. Treat every percentile here as an assumption until the surface that produced it can name its basis.',
        rule: 'Underwriting.basis (packages/shared/src/gps/underwrite.ts:496) was absent from every read · D3, uncertainty is reported beside the estimate',
        basis: { via: 'field_absent', field: 'basis', read: 'no candidate object carried it' },
      });
    } else if (basis !== 'measured') {
      out.push({
        id: 'distribution_basis',
        mark: basis === 'prior' ? 'PRIOR, NOT MEASURED' : 'PART MEASURED, PART ASSUMED',
        headline: `The distribution on this sheet has a ${basis.toUpperCase()} basis`,
        sentence:
          `${BASIS_LABEL[basis]}. ` +
          (basis === 'prior'
            ? 'No recorded outcome informs any percentile here: the numbers are the output of arithmetic over an estimate, not a measurement of anything that has happened. '
            : `It draws partly on ${n} recorded outcome(s), which is short of the threshold at which the cost side stands on its own. `) +
          `${MIN_OUTCOMES_FOR_MEASURED} recorded outcomes are required before this basis reads MEASURED, and the basis is derived from the blend weight that actually moved the arithmetic rather than being a label anyone chose.`,
        rule: 'Underwriting.basis (packages/shared/src/gps/underwrite.ts:496), derived at underwrite.ts:582 · MIN_OUTCOMES_FOR_MEASURED = 8 · D3',
        basis: { via: 'payload_field', field: 'basis', value: basis },
      });
    }
  }

  if (applies('placeholder_effort') && EFFORT_TRIPLES_ARE_PLACEHOLDERS) {
    out.push({
      id: 'placeholder_effort',
      mark: 'PLACEHOLDER EFFORT',
      headline: 'The effort behind every cost figure on this sheet is a placeholder triple',
      sentence:
        'Nobody who has delivered these services has supplied optimistic, likely and pessimistic days, so the width of the distribution is the width of an assumption and not evidence about the risk. The p50 is not a forecast and the p90 is not a worst case; they are what this arithmetic returns when it is fed a guess.',
      rule: 'EFFORT_TRIPLES_ARE_PLACEHOLDERS (packages/shared/src/gps/underwrite.ts:126) · D3',
      basis: {
        via: 'compiled_flag',
        constant: 'EFFORT_TRIPLES_ARE_PLACEHOLDERS',
        source: 'packages/shared/src/gps/underwrite.ts:126',
      },
    });
  }

  if (applies('placeholder_coordination_hours') && COORDINATION_HOURS_ARE_PLACEHOLDERS) {
    out.push({
      id: 'placeholder_coordination_hours',
      mark: 'PLACEHOLDER HOURS',
      headline: 'The coordination hours behind any capacity figure here are placeholders',
      sentence:
        'No hours have ever been measured against a delivered engagement, so a capacity draw, a headroom figure or a crossing point on this sheet is indicative and nothing more. It is a mechanism running on an assumed input, which is worth having and is not a measurement.',
      rule: 'COORDINATION_HOURS_ARE_PLACEHOLDERS (packages/shared/src/gps/delivery.ts:1186) · D8',
      basis: {
        via: 'compiled_flag',
        constant: 'COORDINATION_HOURS_ARE_PLACEHOLDERS',
        source: 'packages/shared/src/gps/delivery.ts:1186',
      },
    });
  }

  if (applies('unreviewed_perimeter')) {
    const reading = readLegalPosition(sources);
    const where = reading.jurisdiction
      ? `for ${reading.jurisdiction}`
      : 'for any jurisdiction — none is named on this sheet';
    if (PERIMETER_IS_UNREVIEWED || !reading.onFile) {
      out.push({
        id: 'unreviewed_perimeter',
        mark: 'UNREVIEWED PERIMETER',
        headline: `No reviewed legal position stands behind this sheet ${where}`,
        sentence:
          `${PERIMETER_UNREVIEWED_REASON} Nothing on this sheet has been checked against a cleared position, so it may not be presented as permitted, cleared or approved, and it is not legal advice. The jurisdiction gate ran and is advisory since 2026-08-02: this artefact exists because the gate was overridden by policy, not because it passed. Read for this artefact · legal position ${reading.onFile ? 'ON FILE' : 'ABSENT'}, basis ${reading.basis}${reading.perimeterSource ? `, perimeter source ${reading.perimeterSource}` : ''}.`,
        rule: 'PERIMETER_IS_UNREVIEWED (packages/shared/src/gps/perimeter.ts:195) · the quote gate is advisory, not passed · D2',
        // The second arm cannot be reached while the constant is true, and it is
        // written anyway: flipping `PERIMETER_IS_UNREVIEWED` must not silently drop
        // this notice from a sheet whose own payload says no position is on file.
        basis: PERIMETER_IS_UNREVIEWED
          ? {
              via: 'compiled_flag',
              constant: 'PERIMETER_IS_UNREVIEWED',
              source: 'packages/shared/src/gps/perimeter.ts:195',
            }
          : reading.basis === 'field_absent'
            ? { via: 'field_absent', field: 'legalPositionOnFile', read: 'no read carried it' }
            : { via: 'payload_field', field: 'legalPositionOnFile', value: String(reading.onFile) },
      });
    }
  }

  if (applies('unreviewed_disclosure') && DISCLOSURES_ARE_NOT_COUNSEL_REVIEWED) {
    out.push({
      id: 'unreviewed_disclosure',
      mark: 'NOT COUNSEL-REVIEWED',
      headline: 'Any disclosure wording on this sheet is a versioned draft, not reviewed text',
      sentence: DISCLOSURES_UNREVIEWED_REASON,
      rule: 'DISCLOSURES_ARE_NOT_COUNSEL_REVIEWED (packages/shared/src/gps/disclosure.ts:45) · owner: founder + counsel',
      basis: {
        via: 'compiled_flag',
        constant: 'DISCLOSURES_ARE_NOT_COUNSEL_REVIEWED',
        source: 'packages/shared/src/gps/disclosure.ts:45',
      },
    });
  }

  if (applies('computation_instant_absent') && !opts.computedAt) {
    out.push({
      id: 'computation_instant_absent',
      mark: 'UNDATED FIGURES',
      headline: 'The instant these figures were computed is not on this sheet',
      sentence:
        'Nothing behind this artefact carried the instant its figures were computed, so the sheet can be dated only to when it was READ — printed in the dateline above. A page found in six months therefore cannot be distinguished from a page whose figures were computed six months ago. Do not treat the read instant as the computation instant.',
      rule: 'no computedAt was passed to GpsPrintArtefact · D7, every artefact is dated',
      basis: { via: 'field_absent', field: 'computedAt', read: 'the surface passed none' },
    });
  }

  return out;
}

/* ════════ refusals, reprinted ════════ */

/** A refusal, in the shape paper needs: a word, a sentence, and the rule cited. */
export interface GpsPrintRefusal {
  /** The machine code, printed as provenance — never as the explanation. */
  readonly code: string;
  readonly mark: string;
  readonly headline: string;
  readonly sentences: readonly string[];
  readonly rule: string;
}

/**
 * An `Underwriting` refusal as a printable notice, or `null` when the quote was
 * underwritten. Structurally typed rather than taking `Underwriting`, so a surface
 * holding a narrower shape (a route echo, a stored verdict) can still print one.
 *
 * The verdict CODE never stands alone: `UNDERWRITE_VERDICT_LABEL` supplies the
 * sentence and `reasons` are reprinted verbatim, because the guard's own wording
 * is what a reader can act on and a code is what a reader has to ask about.
 */
export function gpsUnderwritingRefusal(
  u: { verdict: UnderwriteVerdict; reasons?: readonly string[] } | null | undefined,
): GpsPrintRefusal | null {
  if (!u || !isRefusal(u.verdict)) return null;
  return {
    code: u.verdict,
    mark: 'REFUSED',
    headline: UNDERWRITE_VERDICT_LABEL[u.verdict],
    sentences: u.reasons && u.reasons.length > 0
      ? [...u.reasons]
      : ['The verdict carried no reason. That is a defect in the read, not a clean refusal: every refusal path in the engine pushes a sentence before it returns (underwrite.ts:375 onward), so an empty list means the reasons were lost between the engine and this sheet.'],
    rule: `UnderwriteVerdict · ${u.verdict} (packages/shared/src/gps/underwrite.ts:291) · D2, the system says no and why`,
  };
}

/* ════════ the sheet ════════ */

/** One row of the provenance table: what produced a figure, and where from. */
export interface GpsPrintProvenanceRow {
  readonly label: string;
  readonly value: string;
  /** The formula, table or file the value came from. Printed beside it (D1). */
  readonly source?: string;
}

export interface GpsPrintArtefactProps {
  kind: GpsArtefactKind;
  /** The artefact's own title, e.g. the client and offer it is about. */
  title: string;
  /** The instant the surface read its clock, once. `useAsOf`-style, never per-figure. */
  asOf: string;
  /**
   * The instant the SERVER computed the figures, when a payload carried one. Pass
   * `null` rather than `asOf`: a caveat is raised, which is the honest outcome.
   */
  computedAt?: string | null;
  /** Every payload the surface is holding. Read for basis, migration and perimeter. */
  sources?: readonly unknown[];
  provenance?: readonly GpsPrintProvenanceRow[];
  refusals?: readonly GpsPrintRefusal[];
  children: ReactNode;
  className?: string;
}

/** ISO → `2026-08-02 14:22Z`. Never prints "Invalid Date" onto an artefact. */
function stamp(iso: string | null | undefined): string {
  if (!iso) return '—';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return `UNPARSEABLE (${iso})`;
  const d = new Date(t).toISOString();
  return `${d.slice(0, 10)} ${d.slice(11, 16)}Z`;
}

export function GpsPrintArtefact(props: GpsPrintArtefactProps) {
  const { kind, title, asOf, computedAt = null, sources = [], provenance = [], refusals = [] } = props;
  const caveats = gpsPrintCaveats(kind, sources, { computedAt });

  return (
    <div data-gps-artefact={kind} data-testid="gps-print-artefact" className={clsx('br-page', props.className)}>
      {/* The house sheet: @page A4, chrome hidden, dark tokens pinned. Mounted here
          so an artefact is printable on a surface that mounts nothing else. */}
      <PrintStyles />

      {/* A DIV, NOT A <header>. `PrintStyles` hides `header` in print, which would
          delete the dateline — the line that makes this an artefact and not a
          screenshot. Same reason the closing statement below is a <section>. */}
      <div data-gps-dateline="" data-testid="gps-print-dateline" className="border-b-2 border-navy pb-2">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="font-mono text-[17px] font-bold uppercase tracking-wider">{title}</h1>
          <span className="font-mono text-micro uppercase tracking-wider text-grey">{GPS_ARTEFACT_LABEL[kind]}</span>
          <span className="br-no-print ml-auto flex gap-1.5">
            <Button size="sm" variant="secondary" onClick={() => window.print()}>
              <Printer size={13} /> Print
            </Button>
          </span>
        </div>
        <div className="mt-1 font-mono text-micro tabular-nums text-grey">
          <span data-testid="gps-print-read-at">READ AT {stamp(asOf)}</span>
          {' · '}
          <span data-testid="gps-print-computed-at">
            FIGURES COMPUTED{' '}
            {computedAt ? stamp(computedAt) : 'NOT CARRIED — this sheet is dated only to the read above'}
          </span>
          {' · '}
          <span data-testid="gps-print-notice-count">
            {caveats.length} NOTICE{caveats.length === 1 ? '' : 'S'} QUALIFY THESE FIGURES
          </span>
        </div>
      </div>

      {/* THE NOTICES, above the body, never behind a disclosure and never
          collapsible. An <ol> because they are read in order and because a reader
          can then tell a missing one from a reordered one. */}
      {caveats.length > 0 && (
        <ol data-testid="gps-print-caveats" className="mt-2 space-y-1.5">
          {caveats.map((c) => (
            <li
              key={c.id}
              data-gps-caveat={c.id}
              data-testid={`gps-print-caveat-${c.id}`}
              role="note"
              className="border-2 border-status-blocked/70 bg-status-blocked-bg px-2.5 py-1.5 text-status-blocked"
            >
              <p className="font-mono text-label font-bold uppercase leading-snug tracking-wide">
                <span data-gps-mark="" data-testid={`gps-print-mark-${c.id}`}>{c.mark}</span>
                {' — '}
                {c.headline}
              </p>
              <p className="mt-1 text-label leading-snug">{c.sentence}</p>
              <p className="mt-1 font-mono text-[10px] leading-snug">
                Rule cited · {c.rule}
                {' · Basis · '}
                {c.basis.via === 'compiled_flag'
                  ? `compiled flag ${c.basis.constant} (${c.basis.source})`
                  : c.basis.via === 'payload_field'
                    ? `read from this payload · ${c.basis.field} = ${c.basis.value}`
                    : `field absent · ${c.basis.field} — ${c.basis.read}`}
              </p>
            </li>
          ))}
        </ol>
      )}

      {refusals.length > 0 && (
        <section data-testid="gps-print-refusals" className="mt-2 space-y-1.5">
          {refusals.map((r) => (
            <div
              key={r.code}
              data-gps-refusal={r.code}
              data-testid={`gps-print-refusal-${r.code}`}
              role="note"
              className="border-2 border-status-blocked/70 bg-status-blocked-bg px-2.5 py-1.5 text-status-blocked"
            >
              <p className="font-mono text-label font-bold uppercase leading-snug tracking-wide">
                <span data-gps-mark="" data-testid={`gps-print-refusal-mark-${r.code}`}>{r.mark}</span>
                {' — '}
                {r.headline}
              </p>
              {r.sentences.map((s, i) => (
                <p key={i} className="mt-1 text-label leading-snug">{s}</p>
              ))}
              <p className="mt-1 font-mono text-[10px] leading-snug">Rule cited · {r.rule}</p>
            </div>
          ))}
        </section>
      )}

      <div className="mt-3">{props.children}</div>

      {provenance.length > 0 && (
        <section data-testid="gps-print-provenance" className="mt-4 break-inside-avoid">
          <h2 className="border-b border-line font-mono text-micro font-bold uppercase tracking-wider text-grey">
            Provenance — what produced each figure
          </h2>
          <table className="mt-1 w-full text-left">
            <thead>
              <tr className="font-mono text-[10px] uppercase tracking-wider text-grey">
                <th className="py-0.5 pr-3 font-semibold">Figure</th>
                <th className="py-0.5 pr-3 font-semibold">Value</th>
                <th className="py-0.5 font-semibold">Source</th>
              </tr>
            </thead>
            <tbody className="font-mono text-micro tabular-nums">
              {provenance.map((p) => (
                <tr key={p.label} className="border-t border-line/60">
                  <td className="py-0.5 pr-3">{p.label}</td>
                  <td className="py-0.5 pr-3">{p.value}</td>
                  <td className="py-0.5 text-grey">{p.source ?? 'NOT STATED by the surface that printed this'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* PAPER ONLY. Meaningless on a screen the operator can just reload, and the
          one thing a sheet found in a drawer needs. `gps-print-only` is display:none
          until the print media query (`styles/gpsPrint.css`). */}
      <section
        data-testid="gps-print-closing"
        className="gps-print-only mt-4 border-t border-navy pt-1 font-mono text-[10px] leading-snug text-grey"
      >
        This is a snapshot printed from LCX Global Services at {stamp(asOf)}, not a live read: the
        surface it came from can have moved since. {caveats.length} notice
        {caveats.length === 1 ? '' : 's'} qualifying these figures {caveats.length === 1 ? 'is' : 'are'} printed
        above and none of them is optional — a copy of this sheet without them is not this artefact.
      </section>
    </div>
  );
}

export default GpsPrintArtefact;
