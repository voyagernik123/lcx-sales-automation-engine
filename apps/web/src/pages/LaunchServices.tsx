import { useState } from 'react';
import { request } from '@/lib/apiClient';

/**
 * THE PUBLIC SERVICES SECTION — the catalogue said out loud, and one small honest form.
 *
 * G1's inbound channel. Two rules shape everything here:
 *
 *  · THE BANDS ARE LABELLED INDICATIVE, because they are. What this page shows is the
 *    compiled catalogue's indicative range; the REAL price comes from an underwritten
 *    quote (G3), per engagement, and saying otherwise on a public page would promise a
 *    number nobody underwrote. When the owner approves the price-band packet the server
 *    starts quoting from HIS bands — this page's copy stays true either way because it
 *    claims a starting range, never a price.
 *  · THE FORM SAYS WHAT HAPPENS TO THE DATA, in the sentence next to the button: the
 *    email exists so LCX can respond, it lands in the services queue, nothing else is
 *    collected. The `website` field is the honeypot — hidden from humans, and the server
 *    answers a filled one exactly like a success so it teaches bots nothing.
 *
 * The five offers and their ranges are literals HERE, not imports from @lcx/shared —
 * this page is public and lazy-loaded, and pulling the catalogue module into its chunk
 * would drag the whole GPS type surface into the public bundle for five names and five
 * ranges. The launch page's own tests pin these against drift the same way they pin the
 * version and DMG size claims.
 */

export const PUBLIC_OFFERS: ReadonlyArray<{ key: string; name: string; range: string; line: string }> = [
  { key: 'diagnostic', name: 'Token Readiness Diagnostic', range: 'from $2.5k', line: 'Where your token actually stands — regulatory posture, venue readiness, the gaps, in writing.' },
  { key: 'mica_whitepaper', name: 'MiCA White Paper — Drafting & Submission', range: 'from $15k', line: 'The Annex-compliant paper, drafted and shepherded to submission, by the venue that reads them for a living.' },
  { key: 'legal_opinion_coordination', name: 'Legal Opinion Coordination', range: 'from $10k', line: 'Scoping, counsel selection and the fact package — counsel’s own fees stay counsel’s own.' },
  { key: 'gtm_sprint', name: 'GTM / TGE Strategy Sprint', range: 'from $12k', line: 'Two to three weeks to a launch plan with dates, venues and numbers a desk can execute.' },
  { key: 'marketing_activation', name: 'Marketing & Community Activation', range: 'from $12k', line: 'One activation programme, compliance-gated copy included. Jurisdiction limits apply and are checked first.' },
];

export function LaunchServices() {
  const [form, setForm] = useState({ projectName: '', url: '', email: '', offerInterest: 'unsure', jurisdiction: '', message: '', website: '' });
  const [state, setState] = useState<'idle' | 'sending' | 'received' | 'failed'>('idle');

  const submit = async () => {
    setState('sending');
    try {
      await request('/v1/services/intake', {
        method: 'POST',
        auth: false,
        body: {
          projectName: form.projectName,
          url: form.url.trim() === '' ? null : form.url.trim(),
          email: form.email,
          offerInterest: form.offerInterest,
          jurisdiction: form.jurisdiction.trim() === '' ? null : form.jurisdiction.trim(),
          message: form.message,
          website: form.website,
        },
      });
      setState('received');
    } catch {
      setState('failed');
    }
  };

  const field = (k: keyof typeof form) => ({
    value: form[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value })),
  });

  return (
    <div className="mt-14 border-t border-line pt-10" data-testid="launch-services">
      <h2 className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-grey">
        Services · the launch stack
      </h2>
      <p className="mt-5 max-w-xl text-[13px] leading-relaxed text-grey">
        The desk behind this app also does the work itself. Ranges below are indicative
        starting points — every engagement is priced individually, against its own scope,
        before anything is signed.
      </p>

      <dl className="mt-6 grid gap-x-8 gap-y-5 sm:grid-cols-2">
        {PUBLIC_OFFERS.map((o) => (
          <div key={o.key} className="flex flex-col gap-1">
            <dt className="font-mono text-[12px] font-semibold text-navy">
              {o.name} <span className="font-normal text-grey">· {o.range}, indicative</span>
            </dt>
            <dd className="text-[13px] leading-relaxed text-grey">{o.line}</dd>
          </div>
        ))}
      </dl>

      {state === 'received' ? (
        <p className="mt-8 max-w-xl border border-line p-4 text-[13px] leading-relaxed text-navy" data-testid="intake-received">
          Received. A human reads this queue — you will hear back at the address you gave,
          and from nowhere else.
        </p>
      ) : (
        <form
          className="mt-8 grid max-w-xl gap-3"
          data-testid="intake-form"
          onSubmit={(e) => { e.preventDefault(); void submit(); }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <input required aria-label="project name" placeholder="Project name" maxLength={120}
              className="border border-control bg-transparent px-2 py-1.5 text-[13px]" {...field('projectName')} />
            <input required aria-label="email" type="email" placeholder="Email (so we can respond)" maxLength={254}
              className="border border-control bg-transparent px-2 py-1.5 text-[13px]" {...field('email')} />
            <input aria-label="project url" placeholder="Website (optional)" maxLength={300}
              className="border border-control bg-transparent px-2 py-1.5 text-[13px]" {...field('url')} />
            <select aria-label="service of interest"
              className="border border-control bg-transparent px-2 py-1.5 text-[13px]" {...field('offerInterest')}>
              <option value="unsure">Not sure yet</option>
              {PUBLIC_OFFERS.map((o) => <option key={o.key} value={o.key}>{o.name}</option>)}
            </select>
          </div>
          <textarea aria-label="message" placeholder="One or two sentences on where you are (optional, 500 chars)"
            maxLength={500} rows={3}
            className="border border-control bg-transparent px-2 py-1.5 text-[13px]" {...field('message')} />
          {/* The honeypot: absent from the visual page, present in the DOM. Humans never fill it. */}
          <input aria-hidden="true" tabIndex={-1} autoComplete="off"
            style={{ position: 'absolute', left: '-9999px', width: 1, height: 1 }}
            placeholder="website" {...field('website')} />
          <div className="flex items-center justify-between gap-4">
            <p className="text-[11px] leading-relaxed text-grey">
              Your email is collected to respond to this request and lands in LCX’s services
              queue. Nothing else is collected here.
            </p>
            <button type="submit" disabled={state === 'sending'}
              className="shrink-0 border border-navy px-4 py-1.5 font-mono text-[12px] font-semibold uppercase tracking-wider text-navy transition-opacity hover:opacity-70 disabled:opacity-40">
              {state === 'sending' ? 'Sending…' : 'Start the conversation'}
            </button>
          </div>
          {state === 'failed' && (
            <p className="text-[12px] text-status-blocked" role="alert" data-testid="intake-failed">
              That did not go through. Try again in a minute, or write to the desk directly.
            </p>
          )}
        </form>
      )}
    </div>
  );
}
