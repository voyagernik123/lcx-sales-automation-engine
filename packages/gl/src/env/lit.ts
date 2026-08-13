import type { Mat4 } from '../math.js';
import type { Stage, StageRefusal } from '../stage.js';
import { savePassState, restorePassState, releaseTextureUnits } from './passState.js';
import type { Geometry } from './mesh.js';
import type { ShadowMap } from './target3d.js';
import { SKY_GLSL, bindSky, type SkyOptions } from './sky.js';

/**
 * L2.5 · MATERIAL and L2.6 · SHADOW — the first surface in this codebase that is actually lit.
 *
 * ── WHY GGX AND NOT PHONG ───────────────────────────────────────────────────────────
 * Phong's specular is a power function with no physical basis, so its highlight has the wrong
 * shape and its energy changes with roughness — a surface gets brighter as you make it rougher,
 * which reads as "the material is wrong" without anyone being able to say why. GGX has the long
 * tail real microfacet distributions have, and paired with Smith geometry and Schlick Fresnel it
 * conserves energy. That matters more here than in a game, because this pipeline accumulates in
 * HDR and tone maps ONCE at the end: an over-bright specular does not clip locally, it lifts the
 * whole composite and desaturates the brand colour.
 *
 * ── WHY THE SHADOW BIAS IS SLOPE-SCALED ─────────────────────────────────────────────
 * A constant bias is the standard first attempt and it cannot work: the depth error at a texel
 * scales with the surface's slope relative to the light, so a bias large enough to stop acne on
 * a grazing floor is large enough to detach the shadow from a vertical wall (peter-panning).
 * Scaling by `1 - dot(N, L)` costs one instruction and removes both.
 *
 * ── CONTACT HARDENING IS REFUSED, AND THIS IS THE ARGUMENT ──────────────────────────────────────
 * A penumbra that is sharp where an object meets the floor and softens with distance (PCSS) was
 * proposed alongside the split-sum and multiscatter fixes below. Those two are corrections — the
 * shader was returning energy it did not receive. This one is a look, and it fails on four counts:
 *
 * 1 · IT INVERTS THE FIX DIRECTLY ABOVE IT. Contact hardening needs a BLOCKER SEARCH before the
 *     filter — a first loop that finds the average occluder depth, then a second, variably-sized
 *     PCF. The cheap form is 16 + 16 taps. `shadowTaps` was just wired so the minimum tier pays 1
 *     tap instead of 9, on the machines that cannot afford 9; contact hardening would make the
 *     floor 17. The tier would have to refuse the feature, and then it is a look that only exists
 *     on hardware that never needed the help.
 * 2 · THE PENUMBRA WIDTH IS A TUNED CONSTANT PER ENVIRONMENT, NOT A SHADER PARAMETER. The light is
 *     ORTHOGRAPHIC (`camera.ts:126`), so there is no real light size to derive a penumbra from —
 *     the width would be an authored number, and with eight environments at eight different world
 *     scales that is eight look decisions wearing one function's name.
 * 3 · IT CARRIES NO INFORMATION ABOUT ANY DATASET. This is the same test god rays failed
 *     (`3D_VFX_1000X.md:330`). A softening penumbra encodes height-above-floor, which every one of
 *     these surfaces already encodes in the thing casting it — the bar's own length, the marker's
 *     own lift. The reading it would add is one the geometry already states literally.
 * 4 · IT ARGUABLY MAKES §7(b) WORSE, NOT NEUTRAL. The gate is "an operator still gets their answer
 *     at least as fast as the flat version". A shadow edge is how you read WHICH cell a floating
 *     marker sits over; deliberately blurring that edge everywhere except the contact point removes
 *     the cue at exactly the distances where the marker is lifted furthest and hardest to place.
 *     A sharp uniform edge is not a cheaper approximation of the soft one here — it is the more
 *     legible choice, and the current 3x3 PCF is already softer than that.
 *
 * If it is ever revisited it needs a sentence about the data first, the way E7's shaft has one.
 * Refused on 2026-08-13 against `3D_VFX_FINAL_PLAN.md` §1.3, not deferred.
 *
 * ── LINEAR IN, LINEAR OUT ───────────────────────────────────────────────────────────
 * Every colour here is LINEAR radiance and nothing is tone mapped. The composite owns the tone
 * curve — `look/tonemap.ts` states it is the only tone map in the pipeline — so a material that
 * applied one would double-apply it and break `assertBrandFidelity`.
 */

/* THE SHADOW PASS. Position only: no normals, no colour, no varyings beyond depth. Anything
   else would be bandwidth spent on a value the depth-only framebuffer cannot store. */
const SHADOW_VERT = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uLightVP;
uniform mat4 uModel;
void main(){ gl_Position = uLightVP * uModel * vec4(aPos, 1.0); }`;

const SHADOW_FRAG = `#version 300 es
precision highp float;
void main(){}`;

/*
 * THE DEPTH PREPASS NEEDS ITS OWN SHADER, AND REUSING THE SHADOW ONE COST A DEBUGGING PASS.
 *
 * SHADOW_VERT computes `uLightVP * uModel * vec4(aPos, 1.0)`. GLSL multiplication is LEFT
 * associative, so that multiplies the two MATRICES first and then applies the product to the
 * vector. LIT_VERT applies `uModel` to the vector first and then the view-projection. Same
 * result algebraically, DIFFERENT floating-point rounding — so the depth a prepass wrote and the
 * depth the lit pass computes disagree in the last bits, `LEQUAL` rejects fragments it should
 * pass, and the surface comes out stippled with nested stair-step blocks.
 *
 * That artefact was identical with AO on and off, which is what proved it was the prepass and
 * not the occlusion. The fix is to make the two transforms BIT-IDENTICAL, not to loosen the
 * depth test or add a polygon offset — both of those hide it and leave the disagreement in place.
 */
const DEPTH_VERT = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uViewProj;
uniform mat4 uModel;
void main(){
  vec4 world = uModel * vec4(aPos, 1.0);
  gl_Position = uViewProj * world;
}`;

/*
 * THE NORMAL MATRIX, not the model matrix. Under non-uniform scale the model matrix skews
 *        normals off the surface and the lighting rotates as the object is squashed — the transpose
 *        of the inverse is the only transform that keeps them perpendicular.
 * The tangent transforms by the MODEL matrix, not the normal matrix: it is a direction lying IN
 *        the surface, so it follows the geometry rather than staying perpendicular to it. Using the
 *        normal matrix here is a common slip and rotates the brush direction under non-uniform scale.
 */
