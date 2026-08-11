# E2 · THE GLOBE — the capture harness

`live.png` is the gate. §2 puts E2 among the three environments a stranger sees, replacing the
`DistributionGeo` / `StateMap` flat SVG.

Built on `@lcx/gl` primitives, **which is not what §3.1 recommended.** §3.1 argued for a lazy
three.js chunk on the grounds that earth geometry, great-circle arcs and atmospheric scattering are
solved there. This harness answers the narrower question first — how much of E2 the primitives we
already have can carry — so that what is missing stays visibly missing instead of being borrowed.
The **what is not here** list below is the input to that byte decision, not a workaround for it.

## The scene

| element | geometry | material | why |
|---|---|---|---|
| earth | `sphere(1.0, 64, 96)` | `#0B2B5C`, roughness 0.58, metalness 0.06 | smooth, mid-rough. 0.58 and not the 0.42 this started at: at 0.42 the key light left a broad bright blob and the planet read as a shiny plastic ball |
| atmosphere | `sphere(1.06, 56, 84)` | `#7FB2FF`, roughness 0.86, metalness 0 | drawn inside-out — see below |
| 8 cities | `sphere(0.034, 14, 20)` | `#2C6BFF`, roughness 0.5, metalness 0 | centred **on** the surface, so half is buried. A marker floated clear reads as a pin hovering over the planet |
| orbital ring | `torus(1.38, 0.026, 168, 20)` | `#8FA3C4`, roughness 0.14, metalness 0.95, **anisotropy 0.8** | steel, not brand blue: the globe owns the blue, and a metal hierarchy needs the ring to read as a different material |

32,896 triangles. One key light, shadow map, depth prepass, SSAO, environment, depth of field,
tone-mapped present.

## The cities are sited, not placed

`geoToWorld(lat, lon, r)` is the only source of position in the file. It has to agree with
`sphere()`'s own parameterisation or a marker sits above or below the surface it belongs to:
`env/mesh.ts` builds a UV sphere whose polar axis is **Y** with polar angle 0 at the north pole, so
`phi = 90 - lat`, `y = sin(lat)`, and longitude is the angle around Y from +X toward +Z.

```
x = r · cos(lat) · cos(lon)      y = r · sin(lat)      z = r · cos(lat) · sin(lon)
```

The camera azimuth falls out of the same convention: `eyeOf` puts the eye on bearing
(sin az, cos az), which matches (cos lon, sin lon) at **az = 90 − lon**. So a central meridian of
30°E is an azimuth of 60°, and nothing is nudged afterwards.

The **sun is declared as a sub-solar point** (18°N 95°E) rather than as a direction vector, because
that is what a terminator is: the great circle 90° from the point the sun is overhead. The day/night
line in the capture is a consequence of two numbers.

**The eight sites are placeholders and the file says so.** The coordinates are real city
coordinates; the claim that these eight are LCX's partner and listing corridor is not — no such
list is an input here. Vaduz is the one entry that is not a stand-in. Swapping in the real corridor
is an edit to one array.

`live.png`'s own log reports `citiesFacing: 8` and `citiesSunlit: 8` — computed, not asserted. A
point is on the visible cap when `dot(n, eyeDir) > r/d`; using `> 0` instead is the common error and
claims the whole hemisphere including the band the horizon hides.

## The atmosphere shell is a stand-in, and it is drawn inside-out

`lit.ts` calls `gl.disable(BLEND)` — every surface is opaque, so a shell at 1.06 drawn normally
hides the earth completely. It is given a model matrix with a **negative determinant** (mirror in
x). The mirror maps the sphere onto itself but flips winding, so the renderer's fixed back-face
culling keeps the **far** hemisphere and discards the near one; the far hemisphere loses the depth
test to the earth everywhere the earth covers it, leaving an annulus at the limb. It is excluded
from `shadowCasters` — the shadow pass culls FRONT faces, which for a mirrored mesh inverts back to
the hemisphere facing the light, and the shell would then shadow the entire daylit face.

Measured against `no-atmos.png`, 12 angular sectors, 27,908 pixels changed:

| | |
|---|---|
| annulus, all sectors | r **249–276 px** (predicted 253.2 → 269.0; the extra few px is the DOF gather) |
| sunlit limb luminance | **189 → 197** across the band, against 24 for the backdrop and 69 for the daylit surface |
| night limb luminance | **25 → 27**, against 17 bare |

Side by side, the shell turns out to do one job that was not the point of asking for it: in
`no-atmos.png` the globe's night-side silhouette is dark-on-dark against the plate backdrop and
nearly vanishes at the lower right. The rim wraps the whole limb, so with the shell on the sphere
has an edge everywhere.

