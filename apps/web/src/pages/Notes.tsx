import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FileText, Plus, Trash2, Save, Pin, Paperclip, RefreshCw, ArrowLeft, ExternalLink, Search } from 'lucide-react';
import { request } from '@/lib/apiClient';
import { fetchBdPipeline } from '@/lib/api/bd';
import type { BdFilters, BdLead } from '@/types/bd';
import { PageTitle, SectionLabel, Button } from '@/components/ui';
import { CardSkeleton, EmptyState } from '@/components/shared';

const PICKER_FILTERS: Omit<BdFilters, 'search'> = {
  market: null,
  minScore: 0,
  source: '',
  band: '',
  listedOnLcx: null,
  hasContact: null,
  marketRecommendation: '',
  sort: 'priority',
  order: 'desc',
};

type Note = {
  id: string;
  projectId: string;
  title: string | null;
  body: string;
  currentVersion: number;
  pinned: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

type Doc = {
  id: string;
  projectId: string;
  name: string;
  mime: string;
  sizeBytes: number;
  url: string | null;
  hasContent: boolean;
  createdBy: string;
  createdAt: string;
};

const MAX_DOC_BYTES = 200 * 1024;

function fmtDate(d: string): string {
  return new Date(d).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function fmtBytes(n: number): string {
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
}

export function Notes() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [notes, setNotes] = useState<Note[]>([]);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // note editor state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftBody, setDraftBody] = useState('');

  // document form state
  const [docName, setDocName] = useState('');
  const [docUrl, setDocUrl] = useState('');
  const [docContent, setDocContent] = useState('');

  // project picker / switcher state
  const [pickerQuery, setPickerQuery] = useState('');
  const [pickerResults, setPickerResults] = useState<BdLead[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);

  // No :projectId → debounced search for the picker. With :projectId → top
  // projects for the switcher select.
  useEffect(() => {
    const controller = new AbortController();
    setPickerLoading(true);
    const timer = setTimeout(() => {
      fetchBdPipeline(
        { ...PICKER_FILTERS, search: projectId ? '' : pickerQuery.trim() },
        { limit: projectId ? 50 : 20 },
        controller.signal,
      )
        .then((res) => {
          if (!controller.signal.aborted) setPickerResults(res.data);
        })
        .catch(() => {
          if (!controller.signal.aborted) setPickerResults([]);
        })
        .finally(() => {
          if (!controller.signal.aborted) setPickerLoading(false);
        });
    }, projectId ? 0 : 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [projectId, pickerQuery]);

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError('');
    try {
      const [n, d] = await Promise.all([
        request<{ data: Note[] }>(`/v1/projects/${projectId}/notes`),
        request<{ data: Doc[] }>(`/v1/projects/${projectId}/documents`),
      ]);
      setNotes(n.data);
      setDocs(d.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load notes');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const startNew = () => {
    setEditingId('new');
    setDraftTitle('');
    setDraftBody('');
  };

  const startEdit = (n: Note) => {
    setEditingId(n.id);
    setDraftTitle(n.title ?? '');
    setDraftBody(n.body);
  };

  const saveNote = async () => {
    if (!projectId) return;
    try {
      if (editingId === 'new') {
        await request(`/v1/projects/${projectId}/notes`, {
          method: 'POST',
          body: { title: draftTitle || null, body: draftBody },
        });
      } else if (editingId) {
        await request(`/v1/projects/${projectId}/notes/${editingId}`, {
          method: 'PUT',
          body: { title: draftTitle || null, body: draftBody },
        });
      }
      setEditingId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save note');
    }
  };

  const togglePin = async (n: Note) => {
    if (!projectId) return;
    try {
      await request(`/v1/projects/${projectId}/notes/${n.id}`, {
        method: 'PUT',
        body: { pinned: !n.pinned },
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to pin');
    }
  };

  const deleteNote = async (n: Note) => {
    if (!projectId) return;
    try {
      await request(`/v1/projects/${projectId}/notes/${n.id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete note');
    }
  };

  const addDoc = async () => {
    if (!projectId || !docName.trim()) return;
    if (docContent && new Blob([docContent]).size > MAX_DOC_BYTES) {
      setError(`Content exceeds ${MAX_DOC_BYTES / 1024} KB`);
      return;
    }
    try {
      await request(`/v1/projects/${projectId}/documents`, {
        method: 'POST',
        body: { name: docName.trim(), url: docUrl.trim() || undefined, content: docContent || undefined },
      });
      setDocName('');
      setDocUrl('');
      setDocContent('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add document');
    }
  };

  const deleteDoc = async (d: Doc) => {
    if (!projectId) return;
    try {
      await request(`/v1/projects/${projectId}/documents/${d.id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete document');
    }
  };

  // Route without :projectId → project picker.
  if (!projectId) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-4">
        <PageTitle icon={<FileText size={20} />} subtitle="Pick a project to view its notes and documents.">
          Notes & Documents
        </PageTitle>
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-grey" />
          <input
            autoFocus
            value={pickerQuery}
            onChange={(e) => setPickerQuery(e.target.value)}
            placeholder="Search projects by name or ticker…"
            className="w-full rounded border border-line bg-card py-2 pl-8 pr-2.5 text-label outline-none focus:border-cyan-500 transition-colors"
          />
        </div>
        {pickerLoading ? (
          <CardSkeleton count={4} />
        ) : pickerResults.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line">
            <EmptyState variant="search" title="No projects found" description="Try a different name or ticker." />
          </div>
        ) : (
          <div className="divide-y divide-line/50 overflow-hidden rounded-lg border border-line/70 bg-card shadow-card">
            {pickerResults.map((p) => (
              <button
                key={p.id}
                onClick={() => navigate(`/notes/${p.id}`)}
                className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-ice-soft/50 dark:hover:bg-ice-soft/10"
              >
                <span className="text-label font-semibold">{p.name}</span>
                {p.ticker && <span className="font-mono text-xs text-grey">{p.ticker}</span>}
                <span className="ml-auto text-micro font-semibold capitalize text-grey">{p.band}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          aria-label="Back to customer"
          onClick={() => navigate(`/customer/${projectId}`)}
        >
          <ArrowLeft size={16} />
        </Button>
        <PageTitle
          className="mb-0 flex-1"
          icon={<FileText size={20} />}
          actions={
            <>
              <select
                value={projectId}
                onChange={(e) => navigate(`/notes/${e.target.value}`)}
                title="Switch project"
                className="max-w-[180px] rounded border border-line bg-card px-2 py-1 text-label outline-none focus:border-cyan-500 transition-colors"
              >
                {!pickerResults.some((p) => p.id === projectId) && <option value={projectId}>Current project</option>}
                {pickerResults.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <Button variant="secondary" size="sm" onClick={() => void load()}>
                <RefreshCw size={12} /> Refresh
              </Button>
            </>
          }
        >
          Notes & Documents
        </PageTitle>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 p-3 text-label text-red-700 dark:text-red-300">{error}</div>}
      {loading && <CardSkeleton count={4} />}

      {!loading && (
        <>
          {/* Notes */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <SectionLabel as="h2">Notes ({notes.length})</SectionLabel>
              <Button variant="primary" size="sm" onClick={startNew}>
                <Plus size={12} /> New note
              </Button>
            </div>

            {editingId && (
              <div className="space-y-2 rounded-lg border border-line/70 bg-card shadow-card p-3">
                <input
                  value={draftTitle}
                  onChange={(e) => setDraftTitle(e.target.value)}
                  placeholder="Title (optional)"
                  className="w-full rounded border border-line px-2.5 py-1.5 text-label outline-none focus:border-cyan-500 transition-colors"
                />
                <textarea
                  value={draftBody}
                  onChange={(e) => setDraftBody(e.target.value)}
                  placeholder="Write in markdown…"
                  rows={6}
                  className="w-full rounded border border-line px-2.5 py-1.5 font-mono text-label outline-none focus:border-cyan-500 transition-colors"
                />
                <div className="flex gap-2">
                  <Button variant="primary" size="sm" onClick={() => void saveNote()}>
                    <Save size={12} /> Save
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => setEditingId(null)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {notes.length === 0 && !editingId && (
              <div className="rounded-lg border border-dashed border-line">
                <EmptyState
                  icon={<FileText size={28} className="text-grey" />}
                  title="No notes yet"
                  description="Create the first note for this project."
                />
              </div>
            )}

            {notes.map((n) => (
              <div key={n.id} className="rounded-lg border border-line/70 bg-card shadow-card p-3">
                <div className="flex items-center gap-2">
                  {n.pinned && <Pin size={11} className="text-amber-500" />}
                  <span className="text-label font-bold">{n.title || 'Untitled'}</span>
                  <span className="text-xs text-grey num-tabular">v{n.currentVersion}</span>
                  <span className="ml-auto text-xs text-grey num-tabular">{fmtDate(n.updatedAt)}</span>
                </div>
                <pre className="mt-1.5 whitespace-pre-wrap font-sans text-label text-grey">{n.body}</pre>
                <div className="mt-2 flex gap-2">
                  <button onClick={() => startEdit(n)} className="text-xs font-semibold text-cyan-600 dark:text-cyan-400 hover:underline">Edit</button>
                  <button onClick={() => void togglePin(n)} className="text-xs font-semibold text-amber-600 dark:text-amber-400 hover:underline">
                    {n.pinned ? 'Unpin' : 'Pin'}
                  </button>
                  <button onClick={() => void deleteNote(n)} className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 dark:text-red-400 hover:underline">
                    <Trash2 size={10} /> Delete
                  </button>
                </div>
              </div>
            ))}
          </section>

          {/* Documents */}
          <section className="space-y-2">
            <SectionLabel as="h2">Documents ({docs.length})</SectionLabel>

            <div className="space-y-2 rounded-lg border border-line/70 bg-card shadow-card p-3">
              <input
                value={docName}
                onChange={(e) => setDocName(e.target.value)}
                placeholder="Document name"
                className="w-full rounded border border-line px-2.5 py-1.5 text-label outline-none focus:border-cyan-500 transition-colors"
              />
              <input
                value={docUrl}
                onChange={(e) => setDocUrl(e.target.value)}
                placeholder="External URL (optional)"
                className="w-full rounded border border-line px-2.5 py-1.5 text-label outline-none focus:border-cyan-500 transition-colors"
              />
              <textarea
                value={docContent}
                onChange={(e) => setDocContent(e.target.value)}
                placeholder="Or paste inline text (max 200 KB)"
                rows={3}
                className="w-full rounded border border-line px-2.5 py-1.5 font-mono text-label outline-none focus:border-cyan-500 transition-colors"
              />
              <Button variant="primary" size="sm" onClick={() => void addDoc()}>
                <Paperclip size={12} /> Add document
              </Button>
            </div>

            {docs.map((d) => (
              <div key={d.id} className="flex items-center gap-2 rounded-lg border border-line/70 bg-card shadow-card p-2.5 text-label">
                <Paperclip size={12} className="text-grey" />
                <span className="font-semibold">{d.name}</span>
                <span className="text-grey">{d.mime}</span>
                {d.sizeBytes > 0 && <span className="text-grey num-tabular">{fmtBytes(d.sizeBytes)}</span>}
                {d.url && (
                  <a href={d.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-cyan-600 dark:text-cyan-400 hover:underline">
                    open <ExternalLink size={10} />
                  </a>
                )}
                <button onClick={() => void deleteDoc(d)} className="ml-auto text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 transition-colors">
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </section>
        </>
      )}
    </div>
  );
}
