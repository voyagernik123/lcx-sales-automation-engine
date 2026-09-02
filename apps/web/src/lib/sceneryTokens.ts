/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  ONE MATERIAL — S2 of INSTRUMENT_100X_PLAN.md: the DOM's scenery, derived from the GL rig
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Until this module the platform had two authored palettes for the SAME roles: `styles/tokens.css`
 * chose the page, the card and the hairline for the DOM, and `packages/gl/src/look/theme.ts` chose
 * the ground, the plate and the rule for every GL environment. Two authors, one eye. S0 measured
 * the seam: light page-to-ground 2.78 ΔE2000, dark 3.09, dark hairline-to-rule 3.13 — a lit canvas
 * visibly pasted under cards that were never lit by the same rig.
 *
 * Now `theme.ts` is the ONE source for scenery and this module renders it as CSS. Every DOM
 * scenery token is a GL field by construction:
 *
 *     --page-bg     ← ground        the floor or backdrop a scene sits on
 *     --card        ← plate         panel and card fills behind text
 *     --card-fill   ← plate         the chart block's hex twin of --card
 *     --line        ← rule          axes, ticks, hairlines
 *     --structure   ← structure     plinths, walls, rails (new; S5/S6 consumers)
 *     --sky-horizon ← skyHorizon    the analytic sky's lower stop (new)
 *     --sky-zenith  ← skyZenith     the analytic sky's upper stop (new)
 *
 * DATA TOKENS ARE NOT HERE and never will be: `--navy`, the brand hexes, the status hues are the
 * data half of the platform and data never moves with the theme (`theme.ts` header). What is
 * derived is exactly the set of roles `SceneTheme` calls scenery.
 *
 * NOT DERIVED, ON PURPOSE: the elevation shadows. A shadow's visibility depends on the luminance
 * of the ground it falls on, so the rig's single `shadowStrength` (dark 0.9, light 0.62) cannot
 * reproduce both themes' authored alphas with one constant — light would need k = 0.065 and dark
 * k = 0.39 to land where they are today. Deriving them would mean inventing that dependency. They
 * stay authored until a measured model exists.
 *
 * THIS FILE IS PURE and imported by BOTH the generator (`apps/web/scripts/gen-scenery-tokens.ts`)
 * and the ratchet (`lib/__tests__/oneMaterial.test.ts`), so the test compares the committed CSS
 * against the same rendering the generator would write — drift between them is a red build, not a
 * discovery.
 */

/* THE SUB-PATH, NOT THE BARREL — `docs/3d/w2/SUBPATH_COST.md`'s measured rule, the same specifier every
   GL surface uses. This module is imported only by the generator and the ratchet, never by app code, so
   it costs the bundle nothing either way; the specifier is chosen for consistency with the rule. */
import { AUTHORED_HEX, type ThemeName } from '@lcx/gl/look/theme.js';
import { STAGE_LIGHT } from '@lcx/gl/env/stageScene.js';

export const SCENERY_BEGIN = '/* @generated scenery — derived from packages/gl/src/look/theme.ts by scripts/gen-scenery-tokens.ts (S2 ONE MATERIAL). Do not edit; run `npm run gen:tokens -w apps/web`. */';
export const SCENERY_END = '/* @end generated scenery */';
export const CHART_BEGIN = '/* @generated scenery (chart twin) — see above. */';
export const CHART_END = '/* @end generated scenery (chart twin) */';
export const EDGE_BEGIN = '/* @generated edge — the rig\'s key lights every panel\'s edge; derived by scripts/gen-scenery-tokens.ts (THE PRODUCTION, P3). Do not edit. */';
export const EDGE_END = '/* @end generated edge */';

/**
 * THE EDGE MODEL. The key comes from the upper left (`STAGE_KEY_DIR`, x +, y −, z +), so a panel standing on the stage
 * catches light on its top and left edges and shadows its bottom and right. The hairline alphas scale with the rig's
 * `keyGain` and `shadowStrength` per theme — the same numbers that light the GL scene — so the DOM's panels and the
 * stage's slab are lit by one rig, which is the whole of S2 ONE MATERIAL. Both hairlines are decorative (`contrast.test.ts`
 * classifies the hairline token so) and 1 px, so they never carry information or a floor.
 */
