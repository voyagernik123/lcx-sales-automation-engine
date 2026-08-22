import { Hono } from 'hono';
import type { AuthVariables } from '../middleware/auth.js';
import { requireOperator } from '../middleware/auth.js';
import { requireApprover } from '../middleware/permissions.js';
import { getPool } from '../db/index.js';
import { env } from '../lib/env.js';
import {
  chaseInvoice,
  disputeInvoice,
  invoiceAgingSummary,
  isInvoiceMigrated,
  issueInvoice,
  listInvoices,
  markPaid,
  voidInvoice,
} from '../gps/invoicing.js';

/**
 * GLOBAL SERVICES — MONEY (G6).
 *
 *   GET  /invoices?engagementId=…       invoices (+ the open-invoice aging summary)
 *   POST /invoices/issue                bill an ACCEPTED deliverable (approver act)
 *   POST /invoices/:id/pay              record settlement on an external rail (approver)
 *   POST /invoices/:id/dispute          record a dispute — a state, with its reason
 *   POST /invoices/:id/void             void a live invoice (approver), reasoned
 *   POST /invoices/:id/chase            a gated overdue draft; returned, never sent
 *
 * Mounted inside `gpsRoutes` at '/invoices'. Issue, pay and void take
 * requireApprover on top of requireOperator: raising a bill, recording money, and
 * cancelling a numbered record are all the class of act that decides packets. A
 * dispute is a record the desk makes on the client's behalf and takes operator
 * only; a chase writes nothing billable and takes operator only.
 */

const meta = () => ({ timestamp: new Date().toISOString(), version: env.version });

const NOT_MIGRATED = {
  error: 'The invoice register does not exist on this environment. Apply 0082_gps_invoice.sql.',
  code: 'INVOICE_REGISTER_ABSENT',
} as const;

export const gpsInvoiceRoutes = new Hono<{ Variables: AuthVariables }>();

gpsInvoiceRoutes.get('/', requireOperator, async (c) => {
  try {
    const pool = getPool();
    const present = await isInvoiceMigrated(pool);
    if (present !== true) {
      return c.json({ data: { invoices: [], aging: null, registerPresent: present }, meta: { ...meta(), migrated: false } });
    }
    const engagementId = c.req.query('engagementId');
    const [invoices, aging] = await Promise.all([
      listInvoices(pool, engagementId && engagementId.trim() !== '' ? engagementId : undefined),
      invoiceAgingSummary(pool, new Date().toISOString()),
    ]);
    return c.json({ data: { invoices, aging, registerPresent: true }, meta: { ...meta(), migrated: true } });
  } catch (err) {
    console.error('[gps] invoice list error:', err);
    return c.json({ error: 'Failed to load invoices', code: 'GPS_ERROR' }, 500);
  }
});

gpsInvoiceRoutes.post('/issue', requireOperator, requireApprover, async (c) => {
  try {
    let deliverableId = '';
    let amountCents = Number.NaN;
    try {
      const parsed = await c.req.json();
      deliverableId = typeof parsed?.deliverableId === 'string' ? parsed.deliverableId.trim().slice(0, 80) : '';
      amountCents = typeof parsed?.amountCents === 'number' ? parsed.amountCents : Number.NaN;
    } catch { /* refused below */ }
    if (deliverableId === '') return c.json({ error: 'deliverableId is required', code: 'VALIDATION' }, 400);

    const pool = getPool();
    if ((await isInvoiceMigrated(pool)) !== true) return c.json(NOT_MIGRATED, 503);

    const operator = c.get('operator');
    const out = await issueInvoice(pool, { deliverableId, amountCents, issuedBy: operator?.id ?? 'unknown' });
    if (!out.ok) {
      const status = out.code === 'DELIVERABLE_NOT_FOUND' ? 404
        : out.code === 'NOT_TRACED' ? 409
        : out.code === 'ALREADY_INVOICED' ? 409
        : 400;
      return c.json({ error: out.detail, code: out.code }, status);
    }
    return c.json({ data: { invoice: out.invoice }, meta: { ...meta(), migrated: true } });
  } catch (err) {
    console.error('[gps] invoice issue error:', err);
    return c.json({ error: 'Issue failed — no invoice was raised', code: 'GPS_ERROR' }, 500);
  }
});

