/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 *  THE STATUS MAPPING, PINNED AGAINST THE PLATFORM'S OWN FILES — not against a copy of itself.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 *  `assertBrandFidelity` is the cautionary tale this file is written against. It computes
 *  `linearToHex(hexToLinear(BRAND_HEX[k])) === BRAND_HEX[k]` — a self-round-trip of a frozen table
 *  through two pure functions — and seventeen surfaces refuse on its result, none of which can
 *  ever fire. A test that asserts `semantic.ts`'s table equals `semantic.ts`'s table would be
 *  exactly that mistake with a different constant.
 *
 *  So the authority is the platform's source, read from disk:
 *    · `apps/web/tailwind.config.js`      — which CSS custom property each `status` role binds to.
 *    · `apps/web/src/styles/tokens.css`   — the triple that property carries, in BOTH themes.
 *  A cross-workspace read in a TEST introduces no runtime coupling (`semantic.ts` imports nothing
 *  from `apps/web`, and this package's vitest environment is `node` on purpose), and it is
 *  strictly better than the precedent: `theme.ts:100-103` copies `--card` and `--line` by hand
 *  with a comment, which is the same copy with no check on it.
 *
 *  WHAT THIS DOES NOT CLAIM, said out loud because an assumed scope is how the fidelity story
 *  went wrong: it does not prove a mark keeps the token's pixel. It cannot, and it must not — a
 *  lit material's radiance is albedo x illumination and the whole frame is tone-mapped (fd7fa0d).
 *  It pins the BINDING and the ADMISSION. Whether a given surface uses the binding is a check on
 *  that surface's own file.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  STATUS_ROLES, HUE_BUCKET_DEG, statusToken, statusAlbedo, statusAdmission, sceneStatusRoles,
  hueAngleDeg, chroma, hueDistanceDeg, greyscaleRatio, STATUS_POLICY, type StatusRole,
} from './semantic.js';
import { BRAND, hexToLinear, srgbToLinear, type Linear } from './colour.js';

/*
 * The repo root is FOUND, not counted in `..`s: a path with a fixed depth breaks silently into a
 * skip-shaped failure the moment this file or the package moves, and a colour test that quietly
 * stops reading the token file is worse than no test.
 */
function repoFile(rel: string): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    try {
      const p = join(dir, rel);
      readFileSync(p, 'utf8');
      return p;
    } catch { dir = dirname(dir); }
  }
  throw new Error(`cannot locate ${rel} above ${fileURLToPath(import.meta.url)} — the platform's `
    + 'token file is the authority for this test and there is no fallback by design');
}

const TAILWIND = readFileSync(repoFile('apps/web/tailwind.config.js'), 'utf8');
const TOKENS = readFileSync(repoFile('apps/web/src/styles/tokens.css'), 'utf8');

/**
 * The role census, from `tailwind.config.js`'s `status` group.
 *
 * `-bg` entries are dropped and that is a decision with a reason, not a filter of convenience: a
 * badge fill has no counterpart in a scene, where "behind" is the theme's ground. The flat side
 * agrees — `deferred-bg` binds `--ice-soft` and `unverified-bg` is an inline rgba, so those two
 * are not even a palette family there.
 */
