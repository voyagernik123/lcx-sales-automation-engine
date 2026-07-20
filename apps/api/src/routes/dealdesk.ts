/**
 * Deal Desk routes (Phase 5): negotiation playbook + BATNA, approval workflows,
 * e-signature (mock/provider), invoice & billing TRACKING, post-listing success
 * reviews, partners/referrals, competitive intel + deal coach, virtual data room.
 *
 * HARD RULE: nothing here moves money. Billing is status tracking only.
 */
import { Hono } from 'hono';
import type { AuthVariables } from '../middleware/auth.js';
import { requireOperator } from '../middleware/auth.js';
import { requireApprover } from '../middleware/permissions.js';
import { env } from '../lib/env.js';
import { listPlaybooks, getBatna, createBatna, updateBatna } from '../deals/playbook.js';
import { needsApproval, requestApproval, decideApproval, listApprovals } from '../deals/approvals.js';
import { sendForSignature, getSignature } from '../deals/esign.js';
import { createInvoice, listInvoices, markInvoiceStatus, listOverdue, type InvoiceStatus } from '../deals/billing.js';
import { listSuccessReviews } from '../deals/success.js';
import { listPartners, createPartner, listReferrals, createReferral } from '../deals/partners.js';
import { listCompetitors, addCompetitor, coachDeal } from '../deals/coach.js';
import { getDataRoom, addDoc, DocTooLargeError } from '../deals/dataroom.js';

export const dealDeskRoutes = new Hono<{ Variables: AuthVariables }>();

const meta = () => ({ timestamp: new Date().toISOString(), version: env.version });

/* ── Negotiation playbook + BATNA (5-2) ── */
dealDeskRoutes.get('/playbooks', requireOperator, async (c) => {
  return c.json({ data: await listPlaybooks(), meta: meta() });
});

dealDeskRoutes.get('/deals/:dealId/batna', requireOperator, async (c) => {
  return c.json({ data: await getBatna(c.req.param('dealId')), meta: meta() });
});

dealDeskRoutes.post('/deals/:dealId/batna', requireOperator, async (c) => {
  const body = (await c.req.json<{ ourFloorCents?: number | null; theirOfferCents?: number | null; competitorOfferCents?: number | null; notes?: string | null }>().catch(() => ({}))) as { ourFloorCents?: number | null; theirOfferCents?: number | null; competitorOfferCents?: number | null; notes?: string | null };
  const row = await createBatna(c.req.param('dealId'), body);
  return c.json({ data: row, meta: meta() }, 201);
});

dealDeskRoutes.patch('/deals/:dealId/batna', requireOperator, async (c) => {
  const body = (await c.req.json<{ ourFloorCents?: number | null; theirOfferCents?: number | null; competitorOfferCents?: number | null; notes?: string | null }>().catch(() => ({}))) as { ourFloorCents?: number | null; theirOfferCents?: number | null; competitorOfferCents?: number | null; notes?: string | null };
  const row = await updateBatna(c.req.param('dealId'), body);
  if (!row) return c.json({ error: 'BATNA not found', code: 'NOT_FOUND' }, 404);
  return c.json({ data: row, meta: meta() });
});

/* ── Approval workflows (5-3) ── */
dealDeskRoutes.get('/approvals', requireOperator, async (c) => {
  return c.json({ data: await listApprovals(c.req.query('status') || undefined), meta: meta() });
});

dealDeskRoutes.post('/approvals', requireOperator, async (c) => {
  const body = (await c.req.json<{ dealId?: string; dealValueCents?: number; discountPct?: number; reason?: string }>().catch(() => ({}))) as { dealId?: string; dealValueCents?: number; discountPct?: number; reason?: string };
  if (!body.dealId) return c.json({ error: 'dealId required', code: 'VALIDATION' }, 400);
  const cents = body.dealValueCents ?? 0;
  const pct = body.discountPct ?? 0;
  if (!Number.isFinite(cents) || cents < 0) return c.json({ error: 'dealValueCents must be a non-negative number', code: 'VALIDATION' }, 400);
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) return c.json({ error: 'discountPct must be 0–100', code: 'VALIDATION' }, 400);
  const req = await requestApproval({
    dealId: body.dealId,
    requestedBy: c.get('operator').id,
    dealValueCents: cents,
    discountPct: pct,
    reason: body.reason,
  });
  return c.json({ data: { ...req, needsApproval: needsApproval(cents, pct) }, meta: meta() }, 201);
});

