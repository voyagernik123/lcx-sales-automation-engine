import { Hono } from 'hono';
import type { AuthVariables } from '../middleware/auth.js';
import { requireOperator } from '../middleware/auth.js';
import { requireWorkspace } from '../middleware/workspace.js';
import { getPool } from '../db/index.js';
import { loadControlRegister } from '../access/controlRegister.js';
import { env } from '../lib/env.js';

/**
 * GET /v1/governance/control-register — the governed acts that succeeded while a
 * control did not run.
 *
 *   ?windowDays=1..730   how far back to look (default 90)
 *   ?limit=1..500        how many marked acts to fetch per marker family (default 200)
 *
 * Both are clamped by `loadControlRegister`, which REFUSES rather than substitutes: an
 * out-of-range or unreadable value comes back on the payload as REGISTER_OPTIONS_CLAMPED
 * naming what was requested and what was applied. See `asNumber` below.
 *
 * ONE READ AND NOTHING ELSE. Every remedy this register points at already has a
 * write path that owns it — a missing review is filed at `POST /v1/reviews`, a
 * decision is re-opened through the action registry — and a second write path from a
 * report is how two surfaces come to disagree about what "reviewed" means.
 *
 * ── THE GATE IS DECLARED HERE, NOT INHERITED ─────────────────────────────────
 * `app.ts` mounts `requireWorkspace(ws.id, …)` automatically for every prefix in a
 * workspace's `apiPrefixes` (the workspace constitution in `@lcx/shared`).
 * GOVERNANCE declares `/v1/audit`, `/v1/wbr` and `/v1/decisions` — NOT
 * `/v1/governance`. `packages/shared` is owned by another lane this pass, so the
 * automatic gate cannot be extended to cover this route, and mounting it without a
 * gate would publish the register to the whole desk. The middleware is therefore
 * applied explicitly below, which is idempotent with the automatic mount: if
 * `/v1/governance` is later added to `apiPrefixes` this route keeps working
 * unchanged, because `requireWorkspace` authenticates only when it is first in line.
 *
 * WHY THAT GATE MATTERS HERE and not just as a formality: the rows carry
 * `gateDegradedReason` and `overrideReason` verbatim from `audit_log.meta`, and one
 * of the three writing call sites is the GPS discount limb — a compartment that is
 * `machineAccess: false` precisely so machines cannot read a third party's
 * confidential commercial terms. `routes/audit.ts` records at length what happened
 * the last time governance republished another compartment's `meta` unfiltered.
 *
 * WHAT IS DELIBERATELY NOT DONE ABOUT THAT, said out loud rather than implied: this
 * route does NOT apply `routes/audit.ts`'s per-row `gps`/`marketing` capability
 * redaction to the reasons it returns. A GPS `gateDegradedReason` is a fixed
 * server-authored sentence about placeholder price bands and carries no client
 * material today — but that is a property of the current message, not of the field,
 * and the next marker reason could carry more. The redaction belongs in the composer
 * and is owed work; until it exists, this surface is gated at governance `view` and
 * the reasons are as readable as `/v1/audit`'s already are to the same principals.
 */

export const governanceRegisterRoutes = new Hono<{ Variables: AuthVariables }>();

const meta = () => ({ timestamp: new Date().toISOString(), version: env.version });

/**
 * ONE OWNER OF THE BOUNDS, AND IT IS THE MODULE, NOT THIS ROUTE.
 *
 * The route used to clamp and `loadControlRegister` did not, which was wrong twice over.
 * The exported function was unsafe on its own — measured: a non-finite `windowDays` threw
 * `Invalid time value`, `-30` produced a window running INTO THE FUTURE and published
 * `windowDays: -30` with no refusal, and `limit: 0` published an empty register for a
 * window in which a marked act had been fetched. And clamping HERE meant the substitution
 * was silent: `?windowDays=-30` came back describing 90 days as though that had been
 * asked for.
 *
 * So the module clamps (it owns WINDOW_DAYS_BOUNDS / LIMIT_BOUNDS) and STATES the clamp
 * as REGISTER_OPTIONS_CLAMPED on the payload. This function only parses: an absent
 * parameter is `undefined` so the module applies its default without refusing, and
 * anything present is passed through as the caller wrote it — including `abc`, which
 * comes back as a refusal naming what was asked for rather than as a quiet 90 days.
 */
function asNumber(raw: string | undefined): number | undefined {
  return raw === undefined || raw === '' ? undefined : Number(raw);
}

governanceRegisterRoutes.get(
  '/control-register',
  requireWorkspace('governance', 'view'),
  requireOperator,
  async (c) => {
    const windowDays = asNumber(c.req.query('windowDays'));
    const limit = asNumber(c.req.query('limit'));
    try {
      const data = await loadControlRegister(getPool(), { windowDays, limit });
      return c.json({ data, meta: meta() });
    } catch (err) {
      /*
       * A 500 AND NOT AN EMPTY REGISTER. `loadControlRegister` already converts the
       * one recoverable fault — 42P01, a migration that has not landed — into a
       * stated refusal with `rows: null`. Anything reaching here is a genuine fault,
       * and the one thing this surface must never do is answer "no controls were
       * missed" because the database was broken.
       */
      console.error('[governance] control register error:', err);
      return c.json(
        {
          error: 'The control register could not be computed. This is a fault, NOT a finding that every control ran.',
          code: 'CONTROL_REGISTER_ERROR',
        },
        500,
      );
    }
  },
);