export function renderEdgeBlock(theme: ThemeName): string {
  // THE STAGE'S rig (stageScene.STAGE_LIGHT), not the reliefs' (theme.ts): the panels stand in the room the stage lights.
  const t = STAGE_LIGHT[theme];
  const hiA = Math.min(0.2, 0.04 + t.keyGain * 0.03).toFixed(2);
  const loA = Math.min(0.3, 0.06 + t.shadowStrength * 0.2).toFixed(2);
  const hi = '255 255 255';
  const lo = theme === 'dark' ? '0 0 0' : '9 14 27';
  return [`  ${EDGE_BEGIN}`,
    `  --edge-hi: ${hi};`.padEnd(30) + ` /* the key's highlight, top-left hairline */`,
    `  --edge-hi-a: ${hiA};`.padEnd(30) + ` /* = 0.04 + keyGain ${t.keyGain} × 0.03 */`,
    `  --edge-lo: ${lo};`.padEnd(30) + ` /* the key's shadow, bottom-right hairline */`,
    `  --edge-lo-a: ${loA};`.padEnd(30) + ` /* = 0.06 + shadowStrength ${t.shadowStrength} × 0.2 */`,
    `  ${EDGE_END}`].join('\n');
}

/** `#RRGGBB` → `"r g b"`, the triple shape every reader of tokens.css parses. */
export function hexToTriple(hex: string): string {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).join(' ');
}

/**
 * The DOM token → GL field derivation, as data. Order is the order the CSS is written in.
 *
 * `--page-bg` ← `page`, NOT `ground`. The first cut of S2 derived the page from the ground and the
 * measurement refused it: the light ground is the page tint deepened (its own comment says so), so
 * the derivation ran backwards and cost status-green text on the light canvas ten levels of WCAG
 * headroom (4.93 → 4.54:1). The rig now carries the page as its own radiance role, decided in
 * `theme.ts` with the reasons beside it; the ground is exposed as `--ground` for the surround of a
 * GL canvas (S5), where a floor deeper than the page is exactly what the eye expects.
 */
export const SCENERY_TOKENS: ReadonlyArray<{ token: string; field: keyof typeof AUTHORED_HEX.light; role: string }> = [
  { token: 'page-bg', field: 'page', role: 'the DOM canvas — the sky a scene sits in front of' },
  { token: 'card', field: 'plate', role: 'panel and card fills behind text' },
  { token: 'line', field: 'rule', role: 'axes, ticks, hairlines' },
  { token: 'ground', field: 'ground', role: 'the floor a GL scene stands on (deeper than the page by design)' },
  { token: 'structure', field: 'structure', role: 'plinths, walls, rails' },
  { token: 'sky-horizon', field: 'skyHorizon', role: 'the analytic sky, lower stop' },
  { token: 'sky-zenith', field: 'skyZenith', role: 'the analytic sky, upper stop' },
];

/** The triple-form scenery block for one theme, exactly as it must appear inside tokens.css. */
export function renderSceneryBlock(theme: ThemeName): string {
  const hex = AUTHORED_HEX[theme];
  const lines = SCENERY_TOKENS.map(({ token, field, role }) =>
    `  --${token}: ${hexToTriple(hex[field])};`.padEnd(30) + ` /* = ${field} ${hex[field].toUpperCase()} — ${role} */`);
  return [`  ${SCENERY_BEGIN}`, ...lines, `  ${SCENERY_END}`].join('\n');
}

/** The hex-form chart twin (`--card-fill`) for one theme. */
export function renderChartTwinBlock(theme: ThemeName): string {
  const plate = AUTHORED_HEX[theme].plate.toLowerCase();
  return [`  ${CHART_BEGIN}`, `  --card-fill: ${plate};`.padEnd(30) + ` /* = plate — the chart block's hex twin of --card */`, `  ${CHART_END}`].join('\n');
}

/** The pre-hydration page colour `index.html` paints before any stylesheet arrives. */
export function pageColourHex(theme: ThemeName): string {
  return AUTHORED_HEX[theme].page.toUpperCase();
}