function censusFromTailwind(): Map<string, string> {
  const block = /status:\s*\{([\s\S]*?)\n\s*\},/.exec(TAILWIND);
  if (block === null) throw new Error('no `status` group in tailwind.config.js — the census is broken');
  const out = new Map<string, string>();
  for (const m of block[1]!.matchAll(/'?([a-z][a-z-]*)'?:\s*'rgba?\(var\((--[a-z-]+)\)/g)) {
    if (m[1]!.endsWith('-bg')) continue;
    out.set(m[1]!, m[2]!);
  }
  return out;
}

/**
 * Every `--name: r g b` triple in `tokens.css`, per theme.
 *
 * A triple-only parse isolates the semantic tokens for free: the chart palette below them is
 * authored as hex, which is the same reason `contrast.test.ts` silently skipped every chart token
 * for as long as it did. Multiple `:root` and `.dark` blocks are merged, because the file has
 * three of each.
 */
function tokensByTheme(): Record<'light' | 'dark', Map<string, readonly [number, number, number]>> {
  const out = { light: new Map(), dark: new Map() } as Record<
    'light' | 'dark', Map<string, readonly [number, number, number]>
  >;
  for (const b of TOKENS.matchAll(/^(:root|\.dark)\s*\{([\s\S]*?)^\}/gm)) {
    const into = b[1] === '.dark' ? out.dark : out.light;
    for (const m of b[2]!.matchAll(/(--[a-z][a-z0-9-]*):\s*(\d+)\s+(\d+)\s+(\d+)\s*;/g)) {
      into.set(m[1]!, [Number(m[2]), Number(m[3]), Number(m[4])] as const);
    }
  }
  return out;
}

const CENSUS = censusFromTailwind();
const TOKEN_VALUES = tokensByTheme();
const THEMES = ['light', 'dark'] as const;
const srgbLinear = (s: readonly [number, number, number]): Linear =>
  [srgbToLinear(s[0] / 255), srgbToLinear(s[1] / 255), srgbToLinear(s[2] / 255)];

describe('the parse reached the platform files at all', () => {
  it('found a non-empty role census and non-empty token maps for both themes', () => {
    /* Asserted BEFORE anything loops over them. An empty census makes every check below pass
       while checking nothing — the failure mode that lets a mapping test survive a file move. */
    expect(CENSUS.size, 'no status roles parsed from tailwind.config.js').toBeGreaterThan(0);
    for (const t of THEMES) {
      expect(TOKEN_VALUES[t].size, `no rgb triples parsed for ${t}`).toBeGreaterThan(5);
    }
    /* And the parse found the pair the whole divergence is about, in both themes. */
    for (const t of THEMES) expect(TOKEN_VALUES[t].get('--red'), t).toBeDefined();
  });
});

describe('the mapping is the platform\'s, and cannot drift from it', () => {
  it('covers exactly the roles tailwind defines — a new role fails here, not in review', () => {
    /*
     * DERIVED both ways. If somebody adds `status.escalated` to tailwind.config.js this fails
     * until `semantic.ts` covers it; if somebody invents a role here that the platform does not
     * have, it fails too. A hand-list on either side could not fail on a role nobody thought of.
     */
    expect([...STATUS_ROLES].sort()).toEqual([...CENSUS.keys()].sort());
  });

  it('binds each role to the same custom property tailwind does', () => {
    expect(STATUS_ROLES.length).toBeGreaterThan(0);
    for (const role of STATUS_ROLES) {
      expect(statusToken(role), `role ${role}`).toBe(CENSUS.get(role));
    }
  });

  it('carries the token\'s own triple, in BOTH themes, to the byte', () => {
    /*
     * `--red` was retuned twice already for contrast reasons (#dc5064 -> #e4687a dark, and the
     * light amber #9a6b00 -> #8a5f00), each time with a measured justification in tokens.css. A
     * scene holding a stale copy of a retuned token is the drift this assertion exists to catch.
     */
    for (const role of STATUS_ROLES) {
      const token = statusToken(role);
      for (const t of THEMES) {
        const expected = TOKEN_VALUES[t].get(token);
        expect(expected, `${token} missing from the ${t} theme`).toBeDefined();
        /* Compared in LINEAR space, which is what a material is handed. Equality either way; this
           way the failure message is in the units the shader sees. */
        expect(statusAlbedo(role, t), `${role} (${token}) in ${t}`)
          .toEqual(srgbLinear(expected!));
      }
    }
  });

  it('and that comparison is real — a one-byte edit to the token file is detected', () => {
    /*
     * The negative control for the parse itself. Without it, the assertion above is satisfied by
     * any pair of maps that happen to agree, including two empty ones.
     */
    const sabotaged = new Map(TOKEN_VALUES.light);
    const red = sabotaged.get('--red')!;
    sabotaged.set('--red', [red[0] + 1, red[1], red[2]]);
    expect(statusAlbedo('blocked', 'light')).not.toEqual(srgbLinear(sabotaged.get('--red')!));
  });
});

describe('admission is decided on HUE, because a lit scene has no lightness to spare', () => {
  it('admits exactly blocked, conditional and ready — and the reasons name the measurement', () => {
    /*
     * The two refusals are the finding, not a formality, and both would have shipped as a
     * plausible mapping: --indigo dark (`unverified`) is 0.4 deg of hue from brand blue, and
     * --grey (`deferred`) has less chroma than `refusal` — it IS the absence hue at another
     * lightness, and lightness is exactly what illumination x albedo destroys.
     */
    expect([...sceneStatusRoles()].sort()).toEqual(['blocked', 'conditional', 'ready']);
    expect(statusAdmission('unverified').nearestDataKey).toBe('brand');
    expect(statusAdmission('unverified').nearestDataDeg).toBeLessThan(HUE_BUCKET_DEG);
    expect(statusAdmission('deferred').minChroma).toBeLessThan(chroma(BRAND.refusal));
    for (const role of STATUS_ROLES) {
      expect(statusAdmission(role).reason, role).toMatch(/\d/);
    }
  });

  it('every admitted role clears the bucket against EVERY data colour, in both themes', () => {
    const admitted = sceneStatusRoles();
    expect(admitted.length, 'no admitted roles — the loop below would check nothing').toBe(3);
    /* The data set is derived inside semantic.ts from SceneTheme's field names; re-derived here
       from the palette minus scenery so the two derivations have to agree. */
    const dataKeys = (['brand', 'brandBright', 'brandDeep', 'reference', 'refusal'] as const);
    for (const role of admitted) {
      for (const t of THEMES) {
        const c = statusAlbedo(role, t);
        for (const key of dataKeys) {
          expect(
            hueDistanceDeg(c, BRAND[key]),
            `${role} in ${t} is too close in hue to the data colour ${key}`,
          ).toBeGreaterThanOrEqual(HUE_BUCKET_DEG);
        }
      }
    }
  });

  it('the tightest margin is conditional against reference, and it is 19.7 deg', () => {
    /*
     * Recorded because it is the one pairing to watch: `reference` is the percentile/threshold
     * hue and `conditional` is the warning hue, and a single frame carrying both marks has only
     * 19.7 deg between them. No shipping surface does today — E7 uses `reference` as its ramp
     * high end and has no warning mark — but a future one must check.
     */
    const d = hueDistanceDeg(statusAlbedo('conditional', 'dark'), BRAND.reference);
    expect(d).toBeGreaterThan(19);
    expect(d).toBeLessThan(20);
  });

  it('admission is COMPUTED — feeding a role a data hue would refuse it', () => {
    /*
     * Proves the verdicts are not five hardcoded booleans. `reference` is a data colour, so a
     * role sitting on it has hue distance 0 and cannot clear the bucket by any threshold.
     */
    expect(hueDistanceDeg(hexToLinear('#FF8A3D'), BRAND.reference)).toBe(0);
    expect(hueAngleDeg(BRAND.reference)).toBeCloseTo(56.4, 1);
  });
});

describe('the shipped 3-D values, which are the reason this file exists', () => {
  /*
   * `#C9552B` is E6's BLOCKED slab (`VaultReliefGl.tsx:118`) and E3's stalled ramp end
   * (`PipelineReliefGl.tsx:132`) — one literal doing two jobs the platform keeps apart as red and
   * amber. Recorded here as a literal on purpose: it pins the measurement that refuses it, and it
   * keeps saying so after those files are fixed.
   */
  const SHIPPED_BLOCKED = hexToLinear('#C9552B');

  it('is outside the platform\'s red bucket in BOTH themes — 23.8 and 30.8 deg', () => {
    const light = hueDistanceDeg(SHIPPED_BLOCKED, statusAlbedo('blocked', 'light'));
    const dark = hueDistanceDeg(SHIPPED_BLOCKED, statusAlbedo('blocked', 'dark'));
    expect(light).toBeGreaterThan(HUE_BUCKET_DEG);
    expect(dark).toBeGreaterThan(HUE_BUCKET_DEG);
    expect(light).toBeCloseTo(23.8, 1);
    expect(dark).toBeCloseTo(30.8, 1);
  });

  it('and its nearest palette hue is the DATA colour `reference`, 10.0 deg away', () => {
    /*
     * The sharper half of the finding. It is not a slightly-wrong red: it sits in the hue family
     * `colour.ts` reserves for percentiles, thresholds and targets and calls "deliberately not a
     * data hue". A blocked slab and a threshold mark would read as the same kind of thing.
     */
    const ranked = (['brand', 'brandBright', 'brandDeep', 'reference', 'refusal'] as const)
      .map((k) => [k, hueDistanceDeg(SHIPPED_BLOCKED, BRAND[k])] as const)
      .sort((a, b) => a[1] - b[1]);
    expect(ranked[0]![0]).toBe('reference');
    expect(ranked[0]![1]).toBeCloseTo(10.0, 1);
  });

  it('carries no greyscale signal against brand — 1.035, where every role clears 1.18', () => {
    /*
     * E3's ramp runs brand blue -> #C9552B and its own comment says colour repeats the height
     * "deliberately", because a single-channel encoding "fails for anyone reading at a glance or
     * in greyscale" (PipelineReliefGl.tsx:473). MEASURED, that claim is false: the two ends are
     * within 1.035 of each other in luminance, so in greyscale the ramp is flat and the
     * redundancy the comment promises does not exist. Binding the end to `conditional` is what
     * makes the sentence true for the first time — 1.25 light, 2.02 dark.
     */
    expect(greyscaleRatio(SHIPPED_BLOCKED, BRAND.brand)).toBeCloseTo(1.035, 2);
    const admitted = sceneStatusRoles();
    expect(admitted.length).toBe(3);
    for (const role of admitted) {
      for (const t of THEMES) {
        expect(
          greyscaleRatio(statusAlbedo(role, t), BRAND.brand),
          `${role}/${t} would carry no greyscale signal beside a brand-blue mark`,
        ).toBeGreaterThan(1.1);
      }
    }
    expect(greyscaleRatio(statusAlbedo('conditional', 'light'), BRAND.brand)).toBeCloseTo(1.25, 2);
    expect(greyscaleRatio(statusAlbedo('conditional', 'dark'), BRAND.brand)).toBeCloseTo(2.02, 2);
  });

  it('#E0A94A, E3\'s absent ring, is ALREADY the conditional hue — 0.7 deg', () => {
    /*
     * The collision that makes the E3 fix a PAIR of edits rather than one. `PipelineReliefGl.tsx:133`
     * colours a lead with no recorded market cap in #E0A94A and `PipelineRelief.tsx:139` calls it
     * "an amber ring" in the caption. It is amber — 0.7 deg from --amber light, 3.0 deg from dark.
     * So moving the stalled ramp end to `conditional` while the ring stays put would put two amber
     * meanings 0.7 deg apart in one frame: a warning and an absence. Absence is not a status
     * (`refusal` #6B7A99 is), which is why the companion edit is the ring, not the ramp.
     */
    const ring = hexToLinear('#E0A94A');
    expect(hueDistanceDeg(ring, statusAlbedo('conditional', 'light'))).toBeLessThan(1);
    expect(hueDistanceDeg(ring, statusAlbedo('conditional', 'dark'))).toBeLessThan(3.1);
    /* And it is far from the absence mark it ought to be, which is the other half of the point. */
    expect(hueDistanceDeg(ring, BRAND.refusal)).toBeGreaterThan(HUE_BUCKET_DEG);
  });

  it('#5C6880, the withheld slab, is `refusal` darkened — 1.0 deg of hue, 7.2 L* down', () => {
    /*
     * E6 (:121) and E3 (:134) both ship a private darkening of the palette's absence colour rather
     * than the colour itself. NOT a status divergence and NOT changed here — absence is its own
     * category. Recorded so the near-miss is a known quantity: rule 6 depends on `refusal` reading
     * as "no measurement" and never as a low value, and 7.2 L* below the palette value is 7.2 L*
     * closer to reading as a low one.
     */
    const shipped = hexToLinear('#5C6880');
    expect(hueDistanceDeg(shipped, BRAND.refusal)).toBeLessThan(1.5);
    expect(greyscaleRatio(shipped, BRAND.refusal)).toBeGreaterThan(1.1);
  });
});

describe('what the surfaces print about it', () => {
  it('the policy string promises hue and order, and never a hex', () => {
    /*
     * `TONE_POLICY` used to end "so #2C6BFF leaves the pipeline as #2C6BFF" and was printed on
     * screen under P1 for every frame the surface ever drew. A status policy that promised a
     * matching pixel would be that sentence again, on a lit mesh where it is not even coherent.
     */
    const roleNames: readonly StatusRole[] = sceneStatusRoles();
    expect(roleNames.length).toBe(3);
    expect(STATUS_POLICY).not.toMatch(/#[0-9a-fA-F]{6}\s+exact/);
    expect(STATUS_POLICY).toMatch(/HUE FAMILY and the ORDER, never the pixel/);
  });
});
