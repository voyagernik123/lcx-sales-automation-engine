import { useMemo, useRef, useState } from 'react';
import { AlertTriangle, ShieldAlert, Check, Target } from 'lucide-react';
import { ACTION_MANIFEST } from '@/lib/command/generated/actionManifest';
import {
  blockedExplanation,
  buildParams,
  promptsFor,
  validate,
  verbsFor,
  type Prompt,
  type Principal,
} from '@/components/command/grammar';
import {
  DRILLS,
  executorGatesFor,
  gatesFor,
  medianMs,
  practiceInvoke,
  type PracticeDrill,
  type PracticeLedgerRow,
  type PracticeOutcome,
  type PracticeRefusal,
} from '@/lib/practice';
import { useOperatorStore } from '@/stores/useOperatorStore';

/**
 * THE PRACTICE RANGE — where every mistake is safe (T1 #20).
 *
 * Nobody learns on prod, and under the amended plan Monty and Sam arrive cold
 * with nobody sitting beside them. So this is a full governed write — the real
 * grammar, the real prompts, the real refusal sentences, the real audit row —
 * against objects that exist only in this component's state.
 *
 * WHAT IS REAL HERE AND WHAT IS SIMULATED, because a sandbox an operator
 * half-trusts is worse than none:
 *
 *  - REAL: every verb offered, every prompt asked, every advisory complaint, and
 *    the params that would go on the wire. They come from
 *    `components/command/grammar.ts` — the same pure module the ⌘K command line
 *    renders from, called with the same manifest. Not a copy of it.
 *  - SIMULATED: the server. `lib/practice.ts` mirrors `invokeAction`'s check
 *    order and its two executor gates, and returns the refusal sentence
 *    `components/command/invoke.ts` would have shown. It has no network access —
 *    provably, see the tests named in that file's header.
 *
 * NO DIALOGS ANYWHERE IN HERE, on purpose. An overlay would have to be on the
 * one Escape stack (`lib/dismiss.ts`), and a second modal layer inside a teaching
 * surface is exactly where the two unregistered overlays of Phase 7 came from.
 * Everything is in the page, so Escape keeps meaning what it means everywhere
 * else — which is itself part of what an operator is here to learn.
 */

/** The six workspaces, as the entitlement toggle needs to name them. */
const HELD_ALL = {
  sales: 'approve',
  command: 'approve',
  intel: 'approve',
  regulatory: 'approve',
  distribution: 'approve',
  governance: 'approve',
} as const;

interface Attempt {
  drillId: string;
  outcome: PracticeOutcome;
  /** Their own time on this rep. */
  elapsedMs: number;
}

