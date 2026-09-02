/**
 * GLASS — how much of the stage shows through the chrome and the page plate (THE PRODUCTION, P1).
 *
 * The values here are the ONLY place the alphas live. The components write them as Tailwind arbitrary-alpha classes
 * (`bg-card/[.86]`), which the content scanner needs as literals, so `glass.test.ts` asserts the literals match this
 * table and then proves every certified text role still clears its floor over the worst composite the stage can
 * produce (`STAGE_LUMINANCE_MAX`). Change a number here and the test tells you which role it cost — the dark chrome sat at
 * 0.80 first and `--red`/`--indigo` on `--card` fell to 4.07/4.37:1 over a 0.12 stage; 0.88 over a 0.08 stage clears both.
 * THE PLATE IS THE TRADE: the more it opens, the darker the room behind it must be (dark) or the brighter (light). In
 * dark a 0.56 plate over a room bounded at 0.04 shows MORE than a 0.84 plate over 0.08, because the sRGB curve stretches
 * dark values on screen — the composite reads ~40/255 against the page's 18/255. Those two numbers move together.
 */
export const GLASS = {
  light: { chrome: 0.86, plate: 0.78 },
  dark: { chrome: 0.88, plate: 0.56 },
} as const;

/** The class strings, spelled once. Tailwind's `/[.86]` is rgb(var(--card) / 0.86). */
export const GLASS_CHROME_CLASS = 'bg-card/[.86] dark:bg-card/[.88] backdrop-blur-md';
/**
 * THE CHROME AS A LAYER (THE PRODUCTION, P4). The same alphas, painted on a `::before` under the element's content, so a
 * mask can FADE the glass where the chrome holds no text — the sidebar between its last nav item and its footer, the top
 * bar between the breadcrumb and the controls — and the room shows through. The element itself carries no background:
 * text sits over the layer, and the layer is opaque (these alphas) wherever text can sit. The fade bands are MEASURED by
 * the components (ResizeObserver → `--fade-a/--fade-b` in px) and default to "no fade" until measured; the instrument
 * scans text rects against the bands per route (`chromeFadeTextHits` must be 0).
 */
export const GLASS_CHROME_LAYER_CLASS = 'relative isolate before:pointer-events-none before:absolute before:inset-0 before:-z-10 before:bg-card/[.86] dark:before:bg-card/[.88] before:backdrop-blur-md';
export const GLASS_PLATE_CLASS = 'bg-page/[.78] dark:bg-page/[.56] backdrop-blur-md';
