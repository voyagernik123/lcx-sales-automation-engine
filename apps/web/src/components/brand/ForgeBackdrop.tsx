import { useEffect, useRef, useState } from 'react';

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
 * ── ITS OWN CONTEXT, DELIBERATELY ───────────────────────────────────────────────────
 * The chart kit shares one context across thirteen primitives because a dashboard can hold sixty
 * canvases and an 8 GB M1 will exhaust contexts. This screen has exactly one, and it needs a DEPTH
 * buffer and five render targets the shared 2-D stage does not carry. One dedicated context here
 * is correct; the moment a second environment appears on the same route, they must share.
 */

type GlMod = typeof import('@lcx/gl');

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

      const dpr = Math.min(2, Math.max(1, globalThis.devicePixelRatio || 1));
      const cssW = Math.max(1, host.clientWidth);
      const cssH = Math.max(1, host.clientHeight);
      const W = Math.round(cssW * dpr);
      const H = Math.round(cssH * dpr);
      canvas.width = W;
      canvas.height = H;

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
      const shadow = gl3.createShadowMap(stage, 1024);
      const sky = gl3.createSkyBackdrop(stage);
      const ao = gl3.createAmbientOcclusion(stage, W, H);
      const dof = gl3.createDepthOfField(stage, W, H);

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
      if ('kind' in ao) return bail(ao.reason);
      if ('kind' in dof) return bail(dof.reason);
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
      const draws = [
        { mesh: floorM!, model: at(0, 0, 0), normalMat: NM,
          material: { baseColour: gl3.hexToLinear('#080C15'), roughness: 0.88, metalness: 0 } },
        { mesh: plinthM!, model: at(0, 0.045, 0), normalMat: NM,
          material: { baseColour: gl3.hexToLinear('#161D2E'), roughness: 0.52, metalness: 0.35 } },
        { mesh: discM!, model: at(0, DISC_Y, 0), normalMat: NM,
          material: { baseColour: gl3.hexToLinear('#8FA3C4'), roughness: 0.30, metalness: 0.95, anisotropy: 0.86 } },
        { mesh: ringM!, model: at(0, DISC_Y, 0), normalMat: NM,
          material: { baseColour: gl3.hexToLinear('#2C6BFF'), roughness: 0.13, metalness: 0.92, anisotropy: 0.72 } },
      ];

      /* OFF-CENTRE AND LOW. The sign-in card owns the middle of the screen, so the object sits
         below and to the left of it — the frame is a backdrop, not a competitor. */
      const view = {
        target: [0, 0.34, 0] as const, distance: 5.6,
        azimuthDeg: 22, elevationDeg: 20, fovDeg: 32,
      };
      const centre = gl3.boundsCentre([-2, 0, -2], [2, 0.55, 2]);
      const radius = gl3.boundsRadius([-2, 0, -2], [2, 0.55, 2]);
      const near = Math.max(0.01, view.distance / 100);
      const far = Math.max(near + 1, view.distance * 8);

      const render = (t: number) => {
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
        K.draw({ eye, target: view.target, fovDeg: view.fovDeg, aspect: W / H });
        R.depthPrepass(vp, draws);
        A.compute({ depthTexture: T.depthTexture, near, far, fovDeg: view.fovDeg, aspect: W / H, radius: 0.42, strength: 1.3 });
        T.bind();
        R.draw({
          viewProj: vp, eye, lightDir, lightColour: [5.2 * intensity, 5.0 * intensity, 4.6 * intensity],
          ambientGain: 1.15, lightVP, shadow: S, shadowStrength: 0.9, draws,
          ao: A.texture, screenSize: [W, H],
        });
        const focus = Math.hypot(eye[0], eye[1] - DISC_Y, eye[2]);
        D.apply({
          scene: T.texture, depthTexture: T.depthTexture, near, far,
          fovDeg: view.fovDeg, aspect: W / H, focusDistance: focus, aperture: 7, maxCoc: 0.009,
        });

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, W, H);
        gl.disable(gl.DEPTH_TEST);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, D.texture);
        stage.blit(P, (p) => gl.uniform1i(gl.getUniformLocation(p, 'uScene'), 0));
      };

      const reduced = typeof globalThis.matchMedia === 'function'
        ? globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches
        // Cannot read the preference ⇒ assume reduced. Defaulting the other way would invent
        // consent from a reader who never gave it.
        : true;

      disposeRef.current = () => {
        if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
        D.dispose(); A.dispose(); K.dispose(); S.dispose(); T.dispose(); R.dispose();
        stage.dispose();
      };

      if (reduced) {
        render(1);
        setReady(true);
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