gpsInvoiceRoutes.post('/:id/pay', requireOperator, requireApprover, async (c) => {
  try {
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id) || id < 1) return c.json({ error: 'id must be a positive integer', code: 'VALIDATION' }, 400);
    let reference = '';
    try {
      const parsed = await c.req.json();
      reference = typeof parsed?.reference === 'string' ? parsed.reference.trim().slice(0, 200) : '';
    } catch { /* refused below */ }
    if (reference === '') {
      return c.json({
        error: 'reference is required — rails are external, so marking paid RECORDS the settlement reference from the bank/rail. No reference, no proof.',
        code: 'VALIDATION',
      }, 400);
    }
    const pool = getPool();
    if ((await isInvoiceMigrated(pool)) !== true) return c.json(NOT_MIGRATED, 503);
    const operator = c.get('operator');
    const out = await markPaid(pool, id, reference, operator?.id ?? 'unknown');
    if (!out.ok) return c.json({ error: out.detail, code: out.code }, out.code === 'NOT_FOUND' ? 404 : 409);
    return c.json({ data: { invoice: out.invoice }, meta: { ...meta(), migrated: true } });
  } catch (err) {
    console.error('[gps] invoice pay error:', err);
    return c.json({ error: 'Marking paid failed', code: 'GPS_ERROR' }, 500);
  }
});

gpsInvoiceRoutes.post('/:id/dispute', requireOperator, async (c) => {
  try {
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id) || id < 1) return c.json({ error: 'id must be a positive integer', code: 'VALIDATION' }, 400);
    let reason = '';
    try {
      const parsed = await c.req.json();
      reason = typeof parsed?.reason === 'string' ? parsed.reason.trim().slice(0, 500) : '';
    } catch { /* refused below */ }
    if (reason === '') return c.json({ error: 'reason is required — a dispute is a recorded state, not a deletion', code: 'VALIDATION' }, 400);
    const pool = getPool();
    if ((await isInvoiceMigrated(pool)) !== true) return c.json(NOT_MIGRATED, 503);
    const operator = c.get('operator');
    const out = await disputeInvoice(pool, id, reason, operator?.id ?? 'unknown');
    if (!out.ok) return c.json({ error: out.detail, code: out.code }, out.code === 'NOT_FOUND' ? 404 : 409);
    return c.json({ data: { invoice: out.invoice }, meta: { ...meta(), migrated: true } });
  } catch (err) {
    console.error('[gps] invoice dispute error:', err);
    return c.json({ error: 'Dispute failed', code: 'GPS_ERROR' }, 500);
  }
});

gpsInvoiceRoutes.post('/:id/void', requireOperator, requireApprover, async (c) => {
  try {
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id) || id < 1) return c.json({ error: 'id must be a positive integer', code: 'VALIDATION' }, 400);
    let reason = '';
    try {
      const parsed = await c.req.json();
      reason = typeof parsed?.reason === 'string' ? parsed.reason.trim().slice(0, 500) : '';
    } catch { /* refused below */ }
    if (reason === '') return c.json({ error: 'reason is required — a void is a reasoned, attributed act, not an erase', code: 'VALIDATION' }, 400);
    const pool = getPool();
    if ((await isInvoiceMigrated(pool)) !== true) return c.json(NOT_MIGRATED, 503);
    const operator = c.get('operator');
    const out = await voidInvoice(pool, id, reason, operator?.id ?? 'unknown');
    if (!out.ok) return c.json({ error: out.detail, code: out.code }, out.code === 'NOT_FOUND' ? 404 : 409);
    return c.json({ data: { invoice: out.invoice }, meta: { ...meta(), migrated: true } });
  } catch (err) {
    console.error('[gps] invoice void error:', err);
    return c.json({ error: 'Void failed', code: 'GPS_ERROR' }, 500);
  }
});

gpsInvoiceRoutes.post('/:id/chase', requireOperator, async (c) => {
  try {
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id) || id < 1) return c.json({ error: 'id must be a positive integer', code: 'VALIDATION' }, 400);
    const pool = getPool();
    if ((await isInvoiceMigrated(pool)) !== true) return c.json(NOT_MIGRATED, 503);
    const operator = c.get('operator');
    const out = await chaseInvoice(pool, id, operator?.id ?? 'unknown', Date.now());
    if (!out.ok) return c.json({ error: out.detail, code: out.code }, out.code === 'NOT_FOUND' ? 404 : 409);
    /* The draft and the gate's verdict; NEVER a send. A human carries a cleared chase. */
    return c.json({
      data: { draft: out.draft, verdict: out.verdict, ledgerRecorded: out.ledgerRecorded },
      meta: { ...meta(), migrated: true },
    });
  } catch (err) {
    console.error('[gps] invoice chase error:', err);
    return c.json({ error: 'Chase draft failed', code: 'GPS_ERROR' }, 500);
  }
});