const LIT_VERT = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNormal;
layout(location=2) in vec3 aTangent;
uniform mat4 uViewProj;
uniform mat4 uModel;
uniform mat3 uNormalMat;
out vec3 vWorld;
out vec3 vNormal;
out vec3 vTangent;
void main(){
  vec4 world = uModel * vec4(aPos, 1.0);
  vWorld = world.xyz;
  vNormal = normalize(uNormalMat * aNormal);
  vTangent = normalize(mat3(uModel) * aTangent);
  gl_Position = uViewProj * world;
}`;

/*
 * EXPONENTIAL HEIGHT FOG — L2.9. Zero density is the default, so the five environments that shipped
 *   before this existed render byte-identically. Additive, not a rewrite.
 * ANISOTROPIC GGX — the difference between machined metal and grey plastic.
 *   
 *   Isotropic GGX gives a round highlight. Real turned or brushed metal has microscopic grooves
 *   running one way, so the highlight STRETCHES perpendicular to nothing and elongates ALONG the
 *   grooves — which is why a brushed-steel dial shows a bar of light rather than a dot, and why §2
 *   asks for anisotropy specifically.
 *   
 *   Two roughnesses instead of one: at along the tangent, ab along the bitangent. The half-vector is
 *   measured in that frame, so the lobe becomes an ellipse. Same energy, different shape.
 * OUTSIDE THE LIGHT FRUSTUM IS LIT, NOT SHADOWED. Returning 0 here would drop everything
 *        beyond the shadow extent into darkness — a hard rectangular edge across the floor that
 *        looks like a bug in the geometry rather than a shadow map that ran out of room.
 * The tangent frame, re-orthogonalised in the fragment. Interpolating a tangent across a
 *        triangle leaves it slightly off-perpendicular to the interpolated normal, and an anisotropic
 *        lobe built on a skewed frame twists visibly along a curved surface.
 * THE ENVIRONMENT TERM — and this is what stopped the metal being black.
 *   
 *   A metal has essentially no diffuse lobe, so almost everything visible on it is reflected
 *   environment. E0 rendered a metalness-0.92 sphere nearly black and the material was right:
 *   there was nothing to reflect.
 *   
 *   DIFFUSE irradiance is the sky sampled along the normal. SPECULAR is the sky sampled along
 *   the reflection, lerped toward the normal by roughness — with an analytic sky there is
 *   nothing to prefilter, so moving the sample direction lets the gradient do the blurring. A
 *   mirror samples R, a rough surface samples near N, and highlights stretch and soften
 *   together, which is the behaviour that reads as "material" rather than "shader".
 * AO MULTIPLIES THE ENVIRONMENT TERM ONLY, never the direct light.
 *   
 *   Ambient occlusion answers "how much of the sky can this point see", so it belongs on the
 *   sky's contribution and nowhere else. Applying it to the whole colour — which is what a
 *   post-process multiply would do — darkens the direct highlight as well, and a lit surface
 *   whose specular dims inside a crease reads as dirt rather than as shadow. The shadow MAP
 *   already handles the direct term.
 * FOG LAST, AND BEFORE THE TONE MAP — which is the whole reason it lives in this shader rather
 *   than in a post-process pass.
 *   
 *   A depth-based screen fade applied after tone mapping fades toward a DISPLAY colour, so the
 *   horizon washes to a grey that no light in the scene could produce and the frame looks hazed
 *   rather than deep. Mixing in linear radiance, before the curve, means distant surfaces converge
 *   on the same value the sky already has there — which is what atmosphere actually does.
 *   
 *   The integral is analytic. Density falls off exponentially with height, so the optical depth along
 *   a ray from the eye to the surface is the height-integrated density rather than the naive
 *   distance * density that a flat-fog shader uses. The difference is visible the moment the camera
 *   is not level: flat fog fogs the sky directly overhead exactly as much as the horizon.
 * integral of exp(-h/k) along the ray, in closed form. The dist/|dy| factor converts the
 *            vertical integration variable back to arc length, which is what makes a near-horizontal ray
 *            accumulate far more fog than a vertical one of the same length.
 * direction the light TRAVELS
 * linear radiance
 * scales the environment's contribution
 * linear, brand-exact
 * 0 = isotropic, ->1 = highlight stretched along the tangent
 * 1.0 / shadowMapSize
 * 0 disables the whole term
 * e-folding height: fog thins upward over this many metres
 * linear; -1 in .r means "take it from the sky"
 * y at which density is uFogDensity
 * Schlick-GGX with the direct-lighting k. Using the IBL k here is a common copy-paste error
 * that makes rough surfaces too dark at grazing angles.
 * SLOPE-SCALED BIAS — see the header. Constant bias cannot fix acne and peter-panning at once.
 * Preserve the average roughness while splitting it, so turning anisotropy up does not also
 * change how rough the surface reads.
 * Metals have no diffuse lobe — the energy went into the specular. Not cosmetic: a metallic
 * surface with a diffuse term reads as painted plastic.
 * A horizontal ray: height is constant, so the integral is the flat one at that height.
 * NO TONE MAP. The composite owns the only one in the pipeline.
 */
/*
 * ── TWO DEFECTS FIXED IN THIS SHADER, BOTH RECORDED HERE BECAUSE THE GLSL CANNOT AFFORD THE PROSE ──
 *
 * A comment inside a template literal is shipped bytes that no minifier can reach, so the reasoning
 * lives out here and the shader carries one line pointing at it.
 *
 * ── 1 · uShadowTaps, which quality.ts declared and nothing read ─────────────────────────────────────
 * The ladder in env/quality.ts has said shadowTaps: 1 for the minimum tier since it was wired. The PCF
 * loop was hard-coded to 3x3 and divided by a literal 9.0, so the tier that exists for machines which
 * cannot afford the full frame was paying nine texture fetches per lit fragment to get a result it had
 * explicitly asked to do without. A config field nobody reads is worse than no field, because it reads
 * as a guarantee — env.test.ts even asserted the tiers were monotonic in a number with no effect.
 *
 * It is TWO STATIC BRANCHES, not a dynamic loop bound. uShadowTaps is uniform across the draw, so the
 * branch is coherent for every fragment and both bodies unroll; a loop bounded by the uniform would
 * defeat unrolling on exactly the weak hardware the minimum tier is for. Anything below 9 snaps to 1
 * at the call site, so a stray 4 cannot reach a branch nobody wrote.
 *
 * And one tap is not "9 taps, cheaper" — it is a hard shadow edge. That is the correct thing for the
 * tier to buy, and it is why this is a look change as well as a perf change.
 *
 * ── 5 · THE BIAS WAS TUNED FOR ONE MAP SIZE AND THE QUALITY LADDER CHANGES THE MAP SIZE ────────────
 * Found by an adversarial pass over fix 1, and it is fix 1's own consequence rather than a pre-existing
 * defect — which is why it is here and not in the list above.
 *
 * Depth error from a shadow map scales with TEXEL SIZE. The constants 0.0009 and 0.0045 were tuned against
 * the map an environment actually renders, and every environment picks its own baseline (1024 for all seven
 * shipping components and for e0/e2/e8; 1536 for e4 and e6). The ladder then multiplies that baseline down:
 * shadowMapSizeFor('minimum', 1024) is 256, a quarter of the linear resolution, where the bias needed to
 * clear self-shadowing is about FOUR TIMES what it is at 1024.
 *
 * That was survivable while every fragment took nine taps, because residual acne averaged into a 3-level
 * dither and read as softness. Fix 1 gave the minimum tier ONE tap. One tap does not average, so the same
 * residual becomes hard binary speckle — on precisely the tier that exists for machines least able to hide
 * it, and on which no capture had ever been taken.
 *
 * SCALED AGAINST THE ENVIRONMENT'S OWN BASELINE, not against a global constant. That distinction is the
 * whole design: at the full tier actual == baseline, so the scale is exactly 1.0 and every approved capture
 * is unchanged BY CONSTRUCTION, including e4's and e6's 1536 maps. Only the rungs that shrink the map pay
 * more bias. Scaling against a global 1024 would have been simpler and would have silently altered the two
 * 1536 environments' full-tier shadows — trading one regression for another.
 *
 * The default is 1.0, so a caller that does not pass a baseline gets exactly today's behaviour.
 *
 * ── 4 · THE ISOTROPIC BRANCH HAD THE SAME DEFECT, AND IT WAS LIVE ON THE SIGN-IN SCREEN ────────────
 * distributionGGX guarded with max(1e-6, PI*d*d). At NdotH = 1, d reduces to a2, so the denominator's
 * true floor is PI*a2^2 -- 5.3e-11 at the roughness clamp, which is FIVE ORDERS OF MAGNITUDE below the
 * guard. So for any material smoother than roughness 0.154 the guard replaced the real denominator
 * inside NdotH > 0.9997, i.e. exactly the core of the specular highlight.
 *
 * This was not theoretical. Three materials sit in the affected range, and two of them are the LCX mark:
 *   ForgeBackdrop.tsx roughness 0.13  -- the live sign-in screen
 *   docs/3d/e8/entry.ts roughness 0.13 -- the same mark in its harness
 *   docs/3d/e2/entry.ts roughness 0.14 -- E2's globe
 * At roughness 0.13 the peak came back 3.9x too dim. At the 0.045 clamp it is 18,930x too dim.
 *
 * EXPECT A LOOK CHANGE, and it is the point rather than a side effect: the highlight core on those three
 * materials gets its real intensity, so it reads as a tight bright specular instead of a dull flat one.
 * Combined with defect 2 -- which widened the same lobe -- E8's mark had both a blurred and a clipped
 * highlight, which is most of the difference between "machined metal" and "grey plastic".
 *
 * ── 3 · and the anisotropic epsilon was clipping the specular peak of smooth materials ─────────────
 * Found by the convergence test written for defect 2, which is the reason that test exists rather than
 * a source-level string match.
 *
 * distributionGGXAniso guarded its divide with max(1e-8, v2). But v2 has a legitimate floor of a2^2 --
 * at NdotH = 1 the tangential terms vanish and v2 is exactly (at*ab)^2. With at = ab at the 0.002
 * clamp, that floor is 1.6e-11, which is a THOUSAND times below the old guard. So for the smoothest
 * materials near the specular peak the guard replaced the real denominator with 1e-8 and returned
 * roughly two thirds of the correct intensity: at roughness 0.045 and NdotH 0.999, D came back 0.219
 * against a true 0.326.
 *
 * A divide guard must sit below every value the expression can legitimately take, or it stops being a
 * guard and becomes a silent clamp on the output. 1e-16 is comfortably under the 1.6e-11 floor and
 * nowhere near float32's limits, and v2 cannot actually reach zero anyway because at and ab are clamped
 * away from it -- so this epsilon is paranoia that no longer costs anything.
 *
 * ── 2 · the anisotropic branch disagreed with the isotropic one about alpha ─────────────────────────
 * distributionGGX takes PERCEPTUAL roughness and squares it internally (a = rough*rough, the
 * Disney/Burley remap). distributionGGXAniso takes ALPHAS. The old code fed it rough*(1 +/- aniso) —
 * perceptual roughness wearing an alpha's name.
 *
 * The algebra that makes this a defect rather than a preference: with at = ab = a the anisotropic form
 * reduces to a2/(PI*(NdotH^2*(a2-1)+1)^2), which is exactly the isotropic form. So the branches agree
 * if and only if at and ab converge on the isotropic ALPHA. They did not — crossing the aniso > 0.001
 * threshold jumped alpha from rough^2 to rough (at rough 0.3, from 0.09 to 0.3), so the highlight
 * bloomed visibly rougher the instant anisotropy was switched on, in the direction that looks like a
 * lower-quality render. E8's mark uses this path, and E8 is the sign-in screen every visitor sees.
 *
 * The 0.002 floor is kept and is now consistent rather than coincidental: rough is clamped to 0.045
 * above, so the isotropic alpha floor is 0.045^2 = 0.002025 — the number this clamp already enforced.
 */
/*
 * ── THE AMBIENT TERM WAS RETURNING MORE ENERGY THAN IT RECEIVED, IN THREE SEPARATE PLACES ──────────
 *
 * Same rule as above: this reasoning is out here because a comment inside the template literal is
 * shipped bytes no minifier can reach. The shader carries one line pointing at this note.
 *
 * All three are the SAME defect seen from three angles — the ambient term had no accounting for how
 * much of the incoming sky a surface actually reflects, so it invented energy at both ends of the
 * roughness range. The direct term has always had that accounting (`kd = (1-F)*(1-metalness)`);
 * the environment term did not.
 *
 * ── A · kd WAS MISSING FROM THE ENVIRONMENT DIFFUSE ────────────────────────────────────────────────
 * `envDiffuse` was `skyColour(N) * uBaseColour * (1.0 - uMetalness)`. The `(1 - F)` factor that the
 * direct path applies four lines earlier was simply absent, so every dielectric returned its full
 * Lambertian response PLUS its full specular response to the same incoming sky.
 *
 * Measured against a uniform sky — the case where both terms sample the same radiance, so the two
 * weights can legitimately be summed — a white dielectric's ambient weights summed to 1.9998 at
 * grazing incidence: it returned twice the energy that arrived. The fixed form is capped at 1.0030
 * over the whole (roughness, NdotV) grid, and the 0.0030 is the deliberately-omitted multiscatter
 * coupling described below, not slack.
 *
 * ── B · THE ENVIRONMENT SPECULAR HAD NO BRDF INTEGRATION TERM ──────────────────────────────────────
 * It was `prefilteredSky * fresnelSchlick(NdotV, f0)` — a Fresnel with no D and no G, i.e. the
 * REFLECTANCE of the surface standing in for the INTEGRAL of the BRDF over the hemisphere. Those
 * differ by a factor that falls from 1.0 to 0.45 as roughness goes 0 to 1, so rough metals came back
 * up to 2.2x too bright and the grazing falloff had the wrong shape.
 *
 * The split-sum approximation (Karis, SIGGRAPH 2013 course notes) factors that integral into
 * prefiltered radiance times a two-term BRDF weight `f0 * A + B`, where A and B depend only on
 * NdotV and roughness. The usual delivery is a 2D lookup texture. This uses the ANALYTIC fit from
 * Karis, "Physically Based Shading on Mobile" (Epic Games, 2014) — `EnvBRDFApprox` — for two
 * reasons that are specific to this repo rather than general:
 *   · a LUT is an asset. `sky.ts` already refused a cubemap on exactly this ground: bytes, a fetch
 *     and an asset pipeline that `3D_VFX_1000X.md` §3.3 deferred. The fit is seven ALU operations
 *     counted at source level, and no fetch at all.
 *   · it would take a third texture unit in a pass that already binds the shadow map on 0 and AO on
 *     1, and `lit.ts` has already had one feedback-hazard bug from unit bookkeeping (see
 *     `releaseTextureUnits` below). A unit not taken cannot leak.
 *
 * AND THE FRESNEL IS ALREADY INSIDE A AND B, which is the trap in this change. The obvious edit is
 * `fresnelSchlick(NdotV, f0) * dfg.x + dfg.y`, keeping the call that was there. That applies Schlick
 * TWICE: the fit was made against the Fresnel-weighted integral.
 *
 * The evidence that it is in there, measured rather than asserted: at the smoothest legal roughness
 * a dielectric's `f0*A + B` rises 20.6x from normal incidence to NdotV 0.01, against Schlick's own
 * 23.8x rise over the same range, and the two never differ by more than 0.085 in absolute terms. A
 * fit with no Fresnel in it would be FLAT in NdotV. The double-counted form is 1.7x the correct
 * weight at an ordinary 70-degree view and 5.2x at a grazing one, which is a rim of invented light
 * on every dielectric — the exact artefact this change is supposed to remove. `env.test.ts` pins
 * both halves numerically, so reinstating the multiply fails on arithmetic, not on a string match.
 *
 * ── C · SINGLE-SCATTERING GGX LOSES ENERGY, AND THE LOSS IS LARGE AT THE ROUGHNESS THIS APP USES ───
 * A microfacet BRDF with one bounce drops every ray that hits a second facet. The white-furnace
 * albedo of this fit is exactly `A + B = 1 - 0.55*rough` (the NdotV-dependent halves cancel), so the
 * loss is 7.15% at roughness 0.13 and 48.4% at 0.88 — and this app's shipped materials run 0.13 to
 * 0.9, i.e. the whole range where it matters. What that looks like is the thing worth naming: a rough
 * metal goes grey and chalky instead of staying bright, because the missing energy is the coloured
 * part (it is the light that bounced off f0 twice).
 *
 * The compensation is Fdez-Agüera's / Filament's: multiply the specular by `1 + f0*(1/Ess - 1)`,
 * which restores exactly the lost fraction and is exact by construction in the white-furnace case
 * (f0 = 1 gives `Ess * 1/Ess = 1`). Measured gains on shipped materials, per channel:
 *   the LCX mark  #2C6BFF rough 0.13 metal 0.92 -> +7.1% blue, +0.2% red  (so it also re-saturates)
 *   E2 corridors  #4C86FF rough 0.22 metal 0.85 -> +11.8% blue
 *   brushed ring  #8FA3C4 rough 0.30 metal 0.95 -> +10.4% blue, +5.2% red
 *   StormRelief lid #6B7A99 rough 0.62 metal 0.35 -> +7.1% blue
 * A dielectric floor at rough 0.88 gains 3.8%, uniformly, because its f0 is 0.04 in all channels.
 *
 * APPLIED TO THE ENVIRONMENT SPECULAR ONLY, and Filament applies it to the direct specular too. The
 * reason for the difference is that the factor is derived from the HEMISPHERICAL directional albedo:
 * putting the recovered energy back into a narrow direct lobe places it in a direction it did not
 * actually scatter to, whereas the environment term is an integral over the hemisphere, which is
 * what the factor describes. The direct specular therefore still carries the single-scatter loss —
 * that is a known, bounded approximation and not an oversight.
 *
 * ── WHY kd IS `1 - specWeight` AND NOT `1 - F` ─────────────────────────────────────────────────────
 * Once B lands, `F(NdotV)` is no longer what the specular takes — `f0*A + B` is. Subtracting `1 - F`
 * would remove energy the specular never took: at rough 1.0 and NdotV 0.1 a dielectric's real
 * specular weight is 0.016, while `1 - F` there is 0.393. That is a 24x over-subtraction, and it is
 * the bug that makes rough dielectrics go black at their silhouette in engines that ship the
 * simpler form. `1 - specWeight` costs nothing extra because specWeight is already computed.
 *
 * It does NOT subtract the multiscatter gain from kd, which the fully-coupled form (Fdez-Agüera
 * 2019) does. Measured, the omission mis-states kd by at most 0.003 over the whole (rough, NdotV)
 * grid, because the gain scales with f0 while kd scales with (1 - metalness) and the only case where
 * both are non-zero is a dielectric, whose f0 is 0.04. Stated rather than silently dropped.
 *
 * ── THE THREE CLAMPS, AND WHICH TWO ARE NOT THERE ──────────────────────────────────────────────────
 * The lesson from defects 3 and 4 above is that a guard sitting above a value the expression can
 * legitimately take is not a guard, it is a silent clamp on the output. So each of these was checked
 * against a measured floor rather than picked:
 *   · `max(vec3(0.0), f0*A + B)` IS REACHABLE and stays. B falls to -0.0024 at roughness 1, so a
 *     metal at #101010 or darker produces a negative specular weight (-5.6e-5 at exactly #101010,
 *     +1.4e-4 at #111111 — the threshold is that sharp). A negative radiance in a pipeline that
 *     accumulates in HDR and tone maps once at the end darkens the whole composite rather than
 *     clipping locally, which is the same failure mode the file header warns about for specular.
 *   · kd needs NO clamp, and that is provable rather than lucky. `rough` is clamped to 0.045 first,
 *     which caps a004 at r.x^3 + r.y and so keeps A >= 0.065 for every legal roughness. With A
 *     positive, `1 - (f0*A + B)` is smallest at f0 = 1, where it is `1 - Ess >= 0.0248`. A dielectric
 *     never goes below 0.0877. Both are swept in `env.test.ts` down to NdotV 1e-5.
 *   · `max(1e-3, Ess)` is unreachable paranoia and costs one instruction. Ess is exactly
 *     `1 - 0.55*rough`, so its floor is 0.45 — 450x above the guard, which is the direction the
 *     doctrine requires.
 *
 * ── VERIFIED ON THE GPU, NOT ONLY IN THE MIRROR ────────────────────────────────────────────────────
 * `env.test.ts` mirrors this algebra in TypeScript because vitest cannot execute GLSL, and a mirror
 * is not the shipped code. That gap was closed once by measurement rather than left open: the envDFG
 * bytes were SLICED OUT OF LIT_FRAG (not retyped), compiled in headless Chromium on the M1 through
 * ANGLE Metal, evaluated into an RGBA32F target over a 64x64 grid of (NdotV, roughness) spanning the
 * whole legal roughness range, and read back.
 *   · GPU vs mirror: worst disagreement 1.8e-7 across all 4096 samples — float32 rounding.
 *   · The energy identity A + B = 1 - 0.55*rough holds ON THE GPU to 1.1e-7, so the conservation
 *     claim is not an artefact of doing the arithmetic in float64 in a test.
 *   · All three programs (lit, shadow, depth) compile and link with empty info logs; the lit program
 *     reports 26 active uniforms, and gl.getError() is 0.
 * The check is not automated, because it needs a browser and this package's unit tests run in node
 * with no GL context at all. Re-run it by hand if these coefficients are ever touched.
 *
 * ── EXPECT A LOOK CHANGE, AND WHERE ────────────────────────────────────────────────────────────────
 * Darker: the ambient diffuse of every dielectric, most at grazing angles — the floors and plinths
 * in E3/E5/E7 and ForgeBackdrop's backplate lose their silhouette lift. Also every rough metal's
 * ambient specular, which was up to 2.2x too bright.
 * Brighter and more saturated: the specular on the metals listed above, by the measured percentages.
 * Net on the sign-in screen: the mark's blue reflection strengthens while the plate behind it dims
 * at the edges, which is contrast the previous frame was spending on invented energy.
 */
const LIT_FRAG = `#version 300 es
precision highp float;
in vec3 vWorld;
in vec3 vNormal;
in vec3 vTangent;

