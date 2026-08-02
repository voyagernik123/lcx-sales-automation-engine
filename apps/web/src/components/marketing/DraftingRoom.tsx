import { useEffect, useMemo, useState } from 'react';
import { Bot, ClipboardCheck, Loader2 } from 'lucide-react';
import { Button, SectionLabel } from '@/components/ui';
import { AiProse } from '@/components/ai/AiProse';
import type { MarketingDraft, MarketingReply } from '@/lib/api/marketing';
import { Absent, Gate, NoPostingPath, Refused } from './DeskAtoms';
import { contentHash, recordHandoff, reviewText, type HandoffView, type ReviewVerdict } from './deskApi';
import { PRECHECK_RULESET_VERSION, composeGates, previewRefusals } from './preChecks';
import {
  ENGAGEMENT_VERBS,
  MARKETING_RULES_DISCLOSURE,
  VERB_ADOPTION,
  VERB_PRODUCES_OWN_TEXT,
  X_POST_MAX_CHARS,
  type EngagementVerb,
  type GateReading,
  type Refusal,
} from './vocabulary';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  THE DRAFTING ROOM — where the refusals arrive while you are still typing
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The old surface showed a model's suggestion, a red line reading `flag_reason`, an
 * Approve button and a Copy button. Four things were wrong with that and all four are
 * fixed here rather than softened:
 *
 *  1. THERE WAS NO EDIT BOX, so "approved" could never mean "this exact text". There is
 *     one now — and because no route saves an edit, this surface says plainly that an
 *     edited draft is NOT what the approval covers, instead of implying it is.
 *  2. COPY WAS UNGATED. A `proposed`, flagged draft could be pasted into X with no
 *     record anywhere. Taking the text now writes a handoff record bound to the SHA-256
 *     of exactly the characters taken, and if that record cannot be written the text
 *     does not reach the clipboard. Nothing leaves without a record.
 *  3. THE VERB WAS INVISIBLE. A like and a reply were the same weight. The verb is the
 *     act: a like produces no text of ours and still adopts everything the target said.
 *  4. THE GATES WERE ONE BOOLEAN. Claim safety, market abuse and regime are three
 *     different questions with three different answers, and a gate nobody answered is
 *     shown as unanswered rather than as clean.
 *
 * HONEST LIMIT OF THE CLIPBOARD GATE, stated because a control that overclaims is
 * worse than none: an operator can select the text with a mouse and copy it, and no
 * browser can prevent that. What this design guarantees is that the recorded path is
 * the easy one and the unrecorded path leaves a hole in the record — a published post
 * with no handoff row is visible as such, which is the whole point.
 */

const REVIEW_DEBOUNCE_MS = 600;

