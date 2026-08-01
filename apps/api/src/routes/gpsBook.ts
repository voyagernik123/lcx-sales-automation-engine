import { Hono } from 'hono';
import type { AuthVariables } from '../middleware/auth.js';
import { requireOperator } from '../middleware/auth.js';
import { getPool } from '../db/index.js';
import { env } from '../lib/env.js';
import { isMigrated } from '../gps/service.js';
import {
  BOOK_FIGURES,
  drillBook,
  emptyBook,
  readBook,
  readBookAndPositions,
  validateDrill,
} from '../gps/book.js';

/**
 * GLOBAL SERVICES — PHASE 6, THE BOOK, as an API.
 *
 *   GET /book          the whole book in one read (BookResponse)
 *   GET /book/figures  the drill-down catalogue — which numbers open, and how
 *   GET /book/rows     what produced one number: the rows, the formula, the grade
 *
 * NOT MOUNTED BY THIS FILE. `app.ts` and `routes/gps.ts` belong to the human wiring
 * pass, so the mount is stated in the handover instead of taken. The paths above are
 * written to be mounted at `/v1/gps`, which is what `apps/web/src/lib/api/gpsBook.ts`
 * already calls (`/v1/gps/book`). Mounting this router anywhere else silently breaks
 * the web client, and `intakeLockout.test.ts` asserts that everything served under
 * `/v1/gps` is a reviewed GPS router — so the wiring pass has to add this router to
 * that test's allow-list deliberately rather than by accident.
 *
 * ══ THREE READS. NO WRITES. NOT ONE. ══
 * The book is a read, and that is a design decision with a reason rather than a
 * scope cut: every write that could change it — accept, invoice, chase, price,
 * record the conflict check — already exists on the quote desk, the delivery desk
 * and the conflict register. A second write path to the same rows from a portfolio
 * screen is how two surfaces come to disagree about what a deposit is. The absence
 * is ASSERTED, not intended: `__tests__/book.test.ts` fails the build if a `post`,
 * `put`, `patch` or `delete` handler appears in this file. That is also why there is
 * no 503 branch here — 503 is the answer to a WRITE during the migration window, and
 * a file with no writes that carried one would be carrying dead code.
 *
 * ══ MIGRATION-PENDING DISCIPLINE, copied from `routes/gps.ts` ══
 * 0047 is applied by hand and this code ships on a push to main, so there is a
 * window — possibly a weekend — where the book is live and `gps_engagement` does not
 * exist. Every handler that touches a table probes `isMigrated()` first and answers
 * 200 with a WELL-SHAPED EMPTY body carrying `migrated: false`, so the page renders
 * its banner instead of its error state. A 500 in that window reads as "the platform
 * is down", and it is the second reading people act on.
 *
 * VALIDATION RUNS BEFORE THE PROBE, on every handler that takes a parameter. A
 * malformed request is malformed in every environment; answering 503 or an empty 200
 * for an unknown figure would tell the caller to retry something that can never
 * succeed. `validateDrill` refuses with the VALID VALUES NAMED (D2) — never a
 * silent default, and never a quietly ignored parameter, because an ignored filter
 * is how an operator comes to believe a list was scoped when it was not.
 *
 * ══ WHAT `data` IS ══
 * `BookResponse` — declared once, at `packages/shared/src/gps/book.ts:2035`, and
 * imported by both this API and the web. Nothing is reshaped on the way out and
 * there is no API-local copy of it. The one exception is `BookDrill` (the drill-down
 * envelope), which the shared layer does not declare; it lives in
 * `apps/api/src/gps/book.ts` and the handover names moving it into `packages/shared`
 * as the follow-up. It must NOT be hand-copied into `apps/web/src/lib/api/` — a
 * hand-copied response interface in that directory is what took production down.
 *
 * ══ NO INTAKE ══
 * Three GETs, no body reader, nothing that can accept a client's material. Decision
 * D2 (LCX DPO: controller vs processor for third-party confidential material) is
 * unanswered, and a portfolio screen is a tempting place to defeat that gate.
 */

const meta = () => ({ timestamp: new Date().toISOString(), version: env.version });

export const gpsBookRoutes = new Hono<{ Variables: AuthVariables }>();

/**
 * The basis is a query parameter and NOT a client default.
 *
 * `margin` is the engine's default and it is a COMMERCIAL position, not a technical
 * one: partners deliver and the founder sells and coordinates, so margin and
 * capacity are the business and revenue is a vanity axis. A default that expresses a
 * commercial position belongs on the server that can report its own basis, which is
 * why the response carries `concentration.basis` back. `price` is for an operator who
 * deliberately wants the revenue reading.
 */
function basisOf(raw: string | undefined): 'margin' | 'price' | null {
  const v = (raw ?? 'margin').trim();
  return v === 'margin' || v === 'price' ? v : null;
}

