import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, request } from '@/lib/apiClient';

/**
 * THE CLIENT PORTAL — one engagement, one link, and the same honesty the desk gets.
 *
 * ── THE TOKEN LIVES IN THE HASH, THEN IN MEMORY, THEN NOWHERE ────────────────
 * The magic link arrives as `/portal#t=<token>`. A hash fragment never leaves the
 * browser — not to our server logs, not in a Referer header — and on first render
 * it is read once, moved into component memory, and STRIPPED from the address bar
 * (history.replaceState), so a screenshot, a shared tab or a browser-history sync
 * does not carry a live credential. Nothing here persists it: closing the tab
 * forgets it, and the desk can mint another link in one click.
 *
 * ── WHAT THE CLIENT SEES IS WHAT IS TRUE ─────────────────────────────────────
 * Milestone states arrive verbatim from the delivery register: `blocked` shows its
 * reason and there is NO percent anywhere — the same compiler-enforced honesty the
 * internal desk lives with. The upload section renders the DPO gate's own sentence
 * for its state; this page never invents an upload control the decision has not
 * unlocked. This is a PUBLIC chunk: it imports the api client and nothing from the
 * shared compartment surface (the G1 bundle lesson) — every list it renders came
 * off the wire.
 */

interface PortalView {
  engagement: {
    id: string; clientName: string; offerKey: string; offerName: string; status: string;
    priceCents: number | null; currency: string;
    depositRequiredCents: number | null; depositPaidAt: string | null;
    exclusions: string[]; requiredClientInputs: string[];
  };
  milestones: Array<{ id: string; ordinal: number; name: string; status: string; dueBy: string | null; completedAt: string | null; blockedReason: string | null }>;
  deliverables: Array<{ id: string; name: string; status: string; reviewRequired: boolean; reviewedAt: string | null; acceptedAt: string | null }>;
  facts: Array<{ factKey: string; factValue: string; submittedAt: string }>;
  uploadGate: { state: 'undecided' | 'forbidden' | 'permitted'; detail: string };
  sessionLabel: string;
  sessionExpiresAt: string;
}

const money = (cents: number, ccy: string) =>
  `${ccy === 'USD' ? '$' : `${ccy} `}${Math.round(cents / 100).toLocaleString('en-US')}`;

const MILESTONE_TONE: Record<string, string> = {
  pending: 'text-grey', in_progress: 'text-navy', blocked: 'text-status-blocked',
  done: 'text-status-ready', cancelled: 'text-grey',
};

