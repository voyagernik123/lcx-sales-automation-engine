import { GpsPrintArtefact, type GpsPrintProvenanceRow } from './GpsPrint';

/**
 * G7's PRINT ARTEFACTS for the two nouns G4–G6 added: the DOSSIER and the INVOICE.
 *
 * Both follow `GpsUnderwriting`'s methodology exactly, because it is the one that was
 * argued out: every provenance row names the WIRE FIELD or the SERVER FUNCTION that
 * produced its value, and nothing is recomputed here. `GpsPrintArtefact` prints "NOT
 * STATED by the surface that printed this" for a row with no source, so a figure whose
 * origin nobody can name is visibly unsourced rather than quietly authoritative.
 *
 * ── WHY THE DOSSIER SHEET IS THE DANGEROUS ONE ───────────────────────────────
 * A printed dossier is the single most quotable artefact this compartment can produce
 * and the one most likely to be forwarded outside it. On screen its [F#] citations and
 * its verbatim C3 caveat are what separate cited research from a confident essay; drop
 * them on the way to paper and the printed sheet becomes exactly the thing the
 * cite-or-refuse validator exists to prevent. So the text is printed VERBATIM — no
 * markdown stripping, no citation collapsing, no summarising — and the sheet's own
 * label says out loud that it is a model draft and not a client document.
 */

