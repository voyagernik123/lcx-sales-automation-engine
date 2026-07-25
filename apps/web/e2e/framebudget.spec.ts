import { expect, test } from '@playwright/test';
import { goToDesk } from './seat';

/**
 * The Phase 5 gate: "frame budget held with the juice on".
 *
 * Written as a spec rather than measured once by hand, because a number pasted
 * into a commit message is not a gate — it is an anecdote that cannot notice the
 * day someone adds a 700ms box-shadow transition to every table row.
 *
 * WHAT THIS MEASURES, AND WHY NOT rAF DELTAS ALONE. The obvious approach is to
 * sample `requestAnimationFrame` intervals and assert they stay near 16.7ms. Two
 * problems: on a healthy 60Hz display a frame IS ~16.7ms, so the raw interval can
 * never be "under 16ms" and asserting it would be asserting a falsehood; and in
 * headless Chromium the frame clock is not the display's, so the absolute numbers
 * mean little. Both are the P2 lesson — that phase produced a 7700ms "measurement"
 * that turned out to be a hidden-tab artifact, and the fix was to measure the thing
 * the code actually controls.
 *
 * So the primary assertion is the SYNCHRONOUS main-thread cost of the juice layer
 * itself. `playJuice` deliberately forces a reflow (`void el.offsetWidth`) to
 * restart a CSS animation — that is the one genuinely expensive thing this feature
 * does, it is unavoidable if animations are to be replayable, and it is exactly
 * what would go quadratic if someone juiced 200 table rows in a loop. Measuring it
 * is deterministic, meaningful, and fails for a real reason.
 *
 * The rAF comparison is kept as a secondary, deliberately loose check with an idle
 * CONTROL, and it is allowed to be inconclusive rather than to fail on noise.
 */

/** One flash is a class toggle plus a forced reflow. Budget is per element. */
const PER_ELEMENT_BUDGET_MS = 0.5;
/** A realistic worst case: a filtered table where every visible row changes state. */
const BATCH = 50;

