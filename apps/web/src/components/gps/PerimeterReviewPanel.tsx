import { useCallback, useEffect, useState } from 'react';
import { clsx } from 'clsx';
import { Badge, Button, Card, CardBody, CardHeader } from '@/components/ui';
import { ApiError, request } from '@/lib/apiClient';
import { SERVICE_CLASS_LABEL, type PerimeterCell, type PerimeterView } from '@lcx/shared';

/**
 * THE PERIMETER'S DATABASE ROWS, WITH THE FOUR-EYES REVIEW CONTROL — the surface
 * whose absence the conflict wall's own comment recorded as a wiring gap, closed
 * the day the G0 packet made the gap real by entering 30 rows nobody could review
 * from a screen.
 *
 * What this panel is honest about, in order of consequence:
 *
 *  · REVIEW IS A SECOND HUMAN'S ACT. The server refuses the reviewer who entered
 *    the row (SELF_REVIEW_REFUSED), and that refusal renders here VERBATIM rather
 *    than being pre-hidden — the operator who tries sees the rule, with the
 *    enterer's name in it, which is how a rule teaches. Until the platform has a
 *    second approver signed in, every row on this panel stays honestly UNREVIEWED
 *    and the gate stays advisory for it: that is the designed single-operator
 *    state (decision 9), not a failure this panel should dress up.
 *  · A REVIEW IS NOT PERMISSION. The response says whether the reviewed cell
 *    authorises work NOW, and this panel prints that answer even when it is "no" —
 *    a reviewed counsel_required cell still refuses until counsel is named, and a
 *    reviewed prohibition refuses permanently.
 *  · ONLY STORED ROWS APPEAR. Compiled placeholders (id: null) are not reviewable
 *    and are already rendered — with their unreviewed banner — by the compiled
 *    grid below this panel.
 */

interface ReviewOutcome {
  cellId: string;
  authorisesWorkNow: boolean;
  gateReason: string;
}

export function PerimeterReviewPanel() {
  const [view, setView] = useState<PerimeterView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<ReviewOutcome | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await request<{ data: PerimeterView }>('/v1/gps/conflict/perimeter');
      setView(res.data);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? `${err.code ?? 'ERROR'}: ${err.message}` : String(err));
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const review = async (cell: PerimeterCell) => {
    if (cell.id === null) return;
    setBusy(cell.id);
    setActionError(null);
    setOutcome(null);
    try {
      const res = await request<{ data: { authorisesWorkNow: boolean; gate: { code?: string; reason?: string } } }>(
        `/v1/gps/conflict/perimeter/${cell.id}/review`,
        { method: 'POST', body: {} },
      );
      setOutcome({
        cellId: cell.id,
        authorisesWorkNow: res.data.authorisesWorkNow,
        gateReason: res.data.gate?.reason ?? res.data.gate?.code ?? '',
      });
      await load();
    } catch (err) {
      /* SELF_REVIEW_REFUSED and CONCURRENT_MODIFICATION arrive here with the
         server's own sentences — including the enterer's name — and render as sent. */
      setActionError(err instanceof ApiError ? `${err.code ?? 'ERROR'}: ${err.message}` : String(err));
    } finally {
      setBusy(null);
    }
  };

  const stored = view?.cells.filter((c) => c.id !== null) ?? [];

  return (
    <Card>
      <CardHeader>Perimeter positions — entered rows, awaiting a second pair of eyes</CardHeader>
      <CardBody className="space-y-3 text-xs">
        {error !== null && <p className="text-status-blocked" data-testid="perimeter-review-load-error">{error}</p>}
        {view !== null && (
          <>
            <p className="text-grey" data-testid="perimeter-review-intro">
              {view.storedRowCount === 0
                ? 'No human-entered positions exist yet — the grid below runs on compiled placeholders that authorise nothing.'
                : `${view.storedRowCount} position(s) entered. A position authorises work only after a DIFFERENT approver reviews it — the server refuses self-review, so until a second approver uses this platform these rows stay honestly unreviewed and advisory. Prohibitions enforce regardless.`}
            </p>

            {actionError !== null && (
              <p role="alert" className="font-mono text-status-blocked" data-testid="perimeter-review-error">{actionError}</p>
            )}
            {outcome !== null && (
              <p
                className={clsx('font-mono', outcome.authorisesWorkNow ? 'text-status-ready' : 'text-status-conditional')}
                data-testid="perimeter-review-outcome"
              >
                {outcome.authorisesWorkNow
                  ? 'Reviewed — and this cell now authorises work.'
                  : `Reviewed — and the cell STILL refuses: ${outcome.gateReason || 'see the gate'}. A review is a second pair of eyes, not permission.`}
              </p>
            )}

            {stored.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-micro">
                  <thead>
                    <tr className="border-b border-line text-left font-mono uppercase tracking-wider text-grey">
                      <th className="py-1 pr-2">jurisdiction</th>
                      <th className="pr-2">offer</th>
                      <th className="pr-2">class</th>
                      <th className="pr-2">entered by</th>
                      <th className="pr-2">expires</th>
                      <th className="pr-2">review state</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {stored.map((c) => (
                      <tr key={c.id} className="border-b border-line/50 align-top" data-testid={`perimeter-row-${c.id}`}>
                        <td className="py-1.5 pr-2 text-navy">{c.jurisdictionLabel}</td>
                        <td className="pr-2">{c.offerName}</td>
                        <td className="pr-2 font-mono">{SERVICE_CLASS_LABEL[c.entry.serviceClass] ?? c.entry.serviceClass}</td>
                        <td className="pr-2 font-mono">{c.entry.enteredBy}</td>
                        <td className="pr-2 font-mono">{c.entry.reviewBy.slice(0, 10)}</td>
                        <td className="pr-2">
                          {c.reviewedAt !== null ? (
                            <Badge status="ready">reviewed by {c.reviewedBy} · {c.reviewedAt.slice(0, 10)}</Badge>
                          ) : (
                            <Badge status="conditional">unreviewed — advisory</Badge>
                          )}
                          {c.defects.length > 0 && (
                            <span className="block text-status-blocked">{c.defects.join(' ')}</span>
                          )}
                          <span className="mt-0.5 block max-w-[28rem] text-grey">{c.entry.note}</span>
                        </td>
                        <td className="whitespace-nowrap">
                          {c.reviewedAt === null && (
                            <Button
                              variant="secondary"
                              onClick={() => void review(c)}
                              disabled={busy !== null}
                              data-testid={`perimeter-review-${c.id}`}
                            >
                              {busy === c.id ? 'Reviewing…' : 'Review — my name goes on it'}
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <p className="font-mono text-micro text-grey">
              Four-eyes, enforced server-side: the person who entered a row cannot review it, so one
              person acting alone can open no cell. Reading the note before stamping it is the review.
            </p>
          </>
        )}
      </CardBody>
    </Card>
  );
}
