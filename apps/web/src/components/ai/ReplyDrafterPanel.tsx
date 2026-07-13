import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { fetchBdPipeline, generateDraft } from '@/lib/api/bd';
import type { BdFilters, BdLead, DraftOutput } from '@/types/bd';
import { CopyButton, RunButton, inputClass, labelClass, panelClass, resultBoxClass } from './common';

const PROJECT_FILTERS: BdFilters = {
  market: null,
  minScore: 0,
  source: '',
  band: '',
  listedOnLcx: null,
  hasContact: null,
  marketRecommendation: '',
  sort: 'priority',
  order: 'desc',
  search: '',
};

const TOUCH_LABELS: Record<number, string> = {
  1: 'Touch 1 — intro',
  2: 'Touch 2 — follow-up',
  3: 'Touch 3 — value add',
  4: 'Touch 4 — nudge',
  5: 'Touch 5 — break-up',
};

export function ReplyDrafterPanel() {
  const [projects, setProjects] = useState<BdLead[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [projectId, setProjectId] = useState('');
  const [contactName, setContactName] = useState('');
  const [touchIndex, setTouchIndex] = useState(1);
  const [result, setResult] = useState<DraftOutput | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const ctrl = new AbortController();
    fetchBdPipeline(PROJECT_FILTERS, { limit: 50 }, ctrl.signal)
      .then((res) => {
        setProjects(res.data);
        setProjectsLoading(false);
      })
      .catch((err) => {
        if (ctrl.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Failed to load projects');
        setProjectsLoading(false);
      });
    return () => ctrl.abort();
  }, []);

  const run = async () => {
    if (!projectId) return;
    setRunning(true);
    setError('');
    try {
      const res = await generateDraft(projectId, {
        contactName: contactName.trim() || 'there',
        touchIndex,
        channel: 'email',
      });
      setResult(res.data);
      setWarnings(res.warnings ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate draft');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className={panelClass}>
      <p className="mb-3 text-[11px] text-grey">
        Generate an outreach draft for a pipeline project — pick a project, name the contact, choose the
        touch in the sequence.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 sm:col-span-1">
          <span className={labelClass}>Project</span>
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className={inputClass}
            disabled={projectsLoading}
          >
            <option value="">{projectsLoading ? 'Loading projects…' : 'Select a project…'}</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.ticker ? ` (${p.ticker})` : ''} — {p.band}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>Contact name</span>
          <input
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
            placeholder="e.g. Alex"
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>Touch</span>
          <select
            value={touchIndex}
            onChange={(e) => setTouchIndex(Number(e.target.value))}
            className={inputClass}
          >
            {[1, 2, 3, 4, 5].map((i) => (
              <option key={i} value={i}>
                {TOUCH_LABELS[i]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <RunButton running={running} disabled={!projectId} onClick={() => void run()} runningLabel="Drafting…">
        Generate draft
      </RunButton>
      {error && <p className="mt-2 text-[11px] text-red-600">{error}</p>}
      {result && (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase dark:bg-slate-800">
              {result.channel} · touch {result.touchIndex}
            </span>
            {result.requiresHumanReview && (
              <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                <AlertTriangle size={10} /> Requires human review
              </span>
            )}
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className={labelClass}>Subject</span>
              <CopyButton text={result.subject} label="Copy subject" />
            </div>
            <p className={resultBoxClass}>{result.subject}</p>
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className={labelClass}>Body</span>
              <CopyButton text={result.body} label="Copy body" />
            </div>
            <p className={resultBoxClass}>{result.body}</p>
          </div>
          {result.claimsUsed.length > 0 && (
            <p className="text-[10px] text-grey">Claims used: {result.claimsUsed.join(', ')}</p>
          )}
          {warnings.length > 0 && (
            <ul className="space-y-0.5 text-[10px] text-amber-600 dark:text-amber-400">
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