/**
 * THE BOOK — one request, on purpose.
 *
 * Not a performance choice. `bookHealth()` consumes the concentration, the cash
 * conversion AND the binding constraint, and `bindingConstraint()` consumes the same
 * `CashConversion` instance the funnel renders. A score fetched separately from the
 * concentration it was computed over could disagree with the table underneath it, and
 * a portfolio instrument that prints a verdict about one instant beside evidence from
 * another is worse than a spreadsheet, because the spreadsheet does not claim to be
 * an instrument.
 */
gpsBookRoutes.get('/book', requireOperator, async (c) => {
  try {
    // Inline, not a shared constant: the deploy ratchet reads each handler's own text
    // to prove validation precedes the probe, and a constant lifted out of the handler
    // makes that check pass by accident on a handler that validates nothing.
    const basis = basisOf(c.req.query('basis'));
    if (basis === null) {
      return c.json({ error: "basis must be 'margin' or 'price'", code: 'VALIDATION' }, 400);
    }

    const pool = getPool();
    if (!(await isMigrated(pool))) {
      // 200 with an empty, well-shaped body. `emptyBook` is composed by the REAL
      // engines over zero positions, so no field on this response is undefined and
      // `unresolved[0]` says the book is UNREADABLE rather than empty.
      return c.json({ data: emptyBook(new Date().toISOString(), basis), meta: meta() });
    }
    return c.json({ data: await readBook(pool, { basis }), meta: meta() });
  } catch (err) {
    console.error('[gps] book error:', err);
    return c.json({ error: 'Failed to load the book', code: 'GPS_ERROR' }, 500);
  }
});

/**
 * The drill-down catalogue: DB-FREE, and asserted so.
 *
 * It is the compiled `BOOK_FIGURES` table and touches no row, so it keeps working
 * perfectly during the migration window and carries no probe. The deploy ratchet
 * allow-lists it ONLY on the condition that it contains no `getPool` and no query,
 * so a later edit that adds a lookup here fails the test rather than quietly
 * 500-ing on the first Sunday deploy.
 *
 * It exists for D6 as much as D1: a keyboard-driven surface needs the list of what
 * can be opened, with each figure's required parameters, without guessing.
 */
gpsBookRoutes.get('/book/figures', requireOperator, (c) =>
  c.json({
    data: {
      figures: BOOK_FIGURES,
      note:
        'Every decision-bearing field of BookResponse is claimed by exactly one figure below, and a test ' +
        'resolves each `answers` path against a composed response — so a number with no way to open it ' +
        'fails the build instead of shipping as decoration.',
    },
    meta: meta(),
  }),
);

/**
 * WHAT PRODUCED THIS NUMBER — the rows, the formula, the source grade, the timestamp.
 *
 * D1 in one route. The drill-down is computed from the SAME positions the response
 * was composed from and carries the same `asOf`, so the rows cannot be a different
 * instant from the figure they explain. Each row states WHY it is in the list, so a
 * printed page argues for itself away from the screen (D7).
 *
 * Where a figure cannot be opened at all — realised margin with no `gps_outcome`
 * table, receivable aging with no invoice date, capacity with no bench — the response
 * carries a `refusal` sentence and an empty row list. Never an empty list alone: "no
 * rows" and "this cannot be answered on this schema" are opposite facts, and a blank
 * table reports the wrong one.
 */
gpsBookRoutes.get('/book/rows', requireOperator, async (c) => {
  try {
    // VALIDATION FIRST — before the pool, before the probe. Refusals name the valid
    // values, and an unrecognised parameter is refused rather than ignored.
    const validation = validateDrill({
      figure: c.req.query('figure'),
      basis: c.req.query('basis'),
      axis: c.req.query('axis'),
      currency: c.req.query('currency'),
      holder: c.req.query('holder'),
      stage: c.req.query('stage'),
      leg: c.req.query('leg'),
      bracket: c.req.query('bracket'),
      code: c.req.query('code'),
      offerKey: c.req.query('offerKey'),
    });
    if (!validation.ok) return c.json({ error: validation.error, code: 'VALIDATION' }, 400);
    const { request } = validation;

    const pool = getPool();
    if (!(await isMigrated(pool))) {
      // The figure still answers, over an empty book: same envelope, zero rows,
      // `migrated: false`. A 404 or a 503 here would make the UI unable to tell
      // "nothing matched" from "the tables are not there yet".
      const book = emptyBook(new Date().toISOString(), request.basis);
      return c.json({ data: drillBook(book, [], request), meta: meta() });
    }

    const read = await readBookAndPositions(pool, { basis: request.basis });
    return c.json({ data: drillBook(read.book, read.positions, request), meta: meta() });
  } catch (err) {
    console.error('[gps] book drill-down error:', err);
    return c.json({ error: 'Failed to open the figure', code: 'GPS_ERROR' }, 500);
  }
});
