import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['dist/**', 'node_modules/**'],
    /*
     * 20s, not vitest's default 5s. Nothing here does I/O — this package is pure by
     * construction — so the pressure is CPU, and the heaviest tests are genuinely heavy:
     * the GPS underwriting suite runs Monte Carlo simulations, and the marketing engines
     * evaluate large enumerated rule tables.
     *
     * Measured on 2026-08-03: underwrite.test.ts "refuses the attribution rather than
     * reporting a negative share as 0%" was killed at 5000ms during a seven-agent run,
     * and the whole 98-test file completes in 1.43s on an idle machine. So the assertion
     * was never wrong, only starved of CPU.
     *
     * A pure test that needs more than 20s is a real defect and still fails here.
     */
    testTimeout: 20_000,
  },
});