uniform vec3 uEye;
uniform vec3 uLightDir;
uniform vec3 uLightColour;
uniform float uAmbientGain;
uniform vec3 uBaseColour;
uniform float uRoughness;
uniform float uMetalness;
uniform float uAnisotropy;

uniform mat4 uLightVP;
uniform sampler2D uShadowMap;
uniform float uShadowTexel;
uniform float uShadowStrength;
uniform int uShadowTaps;
uniform float uShadowBiasScale;

uniform sampler2D uAO;
uniform vec2 uScreenSize;
uniform float uAOEnabled;
uniform float uFogDensity;
uniform float uFogHeight;
uniform vec3 uFogColour;
uniform float uFogFloor;

out vec4 frag;
${SKY_GLSL}

const float PI = 3.14159265359;

float distributionGGX(float NdotH, float rough) {
  float a = rough * rough;
  float a2 = a * a;
  float d = NdotH * NdotH * (a2 - 1.0) + 1.0;
  return a2 / max(1e-16, PI * d * d);
}

float distributionGGXAniso(float NdotH, float TdotH, float BdotH, float at, float ab) {
  float a2 = at * ab;
  vec3 v = vec3(ab * TdotH, at * BdotH, a2 * NdotH);
  float v2 = dot(v, v);
  float w2 = a2 / max(1e-16, v2);
  return a2 * w2 * w2 / PI;
}

