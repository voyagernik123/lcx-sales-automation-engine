# W5 · SIGNATURE — the deck plate

`live.png` is the gate. Three GL variants and one CSS control, at the deck's real proportions.

## The finding

**The GL layer earns its bytes, and the first capture said the opposite.**

Run 1 used 300px-tall cells. At that 4.9:1 aspect the composite's vignette —
`smoothstep(0.12, 1.0, length(d * vec2(1.0, 1.45)))` — is dominated by the x term, so the
falloff degenerates into horizontal bands. Panel 2 showed a hard step the CSS control did not
have, and the honest conclusion from that image was **delete this**.

That was an artefact of the TEST, not of the surface. The deck is a tall page, not a strip.
Re-captured at 760px the banding is gone and the comparison inverts: the GL plate is a smooth
luminous field with a soft off-centre falloff, and the CSS control is visibly flatter — a dark
rectangle with a slight lift. The difference is real, and it is subtle by design; a backdrop
that announces itself is a worse backdrop.

**A capture at the wrong aspect ratio is as misleading as no capture at all.** This is the third
time in this program that looking at the output changed the answer — after P0's silent black
frame and the axis labels four suites passed. It is also the first time the *harness* was the
thing that lied.

## What it is

`apps/web/src/components/command/SignatureBackdrop.tsx`. No new shader and no spine growth: the
existing `pipeline.resolve` composites `plate + scene + bloom` and tone maps the sum, so an
empty scene target makes the plate and its vignette the entire frame. `bloomGain: 0` — there is
no highlight to bloom, and a gain would only lift the gradient's own quantisation noise.

Why not CSS: a CSS gradient interpolates in sRGB, which bands across a large near-black field
and muddies the midpoint. The same gradient built in linear light and tone mapped once does not.
Near-black is most of a dashboard, so this is where it matters.

## Cost

| | before | after | ceiling |
|---|---|---|---|
| `CommandDeck` chunk | 48.17 KB | 50.02 KB | 440 |
| initial JS | 839 KB | 839 KB | 850 |

Lazy-loaded, so the 11 KB of initial-JS headroom is untouched. No budget raise was needed —
`PLATFORM_VFX_100X.md` §8.3 reserved that decision for the owner and measurement retired it.

## Fallback

`useFlatChart` starts `refused`, so SSR, print, no-WebGL and the first paint all get the CSS
plate underneath. `br-no-print` removes it from the board pack, which prints on white where a
dark plate is nonsense. Nothing on the deck is unreadable without this layer — that property is
what made shipping it safe.

## Reproduce

```bash
node docs/3d/w5/build.mjs && node docs/3d/w5/capture.mjs
```