export function Portal() {
  /* Read once, strip immediately. A ref so a re-render cannot re-read a hash that
     is no longer there. */
  const tokenRef = useRef<string | null>(null);
  if (tokenRef.current === null) {
    const m = window.location.hash.match(/^#t=([0-9a-f]{64})$/);
    if (m) {
      tokenRef.current = m[1];
      window.history.replaceState(null, '', window.location.pathname);
    } else {
      tokenRef.current = '';
    }
  }
  const token = tokenRef.current;

  const [view, setView] = useState<PortalView | null>(null);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [factDrafts, setFactDrafts] = useState<Record<string, string>>({});
  const [factsSaved, setFactsSaved] = useState(false);
  const [intentRecorded, setIntentRecorded] = useState<string | null>(null);

  const authed = useCallback(
    <T,>(path: string, init?: { method?: string; body?: unknown }) =>
      request<T>(path, { ...init, auth: false, headers: { Authorization: `Bearer ${token}` } }),
    [token],
  );

  const load = useCallback(async () => {
    try {
      const res = await authed<{ data: PortalView }>('/v1/portal/engagement');
      setView(res.data);
      setError(null);
    } catch (err) {
      setView(null);
      setError(err instanceof ApiError
        ? { code: err.code ?? 'ERROR', message: err.message }
        : { code: 'ERROR', message: String(err) });
    }
  }, [authed]);

  useEffect(() => {
    if (token !== '') void load();
  }, [token, load]);

  const act = useCallback(async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    setActionError(null);
    try {
      await fn();
      await load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }, [load]);

  const accept = (id: string) => act(`accept-${id}`, async () => {
    await authed(`/v1/portal/deliverables/${id}/accept`, { method: 'POST', body: {} });
  });

  const submitFacts = () => act('facts', async () => {
    const facts = Object.entries(factDrafts)
      .filter(([, v]) => v.trim() !== '')
      .map(([factKey, factValue]) => ({ factKey, factValue: factValue.trim() }));
    if (facts.length === 0) throw new ApiError('Fill in at least one answer first.', 400, 'VALIDATION');
    await authed('/v1/portal/facts', { method: 'POST', body: { facts } });
    setFactDrafts({});
    setFactsSaved(true);
  });

  const recordIntent = () => act('intent', async () => {
    try {
      await authed<{ data: { note?: string } }>('/v1/portal/upload-intent', { method: 'POST', body: {} });
      setIntentRecorded('Noted — the desk can see your material is ready.');
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        // The refusal still records readiness; say both truths.
        setIntentRecorded(`Noted — the desk can see your material is ready. ${err.message}`);
        return;
      }
      throw err;
    }
  });

  if (token === '') {
    return (
      <Shell>
        <p className="text-[13px] leading-relaxed text-grey" data-testid="portal-no-token">
          This page answers to an invitation link from the LCX services desk. The address you
          opened carries none — ask your desk contact to send the link again.
        </p>
      </Shell>
    );
  }

  if (error !== null) {
    return (
      <Shell>
        <p className="text-[13px] leading-relaxed text-status-blocked" role="alert" data-testid="portal-session-error">
          {error.message}
        </p>
      </Shell>
    );
  }

  if (view === null) {
    return <Shell><p className="text-[13px] text-grey">Loading your engagement…</p></Shell>;
  }

  const e = view.engagement;
  return (
    <Shell>
      <div className="space-y-8" data-testid="portal-engagement">
        <header>
          <h1 className="font-mono text-[15px] font-bold text-navy">{e.offerName}</h1>
          <p className="mt-1 text-[12px] text-grey">
            {e.clientName} · status <span className="font-mono text-navy">{e.status}</span>
            {e.priceCents !== null && <> · engagement value {money(e.priceCents, e.currency)}</>}
            {e.depositRequiredCents !== null && e.depositRequiredCents > 0 && (
              <> · deposit {money(e.depositRequiredCents, e.currency)} {e.depositPaidAt ? 'received' : 'outstanding'}</>
            )}
          </p>
          <p className="mt-1 text-[11px] text-grey">
            Signed in via invitation for {view.sessionLabel} · link valid until {view.sessionExpiresAt.slice(0, 10)}
          </p>
        </header>

        {e.exclusions.length > 0 && (
          <section>
            <h2 className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-grey">Outside this scope</h2>
            <ul className="mt-2 space-y-1 text-[12px] text-grey-dark">
              {e.exclusions.map((x) => <li key={x}>· {x}</li>)}
            </ul>
          </section>
        )}

        <section data-testid="portal-milestones">
          <h2 className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-grey">Where the work stands</h2>
          {/* Honest states, verbatim. A blocked milestone says WHY; nothing here shows a percent. */}
          <ul className="mt-2 space-y-2">
            {view.milestones.map((m) => (
              <li key={m.id} className="border-l-2 border-line pl-3 text-[12px]">
                <span className="font-semibold text-navy">{m.name}</span>{' '}
                <span className={`font-mono ${MILESTONE_TONE[m.status] ?? 'text-grey'}`}>{m.status.replace('_', ' ')}</span>
                {m.dueBy !== null && <span className="text-grey"> · due {m.dueBy.slice(0, 10)}</span>}
                {m.completedAt !== null && <span className="text-grey"> · completed {m.completedAt.slice(0, 10)}</span>}
                {m.status === 'blocked' && m.blockedReason !== null && (
                  <span className="block text-status-blocked">{m.blockedReason}</span>
                )}
              </li>
            ))}
            {view.milestones.length === 0 && <li className="text-[12px] text-grey">The plan is being drawn up.</li>}
          </ul>
        </section>

        <section data-testid="portal-deliverables">
          <h2 className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-grey">Deliverables</h2>
          {actionError !== null && (
            <p role="alert" className="mt-2 text-[12px] text-status-blocked" data-testid="portal-action-error">{actionError}</p>
          )}
          <ul className="mt-2 space-y-2">
            {view.deliverables.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 border border-line p-2 text-[12px]">
                <span>
                  <span className="font-semibold text-navy">{d.name}</span>{' '}
                  <span className="font-mono text-grey">{d.status.replace('_', ' ')}</span>
                  {d.acceptedAt !== null && <span className="block text-status-ready">accepted {d.acceptedAt.slice(0, 10)}</span>}
                </span>
                {d.acceptedAt === null && d.status !== 'cancelled' && d.status !== 'rejected' && (
                  <button
                    onClick={() => void accept(d.id)}
                    disabled={busy !== null}
                    data-testid={`portal-accept-${d.id}`}
                    className="shrink-0 border border-navy px-3 py-1 font-mono text-[11px] font-semibold uppercase tracking-wider text-navy hover:opacity-70 disabled:opacity-40"
                  >
                    Accept this deliverable
                  </button>
                )}
              </li>
            ))}
            {view.deliverables.length === 0 && <li className="text-[12px] text-grey">Nothing has been handed over yet.</li>}
          </ul>
          <p className="mt-1 text-[10px] text-grey">
            Accepting records your name against the deliverable and starts the commercial clock.
            If a deliverable is still under internal review, acceptance will refuse until that review is done.
          </p>
        </section>

        <section data-testid="portal-facts">
          <h2 className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-grey">What the desk asked you for</h2>
          {factsSaved && <p className="mt-1 text-[12px] text-status-ready" data-testid="portal-facts-saved">Saved. The desk sees your answers immediately.</p>}
          <div className="mt-2 space-y-3">
            {e.requiredClientInputs.map((key) => {
              const existing = view.facts.find((f) => f.factKey === key);
              return (
                <label key={key} className="block text-[12px]">
                  <span className="text-grey-dark">{key}</span>
                  {existing && (
                    <span className="block text-[11px] text-grey" data-testid="portal-fact-existing">
                      Your answer ({existing.submittedAt.slice(0, 10)}): {existing.factValue}
                    </span>
                  )}
                  <textarea
                    aria-label={key}
                    rows={2}
                    maxLength={2000}
                    placeholder={existing ? 'Update your answer (optional)' : 'Your answer'}
                    className="mt-1 w-full border border-control bg-transparent px-2 py-1.5 text-[12px]"
                    value={factDrafts[key] ?? ''}
                    onChange={(ev) => setFactDrafts((d) => ({ ...d, [key]: ev.target.value }))}
                  />
                </label>
              );
            })}
          </div>
          <button
            onClick={() => void submitFacts()}
            disabled={busy !== null}
            className="mt-2 border border-navy px-3 py-1 font-mono text-[11px] font-semibold uppercase tracking-wider text-navy hover:opacity-70 disabled:opacity-40"
          >
            {busy === 'facts' ? 'Saving…' : 'Send answers to the desk'}
          </button>
        </section>

        <section data-testid="portal-upload">
          <h2 className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-grey">Documents</h2>
          {/* The gate's own sentence, verbatim. This page renders the state; it never argues with it. */}
          <p className="mt-1 text-[12px] leading-relaxed text-grey-dark" data-testid="portal-upload-gate">{view.uploadGate.detail}</p>
          {intentRecorded !== null ? (
            <p className="mt-1 text-[12px] text-status-ready" data-testid="portal-intent-recorded">{intentRecorded}</p>
          ) : (
            <button
              onClick={() => void recordIntent()}
              disabled={busy !== null}
              className="mt-2 border border-control px-3 py-1 font-mono text-[11px] uppercase tracking-wider text-grey-dark hover:text-navy disabled:opacity-40"
            >
              {busy === 'intent' ? 'Recording…' : 'Tell the desk my material is ready'}
            </button>
          )}
        </section>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white text-navy dark:bg-[#0b1020] dark:text-white">
      <div className="mx-auto max-w-2xl px-5 py-10">
        <p className="mb-8 font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-grey">
          LCX · services portal
        </p>
        {children}
        <p className="mt-12 border-t border-line pt-4 text-[10px] leading-relaxed text-grey">
          This page shows one engagement to the holder of one invitation link. It sets no
          cookies and stores nothing in this browser; close the tab and it forgets you.
          Questions belong with your desk contact, who you already know by name.
        </p>
      </div>
    </div>
  );
}
