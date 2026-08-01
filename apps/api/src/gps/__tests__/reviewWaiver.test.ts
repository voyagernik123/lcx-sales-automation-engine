import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * `reviewRequired: false` DELETED THE APPROVER-ONLY REVIEW STEP FROM A BODY FIELD.
 *
 * `review_required` defaults TRUE at the column (`0049_gps_delivery.sql:268`) and in the
 * domain (`REVIEW_REQUIRED_BY_DEFAULT`). Both `canAccept` and the database constraint
 * `gps_deliverable_no_acceptance_before_review` are CONDITIONED on it — so a row created
 * with it false has no review gate at all, and `recordDeliverableReview` (approver-only)
 * becomes vacuous for that row.
 *
 * `POST /engagements/:id/deliverables` is `requireOperator` only, and it took the flag
 * straight off the body with no reason recorded. `GpsDelivery.tsx` then printed a grey
 * "not required" and "may be accepted": an unattributed operator assertion rendered as a
 * policy property, on the screen that authorises invoicing.
 *
 * Source-level because the handler is a Hono mount over a pool this suite has no
 * database for. What is asserted is the CONTROL, not the prose: the role check, the
 * required reason, and the fact that the reason is persisted somewhere rather than
 * dropped.
 */

const ROUTE = readFileSync(new URL('../../routes/gpsDelivery.ts', import.meta.url), 'utf8');
const PAGE = readFileSync(
  new URL('../../../../web/src/pages/GpsDelivery.tsx', import.meta.url),
  'utf8',
);

/** The `POST …/deliverables` handler, from its mount to the next route registration. */
function handler(): string {
  const at = ROUTE.indexOf("gpsDeliveryRoutes.post('/engagements/:id/deliverables'");
  expect(at, 'the deliverables route has moved or been renamed').toBeGreaterThan(-1);
  const rest = ROUTE.slice(at);
  const next = rest.slice(1).search(/gpsDeliveryRoutes\.(get|post|patch|put|delete)\(/);
  return next === -1 ? rest : rest.slice(0, next + 1);
}

describe('waiving the review is an approver act with a stated reason', () => {
  const h = handler();

  it('refuses reviewRequired: false unless the session is an approver', () => {
    expect(h).toMatch(/reviewRequired === false/);
    expect(h).toContain("role !== 'approver'");
    expect(h).toContain('REVIEW_WAIVER_REQUIRES_APPROVER');
    // 403 rather than 400: the request is well formed and the principal is not allowed.
    expect(h).toMatch(/REVIEW_WAIVER_REQUIRES_APPROVER'[,\s]*\}[,\s]*403/);
  });

  it('requires a reason, and the check is BEFORE the write', () => {
    expect(h).toContain('reviewWaiverReason');
    const roleCheck = h.indexOf("role !== 'approver'");
    const reasonCheck = h.indexOf('reviewWaiverReason');
    const write = h.indexOf('createDeliverable(');
    expect(roleCheck).toBeGreaterThan(-1);
    expect(reasonCheck).toBeGreaterThan(-1);
    expect(roleCheck, 'the role is checked after the write').toBeLessThan(write);
    expect(reasonCheck, 'the reason is checked after the write').toBeLessThan(write);
  });

  it('persists the waiver reason and the waiving operator, not just validates them', () => {
    // 0049 has no `review_waiver_reason` column (DELIVERY_SCHEMA_GAPS), so it goes into
    // `external_location_note` behind a findable prefix. An honest place beats no place,
    // and validating a reason then dropping it would be the original defect with a form.
    expect(h).toContain('REVIEW WAIVED');
    expect(h).toMatch(/REVIEW WAIVED by \$\{c\.get\('operator'\)/);
  });

  it('takes the flag from the body and nothing else — no header, query or default flip', () => {
    expect(h).not.toMatch(/query\('reviewRequired'\)/);
    expect(h).not.toMatch(/header\('[^']*review/i);
    // The DEFAULT is still true. A default flip would waive every row silently.
    expect(h).toMatch(/reviewRequired === undefined \? true/);
  });
});

describe('the acceptance table does not render a waiver as policy', () => {
  it('says the review was WAIVED AT CREATION, never bare "not required"', () => {
    // "not required" reads as a property of the offer. It is a per-row column one
    // person set, on the screen that authorises invoicing.
    expect(PAGE).toContain('waived at creation');
    expect(PAGE).toMatch(/review_required = false on this row/);
    expect(PAGE, 'the bare phrase is back').not.toMatch(/>\s*not required\s*</);
  });

  it('states that the review BASIS is not recorded rather than rendering nothing', () => {
    // `reviewBasis` is a substituted null on every row (0049 has no column), so
    // `{r.reviewBasis && …}` printed an empty line and the reader inferred a fact.
    expect(PAGE).toMatch(/basis not recorded/);
  });

  it('renders the substitution ledger the server sends in meta', () => {
    // The ledger explaining reviewBasis/acceptedBy/milestoneKey travelled in `meta`,
    // and the web `unwrap` dropped `meta`. See lib/api/meta.ts.
    expect(PAGE).toContain('responseMeta(');
    expect(PAGE).toMatch(/SUBSTITUTED, not recorded/);
  });
});