const money = (cents: number, ccy: string) => {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}${ccy === 'USD' ? '$' : `${ccy} `}${Math.trunc(abs / 100).toLocaleString('en-US')}.${String(abs % 100).padStart(2, '0')}`;
};

export interface DossierSheetInput {
  id: number;
  targetName: string;
  offerKey: string;
  status: string;
  dossierMd: string;
  model: string;
  factRefsCited: number;
  generatedBy: string;
  generatedAt: string;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
}

export function DossierSheet({ dossier, asOf, sources = [] }: {
  dossier: DossierSheetInput;
  asOf: string;
  sources?: readonly unknown[];
}) {
  const provenance: GpsPrintProvenanceRow[] = [
    { label: 'Target', value: dossier.targetName, source: 'gps_target.name via the origination register' },
    { label: 'Offer hypothesis', value: dossier.offerKey, source: 'gps_dossier.offer_key' },
    { label: 'Drafted by', value: dossier.model, source: 'gps_dossier.model — the AI PROVIDER attempted, not a model id' },
    { label: 'Requested by', value: dossier.generatedBy, source: 'gps_dossier.generated_by (c.get(operator), never a body field)' },
    {
      label: 'Register facts cited',
      value: String(dossier.factRefsCited),
      source: 'gps_dossier.fact_refs_cited — counted from the surviving text; the validator refused any response citing none',
    },
    {
      label: 'Acceptance',
      value: dossier.status === 'accepted' && dossier.decidedBy !== null
        ? `${dossier.decidedBy} on ${(dossier.decidedAt ?? '').slice(0, 10)}`
        : `NOT ACCEPTED (${dossier.status})`,
      source: 'gps_dossier.decided_by / decided_at — D10: an AI draft is provenance, never authority',
    },
  ];

  return (
    <GpsPrintArtefact
      kind="dossier"
      title={`Research dossier — ${dossier.targetName}`}
      asOf={asOf}
      computedAt={dossier.generatedAt}
      sources={sources}
      provenance={provenance}
    >
      <section data-testid="dossier-sheet-body" className="space-y-2">
        {dossier.status !== 'accepted' && (
          <p className="border-2 border-navy p-2 font-mono text-[11px] font-bold uppercase tracking-wider" data-testid="dossier-sheet-unaccepted">
            This dossier has NOT been accepted by a named human. It is a model draft only.
          </p>
        )}
        {/* VERBATIM. The [F#] citations and the C3 caveat line are the provenance; a
            printer that tidied them away would print an essay. */}
        <pre className="whitespace-pre-wrap font-sans text-[12px] leading-relaxed" data-testid="dossier-sheet-text">
          {dossier.dossierMd}
        </pre>
        {dossier.decisionNote !== null && (
          <p className="text-[11px] italic text-grey-dark">Decision note: {dossier.decisionNote}</p>
        )}
      </section>
    </GpsPrintArtefact>
  );
}

export interface InvoiceSheetInput {
  number: string;
  amountCents: number;
  currency: string;
  status: string;
  issuedBy: string;
  issuedAt: string;
  deliverableId: string;
  engagementId: string;
  paidAt: string | null;
  paidBy: string | null;
  paidReference: string | null;
  disputedAt: string | null;
  disputedBy: string | null;
  disputedReason: string | null;
  voidedAt: string | null;
  voidedBy: string | null;
  voidedReason: string | null;
}

export function InvoiceSheet({ invoice, clientName = null, asOf, sources = [] }: {
  invoice: InvoiceSheetInput;
  clientName?: string | null;
  asOf: string;
  sources?: readonly unknown[];
}) {
  const provenance: GpsPrintProvenanceRow[] = [
    { label: 'Invoice number', value: invoice.number, source: 'formatInvoiceNumber(gps_invoice.id) — derived from the append-only id, so it cannot drift from its row' },
    { label: 'Amount', value: money(invoice.amountCents, invoice.currency), source: 'gps_invoice.amount_cents — integer cents, write-once at issue' },
    { label: 'Issued by', value: `${invoice.issuedBy} on ${invoice.issuedAt.slice(0, 10)}`, source: 'gps_invoice.issued_by / issued_at (an approver act)' },
    {
      label: 'Traces to deliverable',
      value: invoice.deliverableId,
      source: 'gps_invoice.deliverable_id, NOT NULL — issueInvoice refuses NOT_TRACED unless that deliverable is accepted',
    },
    {
      /*
       * THE HONEST HALF OF THE TRACE. `gps_invoice` carries the deliverable's ID and
       * NOT its acceptance instant or acceptor, so this sheet can prove that the server
       * REFUSED TO INSERT without an acceptance — which is not the same claim as "here
       * is the acceptance". Stating the difference is the point; implying the stronger
       * claim on a demand for payment would be the worst place in the system to do it.
       */
      label: 'The acceptance itself',
      value: 'not carried on this sheet',
      source: 'gps_invoice has no accepted_at/accepted_by column — the acceptance is provable on the delivery desk, not from this row',
    },
    { label: 'Status', value: invoice.status, source: 'gps_invoice.status — paid needs a reference, dispute and void need a reason' },
  ];

  /*
   * THE TRANSITION HISTORY, WITH ITS ACTORS. These six fields were on the wire and
   * rendered nowhere, so a disputed invoice showed a reason with nobody's name against
   * it and no instant. A state change on a demand for payment is exactly the kind of
   * act that must not be anonymous.
   */
  const transitions: Array<{ what: string; who: string; when: string }> = [
    { what: 'Issued', who: invoice.issuedBy, when: invoice.issuedAt },
  ];
  if (invoice.paidBy !== null) transitions.push({ what: 'Marked paid', who: invoice.paidBy, when: invoice.paidAt ?? '' });
  if (invoice.disputedBy !== null) transitions.push({ what: 'Disputed', who: invoice.disputedBy, when: invoice.disputedAt ?? '' });
  if (invoice.voidedBy !== null) transitions.push({ what: 'Voided', who: invoice.voidedBy, when: invoice.voidedAt ?? '' });

  return (
    <GpsPrintArtefact
      kind="invoice"
      title={`${invoice.number}${clientName === null ? '' : ` — ${clientName}`}`}
      asOf={asOf}
      computedAt={invoice.issuedAt}
      sources={sources}
      provenance={provenance}
    >
      <section data-testid="invoice-sheet-body" className="space-y-2">
        <p className="font-mono text-[15px] font-bold tabular-nums" data-testid="invoice-sheet-amount">
          {money(invoice.amountCents, invoice.currency)} {invoice.currency}
        </p>
        <p className="text-[12px] leading-relaxed">
          Raised against an accepted deliverable on engagement {invoice.engagementId}. This invoice
          exists because that deliverable was accepted — the register refuses to hold one that traces
          to no acceptance.
        </p>
        {invoice.status === 'paid' && invoice.paidReference !== null && (
          <p className="text-[12px]" data-testid="invoice-sheet-paid">
            SETTLED. Reference recorded: {invoice.paidReference}. Payment happened on an external
            rail; this system records the reference and moves no money.
          </p>
        )}
        {invoice.status === 'disputed' && invoice.disputedReason !== null && (
          <p className="border-2 border-navy p-2 text-[12px] font-bold" data-testid="invoice-sheet-disputed">
            DISPUTED: {invoice.disputedReason}. The invoice still stands and still ages; a dispute is
            a recorded state, not a withdrawal.
          </p>
        )}
        {invoice.status === 'void' && invoice.voidedReason !== null && (
          <p className="border-2 border-navy p-2 text-[12px] font-bold" data-testid="invoice-sheet-void">
            VOID: {invoice.voidedReason}. This sheet is a record of a demand that was withdrawn and
            must not be presented as payable.
          </p>
        )}

        <div className="border-t border-line pt-2" data-testid="invoice-sheet-history">
          <p className="font-mono text-micro uppercase tracking-wider text-grey">Every state change, with its actor</p>
          <ul className="mt-1 space-y-0.5 font-mono text-[11px]">
            {transitions.map((t, i) => (
              <li key={i}>
                {t.what} by {t.who}{t.when === '' ? '' : ` on ${t.when.slice(0, 10)}`}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </GpsPrintArtefact>
  );
}
