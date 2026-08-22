/**
 * THE GPS LIMB OF THE WEEKLY REVIEW — composed per request, never persisted.
 *
 * ══ WHY THIS FILE EXISTS INSTEAD OF THREE LINES IN `composeWbr` ══
 * `routes/gpsLoop.ts` carries a wiring note that says, literally: add
 * `gps?: WbrGpsBlock` beside `program?` / `distribution?` in `kpi/wbr.ts`, then fill
 * it from `loopSnapshot(...).wbr`. FOLLOWING THAT NOTE IS A CROSS-COMPARTMENT LEAK,
 * and the note is wrong:
 *
 *  · `composeWbr` is consumed by `writeWbr`, which `JSON.stringify`s the whole report
 *    into `wbr_reports.payload`, and `getWbrForWeek` hands that payload straight back
 *    to any caller of `/v1/wbr`.
 *  · `/v1/wbr` is reachable by a GOVERNANCE holder. `governance` and `gps` are
 *    different grants — gps is `legacy: false, machineAccess: false`, so a member with
 *    six compartments still gets nothing from it by default.
 *  · The Monday cron writes that row as the shared machine principal, which
 *    `machineMap()` gives `operate` on machine-accessible workspaces only. The writer
 *    would be persisting data it is not entitled to read.
 *
 * That is precisely the defect `routes/__tests__/wbrNarrativeCompartment.test.ts`
 * already ratchets one compartment over ("the WBR had two doors with different
 * locks"). So the block is assembled HERE, after an entitlement check, attached to the
 * response by `routes/wbr.ts`, and never handed to `writeWbr`.
 *
 * ══ NO CROSS-CURRENCY TOTAL, ANYWHERE ══
 * `invoiceAging.openAmountCents` sums cents across every currency present, which is
 * only meaningful on a single-currency book — the reason it also returns
 * `currenciesPresent`. A printed weekly figure is the most quotable number in the
 * business, so this module never prints that field: cash is reported PER CURRENCY, and
 * a mixed book shows two rows rather than one invented sum.
 */

import type pg from 'pg';
import { capAtLeast, formatInvoiceNumber, type WbrGpsBlock } from '@lcx/shared';
import { loadEntitlements } from '../access/entitlements.js';

export const GPS_INVOICE_MIGRATION = '0082_gps_invoice.sql';

/** Cash, per currency. Never one total across currencies — see the header. */
export interface GpsWbrCashRow {
  currency: string;
  count: number;
  amountCents: number;
}

/** Oldest open invoice, for the chase list. */
export interface GpsWbrOldestOpen {
  number: string;
  ageDays: number;
  currency: string;
  amountCents: number;
}

export type GpsWbrCash =
  | { state: 'register_absent'; migration: string; note: string }
  | {
      state: 'measured';
      open: readonly GpsWbrCashRow[];
      paidThisWeek: readonly GpsWbrCashRow[];
      disputed: readonly GpsWbrCashRow[];
      /** Null when nothing is open — absent, never a zero-valued placeholder row. */
      oldestOpen: GpsWbrOldestOpen | null;
      note: string;
    };

/**
 * Four honest states. `withheld_*` is not an error and not an empty block: the reader
 * is told a limb exists and why they are not seeing it, which is the difference
 * between a redaction and a silence.
 */
export type GpsWbrDisposition =
  | { state: 'included'; block: WbrGpsBlock; cash: GpsWbrCash }
  | { state: 'withheld_no_grant'; headline: string; detail: string }
  | { state: 'withheld_historical_week'; headline: string; detail: string }
  | { state: 'unreadable'; headline: string; detail: string };

function cashRows(rows: readonly Record<string, unknown>[]): GpsWbrCashRow[] {
  const by = new Map<string, GpsWbrCashRow>();
  for (const r of rows) {
    const currency = String(r.currency);
    const cell = by.get(currency) ?? { currency, count: 0, amountCents: 0 };
    cell.count += 1;
    cell.amountCents += Number(r.amount_cents);
    by.set(currency, cell);
  }
  return [...by.values()].sort((a, b) => a.currency.localeCompare(b.currency));
}