export function PracticeRange() {
  const operator = useOperatorStore((s) => s.operator);
  const [drillId, setDrillId] = useState(DRILLS[0]!.id);
  const [role, setRole] = useState<'operator' | 'approver'>('operator');
  const [holdsWorkspaces, setHoldsWorkspaces] = useState(true);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [ledger, setLedger] = useState<PracticeLedgerRow[]>([]);

  const drill = DRILLS.find((d) => d.id === drillId)!;
  /**
   * When this rep started. A ref rather than state because reading the clock must
   * not be able to trigger a render — and it is reset on every drill change and
   * every completed write, so the number is always "how long THIS attempt took".
   */
  const startedAt = useRef(Date.now());

  const principal: Principal = useMemo(
    () => ({ role, entitlements: holdsWorkspaces ? { ...HELD_ALL } : {} }),
    [role, holdsWorkspaces],
  );

  const action = ACTION_MANIFEST.actions.find((a) => a.id === drill.actionId)!;
  const verbs = useMemo(
    () => verbsFor(ACTION_MANIFEST, { type: drill.subject.type, id: drill.subject.id, label: drill.subject.label, state: drill.subject.state }, principal),
    [drill, principal],
  );
  const thisVerb = verbs.find((v) => v.action.id === action.id) ?? null;
  const prompts = useMemo(() => promptsFor(action, ACTION_MANIFEST.valueSets), [action]);
  const advisory = useMemo(() => validate(action, values), [action, values]);
  const gates = useMemo(() => [...gatesFor(action), ...executorGatesFor(action, drill.subject)], [action, drill]);

  const last = attempts.at(-1) ?? null;
  const median = medianMs(ledger.map((r) => r.elapsedMs));

  function pick(next: PracticeDrill) {
    setDrillId(next.id);
    setValues({});
    setAttempts([]);
    startedAt.current = Date.now();
  }

  function run() {
    const params = buildParams(action, values);
    const elapsedMs = Date.now() - startedAt.current;
    const outcome = practiceInvoke(ACTION_MANIFEST, action.id, drill.subject, params, {
      role,
      entitlements: principal.entitlements,
      actor: operator?.email ?? 'nobody@practice',
    });
    setAttempts((prev) => [...prev, { drillId: drill.id, outcome, elapsedMs }]);
    if (outcome.ok) {
      setLedger((prev) => [...prev, { ...outcome.row, seq: prev.length + 1, elapsedMs }]);
      // A completed rep is the end of a rep. The next one is timed from now, so
      // reading a refusal properly never costs them on the clock that follows.
      startedAt.current = Date.now();
    }
  }

  return (
    <div className="p-5">
      <PracticeBanner />

      <div className="mt-4 grid gap-4 lg:grid-cols-[15rem_minmax(0,1fr)_18rem]">
        {/* ── the five flows ── */}
        <nav aria-label="Practice drills" className="rounded-xl border border-line bg-card p-3">
          <h2 className="mb-2 text-label font-semibold uppercase tracking-wide text-grey">The five flows</h2>
          <ul className="space-y-1">
            {DRILLS.map((d) => {
              const on = d.id === drill.id;
              return (
                <li key={d.id}>
                  <button
                    type="button"
                    onClick={() => pick(d)}
                    aria-current={on ? 'true' : undefined}
                    className={`focus-ring w-full rounded-lg px-2.5 py-2 text-left text-body transition-colors ${
                      on ? 'bg-ice-soft font-semibold text-navy' : 'text-grey-dark hover:bg-ice-soft/60'
                    }`}
                  >
                    {d.title}
                    {d.meets ? (
                      <span className="mt-0.5 block font-mono text-micro text-status-conditional">
                        meets {d.meets}
                      </span>
                    ) : (
                      <span className="mt-0.5 block font-mono text-micro text-grey">clean write</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>

          <h2 className="mb-2 mt-4 border-t border-line pt-3 text-label font-semibold uppercase tracking-wide text-grey">
            Who you are, for now
          </h2>
          <p className="mb-2 text-micro text-grey">
            Your real desk role is {operator?.role ?? 'unknown'}. Change it here to see the other half of the
            governance — nothing outside this page is affected.
          </p>
          <Toggle
            label="Approver authority"
            on={role === 'approver'}
            onChange={(on) => setRole(on ? 'approver' : 'operator')}
          />
          <Toggle
            label="Holds every workspace"
            on={holdsWorkspaces}
            onChange={setHoldsWorkspaces}
          />
        </nav>

        {/* ── the drill ── */}
        <section className="rounded-xl border border-line bg-card p-4">
          <div className="flex items-baseline justify-between gap-3 border-b border-line pb-2.5">
            <h2 className="flex items-center gap-2 text-base font-bold tracking-tight text-navy">
              <Target size={16} aria-hidden="true" /> {drill.title}
            </h2>
            <span className="font-mono text-micro text-grey">{action.id}</span>
          </div>

          <p className="mt-2.5 text-body text-grey-dark">{drill.teaches}</p>

          <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-label">
            <dt className="text-grey">Subject</dt>
            <dd className="font-medium text-navy">
              {drill.subject.label}{' '}
              <span className="font-mono text-micro text-grey">
                {drill.subject.type}/{drill.subject.id}
              </span>
            </dd>
            <dt className="text-grey">State</dt>
            <dd className="font-mono text-micro text-grey-dark">{JSON.stringify(drill.subject.state)}</dd>
            <dt className="text-grey">Gates on this verb</dt>
            <dd className="text-grey-dark">
              {gates.length === 0 ? (
                'None — this one only needs the write to be well-formed.'
              ) : (
                <ul className="space-y-0.5">
                  {gates.map((g) => (
                    <li key={g.code + g.why}>
                      <span className="font-mono text-micro text-status-conditional">{g.code}</span>{' '}
                      <span className="text-micro">{g.why}</span>
                    </li>
                  ))}
                </ul>
              )}
            </dd>
          </dl>

          {thisVerb?.blocked ? (
            <p className="mt-3 flex items-start gap-2 rounded-lg bg-status-blocked-bg p-2.5 text-label text-navy">
              <ShieldAlert size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
              <span>
                The command line would show this verb blocked before you could even type into it:{' '}
                {blockedExplanation(thisVerb.blocked)}
              </span>
            </p>
          ) : null}

          <form
            className="mt-4 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              run();
            }}
          >
            {prompts.map((p) => (
              <Field key={p.name} prompt={p} value={values[p.name]} onChange={(v) => setValues((s) => ({ ...s, [p.name]: v }))} />
            ))}

            {advisory.length > 0 ? (
              <ul className="rounded-lg bg-status-conditional-bg p-2.5 text-label text-navy">
                {advisory.map((p) => (
                  <li key={`${p.field}-${p.message}`}>{p.message}</li>
                ))}
              </ul>
            ) : null}

            <div className="flex items-center gap-3">
              <button
                type="submit"
                className="focus-ring rounded-lg bg-navy px-3 py-1.5 text-label font-semibold text-card transition-opacity hover:opacity-90"
              >
                Run it
              </button>
              <span className="text-micro text-grey">
                Advisory complaints do not stop you — the server is the only authority, so send it and read what
                comes back.
              </span>
            </div>
          </form>

          {/* ── what came back ── */}
          {attempts.length > 0 ? (
            <div className="mt-4 border-t border-line pt-3">
              <h3 className="mb-2 text-label font-semibold uppercase tracking-wide text-grey">
                What came back — attempt {attempts.length}
              </h3>
              {last!.outcome.ok ? (
                <div className="rounded-lg bg-status-ready-bg p-3">
                  <p className="flex items-center gap-2 text-body font-semibold text-navy">
                    <Check size={14} aria-hidden="true" /> Written. That took {(last!.elapsedMs / 1000).toFixed(1)}s.
                  </p>
                  <p className="mt-1 font-mono text-micro text-grey-dark">
                    {JSON.stringify(last!.outcome.result)}
                  </p>
                </div>
              ) : (
                <RefusalCard refusal={last!.outcome} />
              )}
            </div>
          ) : null}
        </section>

        {/* ── the spine ── */}
        <aside className="rounded-xl border border-line bg-card p-3">
          <h2 className="mb-1 text-label font-semibold uppercase tracking-wide text-grey">
            What the audit would hold
          </h2>
          <p className="mb-2 text-micro text-grey">
            Every governed write lands in <span className="font-mono">object_actions</span> and the hash-chained{' '}
            <span className="font-mono">audit_log</span>, attributed to you. A REFUSAL lands in neither — nothing
            was written, and nothing was recorded either.
          </p>
          {ledger.length === 0 ? (
            <p className="text-label text-grey">Nothing yet.</p>
          ) : (
            <ol className="space-y-2">
              {ledger.map((r) => (
                <li key={r.seq} className="rounded-lg bg-ice-soft p-2 text-micro">
                  <div className="font-mono text-navy">
                    action:{r.actionId} → {r.subjectType}/{r.subjectId}
                  </div>
                  <div className="text-grey">by {r.actor}</div>
                  <div className="mt-0.5 break-words font-mono text-grey-dark">{JSON.stringify(r.params)}</div>
                </li>
              ))}
            </ol>
          )}

          {median !== null ? (
            <p className="mt-3 border-t border-line pt-2.5 text-label text-grey-dark">
              Your median time to a completed write, this session:{' '}
              <span className="font-semibold text-navy">{(median / 1000).toFixed(1)}s</span> over {ledger.length}{' '}
              reps.
            </p>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

/**
 * The one-second test.
 *
 * The constraint is that somebody who wanders in knows inside a second, without
 * reading — so it is the striped hazard band and the amber field, not the words.
 * The words are for the second second, and they answer the only question that
 * matters about a sandbox: where does the write go. Deliberately not so toy-like
 * that the lesson stops transferring: the surface below it is the app's real
 * geometry and the real sentences.
 */
function PracticeBanner() {
  return (
    <div
      role="note"
      className="overflow-hidden rounded-xl border-2 border-status-conditional bg-status-conditional-bg"
    >
      {/* Hazard stripes. Pure CSS so there is no asset to fail to load, and
        * `background-image` rather than an animation so it has nothing to do with
        * prefers-reduced-motion. */}
      <div
        aria-hidden="true"
        className="h-2 w-full"
        style={{
          backgroundImage:
            'repeating-linear-gradient(45deg, rgb(var(--amber)) 0 8px, transparent 8px 16px)',
        }}
      />
      <div className="flex items-start gap-2.5 p-3">
        <AlertTriangle size={18} className="mt-0.5 shrink-0 text-status-conditional" aria-hidden="true" />
        <div>
          <h1 className="text-base font-bold tracking-tight text-navy">
            PRACTICE RANGE — nothing here is real
          </h1>
          <p className="mt-0.5 text-label text-grey-dark">
            Every object on this page exists only in this browser tab, and no write leaves it. The verbs, the
            prompts, the gates and the refusal sentences are the production ones — so a mistake here costs nothing
            and still teaches you the thing that will happen on the desk.
          </p>
        </div>
      </div>
    </div>
  );
}

/** A refusal, shown the way the command line shows one: code, sentence, remedy. */
function RefusalCard({ refusal }: { refusal: PracticeRefusal }) {
  return (
    <div className="rounded-lg bg-status-blocked-bg p-3">
      <p className="flex items-center gap-2 text-body font-semibold text-navy">
        <ShieldAlert size={14} aria-hidden="true" /> Refused —{' '}
        <span className="font-mono text-label">{refusal.code}</span>
      </p>
      <p className="mt-1.5 text-label text-grey-dark">{refusal.message}</p>
      <p className="mt-2 text-body font-medium text-navy">{refusal.remedy}</p>
      <p className="mt-2 text-micro text-grey">
        {refusal.overridable
          ? 'This one is a risk you may accept: re-run it with the override on AND a reason. The reason is recorded against your name.'
          : 'This one has no override. Nothing you can type will unlock it — that is the point of it.'}
      </p>
      <p className="mt-1 text-micro text-grey">Nothing was written.</p>
    </div>
  );
}

/**
 * One prompt.
 *
 * The label, the required flag, the choices and the ordering are all
 * `promptsFor`'s, not this component's — the same division of labour CommandBody
 * keeps, so a new action's prompt appears here correctly without anyone editing
 * this file.
 */
function Field({
  prompt,
  value,
  onChange,
}: {
  prompt: Prompt;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const id = `practice-${prompt.name}`;
  const hint =
    prompt.kind === 'override'
      ? 'Never pre-selected. Turning it on is a deliberate extra step.'
      : prompt.kind === 'reason'
        ? 'Recorded in the audit, verbatim.'
        : prompt.kind === 'secret'
          ? 'Verified server-side, never stored, and redacted out of the ledger.'
          : null;

  if (prompt.type === 'boolean') {
    return (
      <div>
        <Toggle label={`${prompt.label}${prompt.required ? ' *' : ''}`} on={value === true} onChange={onChange} />
        {hint ? <p className="ml-1 mt-0.5 text-micro text-grey">{hint}</p> : null}
      </div>
    );
  }

  /*
   * A RECORD PARAM, AND THE ONE PLACE THIS SURFACE DELIBERATELY DOES NOT COPY THE
   * COMMAND LINE.
   *
   * `promptsFor` gives `command_rfi_record.values` `kind: 'record'` and a `choices`
   * list of the RFI field names. `VerbPanel`'s Field tests `choices` first and has
   * no branch for `type: 'record'` at all — so ⌘K renders what looks like a field
   * picker, sends the chosen NAME as a bare string, and the server refuses it
   * (`z.record(string, string)`). The client validator cannot warn, because the
   * choices come from a value set rather than a schema enum.
   *
   * Reproducing that here would be teaching a trap. Showing it disabled with the
   * reason is the honest version: the operator learns that the keyboard path sets
   * the RFI STATUS and that the values belong on the partner surface. The
   * underlying defect is a finding, not something this page should paper over.
   */
  if (prompt.type === 'record') {
    return (
      <div>
        <span className="block text-label font-medium text-grey">{prompt.label}</span>
        <select
          disabled
          aria-label={`${prompt.label} (not fillable from the keyboard path)`}
          className="mt-1 w-full cursor-not-allowed rounded-lg border border-line bg-ice-soft px-2 py-1.5 text-body text-grey"
        >
          <option>{prompt.choices?.length ?? 0} fields — none of them fillable here</option>
        </select>
        <p className="mt-0.5 text-micro text-status-conditional">
          The server wants a map of field → value. The command line offers only the field names and the write is
          refused, so this is not a flow to rehearse — fill RFI values on the partner surface.
        </p>
      </div>
    );
  }

  return (
    <div>
      <label htmlFor={id} className="block text-label font-medium text-navy">
        {prompt.label}
        {prompt.required ? <span className="text-status-blocked"> *</span> : null}
      </label>
      {prompt.choices ? (
        <select
          id={id}
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          className="focus-ring mt-1 w-full rounded-lg border border-line bg-card px-2 py-1.5 text-body text-navy"
        >
          <option value="">—</option>
          {prompt.choices.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={id}
          type={prompt.kind === 'secret' ? 'password' : prompt.type === 'number' ? 'number' : 'text'}
          value={String(value ?? '')}
          maxLength={prompt.maxLength}
          onChange={(e) => onChange(e.target.value)}
          className="focus-ring mt-1 w-full rounded-lg border border-line bg-card px-2 py-1.5 text-body text-navy"
        />
      )}
      {hint ? <p className="mt-0.5 text-micro text-grey">{hint}</p> : null}
    </div>
  );
}

function Toggle({
  label,
  on,
  onChange,
}: {
  label: string;
  on: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 py-1 text-label text-grey-dark">
      <input
        type="checkbox"
        checked={on}
        onChange={(e) => onChange(e.target.checked)}
        className="focus-ring h-3.5 w-3.5 rounded border-line"
      />
      {label}
    </label>
  );
}
