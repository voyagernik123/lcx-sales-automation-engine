import { useState } from 'react';
import { ChevronDown, ChevronRight, Braces } from 'lucide-react';
import { safeHref } from '@/lib/safeHref';

/**
 * Structured key-value renderer for signal/source payloads — replaces raw
 * `JSON.stringify` dumps. Mono keys, formatted values (links, dates, numbers,
 * booleans), nested objects behind toggles, and a collapsible raw-JSON view
 * so nothing is ever hidden.
 */

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2})?/;

function FormattedValue({ value }: { value: unknown }) {
  if (value == null) return <span className="text-grey">—</span>;

  if (typeof value === 'boolean') {
    return (
      <span
        className={`inline-flex rounded px-1 py-0.5 text-micro font-semibold leading-none ${
          value
            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400'
            : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
        }`}
      >
        {value ? 'yes' : 'no'}
      </span>
    );
  }

  if (typeof value === 'number') {
    return <span className="font-mono num-tabular text-navy">{value.toLocaleString()}</span>;
  }

  if (typeof value === 'string') {
    if (/^https?:\/\//.test(value)) {
      return (
        <a href={safeHref(value)} target="_blank" rel="noopener noreferrer" className="text-cyan-600 dark:text-cyan-400 hover:underline break-all">
          {value}
        </a>
      );
    }
    if (ISO_DATE_RE.test(value) && !Number.isNaN(Date.parse(value))) {
      return (
        <span className="text-navy" title={value}>
          {new Date(value).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </span>
      );
    }
    return <span className="text-navy break-words">{value}</span>;
  }

  return <NestedValue value={value} />;
}

function NestedValue({ value }: { value: unknown }) {
  const [open, setOpen] = useState(false);
  const isArray = Array.isArray(value);
  const size = isArray ? (value as unknown[]).length : Object.keys(value as object).length;
  const summary = isArray ? `[${size} item${size === 1 ? '' : 's'}]` : `{${size} field${size === 1 ? '' : 's'}}`;

  return (
    <span>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="inline-flex items-center gap-0.5 rounded border border-line px-1 py-0.5 font-mono text-micro text-grey hover:text-navy hover:border-cyan-400 transition-colors"
      >
        {open ? <ChevronDown size={9} /> : <ChevronRight size={9} />}
        {summary}
      </button>
      {open && (
        <pre className="mt-1 max-h-40 overflow-auto rounded bg-ice-soft dark:bg-navy-deep px-2 py-1.5 font-mono text-micro leading-relaxed text-navy">
          {JSON.stringify(value, null, 2)}
        </pre>
      )}
    </span>
  );
}

export function StructuredPayload({
  payload,
  maxRows,
  className = '',
}: {
  payload: Record<string, unknown>;
  /** Collapse to the first N rows with a "+k more" expander. */
  maxRows?: number;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showRaw, setShowRaw] = useState(false);

  const entries = Object.entries(payload ?? {});
  if (entries.length === 0) {
    return <p className={`text-micro text-grey italic ${className}`}>Empty payload.</p>;
  }

  const visible = maxRows != null && !expanded ? entries.slice(0, maxRows) : entries;
  const hidden = entries.length - visible.length;

  return (
    <div className={className}>
      <dl className="space-y-0.5">
        {visible.map(([key, value]) => (
          <div key={key} className="flex items-start gap-2 text-micro leading-relaxed">
            <dt className="w-32 shrink-0 truncate font-mono text-grey" title={key}>{key}</dt>
            <dd className="min-w-0 flex-1"><FormattedValue value={value} /></dd>
          </div>
        ))}
      </dl>
      <div className="mt-1 flex items-center gap-3">
        {hidden > 0 && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="text-micro font-bold text-cyan-600 dark:text-cyan-400 hover:underline"
          >
            + {hidden} more field{hidden === 1 ? '' : 's'}
          </button>
        )}
        <button
          type="button"
          onClick={() => setShowRaw(r => !r)}
          className="inline-flex items-center gap-1 text-micro font-bold text-grey hover:text-navy transition-colors"
        >
          <Braces size={9} />
          {showRaw ? 'Hide raw JSON' : 'Raw JSON'}
        </button>
      </div>
      {showRaw && (
        <pre className="mt-1 max-h-60 overflow-auto rounded bg-ice-soft dark:bg-navy-deep px-2 py-1.5 font-mono text-micro leading-relaxed text-navy">
          {JSON.stringify(payload, null, 2)}
        </pre>
      )}
    </div>
  );
}
