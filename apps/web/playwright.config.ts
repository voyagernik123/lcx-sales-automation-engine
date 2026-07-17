import { defineConfig, devices } from '@playwright/test';

/**
 * Screenshot + interaction ratchet (FINAL_MASTER_PLAN D3). Runs in CI (see
 * .github/workflows/ci.yml) against the web dev server. Deliberately does NOT
 * require the API/DB: the shell degrades gracefully when the API is down, so
 * these specs assert chrome, routing, theming and inspector interaction —
 * the things a visual/behavioral regression would break — not seeded data.
 *
 * Baselines are generated on the first CI run (`npm run e2e:update`) and
 * committed; every subsequent run fails the job on a visual or behavior diff.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 6_000, toHaveScreenshot: { maxDiffPixelRatio: 0.02 } },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    colorScheme: 'light',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
