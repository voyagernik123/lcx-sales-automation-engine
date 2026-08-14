import { useEffect, useRef, useState } from 'react';
/* The tier only; no `@lcx/gl` runtime import comes with it — see that module's header on why it takes
   `pickQualityTier` as an argument rather than importing it. Static-importing the package here once pushed the
   shell chunk to 441 KB against a 440 KB ceiling. */
import { resolveQualityTier } from '../shared/useQualityTier';

/**
 * E8 · THE FORGE, on the sign-in screen.
 *
 * `3D_VFX_1000X.md` §2 E8: the LCX mark as a machined metal object, a single moving key light,
 * five seconds, once. Sign-in is the one screen every operator and every stranger passes through,
 * which is why §5 ships it first.
 *
 * ── FIVE SECONDS, ONCE — NOT AN IDLE ANIMATION ──────────────────────────────────────
 * §6 rule 2 forbids animation that carries no information, and a key light orbiting forever is
 * exactly that. So the sweep runs ONE arc and stops, holding the frame where the highlight sits
 * best. `prefers-reduced-motion` skips straight to that final frame — the reader sees the same
 * object, without the movement, which is what the media query asks for and not "the same
 * animation, faster".
 *
 * ── THE CSS PLATE IS ALWAYS UNDERNEATH, AND IT LIVES IN `ForgePlate` ────────────────
 * §6 rule 1. Server render, print, no WebGL2, a GPU that refuses a float target, and the first
 * paint before this chunk is fetched all resolve to that gradient. Nothing on this screen is
 * unreadable without the GL layer — the sign-in form sits above it and never depends on it. That
 * property is what makes shipping a renderer to the FRONT DOOR defensible at all.
 *
 * This component is LAZY for a measured reason: imported statically into the eagerly-loaded
 * sign-in route it pushed the shell chunk to 441 KB against a 440 KB ceiling.
 *
 * ── TWO LIGHTING ENVIRONMENTS, NOT ONE ─────────────────────────────────────────────
 * The sign-in screen is a designed light/dark pair, and the first version of this rendered one
 * near-black room regardless — which would have blacked out the light theme. Machined metal reads
 * beautifully on a bright ground, so light mode gets a studio sky and a brighter key, dark mode
 * keeps the room. The object is identical; only the light around it changes, which is exactly what
 * a real product shot does.
 *
 * ── ITS OWN CONTEXT, DELIBERATELY ───────────────────────────────────────────────────
 * The chart kit shares one context across thirteen primitives because a dashboard can hold sixty
 * canvases and an 8 GB M1 will exhaust contexts. This screen has exactly one, and it needs a DEPTH
 * buffer and five render targets the shared 2-D stage does not carry. One dedicated context here
 * is correct; the moment a second environment appears on the same route, they must share.
 */

type GlMod = typeof import('@lcx/gl');

/**
 * THE MARK'S OWN SHADOW BASELINE, which the tier SCALES rather than replaces.
 *
 * 1024 because the subject is one disc on one plinth. `env/quality.ts:91` records the alternative and what it
 * cost: handing over the tier's absolute `shadowMapSize` gave E0, E2 and E8 a 1536 map where each had chosen
 * 1024 — a 2.25x bigger map and three captures that changed without anyone saying so.
 */
const SHADOW_BASELINE = 1024;

/** How long the key light takes to travel its arc. Then it stops. */
const SWEEP_MS = 5000;

export interface ForgeBackdropProps {
  /** Set on the sign-in screen. Kept as a prop so a marketing page can dial it back. */
  readonly intensity?: number;
}

