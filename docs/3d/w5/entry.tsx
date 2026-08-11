import { createRoot } from 'react-dom/client';
import { SignatureBackdrop } from '@/components/command/SignatureBackdrop';

/**
 * W5 GATE · LOOK AT IT.
 *
 * A DOM test proves a canvas exists. It cannot prove a gradient is smooth, that the vignette
 * sits where it was asked to, or that near-black does not band — and near-black is most of a
 * dashboard. This repo has already paid for that lesson twice: P0 issued every draw call with
 * no error and produced a solid black frame, and a passing suite shipped clipped, colliding
 * axis labels. So this renders the real component at real size and writes a PNG.
 *
 * The CSS fallback is captured beside it. If the two are indistinguishable, the GL layer is not
 * earning its bytes and should be deleted — that is a real possible outcome of this gate.
 */
const cells: Array<[string, string, React.ReactNode]> = [
  ['GL · deck plate', 'linear-light gradient + vignette, tone mapped once', <SignatureBackdrop key="a" />],
  ['GL · deeper vignette', 'vignetteDepth 0.85 — is the falloff still smooth?', <SignatureBackdrop key="b" vignetteDepth={0.85} />],
  ['GL · centred', 'vignetteCentre [0.5,0.5] — symmetric, for comparison', <SignatureBackdrop key="c" vignetteCentre={[0.5, 0.5]} />],
];

const root = document.getElementById('root')!;
createRoot(root).render(
  <>
    {cells.map(([name, note, node]) => (
      <div className="cell" key={name} style={{ height: 760 }}>
        {node}
        <div className="hd" style={{ position: "relative", zIndex: 1 }}><span className="nm">{name}</span><span className="no">{note}</span></div>
      </div>
    ))}
    {/* THE CONTROL. Same box, CSS gradient only — the comparison that decides whether the GL
        layer is worth shipping at all. */}
    <div className="cell" key="css" style={{ height: 760 }}>
      <div className="absolute inset-0 -z-10" style={{ background: 'radial-gradient(120% 90% at 42% 30%, #0b1220 0%, #070b14 55%, #04060b 100%)' }} />
      <div className="hd" style={{ position: "relative", zIndex: 1 }}><span className="nm">CONTROL · CSS only</span><span className="no">sRGB interpolation — the fallback, and the thing to beat</span></div>
    </div>
  </>,
);
/* Two frames, so the GL pass has certainly composited before the harness screenshots. */
requestAnimationFrame(() => requestAnimationFrame(() => { document.title = 'READY'; }));
