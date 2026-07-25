/**
 * The verb stage of the command line (TERMINAL Phase 3).
 *
 * Noun already chosen. This panel offers the legal verbs, prompts for typed
 * params inline, invokes through the governed path, and — when a gate fires —
 * shows the remedy instead of dead-ending.
 *
 * It renders decisions made elsewhere: `grammar.ts` decides which verbs exist and
 * what to ask for, `invoke.ts` decides what a refusal means. This file is only
 * presentation and keyboard handling, deliberately, so the rules that matter stay
 * testable without a DOM.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { clsx } from 'clsx';
import { ChevronRight, ShieldAlert, Check, AlertTriangle } from 'lucide-react';
import { ACTION_MANIFEST } from '@/lib/command/generated/actionManifest';
import {
  verbsFor,
  promptsFor,
  validate,
  buildParams,
  blockedExplanation,
  type Noun,
  type Principal,
  type Prompt,
  type Verb,
} from './grammar';
import { invoke, wasNoOp, type Refusal } from './invoke';
import { useDismissible } from '@/hooks/useDismissible';

type Stage = 'verbs' | 'params' | 'done';

export function VerbPanel({
  noun,
  principal,
  onBack,
  onFinished,
}: {
  noun: Noun;
  principal: Principal;
  onBack: () => void;
  onFinished: () => void;
}) {
  const verbs = useMemo(() => verbsFor(ACTION_MANIFEST, noun, principal), [noun, principal]);

  const [stage, setStage] = useState<Stage>('verbs');
  const [cursor, setCursor] = useState(0);
  const [verb, setVerb] = useState<Verb | null>(null);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [submitting, setSubmitting] = useState(false);
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [success, setSuccess] = useState<{ noOp: boolean } | null>(null);

  const prompts = useMemo(
    () => (verb ? promptsFor(verb.action, ACTION_MANIFEST.valueSets) : []),
    [verb],
  );
  const problems = useMemo(
    () => (verb ? validate(verb.action, values) : []),
    [verb, values],
  );

  const firstFieldRef = useRef<HTMLInputElement | HTMLSelectElement | null>(null);
  useEffect(() => {
    if (stage === 'params') firstFieldRef.current?.focus();
  }, [stage]);

  function chooseVerb(v: Verb) {
    if (v.blocked) return; // present for honesty, not runnable
    setVerb(v);
    setRefusal(null);
    // A verb with no params is a single keystroke away from done, but it still
    // goes through the confirm step: a governed write should never happen on a
    // keypress the operator could have meant as navigation.
    setValues({});
    setStage('params');
  }

  async function submit() {
    if (!verb || submitting) return;
    if (problems.length > 0) return;
    setSubmitting(true);
    setRefusal(null);
    const params = buildParams(verb.action, values);
    const out = await invoke(verb.action.id, noun.type, noun.id, params);
    setSubmitting(false);

    if (out.ok) {
      // Never claim more than happened: several actions return 200 having changed
      // nothing (e.g. `track` on an already-tracked project).
      setSuccess({ noOp: wasNoOp(out.result) });
      setStage('done');
      // Secrets are dropped the instant the request is away.
      setValues({});
      return;
    }
    setRefusal(out);
  }

  /* ── keyboard ──────────────────────────────────────────────────────────── */
  // Escape retreats ONE stage rather than closing outright — losing a half-typed
  // command to a stray keypress is its own kind of hostile. The stack does not
  // require an entry to close itself; retreating and staying registered is a
  // legitimate response, and it keeps the ladder honest: params → verbs → back out
  // to the command line, one press per rung.
  useDismissible(
    true,
    () => {
      if (stage === 'params') {
        setStage('verbs');
        setVerb(null);
        setValues({});
      } else onBack();
    },
    'command verb panel',
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (stage !== 'verbs') return;
      const runnable = verbs;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setCursor((i) => Math.min(i + 1, runnable.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setCursor((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const picked = runnable[cursor];
        if (picked) chooseVerb(picked);
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [stage, cursor, verbs, onBack]);

  /* ── render ────────────────────────────────────────────────────────────── */

  if (stage === 'done') {
    return (
      <div className="p-4" role="status" aria-live="polite">
        <div className="flex items-start gap-2">
          {success?.noOp ? (
            <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-500" />
          ) : (
            <Check size={15} className="mt-0.5 shrink-0 text-emerald-500" />
          )}
          <div>
            <div className="text-label font-semibold text-navy">
              {success?.noOp ? 'Nothing changed' : `${verb?.action.label} — recorded`}
            </div>
            <div className="mt-0.5 text-body text-grey">
              {success?.noOp
                ? 'The server accepted the command but the object was already in that state.'
                : `Audited against ${noun.label}.`}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onFinished}
          className="mt-3 rounded-md border border-line px-2 py-1 text-label text-navy hover:bg-ice-soft dark:hover:bg-ice-soft/10"
        >
          Done
        </button>
      </div>
    );
  }

  if (stage === 'params' && verb) {
    return (
      <div className="p-3">
        <Breadcrumb noun={noun} verbLabel={verb.action.label} />
        <p className="mt-1 px-1 text-body text-grey">{verb.action.description}</p>

        <div className="mt-3 space-y-2.5">
          {prompts.map((p, i) => (
            <Field
              key={p.name}
              prompt={p}
              value={values[p.name]}
              autoFocusRef={i === 0 ? firstFieldRef : undefined}
              onChange={(v) => setValues((prev) => ({ ...prev, [p.name]: v }))}
            />
          ))}
          {prompts.length === 0 && (
            <p className="px-1 text-body text-grey">This action takes no parameters.</p>
          )}
        </div>

        {problems.length > 0 && (
          <ul className="mt-2.5 space-y-0.5 px-1">
            {problems.map((p) => (
              <li key={`${p.field}-${p.message}`} className="text-label text-amber-600 dark:text-amber-500">
                {p.message}
              </li>
            ))}
          </ul>
        )}

        {refusal && <RefusalNote refusal={refusal} />}

        <div className="mt-3 flex items-center gap-2 border-t border-line pt-2.5">
          <button
            type="button"
            disabled={problems.length > 0 || submitting}
            onClick={() => void submit()}
            className="rounded-md bg-navy px-2.5 py-1 text-label font-semibold text-white disabled:opacity-40"
          >
            {submitting ? 'Running…' : 'Run'}
          </button>
          <span className="text-[10px] font-mono uppercase tracking-wider text-grey">
            esc to go back · goes through the governed path, audited
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="py-1" role="listbox" aria-label={`Actions on ${noun.label}`}>
      <Breadcrumb noun={noun} />
      {verbs.length === 0 && (
        <p className="px-4 py-3 text-body text-grey">
          No governed actions apply to this object.
        </p>
      )}
      {verbs.map((v, i) => (
        <button
          key={v.action.id}
          type="button"
          role="option"
          aria-selected={i === cursor}
          aria-disabled={v.blocked !== null}
          onClick={() => chooseVerb(v)}
          onMouseEnter={() => setCursor(i)}
          className={clsx(
            'flex w-full items-start gap-2 px-4 py-2 text-left',
            i === cursor && 'bg-ice-soft dark:bg-ice-soft/10',
            v.blocked && 'opacity-60',
          )}
        >
          {v.blocked ? (
            <ShieldAlert size={14} className="mt-0.5 shrink-0 text-amber-500" />
          ) : (
            <ChevronRight size={14} className="mt-0.5 shrink-0 text-grey" />
          )}
          <span className="min-w-0">
            <span className="block truncate text-label font-medium text-navy">{v.action.label}</span>
            <span className="block truncate text-body text-grey">
              {v.blocked ? blockedExplanation(v.blocked) : v.action.description}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}

function Breadcrumb({ noun, verbLabel }: { noun: Noun; verbLabel?: string }) {
  return (
    <div className="flex items-center gap-1.5 px-4 py-1.5 font-mono text-[10px] uppercase tracking-wider text-grey">
      <span className="text-navy">{noun.label}</span>
      <span className="text-grey/50">/</span>
      <span>{verbLabel ?? 'choose an action'}</span>
    </div>
  );
}

/** A refusal, rendered with its remedy rather than just its message. */
function RefusalNote({ refusal }: { refusal: Refusal }) {
  return (
    <div
      className="mt-2.5 rounded-md border border-amber-500/40 bg-amber-500/5 p-2.5"
      role="alert"
    >
      <div className="flex items-start gap-2">
        <ShieldAlert size={14} className="mt-0.5 shrink-0 text-amber-500" />
        <div className="min-w-0">
          <div className="font-mono text-[10px] uppercase tracking-wider text-amber-600 dark:text-amber-500">
            {refusal.code}
          </div>
          <p className="mt-0.5 text-body text-navy">{refusal.remedy}</p>
          {/* The override is described, never offered as a shortcut: it has to be
              set deliberately in the field above, with a reason. */}
          {refusal.overridable && (
            <p className="mt-1 text-label text-grey">
              To proceed anyway, set the override above and give a reason — both are recorded.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({
  prompt,
  value,
  onChange,
  autoFocusRef,
}: {
  prompt: Prompt;
  value: unknown;
  onChange: (v: unknown) => void;
  autoFocusRef?: React.MutableRefObject<HTMLInputElement | HTMLSelectElement | null>;
}) {
  const label = (
    <span className="mb-0.5 block font-mono text-[10px] uppercase tracking-wider text-grey">
      {prompt.name}
      {prompt.required && <span className="text-amber-500"> *</span>}
      {prompt.kind === 'override' && <span className="text-amber-500"> · accepts risk</span>}
      {prompt.kind === 'secret' && <span className="text-grey"> · never stored</span>}
    </span>
  );

  const box =
    'w-full rounded-md border border-line bg-page px-2 py-1 text-label text-navy outline-none focus:border-grey-light';

  if (prompt.type === 'boolean') {
    return (
      <label className="flex cursor-pointer items-start gap-2 px-1">
        <input
          type="checkbox"
          checked={value === true}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-0.5"
        />
        <span>{label}</span>
      </label>
    );
  }

  if (prompt.choices && prompt.choices.length > 0) {
    return (
      <label className="block px-1">
        {label}
        <select
          ref={autoFocusRef as React.MutableRefObject<HTMLSelectElement | null> | undefined}
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          className={box}
        >
          <option value="">—</option>
          {prompt.choices.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>
    );
  }

  return (
    <label className="block px-1">
      {label}
      <input
        ref={autoFocusRef as React.MutableRefObject<HTMLInputElement | null> | undefined}
        // A credential is masked and never autofilled — the browser must not
        // remember a shared desk passcode.
        type={prompt.kind === 'secret' ? 'password' : prompt.type === 'number' ? 'number' : 'text'}
        autoComplete={prompt.kind === 'secret' ? 'off' : undefined}
        value={String(value ?? '')}
        maxLength={prompt.maxLength}
        onChange={(e) => onChange(e.target.value)}
        className={box}
      />
    </label>
  );
}
