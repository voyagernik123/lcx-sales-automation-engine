import { Hono } from 'hono';
import { intakeCandidate, INTAKE_MESSAGE_MAX, OFFER_KEYS, type OfferKey } from '@lcx/shared';
import { getPool } from '../db/index.js';
import { insertCandidates, isDemandMigrated } from '../gps/demand.js';
import { rateBucketKey } from '../middleware/rateKey.js';

/**
 * PUBLIC SERVICES INTAKE — the one unauthenticated write GPS owns, built like it knows it.
 *
 *   POST /v1/services/intake    a project asks about a service; a candidate lands in the queue
 *
 * Mounted in app.ts BESIDE x402 (public by design), NOT under /v1/gps — the compartment
 * constitution forbids exemptions there, and this endpoint is not an exemption: it is a
 * different, narrower thing with its own rules.
 *
 * ── THE RULES, EACH ONE A REFUSAL SOMEWHERE ──────────────────────────────────
 *  · STRICT SCHEMA: six known fields, everything else refused — an unknown key on a
 *    public endpoint is someone exploring, and the exploration ends at the first key.
 *  · LENGTH CAPS on every field, message ≤500. A public form is not a document intake;
 *    D2's whole apparatus exists for material that matters, and none of it enters here.
 *  · HONEYPOT: the `website` field is invisible to humans. Anything in it and the request
 *    is dropped — while answering the SAME {received:true} a real submission gets, because
 *    a honeypot that explains itself stops being one. The drop is logged server-side only.
 *  · PER-IP BUCKET, tighter than the global limiter: 5 submissions/hour/IP. The global
 *    rateLimit() in app.ts still applies in front; this is the second, narrower fence.
 *  · NO REFLECTION: the response never echoes what was submitted and never reveals whether
 *    an email or project is already known. {received:true} is the entire vocabulary.
 *  · IDEMPOTENT-ISH: sourceRef derives from (email, projectName, UTC-day), so the same
 *    person resubmitting the same ask the same day updates nothing and duplicates nothing.
 *
 * ── WHAT THE VISITOR IS TOLD ABOUT THEIR DATA ────────────────────────────────
 * The public form says why the email is collected (to respond) and that it lands in LCX's
 * services queue. That sentence lives with the form; this endpoint stores exactly the six
 * fields and nothing derived from headers beyond the rate key, which is never persisted.
 */

const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 5;
/** ip → timestamps of accepted-or-refused attempts inside the window. Tab-of-the-process scope. */
const attempts = new Map<string, number[]>();

function overLimit(ip: string, nowMs: number): boolean {
  const list = (attempts.get(ip) ?? []).filter((t) => nowMs - t < WINDOW_MS);
  list.push(nowMs);
  attempts.set(ip, list);
  // Opportunistic sweep so the map cannot grow unbounded on a scan.
  if (attempts.size > 10_000) {
    for (const [k, v] of attempts) if (v.every((t) => nowMs - t >= WINDOW_MS)) attempts.delete(k);
  }
  return list.length > MAX_PER_WINDOW;
}

const ALLOWED_KEYS = new Set(['projectName', 'url', 'email', 'offerInterest', 'jurisdiction', 'message', 'website']);

export const servicesIntakeRoutes = new Hono();

servicesIntakeRoutes.post('/intake', async (c) => {
  try {
    /* `rateBucketKey`, not the leftmost XFF entry. This bucket read a header the
       CALLER writes, so rotating one value per request made the 5/hr ceiling
       decorative — found in the G7 pen-test round, same defect as the portal's.
       The key now derives from the declared trusted-proxy chain. */
    const ip = rateBucketKey(c);
    if (overLimit(ip, Date.now())) {
      // 429 with no detail: a scanner learns the ceiling exists, not where the queue lives.
      return c.json({ error: 'Too many submissions. Try again later.', code: 'RATE_LIMITED' }, 429);
    }

    let body: Record<string, unknown>;
    try {
      const parsed = await c.req.json();
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('shape');
      body = parsed as Record<string, unknown>;
    } catch {
      return c.json({ error: 'body must be a JSON object', code: 'VALIDATION' }, 400);
    }

    for (const k of Object.keys(body)) {
      if (!ALLOWED_KEYS.has(k)) {
        return c.json({ error: `unknown field "${k}"`, code: 'VALIDATION' }, 400);
      }
    }

    const str = (v: unknown, max: number): string | null =>
      typeof v === 'string' && v.trim().length > 0 && v.length <= max ? v.trim() : null;

    const projectName = str(body.projectName, 120);
    const email = str(body.email, 254);
    const offerInterest = typeof body.offerInterest === 'string' ? body.offerInterest : '';
    if (!projectName) return c.json({ error: 'projectName is required (≤120 chars)', code: 'VALIDATION' }, 400);
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return c.json({ error: 'a valid email is required — it is how LCX responds', code: 'VALIDATION' }, 400);
    }
    if (offerInterest !== 'unsure' && !OFFER_KEYS.includes(offerInterest as OfferKey)) {
      return c.json({ error: `offerInterest must be one of ${OFFER_KEYS.join(', ')} or "unsure"`, code: 'VALIDATION' }, 400);
    }
    const message = typeof body.message === 'string' ? body.message : '';
    if (message.length > INTAKE_MESSAGE_MAX) {
      return c.json({ error: `message must stay ≤${INTAKE_MESSAGE_MAX} chars — this is an introduction, not a brief`, code: 'VALIDATION' }, 400);
    }

    const nowIso = new Date().toISOString();
    const out = intakeCandidate({
      projectName,
      url: str(body.url, 300),
      email,
      offerInterest: offerInterest as OfferKey | 'unsure',
      jurisdiction: str(body.jurisdiction, 200),
      message,
      website: typeof body.website === 'string' ? body.website : '',
    }, `in:${email.toLowerCase()}:${projectName.toLowerCase()}:${nowIso.slice(0, 10)}`, nowIso);

    if (!out.ok) {
      // The honeypot path lands here too. Same answer as success, logged server-side only.
      if (out.defects.some((d) => d.includes('honeypot'))) {
        console.warn(`[services] intake dropped (honeypot) from ${ip}`);
        return c.json({ received: true });
      }
      return c.json({ error: 'submission not accepted', code: 'VALIDATION' }, 400);
    }

    const pool = getPool();
    if ((await isDemandMigrated(pool)) !== true) {
      /* The visitor is not the audience for our migration state. Accept-and-log: losing an
         inbound lead to an unapplied migration is our defect, and it is at least VISIBLE in
         the log, unlike a 503 the visitor never reports. */
      console.error('[services] intake received but gps_demand_candidate is absent — apply 0077. Lead:', out.candidate.sourceRef);
      return c.json({ received: true });
    }
    await insertCandidates(pool, [out.candidate], 'public_intake');
    return c.json({ received: true });
  } catch (err) {
    console.error('[services] intake error:', err);
    return c.json({ error: 'submission failed', code: 'ERROR' }, 500);
  }
});