export function ForgeBackdrop({ intensity = 1 }: ForgeBackdropProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [ready, setReady] = useState(false);
  /* The refusal REASON is kept even though nothing renders it: a surface that wants to name why it
     degraded can read it, and discarding it would make the three states indistinguishable. */
  const [, setReason] = useState<string | null>(null);
  const rafRef = useRef<number | null>(null);
  const disposeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let alive = true;

    // Dynamic import so @lcx/gl never enters the shell chunk. The sign-in screen is the first
    // thing loaded, so putting a renderer in its critical path would be the worst possible place.
    void import('@lcx/gl').then((m) => {
      if (alive) start(m);
    }).catch(() => {
      if (alive) setReason('The renderer could not be loaded.');
    });

    function start(gl3: GlMod) {
      const canvas = canvasRef.current;
      const host = hostRef.current;
      if (!canvas || !host) return;

      /*
       * THE QUALITY TIER, READ ONCE AND NOT SUBSCRIBED TO — and this is the one surface where that is the whole
       * point.
       *
       * `3D_VFX_1000X.md:316` records the ladder as the decided answer to §3.2 and says it is "wired into all
       * nine" harnesses. It was wired into none of the eight shipping components: this file hard-coded a 1024
       * shadow map, ran AO and DOF unconditionally and never passed `shadowTaps`, so a weak machine got the full
       * frame with nothing to drop — through a FIVE-SECOND ANIMATION, on the one screen every visitor passes.
       *
       * It reads `resolveQualityTier()` instead of `useResolvedQualityTier()` because a resolution arriving
       * mid-sweep must NOT restart the arc. `env/quality.ts` bans a tier that changes while the reader looks at
       * it — "ambient occlusion appearing three seconds in is not a graceful degradation, it is the frame
       * contradicting itself" — and an arc that jumps back to its start so the lens can switch off is exactly
       * that. So this mount lives with the tier it began at, and picks up a resolved one the next time it mounts.
       *
       * IT ALSO TAKES NO PROBE. `render` blits straight to the default framebuffer, so the discarded warm-up
       * frame a measurement needs would be a PRESENTED frame; and on the reduced-motion path there is only one
       * frame, which is also its warm-up. The five reliefs that render into an offscreen target take the probe.
       */
      const tier = resolveQualityTier();
      const Q = gl3.qualitySettings(tier);
      /* CAPPED BY THE TIER, where it was a literal 2. Every pass here is fill-bound. */
      const dpr = Math.min(Q.dprScale, Math.max(1, globalThis.devicePixelRatio || 1));
      const cssW = Math.max(1, host.clientWidth);
      const cssH = Math.max(1, host.clientHeight);
      const W = Math.round(cssW * dpr);
      const H = Math.round(cssH * dpr);
      canvas.width = W;
      canvas.height = H;

      /*
       * THE THEME IS READ PER FRAME, NOT ONCE AT MOUNT — and the e2e pixel ratchet is what caught
       * that. The first version captured it in a `const` during setup, so toggling to dark left the
       * canvas holding a stale WHITE STUDIO underneath dark-theme form controls: the heading came
       * out white-on-white and unreadable. A one-line snapshot of mutable global state.
       *
       * Read from the DOM class rather than a media query, because the app has an explicit toggle
       * and the media query would disagree with what is actually on screen.
       */
      const isDark = () => document.documentElement.classList.contains('dark');
      // `skyStops`, not `sky` — `sky` is the backdrop RESOURCE below, and shadowing it compiles
      // into a scene lit by a framebuffer object.
      const skyStopsFor = (dark: boolean) => (dark
        ? undefined                                    // the authored default room
        : { zenith: [0.72, 0.78, 0.90] as const, horizon: [0.95, 0.96, 0.99] as const, ground: [0.42, 0.46, 0.55] as const });

      const outcome = gl3.createStage(canvas, { alpha: false });
      if (!gl3.isStage(outcome)) { setReason(outcome.reason); return; }
      const stage = outcome;
      const gl = stage.gl;

      const PRESENT_VERT = `#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;
      const PRESENT_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene;
out vec4 frag;
${gl3.TONE_MAP_GLSL}
${gl3.SRGB_ENCODE_GLSL}
void main(){ frag = vec4(lcxEncode(lcxToneMap(texture(uScene, vUv).rgb)), 1.0); }`;

      const present = stage.compile(PRESENT_VERT, PRESENT_FRAG);
      const lit = gl3.createLitRenderer(stage);
      const target = gl3.createTarget3D(stage, W, H);
      /* `shadowMapSizeFor`, NOT the tier's absolute `shadowMapSize`. `env/quality.ts:91` records what the
         absolute value did: E8 — this same mark, in its harness — had chosen 1024 and was handed 1536 at the
         default tier, so its capture changed without anyone saying so. 1024 is the mark's own choice because its
         subject is one disc; the tier scales it. */
      const shadow = gl3.createShadowMap(stage, gl3.shadowMapSizeFor(tier, SHADOW_BASELINE));
      const sky = gl3.createSkyBackdrop(stage);
      /* NOT ALLOCATED AT ALL when the tier declines them. DOF is the ladder's first drop and AO its second, in
         E0's measured cost order: the lens is ~6.4 ms of an 11.328 ms frame. */
      const ao = Q.ao ? gl3.createAmbientOcclusion(stage, W, H) : null;
      const dof = Q.dof ? gl3.createDepthOfField(stage, W, H) : null;

      /*
       * EVERY RESOURCE IS NARROWED INDIVIDUALLY, not checked in a loop.
       *
       * The loop version needed a double cast to compile, and a cast is precisely the mechanism by
       * which a refused resource gets used anyway — which renders a black frame with NO error, the
       * most expensive failure mode this renderer has produced. Seven explicit guards cost seven
       * lines and make that unrepresentable.
       */
      const bail = (reason: string) => { setReason(reason); stage.dispose(); };
      if ('kind' in present) return bail(present.reason);
      if ('kind' in lit) return bail(lit.reason);
      if ('kind' in target) return bail(target.reason);
      if ('kind' in shadow) return bail(shadow.reason);
      if ('kind' in sky) return bail(sky.reason);
      if (ao && 'kind' in ao) return bail(ao.reason);
      if (dof && 'kind' in dof) return bail(dof.reason);
      const P = present, R = lit, T = target, S = shadow, K = sky, A = ao, D = dof;

      const discGeo = gl3.cylinder(0.92, 0.16, 96);
      const ringGeo = gl3.torus(1.06, 0.055, 128, 32);
      const plinthGeo = gl3.cylinder(1.9, 0.09, 96);
      const floorGeo = gl3.plane(16, 24);
      const uploaded = [discGeo, ringGeo, plinthGeo, floorGeo].map((g) => gl3.uploadMesh(stage, g));
      if (uploaded.some((m) => 'kind' in m)) {
        setReason('The GPU refused a vertex buffer.');
        stage.dispose();
        return;
      }
      const [discM, ringM, plinthM, floorM] = uploaded as Array<
        Exclude<ReturnType<GlMod['uploadMesh']>, { kind: 'refused' }>
      >;

      const at = (x: number, y: number, z: number) => {
        const m = gl3.IDENTITY(); m[12] = x; m[13] = y; m[14] = z; return m;
      };
      const NM = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
      const DISC_Y = 0.30;
      /* Rebuilt per frame from the live theme. Four small objects; the GEOMETRY is uploaded once
         and shared, so this costs nothing measurable and cannot go stale. */
      const buildDraws = (dark: boolean) => [
        { mesh: floorM!, model: at(0, 0, 0), normalMat: NM,
          material: { baseColour: gl3.hexToLinear(dark ? '#080C15' : '#D7DEEA'), roughness: 0.88, metalness: 0 } },
        { mesh: plinthM!, model: at(0, 0.045, 0), normalMat: NM,
          material: { baseColour: gl3.hexToLinear(dark ? '#161D2E' : '#AEBACD'), roughness: 0.52, metalness: 0.35 } },
        { mesh: discM!, model: at(0, DISC_Y, 0), normalMat: NM,
          /* GUNMETAL in light mode: #8FA3C4 against a white studio is white-on-white and the
             object dissolves. Dark mode keeps the brighter alloy because it needs to lift off a
             near-black room. Same object, different ground, different value. */
          /*
           * ── WHY THE ANISOTROPIC ROUGHNESS VALUES LOOK ODD: THEY ARE sqrt() OF WHAT THEY WERE ────────────────
           * Re-authored 2026-08-13. The RENDERED RESULT IS INTENDED TO BE UNCHANGED; only the units moved.
           *
           * `distributionGGXAniso` used to receive at/ab derived from PERCEPTUAL roughness, so its effective alpha
           * was ~rough, while the isotropic branch has always used alpha = rough^2. Commit 38c01b1 made the two
           * branches agree — correct, and verified symbolically. But every anisotropic material in this repo had been
           * AUTHORED against the old convention, so correcting it made all eleven of them sharper: the E8 disc's lobe
           * half-width by 3.33x, the ring's by 7.9x along the highlight and 7.7x across.
           *
           * That is a redesign, not a fix. `docs/3d/e8/README.md` states the intent in as many words — the highlight
           * "has to TRAVEL", the disc is "brushed, not mirror — a broad travelling highlight instead of a hotspot",
           * and it "shows a BAR of light rather than a dot". A lobe 3.3x narrower works against that.
           *
           * So each value is now sqrt() of the authored one, which restores the effective alpha exactly
           * (sqrt(r)^2 == r) while the number finally means what the type says it means. Isotropic materials are
           * untouched: they always used rough^2, so they were never affected.
           * Pinned by `packages/gl/src/env/anisoPreserved.test.ts`.
           */
          material: { baseColour: gl3.hexToLinear(dark ? '#8FA3C4' : '#5E6C85'), roughness: 0.5477, metalness: 0.95, anisotropy: 0.86 } },
        { mesh: ringM!, model: at(0, DISC_Y, 0), normalMat: NM,
          material: { baseColour: gl3.hexToLinear('#2C6BFF'), roughness: 0.3606, metalness: 0.92, anisotropy: 0.72 } },
      ];

      /*
       * THE OBJECT SINKS BELOW THE FORM, and the first attempt got this wrong in a way only a
       * screenshot could show: centred behind the card, the ring cut straight through the email
       * field and the body copy sat on top of a specular highlight. A hero object directly behind
       * a centred form is a conflict, not a backdrop.
       *
       * Raising the camera's look-at target pushes the object DOWN in frame, so it reads as a
       * machined plinth the form floats above and is cropped by the bottom edge. Nothing the
       * operator has to read sits over anything bright.
       */
      const view = {
        /* y 2.35 rather than 1.55: at 1.55 the disc's specular highlight sat directly under the
           status footer and made "LOCAL / API DOWN / UTC" hard to read. Nothing an operator has to
           read may sit over anything bright — the object is cropped by the bottom edge instead. */
        target: [0, 2.35, 0] as const, distance: 6.2,
        azimuthDeg: 22, elevationDeg: 14, fovDeg: 34,
      };
      const centre = gl3.boundsCentre([-2, 0, -2], [2, 0.55, 2]);
      const radius = gl3.boundsRadius([-2, 0, -2], [2, 0.55, 2]);
      const near = Math.max(0.01, view.distance / 100);
      const far = Math.max(near + 1, view.distance * 8);

      const render = (t: number) => {
        const dark = isDark();
        const skyStops = skyStopsFor(dark);
        const draws = buildDraws(dark);
        // t 0..1 across the sweep. One arc, easing to a stop rather than halting mid-travel.
        const eased = t < 1 ? 1 - (1 - t) * (1 - t) : 1;
        const a = -1.35 + eased * 1.5;
        const lightDir: [number, number, number] = [Math.sin(a) * 0.85, -0.95, Math.cos(a) * 0.55];
        const lightVP = gl3.lightViewProjection(
          { direction: lightDir, colour: [1, 1, 1], extent: radius * 0.9 }, centre, radius,
        );
        const vp = gl3.viewProjection(view, W / H);
        const eye = gl3.eyeOf(view);

        R.shadowPass(lightVP, draws, S);
        T.bind();
        gl.clear(gl.DEPTH_BUFFER_BIT);
        K.draw({ eye, target: view.target, fovDeg: view.fovDeg, aspect: W / H, sky: skyStops });
        R.depthPrepass(vp, draws);
        if (A) {
          A.compute({ depthTexture: T.depthTexture, near, far, fovDeg: view.fovDeg, aspect: W / H, radius: 0.42, strength: 1.3 });
          /* AO binds its OWN half-res framebuffer, so the rebind stays INSIDE the gate. Outside it, a tier with
             AO off would render the rest of the frame at half resolution. */
          T.bind();
        }
        /* A studio needs a stronger key and much more ambient, or the metal goes muddy against a
           bright ground; a dark room needs the reverse or the highlight blows out. */
        const keyGain = (dark ? 5.2 : 7.4) * intensity;
        R.draw({
          viewProj: vp, eye, lightDir, lightColour: [keyGain, keyGain * 0.96, keyGain * 0.885],
          ambientGain: dark ? 1.15 : 0.62, sky: skyStops, lightVP, shadow: S, shadowStrength: dark ? 0.9 : 0.62, draws,
          ao: A ? A.texture : null, screenSize: [W, H], shadowTaps: Q.shadowTaps, shadowBaseline: SHADOW_BASELINE,
        });
        /* WHAT THE PRESENT READS FROM depends on whether the lens ran. Reading `D.texture` with the DOF pass
           skipped would present whatever that buffer last held, which on the first frame is uninitialised —
           a black or garbage screen behind the sign-in form. */
        let resolved = T.texture;
        if (D) {
          const focus = Math.hypot(eye[0], eye[1] - DISC_Y, eye[2]);
          D.apply({
            scene: T.texture, depthTexture: T.depthTexture, near, far,
            fovDeg: view.fovDeg, aspect: W / H, focusDistance: focus, aperture: 7, maxCoc: 0.009,
          });
          resolved = D.texture;
        }

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, W, H);
        gl.disable(gl.DEPTH_TEST);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, resolved);
        stage.blit(P, (p) => gl.uniform1i(gl.getUniformLocation(p, 'uScene'), 0));
        /* STAMPED, because `env/quality.ts` is explicit that a tier which cannot be reported cannot be trusted.
           This file was one of the two that never did it, so the app sweep could reach `/select`, watch this
           surface draw, and still report "0 of 1 canvases" for the tier it drew at.
           It is a DOM write and not a GL call, so it does not disturb the reason above at :104 that this
           surface takes NO frame probe — nothing here is presented that was not going to be presented. The
           write repeats on each of the arc's frames and is idempotent: `tier` is read once at :108 and, by
           that same paragraph, deliberately does not change while this mount lives. */
        canvas.dataset.qualityTier = tier;
      };

      const reduced = typeof globalThis.matchMedia === 'function'
        ? globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches
        // Cannot read the preference ⇒ assume reduced. Defaulting the other way would invent
        // consent from a reader who never gave it.
        : true;

      const teardown = () => {
        if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
        D?.dispose(); A?.dispose(); K.dispose(); S.dispose(); T.dispose(); R.dispose();
        stage.dispose();
      };
      disposeRef.current = teardown;

      /*
       * A THEME CHANGE AFTER THE SWEEP HAS FINISHED HAS NO FRAME LOOP TO PICK IT UP. The arc stops
       * by design (§6 rule 2), so without this the canvas holds whichever theme was live when it
       * stopped. One re-render of the final frame, not a replayed sweep — a theme toggle is not an
       * event that warrants an animation.
       */
      const themeWatch = new MutationObserver(() => { if (rafRef.current == null) render(1); });
      themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
      const stopWatch = () => themeWatch.disconnect();

      if (reduced) {
        render(1);
        setReady(true);
        disposeRef.current = () => { stopWatch(); teardown(); };
        return;
      }

      const t0 = performance.now();
      const step = () => {
        const t = Math.min(1, (performance.now() - t0) / SWEEP_MS);
        render(t);
        setReady(true);
        // STOPS. No trailing rAF once the arc completes — see the header on rule 2.
        if (t < 1) rafRef.current = requestAnimationFrame(step);
        else rafRef.current = null;
      };
      rafRef.current = requestAnimationFrame(step);
      disposeRef.current = () => { stopWatch(); teardown(); };
    }

    return () => {
      alive = false;
      disposeRef.current?.();
      disposeRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intensity]);

  return (
    <div ref={hostRef} aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      {/* NO PLATE HERE. `ForgePlate` owns it and paints on the first frame, before this chunk has
          even been fetched — duplicating the gradient in two files is how they drift apart. */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        style={{ display: ready ? 'block' : 'none' }}
      />
    </div>
  );
}
