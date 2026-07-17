import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Edit in place (FINAL_MASTER_PLAN 4.1 rule 3): click the value, type, Enter.
 * No edit mode, no dialog. Saves optimistically — the caller applies the
 * change immediately and rolls back with a toast if the write fails.
 */
export interface InlineEditProps {
  /** The rendered value at rest. */
  display: ReactNode;
  /** Initial raw value when editing starts. */
  initial: string;
  type?: 'text' | 'number';
  ariaLabel: string;
  /** Called with the trimmed raw input; only when it actually changed. */
  onSave: (raw: string) => void | Promise<void>;
  /** Extra classes on the resting wrapper. */
  className?: string;
  inputClassName?: string;
}

export function InlineEdit({ display, initial, type = 'text', ariaLabel, onSave, className, inputClassName }: InlineEditProps) {
  const [editing, setEditing] = useState(false);
  const [raw, setRaw] = useState(initial);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const commit = () => {
    setEditing(false);
    const next = raw.trim();
    if (next !== '' && next !== initial.trim()) void onSave(next);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        type={type}
        value={raw}
        aria-label={ariaLabel}
        onChange={e => setRaw(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') {
            setRaw(initial);
            setEditing(false);
          }
        }}
        onClick={e => e.stopPropagation()}
        className={`num-tabular w-24 rounded border border-cyan-500 bg-page px-1.5 py-0.5 text-label font-semibold text-navy outline-none ${inputClassName ?? ''}`}
      />
    );
  }

  return (
    <span
      role="button"
      tabIndex={0}
      aria-label={`${ariaLabel} — click to edit`}
      title="Click to edit"
      onClick={e => {
        e.stopPropagation();
        setRaw(initial);
        setEditing(true);
      }}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.stopPropagation();
          e.preventDefault();
          setRaw(initial);
          setEditing(true);
        }
      }}
      className={`-mx-1 inline-flex cursor-text items-baseline rounded px-1 transition-colors hover:bg-ice-soft dark:hover:bg-ice-soft/10 ${className ?? ''}`}
    >
      {display}
    </span>
  );
}
