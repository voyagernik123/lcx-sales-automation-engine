import { useCallback, useEffect, useState } from 'react';
import { clsx } from 'clsx';
import { Button } from '@/components/ui';
import { request, ApiError } from '@/lib/apiClient';
import { declareAssetHoldings } from '@/lib/api/marketing';
/**
 * THE HOLDINGS CONTRACT, BY PACKAGE NAME.
 *
 * This was a deep relative specifier into `packages/shared/src/marketing/contracts/`, because
 * `@lcx/shared` exposes exactly one entry point (`"."` → `src/index.ts`) and the marketing
 * barrel did not re-export `contracts/holdings.ts` — so the module resolved for neither
 * `tsc` nor Vite by any other name. That barrel line has landed.
 *
 * WHAT WAS NEVER AN OPTION, then or now: restating the vocabulary or the derivations here.
 * That is precisely the duplication that would let this screen call an unanswered short
 * question "no short position" while the engine calls it unknown — `bearishLimbOf` is a
 * RULE, and a rule with two implementations has two answers.
 */
import {
  CELL_HEADLINE, HOLDINGS_COVERAGE_LIMIT, NOT_DECLARED_IS_NOT_CLEAR, POSITION_LABEL,
  RENEWAL_WARN_DAYS, SHORT_ANSWER_LABEL, SHORT_NOT_ASKED_IS_NOT_NO_SHORT,
  cellBearishLimb, expiryBucketOf, positionOf,
  type ExpiryBucket, type HoldingsCellsResponse, type HoldingsChainResponse,
  type HoldingsDeclarationRow, type HoldingsRegisterResponse, type ShortPositionAnswer,
} from '@lcx/shared';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  THE HOLDINGS DECLARATION — the surface that lets the Art 91(3)(c) gate be fed.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 *  WHY THIS SCREEN EXISTS. `0060_marketing_abuse.sql` created the register and
 *  `abuseRegister.ts` joins against it on every draft, so the gate with EUR 700 000 of
 *  PERSONAL liability behind it (Art 111(2)(d)) has been live since M2 — and there was
 *  no way for a member of staff to file, read or renew a declaration. The register was
 *  therefore permanently empty and the gate permanently refused. A gate nobody can feed
 *  is not a control, it is a wall.
 *
 *  ── THE DANGEROUS STATE IS "NOT DECLARED", AND THIS SCREEN SAYS SO FIRST ────
 *  The failure to design against is not a blank page. It is a page that renders an empty
 *  register as a clean bill of health — a member seeing no rows and concluding they have
 *  nothing to do. So §1 is the WARNING, it is present when the list is empty, and it is
 *  the loudest thing on the screen. Absence here is silence, never "holds nothing".
 *
 *  ── WHAT IT CANNOT TELL YOU, said on the screen ─────────────────────────────
 *  WHICH ASSETS YOU HAVE NOT DECLARED. There is no universe of assets to subtract from:
 *  the embargo register is itself inside information and approver-only, and the token
 *  catalog is not a list of what anybody might post about. So §4 exists — you NAME
 *  symbols and it runs the engine's own join — and `HOLDINGS_COVERAGE_LIMIT` is printed
 *  where somebody reading the list would otherwise draw the wrong conclusion.
 *
 *  ── THE SHORT QUESTION IS RENDERED ONLY IF THE FIRM ASKS IT ─────────────────
 *  `shortQuestionAsked` comes from the API, which reads `SHORT_QUESTION_POLICY`. While
 *  that is `not_asked` this screen shows NO short control at all and every row reads
 *  "NOT ASKED" — never "no short position", which is the conflation the whole widening
 *  exists to prevent. Whether the question may be asked is an HR and legal decision and
 *  it is not made here or anywhere in this repository.
 *
 *  ── DECLARING GOES THROUGH THE GOVERNED ACTION, NOT A ROUTE ─────────────────
 *  `declareAssetHoldings` posts `marketing_holdings_declare` to `/v1/actions/invoke`, so
 *  the write gets the audit row, the `object_actions` ledger, idempotency and the
 *  compartment gate. There is no write route to call instead and there must not be.
 *
 *  ── AMENDMENTS SHOW THE OLD VALUE ───────────────────────────────────────────
 *  The table is append-only by trigger and an amendment INSERTS a new row pointing at
 *  what it replaced. Superseded rows are rendered, dimmed and labelled, because "what
 *  did this person declare on the day that draft was approved" is the single question
 *  the Article turns on. The old value is the evidence, not clutter.
 *
 *  ── WHAT THIS SCREEN NEVER DOES ─────────────────────────────────────────────
 *  It never invents a position, a person or a price. It holds no position SIZE, because
 *  neither the table nor the Article needs one. It cannot declare on anyone's behalf:
 *  there is no memberId param on the action, and an approver reading a colleague sees a
 *  READ-ONLY page.
 */

