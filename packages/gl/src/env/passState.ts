/*
 * THE STATE CONTRACT EVERY PASS KEEPS — and the four defects that made it necessary.
 *
 * A pass sets the GL state it needs and then draws. Every pass in this engine did the first half and
 * only some did the second, and the asymmetry was invisible because the environments happen to call
 * their passes in an order where the leftovers land somewhere harmless. Measured leftovers, before
 * this file existed:
 *
 *   · `particles.step` left the VIEWPORT at the state texture's size — "0,0,640,400 -> 0,0,32,32" for
 *     a 1024-slot field — the depth test OFF, and ACTIVE_TEXTURE on unit 1. A caller that stepped
 *     after binding its scene target rendered the rest of the frame into a 32x32 corner, with no GL
 *     error and no refusal. E3 survives it by calling `step` first and documenting that it must.
 *   · `volume.draw` disabled the depth test and never re-enabled it.
 *   · `ao.compute` left CULL_FACE disabled and the viewport at half resolution.
 *   · `lit.draw` ended with `gl.disable(gl.CULL_FACE)`, which is a restore only if culling happened
 *     to be off when it was called.
 *
 * None of those is a bug in the pass that leaks. Each is a bug in whatever pass runs next, reported
 * against the wrong line — which is the whole reason to fix it structurally instead of one call site
 * at a time.
 *
 * ── WHAT IS RESTORED, AND WHAT IS DELIBERATELY NOT ───────────────────────────────────
 * Restored here: the framebuffer binding, the viewport, and the four pieces of enable-state that
 * decide whether a draw lands at all — DEPTH_TEST, DEPTH_WRITEMASK, CULL_FACE, BLEND.
 *
 * NOT restored, and this is a decision rather than an omission:
 *
 *   · The BLEND FUNCTION and the DEPTH FUNCTION. Neither has a meaningful default to return to, and a
 *     pass that enables blending or depth testing without stating its own function is already broken
 *     in a way restoring cannot fix. They are caller-owned, and every pass here sets both.
 *   · TEXTURE BINDINGS and ACTIVE_TEXTURE. The engine's existing discipline is stronger than a
 *     restore: a pass RELEASES the units it bound, back to null, and leaves ACTIVE_TEXTURE on unit 0.
 *     That is what makes a feedback loop impossible rather than merely unlikely, and it is asserted
 *     in `glState.test.ts` alongside the parameters this file handles.
 */

/**
 * Opaque snapshot. A tuple rather than named fields because it is created on every pass of every
 * frame and never read by anything but `restorePassState`.
 */
export type PassState = readonly [
  WebGLFramebuffer | null,
  Int32Array,
  boolean,
  readonly boolean[],
];

/* One list, walked in both directions, rather than three named branches each way: the enable bits are
   interchangeable to this code and naming each one twice is bytes in a lane with 0.2 KB of margin. */
const caps = (gl: WebGL2RenderingContext): number[] => [gl.DEPTH_TEST, gl.CULL_FACE, gl.BLEND];

export function savePassState(gl: WebGL2RenderingContext): PassState {
  return [
    gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null,
    gl.getParameter(gl.VIEWPORT) as Int32Array,
    gl.getParameter(gl.DEPTH_WRITEMASK) as boolean,
    caps(gl).map((c) => gl.getParameter(c) as boolean),
  ];
}

export function restorePassState(gl: WebGL2RenderingContext, s: PassState): void {
  gl.bindFramebuffer(gl.FRAMEBUFFER, s[0]);
  const v = s[1];
  gl.viewport(v[0] ?? 0, v[1] ?? 0, v[2] ?? 0, v[3] ?? 0);
  gl.depthMask(s[2]);
  caps(gl).forEach((c, i) => { if (s[3][i]) gl.enable(c); else gl.disable(c); });
}

/**
 * Release every texture unit a pass may have bound, and leave ACTIVE_TEXTURE on unit 0.
 *
 * `units` is how many to walk from 0. Passing the count the pass actually used keeps this from
 * touching state it never had anything to do with.
 *
 * The 3-D target is nulled as well as the 2-D one because the volume field binds a `sampler3D` on
 * unit 0, and a 3-D texture left bound is exactly as much of a feedback hazard as a 2-D one — it was
 * simply invisible because only one layer in the engine has ever bound one.
 */
export function releaseTextureUnits(gl: WebGL2RenderingContext, units: number): void {
  for (let i = units - 1; i >= 0; i--) {
    gl.activeTexture(gl.TEXTURE0 + i);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindTexture(gl.TEXTURE_3D, null);
  }
  gl.activeTexture(gl.TEXTURE0);
}

/**
 * Is `texture` an attachment of the framebuffer currently bound for drawing?
 *
 * The one question that turns a silently dropped draw into a named refusal. Every pass that reads a
 * depth or colour attachment asks it before drawing, because the driver's own answer — INVALID_
 * OPERATION and zero pixels — arrives with no indication of which binding was at fault.
 *
 * Only the DEPTH attachment is checked, because that is what the depth-reading passes sample; a
 * colour-attachment loop is caught by the release discipline above instead. Queried in two steps
 * because asking for OBJECT_NAME on an attachment whose type is NONE is itself an error, and asking
 * anything about DEPTH_ATTACHMENT on the DEFAULT framebuffer is too — hence the null guard.
 */
export function depthAttachmentIs(gl: WebGL2RenderingContext, texture: WebGLTexture): boolean {
  if (!gl.getParameter(gl.FRAMEBUFFER_BINDING)) return false;
  const type = gl.getFramebufferAttachmentParameter(
    gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.FRAMEBUFFER_ATTACHMENT_OBJECT_TYPE,
  );
  if (type !== gl.TEXTURE) return false;
  return gl.getFramebufferAttachmentParameter(
    gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.FRAMEBUFFER_ATTACHMENT_OBJECT_NAME,
  ) === texture;
}
