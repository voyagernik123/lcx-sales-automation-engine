import type { Page } from '@playwright/test';

/**
 * Take a seat without the API (e2e shared helper).
 *
 * WHY THIS FILE EXISTS — a post-mortem worth keeping.
 *
 * Every spec in this suite used to sign in by pressing `3` on a `/select` roster
 * ("take your seat", seat 3 = Nik). The LCX OS hardening replaced that roster with
 * an email + desk passcode form that is **verified server-side**. That silently
 * invalidated the suite's founding assumption, stated at the top of smoke.spec.ts:
 * that it works with the API down, because CI has no database. Sign-in itself now
 * needs the API, so `signIn()` could never complete, so all eleven specs failed at
 * their first line — including the screenshot baselines and the a11y ratchet.
 *
 * It went unnoticed because the workflow that runs `npm run e2e` lives in an
 * UNTRACKED `.github/` directory, so it had never executed. A ratchet nobody runs
 * is worse than no ratchet: it reads as coverage in the repo and provides none. The
 * dead specs included "opens a deal inspector and Escape closes it" — precisely the
 * behaviour Phase 4 rebuilt from scratch, which had to be verified by hand instead.
 *
 * THE FIX, and its limit. Seeding the persisted session restores the suite's
 * original intent — assert chrome, routing, theming, keyboard and interaction, never
 * seeded data. It deliberately does NOT test the sign-in form: that path genuinely
 * requires a server and belongs in an integration test with a real API, not here.
 * So this helper buys back ten specs and honestly forfeits one; `frontDoorOnly`
 * exists for the specs that want the gate itself.
 */

/** Nik, approver — the seat with all six workspaces, so no route is gated away. */
const SEAT = {
  email: 'nik@lcx.com',
  operator: {
    id: 'nik',
    name: 'Nik',
    email: 'nik@lcx.com',
    role: 'approver',
    initials: 'N',
    colorVar: 'var(--chart-1)',
  },
};

/**
 * Seed the session before the app's first script runs.
 *
 * `addInitScript` rather than an `evaluate` after `goto`: the operator store reads
 * localStorage during module initialisation, so anything written after navigation
 * arrives too late and the guard has already redirected to /select.
 */
export async function takeSeat(page: Page): Promise<void> {
  await page.addInitScript((seat) => {
    // The email is unscoped and drives the scope of every other key — see
    // lib/persistence.ts. It must be set first or the operator record lands under
    // the `anon` scope, where the app will not look for it.
    localStorage.setItem('lcx_operator_email', seat.email);
    // A passcode has to be present for the API client to attempt authenticated
    // reads at all. Its value is irrelevant here: with no API the requests fail
    // either way, and the specs assert on the degraded state, not on data.
    localStorage.setItem('lcx_desk_passcode', 'e2e-no-api');

    const key = `lcx-os:${seat.email}:operator:v1`;
    // `version: 3` matters. The store's migrate() unconditionally returns
    // `{ operator: null }`, so seeding any other version wipes the seat and the
    // spec fails on the sign-in gate with no clue why.
    localStorage.setItem(key, JSON.stringify({ state: { operator: seat.operator }, version: 3 }));
  }, SEAT);
}

/** The desk, seated. */
export async function goToDesk(page: Page, path = '/'): Promise<void> {
  await takeSeat(page);
  await page.goto(path);
}