// Signing off a deal is an approver-only action — enforced server-side, not
// just hidden on the client. Operators can request approvals (above), only
// approvers can decide them.
dealDeskRoutes.post('/approvals/:id/decide', requireOperator, requireApprover, async (c) => {
  const body = (await c.req.json<{ decision?: 'approved' | 'rejected'; note?: string }>().catch(() => ({}))) as { decision?: 'approved' | 'rejected'; note?: string };
  if (body.decision !== 'approved' && body.decision !== 'rejected') {
    return c.json({ error: 'decision must be approved|rejected', code: 'VALIDATION' }, 400);
  }
  const row = await decideApproval(c.req.param('id'), body.decision, c.get('operator').id, body.note);
  if (!row) return c.json({ error: 'Approval not found', code: 'NOT_FOUND' }, 404);
  return c.json({ data: row, meta: meta() });
});

/* ── E-signature (5-4, provider + mock) ── */
dealDeskRoutes.post('/deals/:dealId/send-for-signature', requireOperator, async (c) => {
  const body = (await c.req.json<{ documentName?: string; signerEmail?: string }>().catch(() => ({}))) as { documentName?: string; signerEmail?: string };
  const row = await sendForSignature({
    dealId: c.req.param('dealId'),
    documentName: body.documentName ?? 'LCX Listing Agreement',
    signerEmail: body.signerEmail,
  });
  return c.json({ data: row, meta: meta() }, 201);
});

dealDeskRoutes.get('/deals/:dealId/signature', requireOperator, async (c) => {
  return c.json({ data: await getSignature(c.req.param('dealId')), meta: meta() });
});

/* ── Billing / invoices (5-5, tracking only — no money movement) ── */
dealDeskRoutes.get('/invoices', requireOperator, async (c) => {
  const overdue = c.req.query('overdue') === 'true';
  const data = overdue ? await listOverdue() : await listInvoices(c.req.query('dealId') || undefined);
  return c.json({ data, meta: meta() });
});

const INVOICE_STATUSES: readonly InvoiceStatus[] = ['draft', 'sent', 'paid', 'overdue'];

dealDeskRoutes.post('/invoices', requireOperator, async (c) => {
  const body = (await c.req.json<{ dealId?: string; amountCents?: number; currency?: string; dueDate?: string | null; cryptoAddress?: string | null; lineItems?: { description: string; amountCents: number }[]; status?: InvoiceStatus }>().catch(() => ({}))) as { dealId?: string; amountCents?: number; currency?: string; dueDate?: string | null; cryptoAddress?: string | null; lineItems?: { description: string; amountCents: number }[]; status?: InvoiceStatus };
  if (!body.dealId || !body.amountCents) return c.json({ error: 'dealId and amountCents required', code: 'VALIDATION' }, 400);
  if (!Number.isFinite(body.amountCents) || body.amountCents < 0) return c.json({ error: 'amountCents must be a non-negative number', code: 'VALIDATION' }, 400);
  if (body.status && !INVOICE_STATUSES.includes(body.status)) return c.json({ error: `status must be one of: ${INVOICE_STATUSES.join(', ')}`, code: 'VALIDATION' }, 400);
  const inv = await createInvoice({
    dealId: body.dealId,
    amountCents: body.amountCents,
    currency: body.currency,
    dueDate: body.dueDate,
    cryptoAddress: body.cryptoAddress,
    lineItems: body.lineItems,
    status: body.status,
  });
  return c.json({ data: inv, meta: meta() }, 201);
});

dealDeskRoutes.patch('/invoices/:id/status', requireOperator, async (c) => {
  const body = (await c.req.json<{ status?: InvoiceStatus }>().catch(() => ({}))) as { status?: InvoiceStatus };
  if (!body.status || !INVOICE_STATUSES.includes(body.status)) return c.json({ error: `status must be one of: ${INVOICE_STATUSES.join(', ')}`, code: 'VALIDATION' }, 400);
  const inv = await markInvoiceStatus(c.req.param('id'), body.status);
  if (!inv) return c.json({ error: 'Invoice not found', code: 'NOT_FOUND' }, 404);
  return c.json({ data: inv, meta: meta() });
});

