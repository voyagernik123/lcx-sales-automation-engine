import { ShieldAlert } from 'lucide-react';
import type { AbusePerimeterState, RegisterPresence } from './vocabulary';
import { CardSkeleton } from '@/components/shared';
import { fetchAbusePerimeter } from '@/lib/api/marketing';
import { Absent, NotPermitted, Nothing, Refused, Th, Td, apiReadRefusal } from './DeskAtoms';
import { useDeskRead } from './useDeskRead';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  THE MARKET-ABUSE PERIMETER — the read the three governed writes never had
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * TYPED END TO END. `AbusePerimeterState` is declared once, in
 * `packages/shared/src/marketing/types.ts` §16, and imported by `routes/marketing.ts` and by
 * `lib/api/marketing.ts` from the same symbol — so there is no narrowing in this file, no
 * `rec()`, no runtime field-walking. The compiler checks every field, in both directions, and
 * a server-side rename breaks this file rather than breaking an operator's screen.
 *
 * It was the FIRST contract to land, and for a while the only one. Sixteen of the
 * twenty-three now have theirs; the seven that do not are listed in
 * `MARKETING_CONTRACTS_OWED` and their surfaces narrow `unknown` at runtime instead.
 *
 * ── WHY THE PERIMETER GOT A ROUTE FIRST ───────────────────────────────────────
 * Three governed actions write these registers — `enterAssetEmbargo`, `liftAssetEmbargo`,
 * `declareAssetHoldings` — and before this read existed the desk could enter an embargo
 * and then never see it. A write with no read is worse than no button: the operator has no
 * way to check that the control they just used took effect, so they use it twice.
 *
 * ── THE THREE STATES THIS PANEL EXISTS TO KEEP APART ──────────────────────────
 *   registerPresent: false   migration 0060 is not applied here. NOTHING IS RECORDED.
 *   detailWithheld: true     the register exists and this operator may not read it. Art 87
 *                            makes the detail inside information, so the row names who to
 *                            ask instead of showing a thinner version that looks complete.
 *   entries: []              the register exists, is readable, and is empty.
 *
 * Rendering all three as an empty table is how a desk concludes it may name any asset it
 * likes. `absenceIsNotClearance` is restated on the payload for exactly this reason and is
 * printed verbatim below rather than paraphrased.
 */

/**
 * The presence/withheld pair, as a sentence, for either register.
 *
 * Returns `null` where the register is present and readable — the caller then renders the
 * rows. Every other combination produces prose, because every other combination means the
 * table below is not the answer to the question the operator is asking.
 */
function presenceNotice(p: RegisterPresence, what: string, whoWrites: readonly string[]): {
  readonly kind: 'absent' | 'withheld';
  readonly title: string;
  readonly body: string;
} | null {
  if (!p.registerPresent) {
    return {
      kind: 'absent',
      title: `The ${what} register does not exist on this environment.`,
      body: `Migration 0060 is not applied here, so nothing has ever been recorded in it and nothing can be. `
        + `This is not an empty register — it is the absence of one. The writes that would populate it `
        + `(${whoWrites.join(', ')}) will refuse.`,
    };
  }
  if (p.detailWithheld) {
    return {
      kind: 'withheld',
      title: `The ${what} register exists and you may not read its detail.`,
      body: p.withheldReason
        ?? 'The loader withheld the detail and gave no reason. Ask an approver; do not read the blank space as an empty register.',
    };
  }
  return null;
}

