import { useState } from 'react';
import { FileText, Printer } from 'lucide-react';
import { Button } from '@/components/ui';
import { toast } from '@/components/shared/Toast';
import { fetchExportBundle } from '@/lib/api/marketing';
import { Absent, NotPermitted, Nothing, Refused, Th, Td, apiReadRefusal } from './DeskAtoms';
import { errorSentence, notPermitted, routeAbsent } from './narrow';
import type { BundleCompletenessLine, ExportBundle } from './vocabulary';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  THE ART 8(2) PRODUCTION — one communication, reproducible, with its absences
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Art 8(2) is a PRODUCE-ON-DEMAND duty, which makes this a feature rather than an
 * afterthought: an authority asks, and the desk hands over one communication with who
 * wrote it, who cleared it, which claim versions it used, what the desk knew at the time,
 * and the regime classification AS RECORDED — never recomputed, because recomputing at
 * export time answers a different question from the one asked.
 *
 * ── WHAT THIS PANEL IS FOR, AND IT IS NOT THE HAPPY PATH ──────────────────────
 * `BundleCompletenessLine` is the type the whole export exists around, and its two
 * load-bearing members are `absent` and `unverifiable`. A production that could not
 * reconstruct a fact NAMES the fact and the reason, in the output, beside the record it
 * belongs to. So the completeness statement is rendered FIRST and never behind a
 * disclosure: a bundle handed to a supervisor with silent holes in it is worse than one
 * that says where the holes are, and the second is the only kind this desk can honestly
 * produce today.
 *
 * `counts.integrityBroken` and `counts.integrityUnverifiable` are printed as separate
 * figures for the same reason. A record whose hash does not match is a finding; a record
 * whose hash cannot be checked is an absence. Averaging them would let the second hide
 * inside the first.
 *
 * ── THE PRINT PATH, AND WHY IT IS NOT A DOWNLOAD ──────────────────────────────
 * There is no file download and no clipboard write. `renderedText` is the artefact — the
 * server renders it deterministically from the document, so two productions of the same
 * window with the same `generatedAt` are byte-identical and their `digest` proves it — and
 * this panel PRINTS it. `window.print()` produces a paper or PDF artefact through the
 * browser's own dialogue, which the operator sees and confirms.
 *
 * That is deliberate rather than lazy. A download button writes a file that leaves no trace
 * on this side, and a copy button writes a stranger's data onto a shared clipboard with no
 * record of who took it. The digest is displayed beside the text so that whoever hands the
 * production over can state which production they handed over.
 *
 * NOTHING HERE PUBLISHES. The production goes to an authority, by whatever channel legal
 * uses, outside this system.
 */

const LABEL = 'Producing an Art 8(2) bundle';

const STATE_CLASS: Record<BundleCompletenessLine['state'], string> = {
  reconstructed: 'text-grey',
  absent: 'text-status-blocked font-bold',
  unverifiable: 'text-status-conditional font-semibold',
};

const STATE_WORD: Record<BundleCompletenessLine['state'], string> = {
  reconstructed: 'reconstructed',
  absent: 'ABSENT',
  unverifiable: 'CANNOT BE VERIFIED',
};

/**
 * The completeness statement. Rendered before the document, never inside a `<details>`.
 *
 * An EMPTY list is stated as a claim, because it IS one: "every fact in this bundle was
 * reconstructed" is the strongest sentence in the production and it must not arrive as a
 * blank space that a reader interprets as "nothing to report".
 */