const DAY = 86_400_000;

interface Feedback { kind: 'ok' | 'error'; text: string }

const bucketTone: Record<ExpiryBucket, string> = {
  expired: 'border-rose-500/60 bg-rose-500/10 text-rose-200',
  expiring: 'border-amber-500/60 bg-amber-500/10 text-amber-200',
  live: 'border-slate-700 bg-slate-900/40 text-slate-300',
};

/** Current rows are the ones nothing supersedes. Never a flag on the row. */
const currentRows = (rows: readonly HoldingsDeclarationRow[]) => rows.filter((r) => !r.superseded);

export function MarketingHoldings() {
  const [chain, setChain] = useState<HoldingsChainResponse | null>(null);
  const [register, setRegister] = useState<HoldingsRegisterResponse | null>(null);
  const [cells, setCells] = useState<HoldingsCellsResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [busy, setBusy] = useState(false);

  // The form. `symbol` is upper-cased on the way in because the register normalises it
  // and a case fork would silently miss the join.
  const [symbol, setSymbol] = useState('');
  const [holds, setHolds] = useState(false);
  const [shortAnswer, setShortAnswer] = useState<ShortPositionAnswer>('not_asked');
  const [renewInDays, setRenewInDays] = useState(90);
  const [amendmentReason, setAmendmentReason] = useState('');
  const [checkSymbols, setCheckSymbols] = useState('');

  /**
   * THE CLOCK IS READ ONCE PER LOAD, and held in state rather than read during render.
   *
   * Every expiry decision on this screen is a comparison against `now`, and a `new Date()`
   * evaluated inside render would make two rows rendered in the same paint answer against
   * two different instants. Re-read on each load so a long-open tab does not keep calling
   * an expired declaration live — which is the one direction of error that matters here.
   */
  const [now, setNow] = useState(() => new Date());

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const got = await request<HoldingsChainResponse>('/v1/marketing/holdings', { auth: true });
      setNow(new Date());
      setChain(got);
      try {
        // Approver-only. A 403 here is the EXPECTED answer for an operator and is not an
        // error on this page: the supervision panel simply does not render.
        setRegister(await request<HoldingsRegisterResponse>(
          '/v1/marketing/holdings/register', { auth: true },
        ));
      } catch {
        setRegister(null);
      }
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'The holdings register could not be read.');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const asked = chain?.shortQuestionAsked === true;

  const submit = useCallback(async () => {
    const sym = symbol.trim().toUpperCase();
    if (!sym) {
      setFeedback({ kind: 'error', text: 'Name the asset symbol you are declaring.' });
      return;
    }
    setBusy(true);
    setFeedback(null);
    try {
      await declareAssetHoldings(sym, {
        holds,
        renewInDays,
        ...(amendmentReason ? { amendmentReason } : {}),
        // Sent ONLY when the firm asks the question. While it does not, the server
        // refuses a short answer outright, and sending one would produce a refusal that
        // looked like a bug rather than a policy.
        ...(asked ? { shortPosition: shortAnswer } : {}),
      });
      setFeedback({ kind: 'ok', text: `Declaration recorded for ${sym}.` });
      setSymbol('');
      setAmendmentReason('');
      await load();
    } catch (err) {
      setFeedback({
        kind: 'error',
        text: err instanceof ApiError ? `${err.message} (${err.code ?? 'refused'})` : 'The declaration was refused.',
      });
    } finally {
      setBusy(false);
    }
  }, [symbol, holds, renewInDays, amendmentReason, asked, shortAnswer, load]);

  const runCheck = useCallback(async () => {
    const list = checkSymbols.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
    if (list.length === 0) {
      setCells(null);
      setFeedback({ kind: 'error', text: 'Name at least one symbol to check.' });
      return;
    }
    try {
      setCells(await request<HoldingsCellsResponse>(
        `/v1/marketing/holdings/cells?symbols=${encodeURIComponent(list.join(','))}`,
        { auth: true },
      ));
    } catch (err) {
      setCells(null);
      setFeedback({
        kind: 'error',
        text: err instanceof ApiError ? err.message : 'The check could not be run.',
      });
    }
  }, [checkSymbols]);

  const rows = chain?.rows ?? [];
  const live = currentRows(rows);
  const buckets = live.map((r) => ({ row: r, bucket: expiryBucketOf(r.renewBy, now) }));
  const expired = buckets.filter((b) => b.bucket === 'expired');
  const expiring = buckets.filter((b) => b.bucket === 'expiring');
  const shortUnknown = live.filter((r) => cellBearishLimb(r.shortPosition) === 'unknown');

  return (
    <div className="space-y-6 p-6 text-slate-200" data-testid="marketing-holdings">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold">Holdings declaration</h1>
        <p className="text-sm text-slate-400">
          MiCA Art 91(3)(c): voicing an opinion on an asset you hold, without disclosing that
          conflict in the post itself, is market manipulation — with fines on a natural person
          from EUR 700 000 (Art 111(2)(d)). This register decides whether a draft needs that
          disclosure. It is your own declaration; nobody can file it for you.
        </p>
      </header>

      {loadError && (
        <p role="alert" className="rounded border border-rose-500/60 bg-rose-500/10 p-3 text-sm text-rose-200">
          {loadError}
        </p>
      )}

      {/* ── §1 THE WARNING, FIRST AND ALWAYS ─────────────────────────────── */}
      <section className="rounded border border-amber-500/60 bg-amber-500/10 p-4" data-testid="holdings-not-declared-warning">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-amber-200">
          Not declared is the dangerous state
        </h2>
        <p className="mt-2 text-sm text-amber-100">{NOT_DECLARED_IS_NOT_CLEAR}</p>
        {chain?.registerPresent === false && (
          <p className="mt-2 text-sm text-amber-100" data-testid="holdings-register-absent">
            The register does not exist on this environment: {chain.migration} has not been applied,
            so nothing can be declared and every draft naming an asset refuses. A human must paste
            that migration into the Supabase SQL editor.
          </p>
        )}
        {chain?.registerEmpty === true && (
          <p className="mt-2 text-sm text-amber-100" data-testid="holdings-register-empty">
            You have declared NOTHING. This list is empty because the register has never heard from
            you — not because you hold nothing. Every asset refuses until you declare it.
          </p>
        )}
        {chain?.shortLimbMigrated === false && chain?.registerPresent === true && (
          <p className="mt-2 text-sm text-amber-100" data-testid="holdings-short-migration-absent">
            The short-position column is not present here ({chain.shortMigration} has not been
            applied), so no short answer can be recorded and every bearish statement refuses.
          </p>
        )}
      </section>

      {/* ── §2 WHAT IS ABOUT TO EXPIRE ───────────────────────────────────── */}
      <section className="space-y-2" data-testid="holdings-renewals">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Renewals</h2>
        {expired.length === 0 && expiring.length === 0 ? (
          <p className="text-sm text-slate-400">
            Nothing you have declared expires within {RENEWAL_WARN_DAYS} days. A declaration is a
            snapshot: past its renewal date it stops being an answer and the asset refuses again.
          </p>
        ) : (
          <ul className="space-y-1 text-sm">
            {expired.map(({ row }) => (
              <li key={row.id} className="rounded border border-rose-500/60 bg-rose-500/10 p-2 text-rose-200">
                <strong>{row.assetSymbol} EXPIRED</strong> on {row.renewBy.slice(0, 10)} — this asset is
                now treated as NOT DECLARED and refuses. Declare it again.
              </li>
            ))}
            {expiring.map(({ row }) => (
              <li key={row.id} className="rounded border border-amber-500/60 bg-amber-500/10 p-2 text-amber-200">
                <strong>{row.assetSymbol} expires</strong> on {row.renewBy.slice(0, 10)} (in{' '}
                {Math.max(0, Math.ceil((Date.parse(row.renewBy) - now.getTime()) / DAY))} days). It is
                still live until then.
              </li>
            ))}
          </ul>
        )}
        {shortUnknown.length > 0 && (
          <p className="text-sm text-slate-300" data-testid="holdings-short-unknown">
            Short position UNKNOWN for: {shortUnknown.map((r) => r.assetSymbol).join(', ')}.{' '}
            {SHORT_NOT_ASKED_IS_NOT_NO_SHORT}
          </p>
        )}
      </section>

      {/* ── §3 DECLARE, AMEND OR RENEW ───────────────────────────────────── */}
      <section className="space-y-3 rounded border border-slate-700 p-4" data-testid="holdings-declare">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
          Declare, amend or renew
        </h2>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col text-xs text-slate-400">
            Asset symbol
            <input
              aria-label="Asset symbol"
              className="mt-1 w-32 rounded border border-slate-700 bg-slate-900 p-2 text-sm uppercase text-slate-100"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-200">
            <input
              type="checkbox"
              aria-label="I hold a long position in this asset"
              checked={holds}
              onChange={(e) => setHolds(e.target.checked)}
            />
            I hold a LONG position
          </label>
          {/*
            THE SHORT CONTROL IS ABSENT UNTIL THE FIRM ASKS THE QUESTION. Not disabled —
            absent. A disabled control still asserts that the firm intends to ask.
          */}
          {asked && (
            <label className="flex flex-col text-xs text-slate-400" data-testid="holdings-short-control">
              Short position
              <select
                aria-label="Short position"
                className="mt-1 rounded border border-slate-700 bg-slate-900 p-2 text-sm text-slate-100"
                value={shortAnswer}
                onChange={(e) => setShortAnswer(e.target.value as ShortPositionAnswer)}
              >
                <option value="holds_short">{SHORT_ANSWER_LABEL.holds_short}</option>
                <option value="no_short">{SHORT_ANSWER_LABEL.no_short}</option>
                <option value="declined">{SHORT_ANSWER_LABEL.declined}</option>
              </select>
            </label>
          )}
          <label className="flex flex-col text-xs text-slate-400">
            Renew in (days)
            <input
              type="number"
              aria-label="Renew in days"
              min={1}
              max={366}
              className="mt-1 w-24 rounded border border-slate-700 bg-slate-900 p-2 text-sm text-slate-100"
              value={renewInDays}
              onChange={(e) => setRenewInDays(Number(e.target.value))}
            />
          </label>
          <label className="flex flex-col text-xs text-slate-400">
            Amendment reason (only when changing an existing declaration)
            <select
              aria-label="Amendment reason"
              className="mt-1 rounded border border-slate-700 bg-slate-900 p-2 text-sm text-slate-100"
              value={amendmentReason}
              onChange={(e) => setAmendmentReason(e.target.value)}
            >
              <option value="">First declaration for this asset</option>
              <option value="position_opened">position_opened</option>
              <option value="position_closed">position_closed</option>
              <option value="earlier_entry_wrong">earlier_entry_wrong</option>
              <option value="asset_renamed">asset_renamed</option>
              <option value="periodic_renewal">periodic_renewal</option>
            </select>
          </label>
          <Button onClick={() => void submit()} disabled={busy}>
            {busy ? 'Recording…' : 'Record declaration'}
          </Button>
        </div>
        {!asked && (
          <p className="text-xs text-slate-400" data-testid="holdings-short-not-asked-note">
            This desk does not ask about short positions, so every declaration is recorded as
            NOT ASKED on that limb. {SHORT_NOT_ASKED_IS_NOT_NO_SHORT} Whether the question is asked
            at all is a decision for HR and legal, not for this screen.
          </p>
        )}
        {feedback && (
          <p
            role="status"
            data-testid="holdings-feedback"
            className={clsx('text-sm', feedback.kind === 'ok' ? 'text-emerald-300' : 'text-rose-300')}
          >
            {feedback.text}
          </p>
        )}
      </section>

      {/* ── §4 WOULD THIS ASSET REFUSE? ──────────────────────────────────── */}
      <section className="space-y-3 rounded border border-slate-700 p-4" data-testid="holdings-check">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
          Would these assets refuse?
        </h2>
        <p className="text-xs text-slate-400">{HOLDINGS_COVERAGE_LIMIT}</p>
        <div className="flex items-end gap-3">
          <label className="flex flex-col text-xs text-slate-400">
            Symbols (comma separated)
            <input
              aria-label="Symbols to check"
              className="mt-1 w-64 rounded border border-slate-700 bg-slate-900 p-2 text-sm uppercase text-slate-100"
              value={checkSymbols}
              onChange={(e) => setCheckSymbols(e.target.value.toUpperCase())}
            />
          </label>
          <Button onClick={() => void runCheck()}>Check</Button>
        </div>
        {cells && (
          <ul className="space-y-1 text-sm" data-testid="holdings-cells">
            {cells.cells.map((cell) => (
              <li
                key={cell.assetSymbol}
                className={clsx(
                  'rounded border p-2',
                  cell.state === 'declared_none' || cell.state === 'declared_holding'
                    ? 'border-slate-700 bg-slate-900/40'
                    : 'border-rose-500/60 bg-rose-500/10 text-rose-200',
                )}
              >
                <strong>{cell.assetSymbol}</strong> — {CELL_HEADLINE[cell.state]}
                {cell.stale && ' (a declaration exists but has expired, so it is not an answer)'}
                <span className="ml-2 text-xs text-slate-400">
                  short: {cell.shortPosition === null ? 'no live answer' : SHORT_ANSWER_LABEL[cell.shortPosition]}
                  {' · '}bearish limb: {cellBearishLimb(cell.shortPosition)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── §5 THE CHAIN, OLD VALUES INCLUDED ────────────────────────────── */}
      <section className="space-y-2" data-testid="holdings-chain">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
          Your declarations {chain && !chain.viewerIsSubject ? `(${chain.memberId} — read only)` : ''}
        </h2>
        <p className="text-xs text-slate-400">
          Amendments never overwrite. A superseded row is kept because the earlier value is the
          evidence: what was declared on the day a draft was approved is the question the Article
          turns on.
        </p>
        {rows.length === 0 ? (
          <p className="text-sm text-slate-400">No declarations on record. See the warning above.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {rows.map((r) => {
              const bucket = expiryBucketOf(r.renewBy, now);
              return (
                <li
                  key={r.id}
                  data-testid={r.superseded ? 'holdings-row-superseded' : 'holdings-row-current'}
                  className={clsx(
                    'rounded border p-2',
                    r.superseded ? 'border-slate-800 bg-slate-900/20 text-slate-500' : bucketTone[bucket],
                  )}
                >
                  <strong>{r.assetSymbol}</strong> — {POSITION_LABEL[positionOf(r.holds, r.shortPosition)]}
                  <span className="ml-2 text-xs">
                    declared {r.declaredAt.slice(0, 10)} · renew by {r.renewBy.slice(0, 10)}
                    {!r.superseded && bucket === 'expired' && ' · EXPIRED — treated as NOT DECLARED'}
                    {r.superseded && ' · SUPERSEDED (kept as evidence)'}
                    {r.amendmentReason && ` · amended: ${r.amendmentReason}`}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ── §6 SUPERVISION, APPROVERS ONLY ───────────────────────────────── */}
      {register && (
        <section className="space-y-2 rounded border border-slate-700 p-4" data-testid="holdings-register">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
            Desk register (approver)
          </h2>
          {register.membersWithNothingDeclared.length > 0 && (
            <p className="text-sm text-amber-200" data-testid="holdings-census">
              The register has never heard from: {register.membersWithNothingDeclared.join(', ')}. That is
              not a claim that they hold nothing — it is a claim that nobody knows.
            </p>
          )}
          <ul className="space-y-1 text-sm">
            {register.rows.map((r) => (
              <li key={r.id} className={clsx('rounded border p-2', bucketTone[expiryBucketOf(r.renewBy, now)])}>
                <strong>{r.memberId}</strong> · {r.assetSymbol} —{' '}
                {POSITION_LABEL[positionOf(r.holds, r.shortPosition)]}
                <span className="ml-2 text-xs">renew by {r.renewBy.slice(0, 10)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

export default MarketingHoldings;