async function gpsCash(pool: pg.Pool, weekStart: string): Promise<GpsWbrCash> {
  let rows: Record<string, unknown>[];
  try {
    const r = await pool.query(
      `SELECT id, status, amount_cents, currency, issued_at, paid_at FROM gps_invoice LIMIT 5000`,
    );
    rows = r.rows as Record<string, unknown>[];
  } catch {
    return {
      state: 'register_absent',
      migration: GPS_INVOICE_MIGRATION,
      note: `The invoice register does not exist on this environment (${GPS_INVOICE_MIGRATION} is ledgered and unapplied), so no revenue figure is available. This is not-loaded, not zero.`,
    };
  }

  const open = rows.filter((r) => r.status === 'issued' || r.status === 'disputed');
  const disputed = rows.filter((r) => r.status === 'disputed');
  const weekStartMs = Date.parse(`${weekStart}T00:00:00.000Z`);
  const paidThisWeek = rows.filter(
    (r) => r.status === 'paid' && r.paid_at !== null && Date.parse(String(r.paid_at)) >= weekStartMs,
  );

  let oldestOpen: GpsWbrOldestOpen | null = null;
  if (open.length > 0) {
    const sorted = [...open].sort(
      (a, b) => Date.parse(String(a.issued_at)) - Date.parse(String(b.issued_at)),
    );
    const o = sorted[0];
    oldestOpen = {
      number: formatInvoiceNumber(Number(o.id)),
      ageDays: Math.max(0, Math.floor((Date.now() - Date.parse(String(o.issued_at))) / 86_400_000)),
      currency: String(o.currency),
      amountCents: Number(o.amount_cents),
    };
  }

  return {
    state: 'measured',
    open: cashRows(open),
    paidThisWeek: cashRows(paidThisWeek),
    disputed: cashRows(disputed),
    oldestOpen,
    note: 'Amounts are per currency by design: a single total across currencies would be dollars added to euros. Open includes disputed invoices — a dispute is a state, not a disappearance.',
  };
}

/**
 * Resolve the GPS limb for one reader and one week.
 *
 * `loopSnapshot` is the source of the block itself so there is exactly one composer
 * (`wbrGpsBlock`, inside the shared engine) and no second copy to drift.
 */
export async function gpsWbrDisposition(
  pool: pg.Pool,
  args: { operatorId: string | null; reportWeekStart: string; currentWeekStart: string },
): Promise<GpsWbrDisposition> {
  if (args.operatorId === null) {
    return {
      state: 'withheld_no_grant',
      headline: 'Global Services — withheld',
      detail: 'This review was requested without an identified operator, so no compartment can be resolved for it.',
    };
  }
  let mayRead: boolean;
  try {
    const ents = await loadEntitlements(pool, args.operatorId);
    mayRead = capAtLeast(ents.gps, 'view');
  } catch {
    return {
      state: 'unreadable',
      headline: 'Global Services — could not be resolved',
      detail: 'Entitlements could not be read, so the services limb is withheld. A limb shown on an unresolved grant is worse than one withheld on a known failure.',
    };
  }
  if (!mayRead) {
    return {
      state: 'withheld_no_grant',
      headline: 'Global Services — withheld',
      detail: 'You hold this review but not the Global Services compartment. The limb exists and is being withheld deliberately; it is not empty and there is nothing wrong with the week.',
    };
  }

  /*
   * HISTORICAL WEEKS ARE WITHHELD, and the sentence says why rather than looking
   * broken: `wbrGpsBlock` computes cumulative book figures from every recorded
   * outcome, so attaching today's composition to a past week's report would print
   * this week's book wearing last month's date. The stored payload legitimately has
   * no gps limb, because nothing ever wrote one.
   */
  if (args.reportWeekStart !== args.currentWeekStart) {
    return {
      state: 'withheld_historical_week',
      headline: 'Global Services — not available for a past week',
      detail: `This limb is composed live and is never stored, so a past week has none. Its figures are cumulative over the whole book, which means attaching them to ${args.reportWeekStart} would print the CURRENT book under a past date. Open the current week to see it.`,
    };
  }

  try {
    const { loopSnapshot } = await import('./loop.js');
    const snapshot = await loopSnapshot(pool, { asOf: new Date().toISOString(), engagementId: null });
    const cash = await gpsCash(pool, args.currentWeekStart);
    return { state: 'included', block: snapshot.wbr, cash };
  } catch (err) {
    console.error('[wbr] gps limb compose failed:', err);
    return {
      state: 'unreadable',
      headline: 'Global Services — could not be composed',
      detail: 'The services limb failed to compose. Every other section of this review is unaffected, and nothing here is being shown as zero.',
    };
  }
}