function Completeness({ lines, scope }: { lines: readonly BundleCompletenessLine[]; scope: string }) {
  if (lines.length === 0) {
    return (
      <Nothing>
        <span className="font-semibold">{scope}:</span> the production states that every field was
        reconstructed and nothing was absent or unverifiable. That is a strong claim — check it against the
        records below before handing this over, because an empty completeness statement and a completeness
        statement nobody generated look identical.
      </Nothing>
    );
  }
  return (
    <div className="space-y-1">
      <p className="text-micro font-semibold text-navy">{scope}</p>
      <table className="w-full border-collapse">
        <caption className="sr-only">{scope} completeness statement</caption>
        <thead><tr><Th>Field</Th><Th>State</Th><Th>Why</Th></tr></thead>
        <tbody>
          {lines.map((l) => (
            <tr key={`${l.field}-${l.state}`} className="border-b border-line/70 align-top">
              <Td><span className="font-mono text-[10px]">{l.field}</span></Td>
              <Td><span className={`font-mono text-[10px] uppercase ${STATE_CLASS[l.state]}`}>{STATE_WORD[l.state]}</span></Td>
              <Td><span className="text-grey">{l.why}</span></Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ExportBundlePanel() {
  const [itemId, setItemId] = useState('');
  const [busy, setBusy] = useState(false);
  const [absent, setAbsent] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  /* Separate from `failed` on purpose. `GET /export/:itemId` is `requireApprover`, so an
     operator opening this panel gets a 403 — which is the control working, not a fault, and
     must not be rendered as one. */
  const [forbidden, setForbidden] = useState<string | null>(null);
  const [bundle, setBundle] = useState<ExportBundle | null>(null);

  const run = async () => {
    if (itemId.trim() === '') {
      toast('error', 'An item id is required. There is no "produce everything" button: a production answers a specific request.');
      return;
    }
    setBusy(true); setAbsent(false); setFailed(null); setForbidden(null); setBundle(null);
    try {
      setBundle(await fetchExportBundle(itemId.trim()));
    } catch (e) {
      if (routeAbsent(e)) setAbsent(true);
      else if (notPermitted(e)) setForbidden(errorSentence(e));
      else setFailed(errorSentence(e));
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-2">
      <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-navy">
        <FileText size={12} aria-hidden="true" /> Art 8(2) production
      </h3>
      <p className="text-[10px] leading-snug text-grey">
        One communication, reproducible on demand: who wrote it, who cleared it, which claim versions it used, and
        the regime classification as recorded rather than as recomputed. The completeness statement comes first,
        because a production with silent holes is worse than one that names them.
      </p>

      <div className="flex flex-wrap items-center gap-1.5 print:hidden">
        <input
          className="w-full rounded border border-line bg-card px-2 py-1 font-mono text-micro text-navy focus-ring sm:max-w-xs"
          placeholder="Item id" value={itemId} onChange={(e) => setItemId(e.target.value)}
          aria-label="Item id to produce"
        />
        <Button size="xs" variant="secondary" disabled={busy} onClick={() => void run()}>
          Produce the bundle
        </Button>
      </div>

      {absent && (
        <Absent title="The export route is not on this environment.">
          <span className="font-mono">GET /v1/marketing/export/:itemId</span> answered 404, so no production can be
          made here. Art 8(2) is a produce-on-demand duty: if an authority asks on this environment, the answer has
          to be assembled by hand from the database and nothing will state its completeness.
        </Absent>
      )}
      {forbidden !== null && <NotPermitted what={LABEL} sentence={forbidden} />}
      {failed !== null && (
        <Refused r={apiReadRefusal(new Error(failed),
          'A failed production is not an empty production. Do not conclude that nothing is held for this item.')} />
      )}

      {bundle && (
        <div className="space-y-2" data-testid="mkt-export-bundle">
          <div className="flex flex-wrap items-baseline gap-2 print:hidden">
            <Button size="xs" variant="secondary" onClick={() => window.print()}>
              <Printer size={11} aria-hidden="true" /> Print this production
            </Button>
            <span className="text-[10px] leading-snug text-grey">
              There is no download and no copy control. Printing goes through the browser&apos;s own dialogue, which
              you see and confirm; a download would write a file this side has no record of, and a clipboard write
              would put a stranger&apos;s data on a shared machine with nobody&apos;s name on it.
            </span>
          </div>

          {/* THE DIGEST, BESIDE THE TEXT. Two productions of the same window are
              byte-identical, so this is what lets whoever hands one over say WHICH one. */}
          <p className="break-all font-mono text-[10px] text-grey">
            digest · {bundle.digest}
          </p>
          <p className="font-mono text-[10px] text-grey">
            requested by {bundle.bundle.request.requestedBy} for {bundle.bundle.request.authority} ·
            window {bundle.bundle.request.windowFrom.slice(0, 10)} to {bundle.bundle.request.windowTo.slice(0, 10)} ·
            generated {bundle.bundle.request.generatedAt.slice(0, 16)} ·
            jurisdiction {bundle.bundle.request.jurisdiction ?? 'none stated'}
          </p>

          <Completeness lines={bundle.bundle.completeness} scope="Absent from the whole production" />

          {/* THE COUNTS. `integrityBroken` and `integrityUnverifiable` stay apart: a hash
              that does not match is a finding, a hash that cannot be checked is an absence,
              and one number for both would let the second hide inside the first. */}
          <table className="w-full border-collapse">
            <caption className="sr-only">Production counts</caption>
            <tbody className="font-mono text-micro">
              {([
                ['records in the production', bundle.bundle.counts.records, false],
                ['published', bundle.bundle.counts.published, false],
                ['approved but never closed out — no record of what was published', bundle.bundle.counts.outstandingCloseOut, true],
                ['withdrawn', bundle.bundle.counts.withdrawn, false],
                ['refusals fired', bundle.bundle.counts.refusals, false],
                ['refusals an approver proceeded past', bundle.bundle.counts.refusalsOverridden, true],
                ['integrity BROKEN — the stored hash does not match', bundle.bundle.counts.integrityBroken, true],
                ['integrity UNVERIFIABLE — no hash to check against', bundle.bundle.counts.integrityUnverifiable, true],
                ['records with an incomplete statement', bundle.bundle.counts.incompleteRecords, true],
              ] as const).map(([label, n, warn]) => (
                <tr key={label} className="border-b border-line/70">
                  <Td><span className={warn && n > 0 ? 'font-bold text-status-blocked' : 'text-grey'}>{label}</span></Td>
                  <Td align="right">
                    <span className={warn && n > 0 ? 'font-bold tabular-nums text-status-blocked' : 'tabular-nums text-navy'}>{n}</span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* VERBATIM. The retention inference and the outstanding DPO ruling travel with
              every production, so a reader learns the five-year figure is INFERRED at the
              moment they learn the figure. */}
          {bundle.bundle.caveats.map((c) => (
            <p key={c} className="border-l-2 border-status-conditional/60 bg-status-conditional-bg px-2 py-1 text-[10px] leading-snug text-status-conditional">
              {c}
            </p>
          ))}

          {bundle.bundle.records.length === 0 ? (
            <Nothing>
              The production contains no records for this item. That is an answer an authority can be given — “we
              hold nothing for this reference” — and it is only that answer if the completeness statement above says
              the search itself succeeded.
            </Nothing>
          ) : (
            <div className="space-y-2">
              {bundle.bundle.records.map((r) => (
                <div key={r.recordUid} className="border-l-2 border-line px-2 py-1.5">
                  <p className="break-all font-mono text-[10px] font-bold text-navy">{r.recordUid}</p>
                  <Completeness lines={r.completeness} scope="Could not be reconstructed for this record" />
                </div>
              ))}
            </div>
          )}

          {/* THE ARTEFACT ITSELF, rendered by the server so that the bytes are the bytes the
              digest is over. Not re-laid-out here: a client that reflows the production is a
              client that can produce text the digest does not cover. */}
          <div>
            <p className="text-micro font-semibold text-navy">The production, as it will print</p>
            <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-words border border-line bg-card p-2 font-mono text-[10px] leading-snug text-navy">
              {bundle.renderedText}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
