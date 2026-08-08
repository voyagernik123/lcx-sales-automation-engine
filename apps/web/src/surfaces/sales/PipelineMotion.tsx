import { useEffect, useMemo, useRef, useState } from 'react';
import { Activity } from 'lucide-react';
import { request } from '@/lib/apiClient';
import { buildMotionGeometry, isMotionGeometry, type MotionPayload, type MotionOutcome } from './motionGeometry';
import type { MotionLabel } from './renderMotion';

/**
 * S6 · PIPELINE IN MOTION, mounted beside the Kanban it answers.
 *
 * `DealBoard` can tell you a deal is in Proposal. It cannot tell you the deal has been in
 * Proposal for seven weeks, because a column has no time in it — and on the current book
 * dwell runs from 3 days to 49. This draws each deal as a staircase: a horizontal run whose
 * LENGTH is how long it sat in that stage, then a step up at the moment it moved.
 *
 * ── THE GPU CODE IS BEHIND A DYNAMIC import() ───────────────────────────────────────
 * Not for tidiness. `@lcx/gl` plus this renderer is real weight, and the perf budget has
 * 13 KB of initial-JS headroom (`apps/web/scripts/check-bundle.mjs`). Loading it only when
 * the panel is opened keeps it out of the board's own chunk for every operator who never
 * opens it. The geometry builder above is NOT dynamic — it is pure arithmetic, it is what
 * decides whether there is anything honest to draw, and that decision has to be available
 * before a single byte of WebGL is fetched.
 */

interface Props {
  /** Rendered collapsed by default: the board is the primary surface, this answers it. */
  readonly defaultOpen?: boolean;
}

type Load =
  | { readonly state: 'idle' }
  | { readonly state: 'loading' }
  | { readonly state: 'failed'; readonly message: string }
  | { readonly state: 'ready'; readonly payload: MotionPayload };

