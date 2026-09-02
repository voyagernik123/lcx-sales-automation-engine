import { useState, type ReactNode, useRef, useEffect } from 'react';
import { Button, SectionLabel } from '@/components/ui';
import type { MarketingReply } from '@/lib/api/marketing';
import { Absent, Refused } from './DeskAtoms';
import { recordTriage } from './deskApi';
import {
  ATTRIBUTION_MIN_CONCURRING,
  CONFIDENCE_DEFINITION,
  FIRST_INDICATOR_QUESTION,
  PRIORITY_MEANING,
  REACH_LEVEL_DESCRIPTION,
  type Confidence,
  type FirstIndicator,
  type PriorityTier,
  type ReachLevel,
  type Refusal,
  type Verifiability,
} from './vocabulary';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  ONE ITEM'S ASSESSMENT — the taxonomy as a form an operator can finish
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The order is the doctrine's order and it is load-bearing. The opinion gate is first
 * because it disposes of most of the queue; the response action is last because it is
 * the only field that commits the desk to anything.
 *
 * Every label here is RESIST 2's own wording. Not out of deference — out of the same
 * instinct that keeps `ART_7_1_E_STATEMENT_*` verbatim: a paraphrase of "opinions
 * cannot be verifiably false" is a second, unsourced rule that will drift from the one
 * the compartment claims to implement.
 *
 * WHAT THIS FORM WILL NOT DO:
 *  · It will not offer attribution. Two named humans must concur and this desk has one
 *    shared passcode, so the field is absent rather than disabled-with-a-tooltip.
 *  · It will not privilege "reply publicly". It is one of nine, listed among them.
 *  · It will not accept `ignore` or `do not engage` without a rationale, because that
 *    rationale is the whole of what turns silence from absence-of-evidence into
 *    evidence.
 *  · It will not tell you it recorded anything it did not record.
 */

const VERIFIABILITY: readonly { value: Verifiability; label: string; note: string }[] = [
  {
    value: 'opinion',
    label: 'An opinion',
    note: 'Opinions are usually subjective, which means they cannot be verifiably false. Do not treat it as disinformation. The correction path is closed for this item — what remains is to engage on the merits, or not at all.',
  },
  {
    value: 'verifiable_factual',
    label: 'A verifiable factual claim',
    note: 'It asserts something that can be shown true or false. Eligible for a correction.',
  },
  {
    value: 'opinion_resting_on_false_fact',
    label: 'An opinion resting on a false fact',
    note: 'The view is subjective but the premise under it is verifiably false, deceptive or manipulated, and has the potential to cause harm. Correct the premise, not the opinion.',
  },
];

const INDICATORS: readonly FirstIndicator[] = ['fabrication', 'identity', 'rhetoric', 'symbolism', 'technology'];
const REACH: readonly ReachLevel[] = ['little_interest', 'filter_bubble', 'trending', 'minor_story', 'headline_story'];
const TIERS: readonly PriorityTier[] = ['high', 'medium', 'low'];
const CONFIDENCES: readonly Confidence[] = ['H', 'M', 'L'];

/**
 * The nine, in RESIST/CERC order rather than in an order that flatters the desk. A
 * platform report plus an owned-channel warning — not a reply — is the correct handling
 * of an impersonation account, which is the indicator that fires most often for a venue.
 */
const ACTIONS: readonly { value: string; label: string; needsRationale: boolean }[] = [
  { value: 'ignore', label: 'Do not engage — and record why', needsRationale: true },
  { value: 'monitor', label: 'Monitor against the baseline, review later', needsRationale: true },
  { value: 'prepare_line_hold', label: 'Prepare a line and hold it, unpublished', needsRationale: false },
  { value: 'reply_public', label: 'Reply in public (draft it, a human sends it by hand)', needsRationale: false },
  { value: 'owned_channel_statement', label: 'Say it on our own channel instead of replying', needsRationale: false },
  { value: 'direct_contact_author', label: 'Contact the author off-platform', needsRationale: true },
  { value: 'platform_report', label: 'Report to the platform (impersonation or fraud)', needsRationale: false },
  { value: 'escalate_internal', label: 'Escalate internally', needsRationale: false },
  { value: 'escalate_market_abuse', label: 'Escalate as possible market abuse', needsRationale: true },
];

const cls = 'w-full rounded border border-line bg-card px-2 py-1 text-micro text-navy focus-ring';

function Row({ label, children, help }: { label: string; children: ReactNode; help?: string }) {
  return (
    <div className="border-t border-line pt-2">
      <SectionLabel as="h3">{label}</SectionLabel>
      {help && <p className="mt-0.5 text-[10px] leading-snug text-grey">{help}</p>}
      <div className="mt-1">{children}</div>
    </div>
  );
}