export function PerimeterPanel() {
  const { result } = useDeskRead<AbusePerimeterState>('marketing:perimeter', () => fetchAbusePerimeter());

  if (result.state === 'loading') return <CardSkeleton />;

  if (result.state === 'absent') {
    return (
      <Absent title="The perimeter route is not on this environment.">
        <span className="font-mono">GET /v1/marketing/perimeter</span> answered 404. No register was read, so this
        screen cannot tell you whether an asset is embargoed. Draft as though the perimeter were unknown — which
        it is — rather than as though it were clear.
      </Absent>
    );
  }

  /* A 403 on the perimeter is the loader's own approver rule reaching the screen, and it is
     NOT the same as `detailWithheld` below: this is "you may not read the registers at all",
     that is "you may read that they exist and not what is in them". Two different sentences,
     because the operator's next move differs. */
  if (result.state === 'forbidden') {
    return <NotPermitted what="Reading the market-abuse registers" sentence={result.sentence} />;
  }

  if (result.state === 'failed') {
    return (
      <Refused
        r={apiReadRefusal(
          new Error(result.sentence),
          'A failed perimeter read is not an empty perimeter. An asset under embargo would look identical to this screen right now.',
        )}
      />
    );
  }

  const p = result.value;
  const embargo = presenceNotice(p.embargo, 'embargo', p.writeActions);
  const holdings = presenceNotice(p.holdings, 'holdings', p.writeActions);

  return (
    <div className="space-y-3">
      <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-navy">
        <ShieldAlert size={12} aria-hidden="true" /> Market-abuse perimeter
      </h3>

      {/* VERBATIM FROM THE PAYLOAD. The server states this sentence so a surface cannot
          soften it, and it is the sentence an operator needs before reading either table. */}
      <p role="note" className="border-l-2 border-status-conditional/60 bg-status-conditional-bg px-2 py-1.5 text-micro leading-snug text-status-conditional">
        {p.absenceIsNotClearance}
      </p>

      <section className="space-y-1.5">
        <h4 className="text-micro font-bold uppercase tracking-wider text-grey">Embargoed assets</h4>
        {embargo ? (
          <Absent title={embargo.title}>{embargo.body}</Absent>
        ) : p.embargo.entries.length === 0 ? (
          <Nothing>
            The register is present, readable, and holds no live embargo. That is a fact about what has been
            RECORDED — a listing decision nobody entered is not visible here, and the sentence above is why that
            distinction matters.
          </Nothing>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <caption className="sr-only">Live asset embargoes</caption>
              <thead>
                <tr>
                  <Th>Asset</Th><Th>State</Th><Th>Review by</Th><Th>Entered by</Th><Th>Entered</Th><Th>Refs</Th>
                </tr>
              </thead>
              <tbody>
                {p.embargo.entries.map((e) => (
                  <tr key={`${e.assetSymbol}-${e.enteredAt}`} className="border-b border-line/70 align-top">
                    <Td><span className="font-mono font-bold text-navy">{e.assetSymbol}</span></Td>
                    <Td>
                      <span className={e.state === 'unknown'
                        ? 'font-mono text-[10px] font-bold uppercase text-status-blocked'
                        : 'font-mono text-[10px] uppercase text-navy'}
                      >
                        {e.state}
                      </span>
                    </Td>
                    <Td>
                      {/* NOT DEFAULTED TO `enteredAt`. A null review date means the register
                          holds no fresh review, and substituting the entry date would print a
                          review that never happened — the exact fix recorded on the shared type. */}
                      <span className="font-mono text-[10px] text-grey">
                        {e.reviewBy?.slice(0, 10) ?? 'no review date held — staleness has already forced the state above'}
                      </span>
                    </Td>
                    <Td><span className="font-mono text-[10px] text-grey">{e.enteredBy ?? 'not recorded'}</span></Td>
                    <Td><span className="font-mono text-[10px] text-grey">{e.enteredAt.slice(0, 16)}</span></Td>
                    <Td>
                      {/* Approver-only fields. `null` here is not "no reference" — it is "this
                          slug points at an unannounced decision and you are not cleared for it". */}
                      <span className="font-mono text-[10px] text-grey">
                        {e.eventRef ?? 'withheld'} / {e.sourceRef ?? 'withheld'}
                      </span>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-1.5">
        <h4 className="text-micro font-bold uppercase tracking-wider text-grey">Declared holdings</h4>
        <p className="text-[10px] leading-snug text-grey">
          A colleague&apos;s financial position is personal data (Art 91(3)(c)), so this register is self-or-approver
          and an operator sees their own declarations. A short list here is a statement about your own row, not
          about the desk.
        </p>
        {holdings ? (
          <Absent title={holdings.title}>{holdings.body}</Absent>
        ) : p.holdings.entries.length === 0 ? (
          <Nothing>
            No declaration is recorded for you. An undeclared position is indistinguishable from no position, in
            this register and to this screen.
          </Nothing>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <caption className="sr-only">Declared holdings</caption>
              <thead>
                <tr><Th>Member</Th><Th>Asset</Th><Th>Holds</Th><Th>Declared</Th><Th>Renew by</Th></tr>
              </thead>
              <tbody>
                {p.holdings.entries.map((h) => (
                  <tr key={`${h.memberId}-${h.assetSymbol}`} className="border-b border-line/70 align-top">
                    <Td><span className="font-mono text-[10px] text-navy">{h.memberId}</span></Td>
                    <Td><span className="font-mono font-bold text-navy">{h.assetSymbol}</span></Td>
                    <Td>
                      <span className={h.holds ? 'font-mono text-[10px] font-bold uppercase text-status-conditional' : 'font-mono text-[10px] uppercase text-grey'}>
                        {h.holds ? 'holds' : 'does not hold'}
                      </span>
                    </Td>
                    <Td><span className="font-mono text-[10px] text-grey">{h.declaredAt.slice(0, 10)}</span></Td>
                    <Td><span className="font-mono text-[10px] text-grey">{h.renewBy.slice(0, 10)}</span></Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="text-[10px] leading-snug text-grey">
        Written by <span className="font-mono">{p.writeActions.join(', ')}</span> — governed actions, each of which
        requires an approver and records who acted. There is no control on this screen that writes either register:
        entering an embargo is a decision with a named owner, not a toggle.
      </p>
    </div>
  );
}
