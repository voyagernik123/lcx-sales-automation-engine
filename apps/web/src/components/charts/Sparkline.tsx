import { useEffect, useMemo, useRef, useState } from 'react';
import { CARD_FILL, CHART_BAD, CHART_GOOD, seriesVar } from './palette';
import { resolveColour } from './gl/FlatBars';
import { useFlatLine } from './gl/FlatLine';

export interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  /** Line color; defaults to series slot 1. */
  stroke?: string;
  /**
   * When set, the last segment and end-dot are colored with the status
   * colors: true → --chart-good, false → --chart-bad. Unset → stroke color.
   */
  good?: boolean;
  /** Optional area wash under the line at 10% opacity. */
  area?: boolean;
}

/** Tiny trend line: 2px round-capped stroke, ringed end-dot, no axes, no grid. */
export function Sparkline({
  data,
  width = 96,
  height = 28,
  stroke = seriesVar(1),
  good,
  area = false,
}: SparklineProps) {
  const n = data.length;
  const hostRef = useRef<HTMLSpanElement | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => { if (hostRef.current) setReady(true); }, []);

  // 5px padding keeps the r=4 end-dot + 2px surface ring inside the viewBox.
  const pad = 5;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const flat = max === min;
  const xs =
    n === 1
      ? [width / 2]
      : data.map((_, i) => pad + (i * (width - pad * 2)) / (n - 1));
  const ys = data.map((v) =>
    flat ? height / 2 : height - pad - ((v - min) / (max - min)) * (height - pad * 2)
  );
  const points = xs.map((x, i) => `${x},${ys[i]}`).join(' ');
  const endColor = good === undefined ? stroke : good ? CHART_GOOD : CHART_BAD;

  /* The GL line, in the SVG's own viewBox units so the two layers cannot drift.
     The status TAIL is a second path rather than an overdraw — under source-over an
     overdraw would be fine, but a separate run also keeps the tail's own colour exact
     rather than blended with the base beneath it. */
  const glLines = useMemo(() => {
    if (n < 2) return [];
    const el = hostRef.current;
    const base = el ? resolveColour(stroke, el) : '';
    const tail = el ? resolveColour(endColor, el) : '';
    const xy = (from: number, to: number) => {
      const f = new Float32Array((to - from + 1) * 2);
      for (let i = from; i <= to; i++) { f[(i - from) * 2] = xs[i]!; f[(i - from) * 2 + 1] = ys[i]!; }
      return f;
    };
    const last = good === undefined ? n - 1 : n - 2;
    const out = [{ points: xy(0, last), colour: base, halfWidth: 1.15 }];
    if (good !== undefined) out.push({ points: xy(n - 2, n - 1), colour: tail, halfWidth: 1.15 });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.join(','), stroke, endColor, good, width, height, ready]);

  const { canvas: glCanvas, refused: glRefused } = useFlatLine({
    lines: glLines, viewW: width, viewH: height,
  });

  if (n === 0) return null;

  return (
    <span ref={hostRef} className="relative inline-block shrink-0" style={{ width, height }}>
    {glCanvas}
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="relative z-10 block"
      aria-hidden="true"
      focusable="false"
    >
      {area && n > 1 && (
        <polygon
          points={`${xs[0]},${height - pad} ${points} ${xs[n - 1]},${height - pad}`}
          fill={stroke}
          opacity={0.1}
        />
      )}
      {/* FALLBACK: server render, print, no WebGL2, first paint. */}
      {n > 1 && glRefused && (
        <polyline
          points={points}
          fill="none"
          stroke={stroke}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}
      {n > 1 && good !== undefined && glRefused && (
        <line
          x1={xs[n - 2]}
          y1={ys[n - 2]}
          x2={xs[n - 1]}
          y2={ys[n - 1]}
          stroke={endColor}
          strokeWidth={2}
          strokeLinecap="round"
        />
      )}
      {/* End-dot: r=4 with a 2px ring in the surface color so it stays legible. */}
      {/* THE END-DOT STAYS SVG ON BOTH PATHS. Its legibility comes from a 2px ring in the
          card colour OCCLUDING the line behind it, and an additive-or-alpha layer over a
          transparent canvas has no surface colour to occlude with. */}
      <circle cx={xs[n - 1]} cy={ys[n - 1]} r={4} fill={endColor} stroke={CARD_FILL} strokeWidth={2} />
    </svg>
    </span>
  );
}