/* ── Post-listing success reviews (5-7) ── */
dealDeskRoutes.get('/success/:projectId', requireOperator, async (c) => {
  return c.json({ data: await listSuccessReviews(c.req.param('projectId')), meta: meta() });
});

/* ── Partners + referrals (5-8) ── */
dealDeskRoutes.get('/partners', requireOperator, async (c) => {
  return c.json({ data: await listPartners(), meta: meta() });
});

dealDeskRoutes.post('/partners', requireOperator, async (c) => {
  const body = (await c.req.json<{ name?: string; type?: string; commissionPct?: number; contact?: string | null }>().catch(() => ({}))) as { name?: string; type?: string; commissionPct?: number; contact?: string | null };
  if (!body.name?.trim()) return c.json({ error: 'name required', code: 'VALIDATION' }, 400);
  const p = await createPartner({ name: body.name.trim(), type: body.type, commissionPct: body.commissionPct, contact: body.contact });
  return c.json({ data: p, meta: meta() }, 201);
});

dealDeskRoutes.get('/referrals', requireOperator, async (c) => {
  return c.json({ data: await listReferrals(c.req.query('partnerId') || undefined), meta: meta() });
});

dealDeskRoutes.post('/referrals', requireOperator, async (c) => {
  const body = (await c.req.json<{ partnerId?: string; projectId?: string | null; dealId?: string | null; status?: string; commissionCents?: number; notes?: string | null }>().catch(() => ({}))) as { partnerId?: string; projectId?: string | null; dealId?: string | null; status?: string; commissionCents?: number; notes?: string | null };
  if (!body.partnerId) return c.json({ error: 'partnerId required', code: 'VALIDATION' }, 400);
  const r = await createReferral({
    partnerId: body.partnerId,
    projectId: body.projectId,
    dealId: body.dealId,
    status: body.status,
    commissionCents: body.commissionCents,
    notes: body.notes,
  });
  return c.json({ data: r, meta: meta() }, 201);
});

/* ── Competitive deal intelligence (5-9) ── */
dealDeskRoutes.get('/deals/:dealId/competitors', requireOperator, async (c) => {
  return c.json({ data: await listCompetitors(c.req.param('dealId')), meta: meta() });
});

dealDeskRoutes.post('/deals/:dealId/competitors', requireOperator, async (c) => {
  const body = (await c.req.json<{ competitorName?: string; theirOfferCents?: number | null; notes?: string | null }>().catch(() => ({}))) as { competitorName?: string; theirOfferCents?: number | null; notes?: string | null };
  if (!body.competitorName?.trim()) return c.json({ error: 'competitorName required', code: 'VALIDATION' }, 400);
  const row = await addCompetitor({
    dealId: c.req.param('dealId'),
    competitorName: body.competitorName.trim(),
    theirOfferCents: body.theirOfferCents,
    notes: body.notes,
  });
  return c.json({ data: row, meta: meta() }, 201);
});

dealDeskRoutes.get('/deals/:dealId/coach', requireOperator, async (c) => {
  return c.json({ data: await coachDeal(c.req.param('dealId')), meta: meta() });
});

/* ── Virtual data room (5-10, metadata only) ── */
dealDeskRoutes.get('/deals/:dealId/data-room', requireOperator, async (c) => {
  return c.json({ data: await getDataRoom(c.req.param('dealId'), c.get('operator').id), meta: meta() });
});

dealDeskRoutes.post('/deals/:dealId/data-room', requireOperator, async (c) => {
  const body = (await c.req.json<{ name?: string; mime?: string; accessLevel?: string; content?: string }>().catch(() => ({}))) as { name?: string; mime?: string; accessLevel?: string; content?: string };
  if (!body.name?.trim()) return c.json({ error: 'name required', code: 'VALIDATION' }, 400);
  try {
    const doc = await addDoc(c.req.param('dealId'), c.get('operator').id, {
      name: body.name.trim(),
      mime: body.mime,
      accessLevel: body.accessLevel,
      content: body.content,
    });
    return c.json({ data: doc, meta: meta() }, 201);
  } catch (err) {
    if (err instanceof DocTooLargeError) return c.json({ error: err.message, code: 'DOC_TOO_LARGE' }, 413);
    throw err;
  }
});
