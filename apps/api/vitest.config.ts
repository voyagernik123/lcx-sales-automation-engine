import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    /*
     * 20s, not vitest's default 5s, because much of this suite talks to a REAL Postgres
     * rather than a mock — and that is deliberate, since the defects worth catching here
     * are the ones a mock agrees with.
     *
     * Measured on 2026-08-03, during a run with seven concurrent agents on this machine:
     *   features.test.ts   "unified timeline"  POST /v1/projects 845ms, GET /timeline 2s,
     *                                          test killed at 5017ms
     *   intel100x.test.ts  "project snooze"    466ms + 220ms + 931ms, same ceiling
     * Both pass in 2.7s combined on an idle machine. So neither was a logic defect, and
     * neither was the clock-tick ordering collision first suspected: the ASSERTIONS were
     * sound and the BUDGET was wrong. One of those tests makes seven round-trips, and a
     * 20ms query becomes a 2s query when the box is saturated.
     *
     * Raised only as far as the evidence supports. A genuinely hung test still fails here
     * — 20s is four times the observed worst case, not a licence to hang — and the honest
     * alternative, a retry, would have hidden the fact that the suite is I/O-bound.
     */
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