**This is not scattering.** Real atmospheric scattering is a volumetric integral along the view ray
— optical depth through an exponential density, Rayleigh and Mie phase functions, and a second
integral toward the sun. §4 lists that as L2.9 and it does not exist. This shell gets the right
silhouette and roughly the right brightness gradient from a **surface reflection**, and the
difference shows in the numbers above: the rim nearly vanishes on the night side (25 against 17)
where real forward scatter would still glow.

One thing to know before tuning it: the sunlit rim's brightness is set by `max(dot(N,V), 1e-4)` in
`lit.ts`'s specular denominator. At grazing incidence that is a **clamp constant, not a material
parameter** — no value of roughness, metalness or base colour in this file will move it much.

## What the shadow map does here

There is no ground plane. A globe hangs in space and a floor under it would be a lie about where it
is. The shadow map earns its place because the scene shadows itself. Diffed against
`no-shadow.png`:

- **the ring's shadow band on the globe** — 5,371 px changed on the sphere
- **the globe's shadow on the ring** — the single strongest change in the frame, 153 levels, on the
  ring's right arc at r = 286 px
- **each marker's own cast shadow** — eight small comet-shaped smudges

That band is the cue that tells the eye the ring is a physical object at a distance rather than an
ellipse drawn over the globe.

## The sky is re-aimed at the platform's plate

`DEFAULT_SKY` is right for E8, where a floor plate fills the frame and only a strip of backdrop
shows. Here the backdrop **is** the frame, and at its horizon stop it encodes to about
(76, 88, 107) — a mid-slate field, which made the first capture read as a product shot on a studio
sweep. The three stops are now scaled from `#0E1628`, the platform's own plate: at plate-level
radiance the Reinhard shoulder is within a percent of identity, so those stops survive the present
pass nearly unchanged. Measured, top edge to bottom: **(20, 29, 51) → (6, 10, 22)**, crossing the
plate's own (14, 22, 40) near mid-height.

Not flat, though flat would match the plate exactly — a constant environment gives a metal nothing
to catch, which is the defect E0 found when its metal came out black. The lift through the middle
band is what puts the highlight on the ring. The same object is passed to the backdrop **and** to
the material, because that is the whole point of `sky.ts` sharing one function.

## Cost — NOT measured

`msPerFrame` in the log is **SwiftShader**, a software rasteriser, and observed runs ranged from
134 to 192 ms for the same build. It is a smoke test that every pass executed, not a frame budget.
E0's gate and E8's 10.1 ms were measured on the real M1; **this scene has not been.** 32,896
triangles is 3.3× E8's 10,112, and the fill is one extra full-screen lit pass for the markers.

## What is NOT here

- **The corridor arcs.** §2's headline element. Extruded great-circle arcs need a tube-along-a-path
  generator `env/mesh.ts` does not have, and faking them with cylinders between two cities draws a
  chord **through** the earth — a wrong answer, not a rough one. Filed as a spine request.
- **Continents.** `LIT_FRAG` has no texture sampler and `Material` has no map of any kind, so the
  earth is a plain blue ball. Without an albedo the eight sited markers cannot be read as geography
  by anyone looking at them; this is the largest single gap for E2.
- **An emission channel.** The markers glow via `ambientGain: 140` in a second draw call, because
  ambient gain is a per-pass uniform and there is no emissive term. 140 is not a tuned number, it is
  the ratio needed to lift a plate-level sky reflection to marker radiance. It has a second
  symptom: the glow is a reflection, so a marker's brightness varies slightly with the sky gradient
  at its own latitude and eight identical cities are not quite identically bright.
- **Bloom.** `look/pipeline.ts` is not wired in, so a marker glows without spilling light into the
  pixels around it.
- **City labels.** E8 projects the LCX mark into the frame because rule 4 requires it. A globe's
  equivalent is eight labels, and three of these sites are within 8° of each other — about 23 px at
  this camera, closer than the labels are wide. Projected text without a collision policy reads as
  broken, and this harness cannot check its own legibility.
- **Rotation.** §6 rule 2 forbids idle animation and a globe that turns forever is exactly that.
  Whether the product surface spins is a decision for the surface, not for a capture harness.
- **No city on the night side.** All eight sites are sunlit at 18°N 95°E, so the glow is
  demonstrated against the dim terminator zone rather than against true night. The sub-solar
  longitude is one constant if that is wanted.

## Reproduce

```bash
node docs/3d/e2/build.mjs && node docs/3d/e2/capture.mjs
# controls: live.png, no-atmos.png (shell off), no-shadow.png (shadow map off)
# real GPU: serve docs/3d/e2, open live.html?frames=300&scale=2, read window.E2
```
