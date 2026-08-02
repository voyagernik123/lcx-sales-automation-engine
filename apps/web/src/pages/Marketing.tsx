import { Megaphone } from 'lucide-react';
import { PageTitle } from '@/components/ui';
import { MarketingDesk } from './MarketingDesk';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  LCX MARKETING — the door into the desk
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * This page used to be the whole compartment: a queue, a model's suggestion, an Approve
 * button and a Copy button. It made four claims the backend could not support, and they
 * are gone rather than softened, because each one was the kind of claim that gets
 * believed:
 *
 *  · "triaged, drafted by AI, approved by a human" — NOTHING TRIAGED ANYTHING. `status`
 *    is a workflow position, and `ignored` collapsed "not about us", "deliberately not
 *    engaging" and "this is a scam account" into one word. The triage board is where that
 *    decision now lives, in the RESIST 2 vocabulary, and the silence log is where the
 *    third of those judgements is recorded instead of being lost.
 *  · "Approved — copy it into X to send." — approval was ungated for copying, so a
 *    `proposed`, flagged draft could leave with no record anywhere, and `answered` was set
 *    on approval when nothing had been sent. Taking the text is now its own recorded act,
 *    bound to a hash of exactly the characters taken.
 *  · "Oldest waiting" as a plain number — it was computed from the notification email's
 *    Date header, so it measured mail-forwarding latency and flattered the desk by exactly
 *    the delay. The clock now refuses to report a wait it cannot honestly measure, and
 *    prints its coverage beside every aggregate.
 *  · The Admiralty grade, captioned "how much to trust this record" — the mailbox has no
 *    sender check at all, so a fabricated reply arrives graded identically to a real one.
 *    The grade is still shown; the caption now says what it is not.
 *
 * WHAT SURVIVED UNCHANGED, because it was the one thing this page always got right: there
 * is no posting path. No send, no schedule, no publish, no stored credential, no route
 * behind any of them. A defect in this compartment cannot speak for LCX, and that is
 * because of an absence rather than because of a control.
 */
export function Marketing() {
  return (
    <div className="p-5">
      <PageTitle
        icon={<Megaphone size={20} />}
        subtitle="Inbound items triaged against a stated taxonomy, drafts refused against the rule that refuses them, silences recorded, and no way to publish from here."
      >
        Marketing Desk
      </PageTitle>

      <p className="mb-3 max-w-3xl text-label leading-snug text-grey">
        Two constraints shape everything on this page and neither is a preference. There is no X API
        credential and there never will be, so every count here is a lower bound over one mailbox and carries
        the frame that says what it could not see. And nothing in this compartment may act as the LCX account,
        so a cleared draft is text a named human takes by hand — the taking is recorded, the sending happens
        outside this system, and that gap is the guarantee.
      </p>

      <MarketingDesk />
    </div>
  );
}
