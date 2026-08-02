import { ShieldAlert, ShieldCheck } from 'lucide-react';
import { clsx } from 'clsx';
import type { LegalPositionReading } from './legalPosition';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  THE STAMP — the whole of what was traded for letting quotes through
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The quote gate is advisory as of 2026-08-02: it runs, it records its verdict, and
 * it no longer refuses. What replaced the refusal is this sentence, on every quote
 * and every proposal surface. That makes it a CONTROL, not a caption, and it is built
 * to the three properties a control needs:
 *
 *  1. IT CANNOT BE MISSED. Full width, its own rule, red, bold, at the top of the
 *     figure it qualifies — never in a footnote, never behind a disclosure, never
 *     collapsible. D3 says uncertainty sits BESIDE the estimate rather than inside
 *     it; a discounted number is a number nobody argues with.
 *  2. IT CANNOT BE DISMISSED. There is no state in this component. It is derived from
 *     the reads on every render, so it disappears the moment the server says a
 *     position is on file and it cannot go stale in the other direction.
 *  3. IT PRINTS. The printed page is what reaches a client, so this must survive
 *     `window.print()` — which is where a bolted-on banner usually dies. Two specific
 *     hazards, both handled by the `@media print` block below rather than by hope:
 *       · `role="status"` is hidden outright by the house print sheet
 *         (`components/report/PrintStyles.tsx:54`), so this is a `role="note"`.
 *       · `--red` / `--red-bg` are NOT among the tokens PrintStyles pins to their
 *         light values, and `.dark` stays on `<html>` during the job. Printed from
 *         dark mode, a `bg-status-blocked-bg` stamp comes out as dark-red ink on
 *         white paper at ~1.5:1 — legible on screen, gone on paper. The rule pins
 *         this element's own colours to print-safe literals.
 *
 * WHAT IT MUST NOT DO: imply that a position ON file is legal advice, or that GPS
 * cleared anything. When `onFile` is true this prints a short factual line naming the
 * source instead of a green tick — the perimeter is a recorded position about where a
 * service may be sold, and the desk still has no legal opinion to give.
 */

const PRINT_CSS = `
@media print {
  [data-legal-stamp] {
    background: #fff !important;
    border-color: #7a0d1e !important;
    color: #7a0d1e !important;
    break-inside: avoid;
  }
  [data-legal-stamp] * { color: #7a0d1e !important; }
  [data-legal-stamp="on-file"], [data-legal-stamp="on-file"] * {
    color: #1e2761 !important;
    border-color: #1e2761 !important;
  }
}
`;

export interface LegalPositionStampProps {
  reading: LegalPositionReading;
  /**
   * What is being qualified, in the operator's words: 'quote', 'proposal',
   * 'engagement dossier'. Printed in the sentence, because "this number" is not
   * specific enough on a page carrying four of them.
   */
  subject: string;
  className?: string;
}

/**
 * WHY THE BASIS IS PRINTED. "No position on file" has three different causes and they
 * are not the same problem to fix: the API said so, the API's perimeter fell back to
 * the compiled placeholders, or nothing on the wire mentioned the field at all. The
 * third is a wiring defect and would otherwise be indistinguishable from the first —
 * which is how a stamp that fires on every page for a bad reason gets ignored.
 */
const BASIS_SENTENCE: Record<LegalPositionReading['basis'], string> = {
  on_file: 'A position is recorded in gps_jurisdiction_profile.',
  stated_absent:
    'The API states no position is on file: gps_jurisdiction_profile holds no human-entered row for it.',
  compiled_placeholder:
    'The perimeter behind this answer is the compiled placeholder set — expired on arrival, authorising nothing. No human has entered a position.',
  field_absent:
    'No read on this screen carried a legal-position field at all. That is read as ABSENT, never as cleared: a field that went missing must not remove this stamp.',
};

export function LegalPositionStamp({ reading, subject, className }: LegalPositionStampProps) {
  const where = reading.jurisdiction
    ? `for ${reading.jurisdiction}`
    : 'for any jurisdiction — none is even named on this screen';

  if (reading.onFile) {
    return (
      <>
        <style>{PRINT_CSS}</style>
        <p
          role="note"
          data-legal-stamp="on-file"
          data-testid="gps-legal-position-stamp"
          className={clsx(
            'border-l-2 border-line px-2 py-1.5 text-micro leading-snug text-navy',
            className,
          )}
        >
          <ShieldCheck size={11} className="mr-1 inline align-baseline text-status-ready" />
          <strong>Legal position on file {where}.</strong>{' '}
          {BASIS_SENTENCE.on_file} A recorded perimeter position is not legal advice and this{' '}
          {subject} is not a legal opinion — it states where the service may be sold, nothing more.
          {reading.perimeterSource && (
            <span className="ml-1 font-mono text-[10px]">source · {reading.perimeterSource}</span>
          )}
        </p>
      </>
    );
  }

  return (
    <>
      <style>{PRINT_CSS}</style>
      <section
        role="note"
        data-legal-stamp="absent"
        data-testid="gps-legal-position-stamp"
        aria-label="No legal position on file"
        className={clsx(
          'border-2 border-status-blocked/70 bg-status-blocked-bg px-3 py-2 text-status-blocked',
          className,
        )}
      >
        <p className="flex items-start gap-1.5 text-label font-bold uppercase leading-snug tracking-wide">
          <ShieldAlert size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>No legal position on file {where}</span>
        </p>
        {/* The two claims the owner is relying on, in the order an operator reads:
            what is missing, then what that means about the number beside it. */}
        <p className="mt-1 text-label font-semibold leading-snug">
          This {subject} is <strong>NOT legally cleared</strong>. No LCX legal position exists for
          this jurisdiction, so nothing here has been checked against one — do not present it to a
          client as cleared, permitted or approved.
        </p>
        {/* THE GUARD'S OWN SENTENCE, VERBATIM, when it reaches here.
            `legalPositionNotice` is written next to the gate that decided
            (perimeterGuard.ts:164) and is printed rather than paraphrased, for the same
            reason `chase.referenceNotice` and `acceptance.gateMechanism` are: one
            wording, changed in one place, and a screen that cannot drift from the rule
            it is reporting. */}
        {reading.notice && (
          <p className="mt-1 text-micro font-semibold leading-snug" data-testid="gps-legal-position-notice">
            {reading.notice}
          </p>
        )}
        <p className="mt-1 text-micro leading-snug">
          {BASIS_SENTENCE[reading.basis]}
        </p>
        {/* The gate still ran. Saying so is the difference between "the check was
            skipped" and "the check ran, found nothing on file, and let this through
            on purpose" — and only the second one is what the desk agreed to. */}
        <p className="mt-1 font-mono text-[10px] leading-snug">
          The jurisdiction quote gate ran and recorded this verdict; since 2026-08-02 it advises and
          does not block, so the quote was permitted with this position missing.
          {reading.advisory && ' The API confirms this act proceeded under that override.'}
          {reading.gateCode && ` Gate · ${reading.gateCode}.`}
          {reading.perimeterSource && ` Perimeter source · ${reading.perimeterSource}.`}
        </p>
      </section>
    </>
  );
}