export function PipelineMotion({ defaultOpen = false }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const [load, setLoad] = useState<Load>({ state: 'idle' });
  const [refusal, setRefusal] = useState<{ code: string; reason: string } | null>(null);
  const [labels, setLabels] = useState<MotionLabel[]>([]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const disposeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!open || load.state !== 'idle') return;
    const controller = new AbortController();
    setLoad({ state: 'loading' });
    request<{ data: MotionPayload }>('/v1/deals/motion', { auth: true, signal: controller.signal })
      .then((res) => setLoad({ state: 'ready', payload: res.data }))
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === 'AbortError') return;
        setLoad({ state: 'failed', message: err instanceof Error ? err.message : 'Request failed' });
      });
    return () => controller.abort();
  }, [open, load.state]);

  const geometry: MotionOutcome | null = useMemo(
    () => (load.state === 'ready' ? buildMotionGeometry(load.payload) : null),
    [load],
  );

  useEffect(() => {
    if (!geometry || !canvasRef.current) return;
    let cancelled = false;
    // The dynamic import is the whole point — see the header.
    void import('./renderMotion').then(({ renderMotion }) => {
      if (cancelled || !canvasRef.current) return;
      const out = renderMotion(canvasRef.current, geometry, setLabels);
      if (out.kind === 'refused') {
        setRefusal({ code: out.code, reason: out.reason });
      } else {
        setRefusal(null);
        disposeRef.current = out.dispose;
      }
    });
    return () => {
      cancelled = true;
      disposeRef.current?.();
      disposeRef.current = null;
    };
  }, [geometry]);

  const geo = geometry && isMotionGeometry(geometry) ? geometry : null;

  return (
    <section className="mt-6 rounded-lg border border-line bg-panel" data-testid="pipeline-motion">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left"
        aria-expanded={open}
      >
        <Activity size={15} className="text-grey" aria-hidden="true" />
        <span className="text-sm font-medium">How long each deal actually took</span>
        <span className="ml-auto text-micro text-grey">
          {open ? 'Hide' : 'The board shows where deals are, not how they are moving'}
        </span>
      </button>

      {open && (
        <div className="border-t border-line px-4 pb-4 pt-3">
          {load.state === 'loading' && <p className="py-8 text-center text-xs text-grey">Reading the deal history…</p>}
          {load.state === 'failed' && (
            <p className="py-8 text-center text-xs text-grey" data-testid="motion-failed">
              The deal history could not be loaded ({load.message}). The board above is unaffected.
            </p>
          )}

          {geometry && !isMotionGeometry(geometry) && (
            /* NOT an empty state. The pipeline is not empty — these deals exist and are on
               the board above. What is absent is the recorded history needed to place them
               in time, and saying "no data" would blame the wrong thing. */
            <div className="py-6" data-testid="motion-refused">
              <p className="font-mono text-micro tracking-widest text-grey">{geometry.code}</p>
              <p className="mt-2 max-w-2xl text-sm text-fg">{geometry.reason}</p>
            </div>
          )}

          {refusal && (
            <div className="py-6" data-testid="motion-gl-refused">
              <p className="font-mono text-micro tracking-widest text-grey">{refusal.code}</p>
              <p className="mt-2 max-w-2xl text-sm text-fg">{refusal.reason}</p>
              <p className="mt-2 max-w-2xl text-micro text-grey">
                The board above shows the same deals; what is unavailable here is only the
                three-dimensional view of when they moved.
              </p>
            </div>
          )}

          <div className={`relative overflow-hidden rounded-md ${refusal || (geometry && !isMotionGeometry(geometry)) ? 'hidden' : ''}`}>
            <canvas ref={canvasRef} width={2560} height={1100} className="block w-full" style={{ aspectRatio: '2560 / 1100' }} />
            <div className="pointer-events-none absolute inset-0">
              {labels.filter((l) => l.kind === 'stage').map((l) => (
                <span
                  key={`s-${l.text}`}
                  className="absolute ml-3 whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.13em] text-grey"
                  style={{ left: l.sx, top: l.sy, transform: 'translate(0,-145%)' }}
                >
                  {l.text}
                </span>
              ))}
            </div>
          </div>

          {geo && (
            <>
              <div className="relative mt-2 h-4">
                {labels.filter((l) => l.kind === 'time').map((l) => (
                  <span
                    key={`t-${l.text}`}
                    className="absolute top-0 whitespace-nowrap font-mono text-[10px] text-grey"
                    style={{ left: l.sx, transform: 'translate(-50%,0)' }}
                  >
                    {l.text}
                  </span>
                ))}
              </div>

              <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-grey">
                <li>Longer and warmer = sat there longer</li>
                <li>Brightest bars are still running — the deal has not moved since</li>
                <li>Depth is the deal&apos;s value</li>
              </ul>

              {geo.censoredRecent > 0 && (
                <p className="mt-3 max-w-4xl text-micro text-amber" data-testid="motion-censoring">
                  {geo.censoredRecent} of {geo.drawnDeals} deals entered within the last{' '}
                  {geo.stallAnchors.slow.toFixed(0)} days, so they <strong>cannot yet</strong> show a stall
                  that long. The right-hand side is cooler because it is censored by the observation
                  window, not because the desk got faster.
                </p>
              )}

              <p className="mt-2 text-micro text-grey">
                {geo.drawnDeals} deals · {geo.risers.length} recorded moves · &ldquo;stalled&rdquo; is
                anchored on this book&apos;s own dwell ({geo.stallAnchors.fast.toFixed(0)}d at the 25th
                percentile → {geo.stallAnchors.slow.toFixed(0)}d at the 90th), not on a fixed threshold.
              </p>

              {geo.excluded.length > 0 && (
                <details className="mt-3" data-testid="motion-excluded">
                  <summary className="cursor-pointer text-micro text-grey">
                    {geo.excluded.length} deal{geo.excluded.length === 1 ? '' : 's'} could not be drawn — and why
                  </summary>
                  <ul className="mt-2 space-y-1.5">
                    {geo.excluded.map((e) => (
                      <li key={`${e.dealId}-${e.reason.slice(0, 12)}`} className="text-micro text-grey">
                        <span className="font-medium text-fg">{e.label}</span> — {e.reason}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
