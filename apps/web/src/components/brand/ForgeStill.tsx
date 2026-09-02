import { useEffect, useState } from 'react';

/**
 * THE OBJECT, STILL — S7 of INSTRUMENT_100X_PLAN.
 *
 * The Forge (E8's machined disc, ring and plinth) rendered headless in Blender 5.2 from the harness's own
 * numbers (`scripts/blender/build_forge.py`), calibrated so the brand blue decodes from the PNG bytes as
 * `#2C6BFF` exactly (`scripts/blender/calibrate.py` + `brand_hex.py`; sidecars in `public/objects/`), and
 * encoded to WebP at 1× and 2× within a stated byte budget. Light and dark are two LIGHTING environments of the
 * same object — a bright studio and a near-black room — not a recolour.
 *
 * ONE FILE DOWNLOADS. The theme is the document's `dark` class (set before hydration by index.html), so this
 * component reads it once on mount and renders one `<img>`; two images with one hidden would fetch both. Width
 * and height are declared, so the page never shifts when the bytes arrive (the ratchet pins this). Nothing here
 * moves: the still is the object; the live GL Forge, where hardware allows, is a separate layer.
 */

export type ForgeVariant = 'hero' | 'poster';

const SRC = {
  light: { x1: '/objects/forge-light.webp', x2: '/objects/forge-light@2x.webp' },
  dark: { x1: '/objects/forge-dark.webp', x2: '/objects/forge-dark@2x.webp' },
} as const;

/** The render's frame: 1200×720 at 1× (2400×1440 at 2×). Declared, never measured at runtime. */
export const FORGE_STILL_WIDTH = 1200;
export const FORGE_STILL_HEIGHT = 720;

function readDark(): boolean {
  return typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
}

export function ForgeStill({ variant, className, priority = variant === 'hero' }: { variant: ForgeVariant; className?: string; priority?: boolean }) {
  const [dark, setDark] = useState<boolean>(readDark);
  useEffect(() => {
    // A theme flip is a state transition (a MutationObserver on the class, as the shell's own subscribers do).
    const el = document.documentElement;
    const obs = new MutationObserver(() => setDark(el.classList.contains('dark')));
    obs.observe(el, { attributes: true, attributeFilter: ['class'] });
    setDark(el.classList.contains('dark'));
    return () => obs.disconnect();
  }, []);
  const s = dark ? SRC.dark : SRC.light;
  return (
    <img
      src={s.x1}
      srcSet={`${s.x1} 1x, ${s.x2} 2x`}
      width={FORGE_STILL_WIDTH}
      height={FORGE_STILL_HEIGHT}
      alt="The Forge: a brushed-metal disc on a plinth inside a polished ring in LCX blue, lit by one key light"
      loading={priority ? 'eager' : 'lazy'}
      decoding="async"
      fetchPriority={priority ? 'high' : 'auto'}
      draggable={false}
      data-object="forge"
      data-object-variant={variant}
      data-object-theme={dark ? 'dark' : 'light'}
      className={className}
    />
  );
}
