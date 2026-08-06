import { Hono } from 'hono';
import type { AuthVariables } from '../middleware/auth.js';
import { requireOperator } from '../middleware/auth.js';
import { env } from '../lib/env.js';
import { getPool } from '../db/index.js';
import { loadEntitlements } from '../access/entitlements.js';
import { scopesFor } from '../notifications/service.js';
import { composeReadout } from '../notifications/readout.js';

/**
 * GET /v1/readout — THE 07:00 READOUT, computed for the calling reader.
 *
 *   ?windowHours=1..720   how far back the brief looks (default 24)
 *   ?fetch=1..100         how many of the reader's most recent items to consider (default 50)
 *
 * Both are clamped by `composeReadout`, which REFUSES rather than substitutes: an
 * out-of-range or unreadable value comes back on the payload as READOUT_OPTIONS_CLAMPED
 * naming what was asked for and what was applied. See `asNumber` below.
 *
 * ── NO WORKSPACE GATE, AND THAT IS THE DESIGN ────────────────────────────────
 * `app.ts` mounts `requireWorkspace(...)` for the prefixes a compartment declares, and
 * a gate here would be WRONG rather than merely redundant: this route is not scoped to
 * one compartment, it is scoped to THE READER. The compartments are resolved per
 * request from the live grant table by `scopesFor(loadEntitlements(...))` — the same
 * two calls `routes/notifications.ts` makes, for the same reason recorded there: there
 * is no unscoped read path left, because the unscoped default is exactly what leaked
 * (0067). Gating on any single workspace would either hide the brief from readers who
 * legitimately hold another compartment, or — mounted on a compartment most people
 * hold — imply an authority over the rows it does not have.
 *
 * ── ONE READ, NO WRITES ──────────────────────────────────────────────────────
 * The brief marks nothing read. Every item it lists already has a write path that owns
 * it (`POST /v1/notifications/:id/read`), and a second write path reachable from a
 * report is how two surfaces come to disagree about what "handled" means. It follows
 * that opening the readout does not change what the bell says, which is deliberate: a
 * brief that silently clears its own contents cannot be read twice.
 *
 * ── NOTHING FIRES THIS AT 07:00 ──────────────────────────────────────────────
 * There is no scheduler in this lane and no cron entry anywhere pointing at it. The
 * name is an intention; the payload says so under READOUT_NOT_SCHEDULED on EVERY
 * response, and `frame.scheduled` is the literal `false`. `wbr_reports` is the
 * precedent being avoided — one row, a "schedule" that is a COMMENT, and a programme
 * metric dropped as unmeasurable because of it.
 */

export const readoutRoutes = new Hono<{ Variables: AuthVariables }>();

const meta = () => ({ timestamp: new Date().toISOString(), version: env.version });

/**
 * Parses, and deliberately does not validate. An absent parameter is `undefined` so the
 * composer applies its default silently (nothing was asked for), and anything present
 * is passed through as the caller wrote it — including `abc`, which comes back as a
 * stated refusal naming what was requested rather than as a quiet 24 hours. The bounds
 * live with the composer because it is the exported entry point and must be safe for
 * its second caller; see `controlRegister.ts` for the measured cost of splitting them.
 */
function asNumber(raw: string | undefined): number | undefined {
  return raw === undefined || raw === '' ? undefined : Number(raw);
}

readoutRoutes.get('/', requireOperator, async (c) => {
  const operator = c.get('operator');
  const windowHours = asNumber(c.req.query('windowHours'));
  const fetch = asNumber(c.req.query('fetch'));
  try {
    const scopes = scopesFor(await loadEntitlements(getPool(), operator.id));
    const data = await composeReadout(scopes, { windowHours, fetch });
    return c.json({ data, meta: meta() });
  } catch (err) {
    /*
     * A 500 AND NOT AN EMPTY BRIEF. `composeReadout` already turns the recoverable
     * ledger faults into a stated `state: 'not_loaded'` with `items: null`, so anything
     * reaching here failed BEFORE the brief could be composed — in practice the
     * entitlement read, which is the one thing that must never fail open: a reader
     * whose grants could not be resolved must get an error, not a brief computed
     * against some default scope set.
     */
    console.error('[readout] compose error:', err);
    return c.json(
      {
        error:
          'The readout could not be computed. This is a fault, NOT a finding that nothing needs your '
          + 'attention, and NOT a statement that nothing is being withheld from you.',
        code: 'READOUT_ERROR',
      },
      500,
    );
  }
});