float geometrySmith(float NdotV, float NdotL, float rough) {

  float k = (rough + 1.0) * (rough + 1.0) / 8.0;
  float gv = NdotV / (NdotV * (1.0 - k) + k);
  float gl = NdotL / (NdotL * (1.0 - k) + k);
  return gv * gl;
}

vec3 fresnelSchlick(float cosTheta, vec3 f0) {
  return f0 + (1.0 - f0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
}

// Split-sum BRDF integral, analytic (Karis 2014) rather than a LUT. See the note above LIT_FRAG.
vec2 envDFG(float NdotV, float rough) {
  const vec4 c0 = vec4(-1.0, -0.0275, -0.572, 0.022);
  const vec4 c1 = vec4(1.0, 0.0425, 1.04, -0.04);
  vec4 r = rough * c0 + c1;
  float a004 = min(r.x * r.x, exp2(-9.28 * NdotV)) * r.x + r.y;
  return vec2(-1.04, 1.04) * a004 + r.zw;
}

float shadowFactor(vec3 world, float NdotL) {
  vec4 lc = uLightVP * vec4(world, 1.0);
  vec3 p = lc.xyz / lc.w;
  p = p * 0.5 + 0.5;
  if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0 || p.z > 1.0) return 1.0;

  float bias = max(0.0009, 0.0045 * (1.0 - NdotL)) * uShadowBiasScale;
  float ref = p.z - bias;

  // One tap is a HARD EDGE, not a cheaper nine. Two static branches: uShadowTaps is uniform across
  // the draw, so both bodies still unroll. See the note above LIT_FRAG.
  if (uShadowTaps < 9) {
    float d = texture(uShadowMap, p.xy).r;
    return mix(1.0, ref <= d ? 1.0 : 0.0, uShadowStrength);
  }

  float lit = 0.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 off = vec2(float(x), float(y)) * uShadowTexel;
      float d = texture(uShadowMap, p.xy + off).r;
      lit += ref <= d ? 1.0 : 0.0;
    }
  }
  lit /= 9.0;
  return mix(1.0, lit, uShadowStrength);
}