export function DraftingRoom({ reply, draft, onDraft, onApprove, busy }: {
  reply: MarketingReply;
  draft: MarketingDraft | undefined;
  onDraft: () => void;
  onApprove: (d: MarketingDraft) => void;
  busy: boolean;
}) {
  const [verb, setVerb] = useState<EngagementVerb>('reply');
  const [promotes, setPromotes] = useState(false);
  const [text, setText] = useState('');
  const [engine, setEngine] = useState<ReviewVerdict | null>(null);
  const [engineChecked, setEngineChecked] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [handoff, setHandoff] = useState<HandoffView | null>(null);
  const [handoffAbsent, setHandoffAbsent] = useState(false);
  const [refusal, setRefusal] = useState<Refusal | null>(null);

  /* The stored draft is the baseline the approval covers. Held separately from `text`
     so "edited" is a fact this surface can state rather than a guess. */
  const stored = draft?.body ?? '';
  useEffect(() => { setText(stored); setHandoff(null); }, [stored]);
  const edited = draft !== undefined && text !== stored;

  /* LIVE, ON EVERY KEYSTROKE, WITH NO NETWORK. Arithmetic and literal phrases only —
     see preChecks.ts for why nothing more may live in a component. */
  const pre = useMemo(
    () => previewRefusals({ text, verb, promotesOfferOrListing: promotes }),
    [text, verb, promotes],
  );

  /* THE ENGINE, DEBOUNCED. Not on a keystroke: this is a round trip, and the pre-checks
     are what keep the surface responsive while it is in flight. */
  useEffect(() => {
    if (text.trim() === '') { setEngine(null); setEngineChecked(false); return; }
    let live = true;
    setReviewing(true);
    const t = setTimeout(() => {
      void reviewText({ text, verb, draftId: draft?.id, replyId: reply.id })
        .then((v) => { if (live) { setEngine(v); setEngineChecked(true); } })
        .catch(() => { if (live) { setEngine(null); setEngineChecked(true); } })
        .finally(() => { if (live) setReviewing(false); });
    }, REVIEW_DEBOUNCE_MS);
    return () => { live = false; clearTimeout(t); };
  }, [text, verb, draft?.id, reply.id]);

  const gates: GateReading[] = useMemo(() => composeGates({
    pre,
    engine,
    engineAbsentBecause: engineChecked
      ? 'The compartment\'s review engine is not deployed on this environment.'
      : 'The review engine has not answered for this text yet.',
  }), [pre, engine, engineChecked]);

  const blocking = gates.flatMap((g) => g.refusals);
  const anyUnchecked = gates.some((g) => g.source === 'absent');

  /* ── TAKING THE TEXT. The only way text leaves, and it is a recorded act. ─── */
  const take = async () => {
    setRefusal(null);
    setHandoffAbsent(false);
    if (!draft) return;
    const hash = await contentHash(text);
    if (hash === null) {
      setRefusal({
        code: 'PUBLISHED_TEXT_NOT_PASTED_BACK',
        sentence: 'This browser cannot hash the text, so a handoff record could not be bound to it — and nothing was copied.',
        rule: {
          instrument: 'desk_policy',
          provision: 'nothing leaves without a record',
          text: 'The handoff record binds to a content hash and never to a row id: a record naming a draft id says nothing about which characters were carried out of the building.',
        },
        recovery: {
          kind: 'wait_until',
          condition: 'the desk is opened over HTTPS — WebCrypto is unavailable on an insecure origin, and there is no weaker hash this record may fall back to',
        },
        matched: null,
        ruleSetVersion: PRECHECK_RULESET_VERSION,
      });
      return;
    }
    try {
      const rec = await recordHandoff(draft.id, hash, verb);
      if (rec === null) { setHandoffAbsent(true); return; }
      await navigator.clipboard.writeText(text);
      setHandoff(rec);
    } catch (e) {
      setRefusal({
        code: 'PUBLISHED_TEXT_NOT_PASTED_BACK',
        sentence: e instanceof Error && e.message ? e.message : 'The handoff could not be recorded, and the text was not copied.',
        rule: {
          instrument: 'desk_policy',
          provision: 'nothing leaves without a record',
          text: 'No copy path, no export and no approval without an audit row that names the human. The API refused to write the row, so the clipboard was left alone.',
        },
        recovery: {
          kind: 'not_recoverable',
          why: 'The sentence above is the API\'s own. Fix what it names rather than working around it — reading the text off the screen is available and leaves the hole in the record visible, which is the point.',
        },
        matched: null,
        ruleSetVersion: PRECHECK_RULESET_VERSION,
      });
    }
  };

  return (
    <div data-testid={`mkt-drafting-${reply.id}`} className="space-y-2 border border-line bg-card p-2">
      <SectionLabel as="h3">The drafting room</SectionLabel>

      {/* ── THE VERB. First, because it decides what is even under review. ───── */}
      <div className="border-t border-line pt-2">
        <SectionLabel as="h3">The act</SectionLabel>
        <p className="mt-0.5 text-[10px] leading-snug text-grey">
          The object under review is never the text alone — it is the verb, the target and the author. A like
          and a reply are not the same act and are not the same exposure.
        </p>
        <div className="mt-1 flex flex-wrap gap-2">
          {ENGAGEMENT_VERBS.map((v) => (
            <label key={v} className="flex cursor-pointer items-center gap-1 text-micro">
              <input
                type="radio"
                name={`verb-${reply.id}`}
                checked={verb === v}
                onChange={() => setVerb(v)}
              />
              <span className="font-mono text-navy">{v}</span>
            </label>
          ))}
        </div>
        <p className="mt-1 font-mono text-[10px] leading-snug text-grey">
          {verb} · {VERB_ADOPTION[verb].replace(/_/g, ' ')}
          {!VERB_PRODUCES_OWN_TEXT[verb] && ' · produces no text of ours, so there is nothing here to reword'}
        </p>
        <label className="mt-1 flex cursor-pointer items-start gap-1.5 text-micro">
          <input type="checkbox" className="mt-0.5" checked={promotes} onChange={(e) => setPromotes(e.target.checked)} />
          <span>
            This promotes an offer, or an admission to trading
            <span className="block text-[10px] leading-snug text-grey">
              Asked rather than guessed: MiCA never defines &ldquo;marketing communication&rdquo; at Level 1, so
              this is a recorded judgement. Ticking it pulls in the Art 7 mandatory elements, and the
              arithmetic below then refuses the post outright.
            </span>
          </span>
        </label>
      </div>

      {/* ── WHAT THEY SAID, and what the model proposed. ─────────────────────── */}
      {!draft ? (
        <div className="border-t border-line pt-2">
          <Button size="xs" variant="secondary" onClick={onDraft} disabled={busy}>
            <Bot size={12} /> {busy ? 'Drafting…' : 'Ask for a draft'}
          </Button>
          <p className="mt-1 text-[10px] leading-snug text-grey">
            A model&apos;s suggestion is an input to this room, not an answer from it. Nothing it writes is
            checked by the act of writing it.
          </p>
        </div>
      ) : (
        <>
          <div className="border-t border-line pt-2">
            <SectionLabel as="h3">As stored — this is what an approval would cover</SectionLabel>
            <div className="mt-1 border-l-2 border-line px-2 py-1">
              <AiProse text={stored} />
            </div>
            <p className="mt-1 font-mono text-[10px] leading-snug text-grey">
              {draft.used_llm ? 'AI-drafted' : 'deterministic draft — no AI key set'} · {draft.status}
              {draft.approved_by ? ` · approved by ${draft.approved_by}` : ''}
            </p>
            {draft.flagged && draft.flag_reason && (
              <Refused
                r={{
                  code: 'AUTHORED_BY_MODEL_UNEDITED',
                  sentence: draft.flag_reason,
                  rule: {
                    instrument: 'desk_policy',
                    provision: 'sanitiser flag on model output',
                    text: 'The sanitiser removed or flagged something in the model\'s output before it reached this screen. A model draft is an unapproved artefact by an unregistered preparer.',
                  },
                  recovery: {
                    kind: 'edit_text',
                    what: 'Read the stored text above as hostile output rather than as a suggestion, and rewrite it below. Approving it as it stands records approval of something a model wrote and nobody edited.',
                  },
                  matched: null,
                  ruleSetVersion: PRECHECK_RULESET_VERSION,
                }}
              />
            )}
          </div>

          {/* ── THE EDITOR. Live refusals below it. ───────────────────────────── */}
          <div className="border-t border-line pt-2">
            <SectionLabel as="h3">Our text</SectionLabel>
            <textarea
              className="mt-1 min-h-[80px] w-full rounded border border-line bg-card px-2 py-1 text-label text-navy focus-ring"
              value={text}
              onChange={(e) => setText(e.target.value)}
              aria-label="Our text"
              disabled={!VERB_PRODUCES_OWN_TEXT[verb]}
            />
            <p className="mt-0.5 flex flex-wrap items-center gap-2 font-mono text-[10px] text-grey">
              <span className={text.trim().length > X_POST_MAX_CHARS ? 'text-status-blocked' : undefined}>
                {text.trim().length} / {X_POST_MAX_CHARS}
              </span>
              {reviewing && <span className="inline-flex items-center gap-1"><Loader2 size={9} className="animate-spin motion-essential" /> asking the engine</span>}
            </p>
            {!VERB_PRODUCES_OWN_TEXT[verb] && (
              <p className="mt-1 border-l-2 border-line px-2 py-1 text-[10px] leading-snug text-grey">
                A {verb} carries no words of ours, so the editor is closed. The only outcomes available are
                doing it or not doing it — and the target&apos;s claims become ours either way.
              </p>
            )}
            {edited && (
              <p
                data-testid="mkt-edited-not-approved"
                className="mt-1 border-l-2 border-status-conditional/60 bg-status-conditional-bg px-2 py-1.5 text-micro leading-snug text-status-conditional"
              >
                <strong>This text is not the stored draft.</strong> No route saves an edit, so approving now
                would record approval of the stored version above and not of what you have written. Take the
                text by hand instead — the handoff record binds to a hash of exactly these characters, which
                is the only claim about &ldquo;what was sent&rdquo; this compartment can honestly make.
              </p>
            )}
          </div>

          {/* ── THE THREE VERDICTS, BEFORE ANY ACTION IS REACHABLE. ───────────── */}
          <div className="space-y-1.5 border-t border-line pt-2">
            <SectionLabel as="h3">Before anyone acts</SectionLabel>
            {/* The limit of the whole apparatus, printed on the surface that renders its
                verdicts — the same device GPS uses for its disclosure constants. A clear
                verdict is a statement about the rulebook and not about the draft. */}
            <p className="text-[10px] leading-snug text-grey">{MARKETING_RULES_DISCLOSURE}</p>
            {gates.map((g) => <Gate key={g.gate} reading={g} />)}
          </div>

          {/* ── THE TWO ACTS. Neither of them is a Send button. ───────────────── */}
          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-2">
            {draft.status === 'proposed' && (
              <Button
                size="xs"
                onClick={() => onApprove(draft)}
                disabled={busy || blocking.length > 0 || edited}
              >
                Approve the stored text
              </Button>
            )}
            <Button
              size="xs"
              variant="secondary"
              onClick={() => void take()}
              disabled={busy || blocking.length > 0 || text.trim() === ''}
            >
              <ClipboardCheck size={12} /> Record the handoff, then take the text
            </Button>
            {blocking.length > 0 && (
              <span className="text-[10px] leading-snug text-status-blocked">
                {blocking.length === 1 ? 'One refusal stands' : `${blocking.length} refusals stand`} above. They
                are not warnings: a regulated promise cannot be stripped into safety, so the text has to change
                or the act has to change.
              </span>
            )}
            {blocking.length === 0 && anyUnchecked && (
              <span className="text-[10px] leading-snug text-status-conditional">
                Nothing is refusing this — and at least one gate never ran. Read the unchecked gates above
                before you act; an unanswered gate is not a clearance.
              </span>
            )}
          </div>

          {handoffAbsent && (
            /* Its own test id: the gates above also render `Absent`, and a test that
               cannot tell "this gate was never checked" from "the text was not copied"
               would pass while the clipboard guarantee was broken. */
            <div data-testid="mkt-handoff-absent">
            <Absent title="This environment cannot record a handoff, so the text was not copied.">
              There is no handoff route deployed here. Copying the text now would put an unrecorded LCX
              statement into the world, which is the one thing this compartment exists to prevent — so the
              clipboard was left alone. Read the text off the screen if you must act before the route exists,
              and record what you sent by hand afterwards.
            </Absent>
            </div>
          )}
          {refusal && <Refused r={refusal} />}
          {handoff && (
            <p
              role="note"
              data-testid="mkt-handoff-recorded"
              className="border-l-2 border-status-ready/40 bg-status-ready-bg px-2 py-1.5 text-micro leading-snug text-status-ready"
            >
              Copied, and recorded. {handoff.takenBy ? `Taken by ${handoff.takenBy}` : 'The server did not state who took it'}
              {handoff.takenAt ? ` at ${handoff.takenAt}` : ''} · sha256 {handoff.contentHash.slice(0, 16)}…
              {handoff.notice ? ` — ${handoff.notice}` : ''}
              <span className="mt-1 block text-[10px] text-grey">
                The record says these exact characters left the instrument. It does not say they were posted:
                what happens next is outside this system, by design.
              </span>
            </p>
          )}
        </>
      )}

      <NoPostingPath />
    </div>
  );
}