export function TriageAssessment({ reply, onRecorded }: {
  reply: MarketingReply;
  onRecorded: () => void;
}) {
  const [verifiability, setVerifiability] = useState<Verifiability | null>(null);
  const [indicators, setIndicators] = useState<FirstIndicator[]>([]);
  const [confidence, setConfidence] = useState<Confidence>('L');
  const [reach, setReach] = useState<ReachLevel | null>(null);
  const [reachBasis, setReachBasis] = useState('');
  const [priority, setPriority] = useState<PriorityTier | null>(null);
  const [action, setAction] = useState<string>('');
  const [rationale, setRationale] = useState('');
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [routeAbsent, setRouteAbsent] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const chosen = ACTIONS.find((a) => a.value === action);
  const missing: string[] = [];
  if (!verifiability) missing.push('whether the message is an opinion');
  if (!reach) missing.push('a reach estimate');
  if (reach && reachBasis.trim() === '') missing.push('the basis for the reach estimate');
  if (!priority) missing.push('a priority tier');
  if (!action) missing.push('a response action');
  if (chosen?.needsRationale && rationale.trim() === '') missing.push('a rationale for this action');

  // Same guard as FactoryPanel: a record that resolves after unmount must not write state.
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const submit = async () => {
    if (!verifiability || !reach || !priority || !action) return;
    setBusy(true);
    setRefusal(null);
    setRouteAbsent(false);
    setDone(null);
    try {
      const wrote = await recordTriage({
        replyId: reply.id,
        verifiability,
        indicators,
        reach,
        reachBasis: reachBasis.trim(),
        confidence,
        priority,
        action,
        rationale: rationale.trim(),
      });
      if (!alive.current) return;
      if (wrote === null) {
        setRouteAbsent(true);
        return;
      }
      setDone('Recorded. The decision, its confidence, its basis and who took it are on the row now.');
      onRecorded();
    } catch (e) {
      if (!alive.current) return;
      setRefusal({
        code: 'DATA_ABSENT_NOT_ZERO',
        sentence: e instanceof Error && e.message ? e.message : 'The API refused to record this decision.',
        rule: {
          instrument: 'desk_policy',
          provision: 'a decision exists only once it is recorded',
          text: 'An assessment held only in a browser tab is not the record. Nothing was written, so this item is still undecided.',
        },
        recovery: {
          kind: 'not_recoverable',
          why: 'The sentence above is the API\'s own wording, not this screen\'s. Nothing here can retry into success.',
        },
        matched: null,
        ruleSetVersion: 1,
      });
    } finally {
      if (alive.current) setBusy(false);
    }
  };

  return (
    <div data-testid={`mkt-assessment-${reply.id}`} className="space-y-2 border border-line bg-card p-2">
      <Row
        label="1 · The opinion gate"
        help="RESIST 2's first question, and the one that disposes of most of the queue: is the message an opinion?"
      >
        <div className="space-y-1">
          {VERIFIABILITY.map((v) => (
            <label key={v.value} className="flex cursor-pointer items-start gap-1.5 text-micro">
              <input
                type="radio"
                name={`verifiability-${reply.id}`}
                className="mt-0.5"
                checked={verifiability === v.value}
                onChange={() => setVerifiability(v.value)}
              />
              <span>
                <span className="font-semibold text-navy">{v.label}</span>
                <span className="block text-[10px] leading-snug text-grey">{v.note}</span>
              </span>
            </label>
          ))}
        </div>
        {verifiability === 'opinion' && (
          <p
            data-testid="mkt-opinion-gate-closed"
            className="mt-1 border-l-2 border-status-blocked/50 bg-status-blocked-bg px-2 py-1.5 text-micro leading-snug text-status-blocked"
          >
            <strong>This is not disinformation and there is nothing here to debunk.</strong> The desk is not
            the arbiter of public debate. What is left is to engage on the merits or to say nothing — both
            are legitimate, and the second one needs a rationale like any other decision.
          </p>
        )}
      </Row>

      <Row
        label="2 · FIRST indicators"
        help="Sparse by design — most items fire none. Two fire constantly for a venue: identity (fake support and airdrop accounts) and symbolism (misuse of on-chain statistics)."
      >
        <div className="space-y-1">
          {INDICATORS.map((i) => (
            <label key={i} className="flex cursor-pointer items-start gap-1.5 text-micro">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={indicators.includes(i)}
                onChange={() => setIndicators((prev) => prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i])}
              />
              <span>
                <span className="font-semibold uppercase text-navy">{i}</span>
                <span className="block text-[10px] leading-snug text-grey">{FIRST_INDICATOR_QUESTION[i]}</span>
              </span>
            </label>
          ))}
        </div>
        {indicators.includes('identity') && (
          <p className="mt-1 border-l-2 border-line px-2 py-1 text-[10px] leading-snug text-grey">
            Identity is the one case where the right action is usually not a reply at all: report the account
            to the platform and warn on a channel we own. Answering an impersonator in their own thread gives
            the impersonation an audience.
          </p>
        )}
      </Row>

      <Row
        label="3 · Confidence"
        help="Per proposition, not per item — you can be highly confident something is false and have no idea who is behind it."
      >
        <div className="flex flex-wrap gap-2">
          {CONFIDENCES.map((c) => (
            <label key={c} className="flex cursor-pointer items-start gap-1 text-micro">
              <input
                type="radio"
                name={`confidence-${reply.id}`}
                className="mt-0.5"
                checked={confidence === c}
                onChange={() => setConfidence(c)}
              />
              <span className="font-mono font-bold text-navy">[{c}]</span>
            </label>
          ))}
        </div>
        <p className="mt-1 text-[10px] leading-snug text-grey">{CONFIDENCE_DEFINITION[confidence]}</p>
      </Row>

      <Row
        label="4 · Reach"
        help="An estimate, not a metric — which is exactly why it works with no API. Escalation between levels is the trigger, not the level."
      >
        <div className="space-y-1">
          {REACH.map((l) => (
            <label key={l} className="flex cursor-pointer items-start gap-1.5 text-micro">
              <input
                type="radio"
                name={`reach-${reply.id}`}
                className="mt-0.5"
                checked={reach === l}
                onChange={() => setReach(l)}
              />
              <span className="text-[10px] leading-snug text-grey">{REACH_LEVEL_DESCRIPTION[l]}</span>
            </label>
          ))}
        </div>
        <label className="mt-1 block">
          <span className="font-mono text-[10px] uppercase tracking-wider text-grey">
            why — required, because a grade with no basis is a feeling with a letter on it
          </span>
          <input
            className={cls}
            value={reachBasis}
            onChange={(e) => setReachBasis(e.target.value)}
            aria-label="Basis for the reach estimate"
          />
        </label>
      </Row>

      <Row label="5 · Priority" help="Outcome-focused. Does this represent a significant obstacle to LCX's priorities? If not, it is lower priority.">
        <div className="space-y-1">
          {TIERS.map((t) => (
            <label key={t} className="flex cursor-pointer items-start gap-1.5 text-micro">
              <input
                type="radio"
                name={`priority-${reply.id}`}
                className="mt-0.5"
                checked={priority === t}
                onChange={() => setPriority(t)}
              />
              <span>
                <span className="font-semibold uppercase text-navy">{t}</span>
                <span className="block text-[10px] leading-snug text-grey">{PRIORITY_MEANING[t]}</span>
              </span>
            </label>
          ))}
        </div>
      </Row>

      <Row label="6 · What the desk will do" help="Nine options. Replying in public is one of them, not the default.">
        <select
          className={cls}
          value={action}
          aria-label="Response action"
          onChange={(e) => setAction(e.target.value)}
        >
          <option value="">— choose —</option>
          {ACTIONS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
        </select>
        {chosen?.needsRationale && (
          <label className="mt-1 block">
            <span className="font-mono text-[10px] uppercase tracking-wider text-grey">
              rationale — required, and it is what puts this in the silence log
            </span>
            <textarea
              className={`${cls} min-h-[48px]`}
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
              aria-label="Rationale"
            />
          </label>
        )}
      </Row>

      {missing.length > 0 && (
        <p className="text-[10px] leading-snug text-status-conditional">
          Not recordable yet — still missing {missing.join(', ')}.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-2">
        <Button size="xs" onClick={() => void submit()} disabled={busy || missing.length > 0}>
          {busy ? 'Recording…' : 'Record this decision'}
        </Button>
        <span className="text-[10px] leading-snug text-grey">
          Attribution is not on this form: naming who is behind something needs at least{' '}
          {ATTRIBUTION_MIN_CONCURRING} humans to concur, and the desk credential is shared, so no row here
          could name them.
        </span>
      </div>

      {routeAbsent && (
        <Absent title="This environment cannot record a triage decision.">
          There is no triage route deployed here, so nothing was written and this item is still undecided.
          The assessment above is still on your screen and nowhere else — do not treat it as the record.
        </Absent>
      )}
      {refusal && <Refused r={refusal} />}
      {done && (
        <p role="note" className="border-l-2 border-status-ready/40 bg-status-ready-bg px-2 py-1.5 text-micro leading-snug text-status-ready">
          {done}
        </p>
      )}
    </div>
  );
}