void main(){
  vec3 N = normalize(vNormal);
  vec3 V = normalize(uEye - vWorld);
  vec3 L = normalize(-uLightDir);
  vec3 H = normalize(V + L);

  float NdotL = max(dot(N, L), 0.0);
  float NdotV = max(dot(N, V), 1e-4);
  float NdotH = max(dot(N, H), 0.0);
  float VdotH = max(dot(V, H), 0.0);

  vec3 f0 = mix(vec3(0.04), uBaseColour, uMetalness);
  float rough = clamp(uRoughness, 0.045, 1.0);

  vec3 T = normalize(vTangent - N * dot(N, vTangent));
  vec3 B = cross(N, T);
  float aniso = clamp(uAnisotropy, 0.0, 0.95);

  // at/ab are ALPHAS and must be derived from alpha, or the two D branches disagree about what the
  // number means and the highlight jumps at aniso = 0. See the note above LIT_FRAG.
  float alpha = rough * rough;
  float at = max(0.002, alpha * (1.0 + aniso));
  float ab = max(0.002, alpha * (1.0 - aniso));

  float D = aniso > 0.001
    ? distributionGGXAniso(NdotH, dot(T, H), dot(B, H), at, ab)
    : distributionGGX(NdotH, rough);
  float G = geometrySmith(NdotV, NdotL, rough);
  vec3  F = fresnelSchlick(VdotH, f0);

  vec3 spec = (D * G * F) / max(1e-6, 4.0 * NdotV * NdotL + 1e-4);

  vec3 kd = (1.0 - F) * (1.0 - uMetalness);
  vec3 diffuse = kd * uBaseColour / PI;

  float shadow = shadowFactor(vWorld, NdotL);
  vec3 direct = (diffuse + spec) * uLightColour * NdotL * shadow;

  vec3 R = reflect(-V, N);
  // ENERGY-ACCOUNTED AMBIENT: split-sum weight, multiscatter gain, kd. See the note above LIT_FRAG.
  vec2 dfg = envDFG(NdotV, rough);
  float Ess = dfg.x + dfg.y;
  vec3 specWeight = max(vec3(0.0), f0 * dfg.x + dfg.y);
  vec3 msComp = 1.0 + f0 * (1.0 / max(1e-3, Ess) - 1.0);
  vec3 envDiffuse = skyColour(N) * uBaseColour * (1.0 - specWeight) * (1.0 - uMetalness);
  vec3 envSpecular = skyColour(normalize(mix(R, N, rough * rough))) * specWeight * msComp;
  float ao = uAOEnabled > 0.5 ? texture(uAO, gl_FragCoord.xy / uScreenSize).r : 1.0;
  vec3 ambient = (envDiffuse + envSpecular) * uAmbientGain * ao;

  vec3 lit = direct + ambient;

  if (uFogDensity > 0.0) {
    vec3 toEye = uEye - vWorld;
    float dist = length(toEye);
    float dyRaw = uEye.y - vWorld.y;
    float hEye = max(0.0, uEye.y - uFogFloor);
    float hFrag = max(0.0, vWorld.y - uFogFloor);
    float k = max(1e-4, uFogHeight);
    float depth;
    if (abs(dyRaw) < 1e-4) {

      depth = uFogDensity * dist * exp(-hFrag / k);
    } else {
      depth = uFogDensity * k * (dist / abs(dyRaw)) * abs(exp(-hFrag / k) - exp(-hEye / k));
    }
    vec3 fogCol = uFogColour.r < 0.0 ? skyColour(normalize(-toEye)) : uFogColour;
    lit = mix(lit, fogCol, 1.0 - exp(-depth));
  }

  frag = vec4(lit, 1.0);
}`;

export interface MeshBuffer {
  readonly vao: WebGLVertexArrayObject;
  readonly indexCount: number;
  readonly indexType: number;
  dispose(): void;
}

/** Upload a `Geometry` to the GPU once. Geometry is static; re-uploading per frame is the leak. */
export function uploadMesh(stage: Stage, g: Geometry): MeshBuffer | StageRefusal {
  const { gl } = stage;
  const vao = gl.createVertexArray();
  const pos = gl.createBuffer();
  const nrm = gl.createBuffer();
  const tanBuf = gl.createBuffer();
  const idx = gl.createBuffer();
  if (!vao || !pos || !nrm || !tanBuf || !idx) {
    return { kind: 'refused', code: 'FRAMEBUFFER_INCOMPLETE', reason: 'The GPU refused a vertex buffer.' };
  }
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, pos);
  gl.bufferData(gl.ARRAY_BUFFER, g.positions, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, nrm);
  gl.bufferData(gl.ARRAY_BUFFER, g.normals, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, tanBuf);
  gl.bufferData(gl.ARRAY_BUFFER, g.tangents, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idx);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, g.indices, gl.STATIC_DRAW);
  gl.bindVertexArray(null);

  return {
    vao,
    indexCount: g.indices.length,
    indexType: g.indices instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT,
    dispose() {
      gl.deleteVertexArray(vao);
      gl.deleteBuffer(pos); gl.deleteBuffer(nrm); gl.deleteBuffer(tanBuf); gl.deleteBuffer(idx);
    },
  };
}

export interface Material {
  readonly baseColour: readonly [number, number, number];
  readonly roughness: number;
  readonly metalness: number;
  /**
   * 0 = isotropic (a round highlight). Toward 1 the highlight stretches ALONG the surface tangent,
   * which is what makes turned or brushed metal show a bar of light instead of a dot.
   */
  readonly anisotropy?: number;
}

export interface LitDraw {
  readonly mesh: MeshBuffer;
  readonly model: Mat4;
  /** Inverse-transpose of the model's 3×3, row-major for `uniformMatrix3fv`. */
  readonly normalMat: Float32Array;
  readonly material: Material;
}

export interface LitRenderer {
  /** Depth-only pass into the shadow map. Call before `draw`. */
  /**
   * Optional per-call probe. `getError()` reports the first error since the last call and
   * CLEARS it, so a single check at the end of a pass identifies the pass and never the call.
   * Passing this makes a GL_INVALID_VALUE name its own line instead of costing three guesses.
   */
  shadowPass(lightVP: Mat4, draws: readonly LitDraw[], shadow: ShadowMap, onStep?: (label: string) => void): void;
  /**
   * DEPTH-ONLY, from the camera. Breaks the AO circularity — AO needs depth, the lit pass needs
   * AO — and is not a tax: the lit pass then rejects every occluded fragment before its GGX
   * evaluation rather than after. Reuses the shadow program, which is already position-only.
   */
  depthPrepass(viewProj: Mat4, draws: readonly LitDraw[]): void;
  draw(opts: {
    readonly viewProj: Mat4;
    readonly eye: readonly [number, number, number];
    readonly lightDir: readonly [number, number, number];
    readonly lightColour: readonly [number, number, number];
    /** Scales the environment contribution. 1 = the sky as authored. */
    readonly ambientGain?: number;
    readonly sky?: SkyOptions;
    readonly lightVP: Mat4;
    readonly shadow: ShadowMap | null;
    readonly shadowStrength?: number;
    /**
     * PCF taps: 9 (3x3) or 1 (hard edge). Defaults to 9, so every caller written before the quality
     * ladder existed keeps the filtering it was captured with. Pass `qualitySettings(tier).shadowTaps`.
     */
    readonly shadowTaps?: number;
    /**
     * The shadow-map size this scene's bias was tuned at — i.e. the baseline you hand
     * `shadowMapSizeFor`, NOT the size the tier resolved to. The bias scales by `baseline / actual`, so
     * a tier that shrinks the map gets proportionally more bias and the full tier gets exactly 1.0.
     *
     * Omit it and the scale is 1.0, which is today's behaviour — the tier then renders a coarser map with
     * a bias tuned for a finer one, which is hard speckle at one tap.
     */
    readonly shadowBaseline?: number;
    readonly draws: readonly LitDraw[];
    /** Half-resolution occlusion from `createAmbientOcclusion`. Omit to disable. */
    readonly ao?: WebGLTexture | null;
    readonly screenSize?: readonly [number, number];
    /**
     * Exponential height fog. Omit for none — the default is off so environments written before this
     * existed are unaffected.
     *
     * `colour: 'sky'` takes the fog colour from the analytic sky along the view ray, which is the
     * only choice that makes a distant surface and the sky behind it agree. A literal colour is for
     * an enclosed space where there is no sky to agree with.
     */
    readonly fog?: {
      readonly density: number;
      /** e-folding height in metres: density falls by 1/e each `height` above `floor`. */
      readonly height: number;
      readonly floor?: number;
      readonly colour: readonly [number, number, number] | 'sky';
    } | null;
    readonly onStep?: (label: string) => void;
  }): void;
  dispose(): void;
}

export function createLitRenderer(stage: Stage): LitRenderer | StageRefusal {
  const { gl } = stage;
  const shadowProg = stage.compile(SHADOW_VERT, SHADOW_FRAG);
  if ('kind' in shadowProg) return shadowProg;
  const litProg = stage.compile(LIT_VERT, LIT_FRAG);
  if ('kind' in litProg) return litProg;
  const depthProg = stage.compile(DEPTH_VERT, SHADOW_FRAG);
  if ('kind' in depthProg) return depthProg;

  const u = (p: WebGLProgram, n: string) => gl.getUniformLocation(p, n);

  return {
    shadowPass(lightVP, draws, shadow, onStep) {
      /* The shadow map's own framebuffer and viewport are bound below and were previously left bound
         for the caller to notice. Every environment happens to call `target.bind()` next; passState.ts
         says why "happens to" is not good enough. */
      const prev = savePassState(gl);
      const step = onStep ?? (() => undefined);
      shadow.bind(); step('shadow.bind');
      gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.disable(gl.BLEND);
      /* FRONT-FACE CULLING IN THE SHADOW PASS. Rendering back faces puts the recorded depth on
         the far side of the object, which moves the acne inside the geometry where nothing can
         see it. Cheaper and more robust than tuning bias alone. */
      gl.enable(gl.CULL_FACE);
      gl.cullFace(gl.FRONT);
      gl.useProgram(shadowProg); step('useProgram(shadow)');
      gl.uniformMatrix4fv(u(shadowProg, 'uLightVP'), false, lightVP); step('uLightVP');
      for (const d of draws) {
        gl.uniformMatrix4fv(u(shadowProg, 'uModel'), false, d.model); step('shadow uModel');
        gl.bindVertexArray(d.mesh.vao); step('shadow bindVAO');
        gl.drawElements(gl.TRIANGLES, d.mesh.indexCount, d.mesh.indexType, 0); step('shadow drawElements');
      }
      gl.bindVertexArray(null);
      gl.cullFace(gl.BACK);
      restorePassState(gl, prev);
    },

    depthPrepass(viewProj, draws) {
      const prev = savePassState(gl);
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
      gl.enable(gl.CULL_FACE);
      gl.cullFace(gl.BACK);
      /* colorMask off: this pass exists for depth, and writing colour would overwrite the
         environment backdrop that was drawn before it. */
      gl.colorMask(false, false, false, false);
      gl.useProgram(depthProg);
      gl.uniformMatrix4fv(u(depthProg, 'uViewProj'), false, viewProj);
      for (const d of draws) {
        gl.uniformMatrix4fv(u(depthProg, 'uModel'), false, d.model);
        gl.bindVertexArray(d.mesh.vao);
        gl.drawElements(gl.TRIANGLES, d.mesh.indexCount, d.mesh.indexType, 0);
      }
      gl.bindVertexArray(null);
      gl.colorMask(true, true, true, true);
      restorePassState(gl, prev);
    },

    draw(o) {
      const prev = savePassState(gl);
      const step = o.onStep ?? (() => undefined);
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      /* depthMask STAYS ON. With a prepass the values are already correct so writing them again
         is a no-op, and turning it off would break the no-prepass path that E0 also exercises. */
      gl.depthMask(true);
      gl.disable(gl.BLEND);
      gl.enable(gl.CULL_FACE);
      gl.cullFace(gl.BACK);
      gl.useProgram(litProg);
      gl.uniformMatrix4fv(u(litProg, 'uViewProj'), false, o.viewProj); step('uViewProj');
      gl.uniform3fv(u(litProg, 'uEye'), o.eye as unknown as number[]); step('uEye');
      gl.uniform3fv(u(litProg, 'uLightDir'), o.lightDir as unknown as number[]); step('uLightDir');
      gl.uniform3fv(u(litProg, 'uLightColour'), o.lightColour as unknown as number[]); step('uLightColour');
      gl.uniform1f(u(litProg, 'uAmbientGain'), o.ambientGain ?? 1); step('uAmbientGain');
      /* Density 0 short-circuits the whole term in the shader, so an absent `fog` costs one uniform
         write and nothing else. The sky sentinel is -1 in red rather than a separate boolean uniform:
         one fewer uniform to forget to set, and a negative radiance is not a value any real colour
         can take. */
      if (o.fog && o.fog.density > 0) {
        gl.uniform1f(u(litProg, 'uFogDensity'), o.fog.density);
        gl.uniform1f(u(litProg, 'uFogHeight'), o.fog.height);
        gl.uniform1f(u(litProg, 'uFogFloor'), o.fog.floor ?? 0);
        const c = o.fog.colour;
        if (c === 'sky') gl.uniform3f(u(litProg, 'uFogColour'), -1, -1, -1);
        else gl.uniform3f(u(litProg, 'uFogColour'), c[0]!, c[1]!, c[2]!);
        step('fog');
      } else {
        gl.uniform1f(u(litProg, 'uFogDensity'), 0);
      }
      bindSky(gl, litProg, o.sky); step('bindSky');
      if (o.ao && o.screenSize) {
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, o.ao);
        gl.uniform1i(u(litProg, 'uAO'), 1);
        gl.uniform2f(u(litProg, 'uScreenSize'), o.screenSize[0], o.screenSize[1]);
        gl.uniform1f(u(litProg, 'uAOEnabled'), 1);
      } else {
        // NO AO TEXTURE MEANS UNOCCLUDED, never fully occluded: a missing resource must not
        // black out the scene, which is indistinguishable from a broken shader.
        gl.uniform1f(u(litProg, 'uAOEnabled'), 0);
      }
      step('bindAO');
      gl.uniformMatrix4fv(u(litProg, 'uLightVP'), false, o.lightVP); step('lit uLightVP');

      if (o.shadow) {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, o.shadow.depthTexture);
        gl.uniform1i(u(litProg, 'uShadowMap'), 0);
        gl.uniform1f(u(litProg, 'uShadowTexel'), 1 / o.shadow.size);
        gl.uniform1f(u(litProg, 'uShadowStrength'), o.shadowStrength ?? 1);
        /* Anything below 9 is the hard edge. Snapped rather than trusted, so a stray 4 cannot land the
           shader in a state neither branch was written for. */
        gl.uniform1i(u(litProg, 'uShadowTaps'), (o.shadowTaps ?? 9) >= 9 ? 9 : 1);
        /* baseline / actual. Guarded so a zero or absent size cannot produce Infinity or NaN — a NaN bias
           makes every depth comparison false, which renders the scene fully shadowed, i.e. black. */
        const base = o.shadowBaseline;
        const scale = base && base > 0 && o.shadow.size > 0 ? base / o.shadow.size : 1;
        gl.uniform1f(u(litProg, 'uShadowBiasScale'), Number.isFinite(scale) && scale > 0 ? scale : 1);
      } else {
        // NO SHADOW MAP IS "FULLY LIT", never "fully shadowed". A missing resource must not
        // black out the scene — that is indistinguishable from a broken shader.
        gl.uniform1f(u(litProg, 'uShadowStrength'), 0);
      }

      for (const d of o.draws) {
        gl.uniformMatrix4fv(u(litProg, 'uModel'), false, d.model);
        gl.uniformMatrix3fv(u(litProg, 'uNormalMat'), false, d.normalMat); step('uNormalMat');
        gl.uniform3fv(u(litProg, 'uBaseColour'), d.material.baseColour as unknown as number[]); step('uBaseColour');
        gl.uniform1f(u(litProg, 'uRoughness'), d.material.roughness);
        gl.uniform1f(u(litProg, 'uMetalness'), d.material.metalness);
        gl.uniform1f(u(litProg, 'uAnisotropy'), d.material.anisotropy ?? 0);
        gl.bindVertexArray(d.mesh.vao); step('lit bindVAO');
        gl.drawElements(gl.TRIANGLES, d.mesh.indexCount, d.mesh.indexType, 0); step('lit drawElements');
      }
      gl.bindVertexArray(null);
      /* THE SHADOW MAP AND THE AO TEXTURE ARE RELEASED, and they were not: this pass left the scene
         target's own shadow depth on unit 0 and the AO result on unit 1, which is the same feedback
         hazard dof.ts's note describes and which reported itself three passes later when it bit.
         `disable(CULL_FACE)` used to stand in for a restore — it is only one if culling was off. */
      releaseTextureUnits(gl, 2);
      restorePassState(gl, prev);
    },

    dispose() {
      gl.deleteProgram(shadowProg);
      gl.deleteProgram(litProg);
      gl.deleteProgram(depthProg);
    },
  };
}

export { LIT_VERT, LIT_FRAG, SHADOW_VERT, SHADOW_FRAG, DEPTH_VERT };