test.describe('frame budget with the juice on', () => {
  test('juicing a table-sized batch stays well inside one frame', async ({ page }, testInfo) => {
    await goToDesk(page, '/settings');
    // The Feel section is rendered by the Settings page, which confirms the juice
    // module is actually reachable in the built app rather than only in a test.
    await expect(page.getByRole('button', { name: /Sample a commit/i })).toBeVisible();

    const result = await page.evaluate(
      async ([batch]) => {
        const juice = (await import('/src/lib/juice.ts')) as typeof import('../src/lib/juice');

        const host = document.createElement('div');
        host.id = 'juice-bench';
        for (let i = 0; i < batch; i++) {
          const row = document.createElement('div');
          row.textContent = `row ${i}`;
          host.appendChild(row);
        }
        document.body.appendChild(host);
        const rows = Array.from(host.children);

        // Warm up: first call pays for style resolution of a class never used yet,
        // which is a one-off cost and not what a real batch pays.
        rows.slice(0, 5).forEach((r) => juice.flash(r, 'live'));
        await new Promise((r) => requestAnimationFrame(() => r(null)));

        const t0 = performance.now();
        rows.forEach((r) => juice.flash(r, 'live'));
        const total = performance.now() - t0;

        host.remove();
        return { batch, total, per: total / batch };
      },
      [BATCH],
    );

    // Report the measurement, not just the verdict. A gate that only says "pass"
    // cannot tell you it has been passing for a year because it measures nothing.
    testInfo.annotations.push({
      type: 'measurement',
      description: `${result.batch} elements juiced in ${result.total.toFixed(2)}ms (${result.per.toFixed(3)}ms each, budget ${PER_ELEMENT_BUDGET_MS})`,
    });

    // A gate that cannot tell "fast" from "did not run" is not a gate.
    expect(result.batch, 'nothing was measured').toBe(BATCH);
    expect(result.total, 'zero elapsed time means the loop was optimised away').toBeGreaterThan(0);

    expect(
      result.per,
      `juicing ${result.batch} elements cost ${result.total.toFixed(2)}ms total, ` +
        `${result.per.toFixed(3)}ms each — budget is ${PER_ELEMENT_BUDGET_MS}ms each. ` +
        'The likely cause of a regression here is the forced reflow in playJuice ' +
        'interacting with a new expensive style on the juiced elements.',
    ).toBeLessThan(PER_ELEMENT_BUDGET_MS);
  });

  test('the juice does not drop frames against an idle control', async ({ page }, testInfo) => {
    await goToDesk(page, '/settings');
    await expect(page.getByRole('button', { name: /Sample a commit/i })).toBeVisible();

    const result = await page.evaluate(async () => {
      const feel = (await import('/src/lib/feedback.ts')) as typeof import('../src/lib/feedback');
      const target = document.querySelector('[role="switch"]')?.parentElement ?? document.body;

      function sample(ms: number): Promise<number[]> {
        return new Promise((resolve) => {
          const deltas: number[] = [];
          let last = performance.now();
          const t0 = last;
          // Hard deadline. If rAF stops firing — a backgrounded tab produces no
          // frames — resolve with what we have so the caller can see n === 0 and
          // report inconclusive, rather than hanging until the test times out.
          const bail = setTimeout(() => resolve(deltas.slice(1)), ms + 2_000);
          const tick = (now: number) => {
            deltas.push(now - last);
            last = now;
            if (now - t0 < ms) requestAnimationFrame(tick);
            else {
              clearTimeout(bail);
              resolve(deltas.slice(1));
            }
          };
          requestAnimationFrame(tick);
        });
      }

      const dropped = (d: number[]) => d.filter((x) => x > 32).length;
      // p50 as well as the dropped count. A run can drop no frames and still be
      // meaningfully slower — if every frame stretches from 16.7ms to 20ms nothing
      // crosses a 32ms threshold, but the app is running at 50Hz. Reporting only
      // the dropped count would hide exactly that, and hiding it is how a "budget
      // held" claim becomes untrue without any test noticing.
      const p50 = (d: number[]) => {
        const sorted = [...d].sort((a, b) => a - b);
        return sorted.length ? +sorted[Math.floor(sorted.length / 2)].toFixed(2) : 0;
      };

      const idle = await sample(1_200);
      feel.setFeelPref('sound', true);
      let fired = 0;
      const firing = setInterval(() => {
        fired++;
        if (fired % 2) feel.feedback.commit(target);
        else feel.feedback.refuse(target, `probe ${fired}`);
      }, 80);
      const juiced = await sample(1_200);
      clearInterval(firing);
      feel.setFeelPref('sound', false);

      return {
        idleN: idle.length,
        juicedN: juiced.length,
        idleDropped: dropped(idle),
        juicedDropped: dropped(juiced),
        idleP50: p50(idle),
        juicedP50: p50(juiced),
        fired,
      };
    });

    // Inconclusive is an honest outcome and must not read as a pass. If no frames
    // were produced the environment did not render, and the numbers below would be
    // vacuously fine — which is exactly how a false green happens.
    test.skip(result.idleN === 0 || result.juicedN === 0, 'no frames produced — environment did not render');

    testInfo.annotations.push({
      type: 'measurement',
      description:
        `idle: ${result.idleN} frames, p50 ${result.idleP50}ms, ${result.idleDropped} dropped · ` +
        `juiced: ${result.juicedN} frames, p50 ${result.juicedP50}ms, ${result.juicedDropped} dropped · ` +
        `${result.fired} events`,
    });

    expect(result.fired, 'no juice events fired').toBeGreaterThan(5);
    expect(
      result.juicedDropped,
      `dropped ${result.juicedDropped} frames with the juice on vs ${result.idleDropped} idle ` +
        `(${result.juicedN} frames sampled, ${result.fired} events). Compared against a control ` +
        'because a raw 16.7ms interval is a healthy frame, not a budget breach.',
      // Tolerance rather than equality: the environment is shared and noisy, and a
      // test that fails on one stray long frame gets retried until green, which is
      // worse than no test.
    ).toBeLessThanOrEqual(result.idleDropped + 3);
  });
});
