import { ageInDays, bracketForAgeDays, AGING_BRACKETS } from './book.js';
import type { AgingBracketKey } from './book.js';

/**
 * G6 — MONEY: the pure parts of invoicing (GPS_REVENUE_100X_PLAN.md §G6).
 *
 * The number is derived, the aging is arithmetic, and the chase is DETERMINISTIC —
 * templated, not generated. A chase for an overdue invoice states three facts
 * (number, amount, age) and asks one question; a model would add warmth and,
 * eventually, a number nobody owes. Templating removes the one place a chase could
 * hallucinate money, and the text still goes through the marketing outbound gate at
 * the API (the one-mouth rule) so it is judged before a human carries it — never
 * sent from here.
 */

export const INVOICE_STATUSES = ['issued', 'paid', 'disputed', 'void'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

/** Open = still owed. Paid and void are settled; disputed still ages. */
export const OPEN_INVOICE_STATUSES: readonly InvoiceStatus[] = ['issued', 'disputed'];

/**
 * The number IS the identity, zero-padded. Immutable because `id` is append-only —
 * there is no stored string to drift from the row it names.
 */
export function formatInvoiceNumber(id: number): string {
  return `GPS-${String(id).padStart(6, '0')}`;
}

export interface InvoiceAgingInput {
  status: InvoiceStatus;
  amountCents: number;
  currency: string;
  issuedAtIso: string;
}

export interface InvoiceAgingBracket {
  key: AgingBracketKey;
  label: string;
  count: number;
  amountCents: number;
}

export interface InvoiceAging {
  brackets: readonly InvoiceAgingBracket[];
  openCount: number;
  openAmountCents: number;
  /** Open invoices whose issue date could not be aged (a future date is a data fault). */
  unagedCount: number;
  /** Present when open invoices span more than one currency — a single total would be a lie. */
  currenciesPresent: readonly string[];
}

/**
 * Age OPEN invoices into the same brackets the deposit cash panel uses. Amounts are
 * summed PER the caller's filtering, and `currenciesPresent` is returned so a surface
 * never adds dollars to euros: mixing currencies into one total is the exact lie
 * `normaliseCurrency` exists to prevent elsewhere in the book.
 */
export function invoiceAging(invoices: readonly InvoiceAgingInput[], asOfIso: string): InvoiceAging {
  const open = invoices.filter((i) => (OPEN_INVOICE_STATUSES as readonly string[]).includes(i.status));
  const byBracket = new Map<AgingBracketKey, { count: number; amountCents: number }>();
  for (const b of AGING_BRACKETS) byBracket.set(b.key, { count: 0, amountCents: 0 });

  let unagedCount = 0;
  let openAmountCents = 0;
  const currencies = new Set<string>();
  for (const inv of open) {
    currencies.add(inv.currency);
    openAmountCents += inv.amountCents;
    const days = ageInDays(inv.issuedAtIso, asOfIso);
    const key = days === null ? null : bracketForAgeDays(days);
    if (key === null) { unagedCount += 1; continue; }
    const cell = byBracket.get(key)!;
    cell.count += 1;
    cell.amountCents += inv.amountCents;
  }

  return {
    brackets: AGING_BRACKETS.map((b) => ({ key: b.key, label: b.label, ...byBracket.get(b.key)! })),
    openCount: open.length,
    openAmountCents,
    unagedCount,
    currenciesPresent: [...currencies].sort(),
  };
}

export const CHASE_MAX_CHARS = 700;

/** Whole-currency amount for human-facing text. Cents stay integer everywhere else. */
function displayAmount(amountCents: number, currency: string): string {
  const whole = Math.round(amountCents / 100).toLocaleString('en-US');
  return currency === 'USD' ? `$${whole}` : `${whole} ${currency}`;
}

export interface ChaseInput {
  invoiceNumber: string;
  amountCents: number;
  currency: string;
  clientName: string;
  ageDays: number;
  deliverableName: string;
}

/**
 * A chase, in the desk's own voice: three facts and one question, no promise, no
 * threat, no legal language. Deterministic so the numbers are the invoice's numbers
 * and nothing else. The API runs this through `gateOutboundText` before it is shown
 * to anyone — the chase is outreach, and outreach has one mouth.
 */
export function buildChaseText(input: ChaseInput): string {
  const amount = displayAmount(input.amountCents, input.currency);
  const overdue = input.ageDays <= 0
    ? 'issued today'
    : `outstanding for ${input.ageDays} day${input.ageDays === 1 ? '' : 's'}`;
  return [
    `Subject: LCX invoice ${input.invoiceNumber} — ${amount}`,
    '',
    `Hello,`,
    '',
    `This is a note from the LCX services desk about invoice ${input.invoiceNumber} for ${amount}, `
      + `covering "${input.deliverableName}", which is ${overdue}.`,
    '',
    `Could you let us know when we can expect settlement, or flag anything on your side we should `
      + `resolve first? If it has already been paid, please send the reference and we will reconcile it.`,
    '',
    `Thank you.`,
    `— The LCX services desk`,
  ].join('\n');
}
