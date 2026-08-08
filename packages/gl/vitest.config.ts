import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    /*
     * `node`, not `jsdom`, and deliberately so. Nothing in this package can be
     * meaningfully tested against a fake DOM: jsdom has no WebGL2, so a `jsdom` run
     * would test the same refusal path as `node` while implying it had exercised a
     * renderer. The GPU half is verified by the headless capture in `docs/3d/p0`, which
     * runs a real driver and produces an image somebody looks at.
     *
     * What IS tested here is everything that can be: the projection arithmetic, the
     * colour pipeline, the tone-map policy, the motion refusals, and the shape of the
     * stage's own refusals.
     */
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['dist/**', 'node_modules/**'],
    testTimeout: 20_000,
  },
});
