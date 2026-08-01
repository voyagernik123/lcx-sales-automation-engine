import { clsx } from 'clsx';
import { AlertTriangle, Ban } from 'lucide-react';
import { mergedMetaNotices, type MetaNotice } from '@/lib/api/meta';

/**
 * THE ENVELOPE, ON THE SCREEN.
 *
 * `lib/api/meta.ts` got `meta` as far as the browser. That fixed the fetch layer and
 * changed nothing an operator sees, which is not a fix: the original defect was that
 * `migrated: false`, a placeholder rate card and a compiled-placeholder perimeter all
 * rendered as ordinary numbers. Eight GPS modules carried the envelope and exactly one
 * component read it.
 *
 * So this is the one renderer, wired into every GPS surface beside the reads it
 * describes. It is deliberately NOT in `components/` — those files belong to another
 * owner, and a GPS-specific statement about GPS provenance has no other consumer.
 *
 * WHY A BANNER AND NOT A SHADED FIGURE. D3: the uncertainty sits BESIDE the estimate,
 * never inside it. A figure quietly discounted for being a placeholder is a figure
 * nobody can argue with; a figure printed at full size with "the rate card under this
 * is a placeholder" above it is arguable, which is the property the whole compartment
 * is built for.
 *
 * IT CANNOT BE DISMISSED, COLLAPSED OR SNOOZED. Every notice is derived from the
 * envelope on each render, so it disappears the moment the server stops saying it and
 * cannot go stale in the other direction.
 */
export function GpsMetaBanner({ of, className }: { of: readonly unknown[]; className?: string }) {
  return <GpsMetaNotices notices={mergedMetaNotices(of)} className={className} />;
}

/**
 * The same statement from an already-derived list.
 *
 * `pages/GpsConflict.tsx` needs this: it reads three endpoints inside one async
 * `load()` and keeps none of the payloads, so it derives the notices there and holds
 * those instead of holding two full arrays in state to re-derive from on every render.
 */
export function GpsMetaNotices(
  { notices, className }: { notices: readonly MetaNotice[]; className?: string },
) {
  if (notices.length === 0) return null;
  return (
    <section
      aria-label="What this read declares about itself"
      data-testid="gps-meta-banner"
      className={clsx('space-y-1.5', className ?? 'mt-4')}
    >
      {notices.map((n) => <MetaNoticeRow key={n.id} notice={n} />)}
    </section>
  );
}

/**
 * One notice. Tone tokens are the house ones (`Statement` in `GpsDelivery.tsx` uses the
 * same three), so a refusal here reads as a refusal everywhere else in the compartment.
 */
function MetaNoticeRow({ notice }: { notice: MetaNotice }) {
  const refusal = notice.tone === 'refusal';
  const Icon = refusal ? Ban : AlertTriangle;
  return (
    <div
      role="note"
      data-notice={notice.id}
      className={clsx(
        'border-l-2 px-2 py-1.5',
        refusal
          ? 'border-status-blocked/50 bg-status-blocked-bg text-status-blocked'
          : 'border-status-conditional/50 bg-status-conditional-bg text-status-conditional',
      )}
    >
      <p className="flex items-start gap-1.5 text-micro font-semibold leading-snug">
        <Icon size={11} className="mt-0.5 shrink-0" aria-hidden="true" />
        <span>{notice.headline}</span>
      </p>
      <p className="mt-1 pl-4 text-micro leading-snug text-grey">{notice.detail}</p>
    </div>
  );
}

export default GpsMetaBanner;
