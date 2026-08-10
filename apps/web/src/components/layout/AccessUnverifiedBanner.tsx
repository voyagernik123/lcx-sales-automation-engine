import { clsx } from 'clsx';
import { ShieldQuestion } from 'lucide-react';
import { useAccessUnverified } from '@/stores/useAccessStore';

/**
 * THE SHELL IS SHOWING YOU EVERYTHING BECAUSE IT DOES NOT KNOW WHAT YOU HOLD.
 *
 * On 2026-08-10 the grants table was unreachable and `/v1/access/me` threw, so the operator
 * signed in and landed on an empty workspace launcher with every panel erroring, and nothing
 * on screen said why. Reported as "login issue and api down".
 *
 * That is now three states rather than two — a grant, no grant, and NOT KNOWN — and this
 * strip is the third one made visible. Without it the fix would be worse than the bug: the
 * shell would show every compartment as if the operator held them, which is the same
 * confident-looking lie in the opposite direction.
 *
 * WHY IT SAYS THE SERVER STILL ENFORCES. The optimistic shell is not a security hole and the
 * operator should not have to wonder: `routes/access.ts` degrades the map to EMPTY and never
 * to legacy or full, and every compartment route re-checks on the server. What is optimistic
 * is the NAVIGATION, not the authorisation. Saying so is the difference between a degraded
 * instrument and one an operator stops trusting.
 *
 * `role="status"`, not `alert`: nothing here is urgent to a screen-reader user mid-task, and
 * an assertive live region would interrupt whatever they were reading.
 */
export function AccessUnverifiedBanner({ className }: { className?: string }) {
  const unverified = useAccessUnverified();
  if (!unverified) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={clsx(
        'flex shrink-0 items-start gap-2 border-b border-cyan-300 bg-cyan-50 px-4 py-1.5',
        'dark:border-cyan-800 dark:bg-cyan-950/20',
        className,
      )}
    >
      <ShieldQuestion size={13} className="mt-px shrink-0 text-cyan-700 dark:text-cyan-400" />
      <span className="shrink-0 text-micro font-bold uppercase tracking-wider text-cyan-800 dark:text-cyan-300">
        Access unverified
      </span>
      <span className="min-w-0 text-micro text-cyan-900/90 dark:text-cyan-300/80">
        {unverified.reason} Every compartment is shown because your grants could not be read —
        not because you hold them. The server still checks each one, so anything you are not
        entitled to will be refused when you open it.{' '}
        {/* The driver code, so an operator pasting a screenshot to whoever fixes it carries the
            one fact that distinguishes the causes. */}
        <span className="font-mono opacity-70">({unverified.code})</span>
      </span>
    </div>
  );
}
