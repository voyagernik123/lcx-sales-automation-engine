import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FileText, Plus, Trash2, Save, Pin, Paperclip, RefreshCw, ArrowLeft, ExternalLink } from 'lucide-react';
import { request } from '@/lib/apiClient';

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

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-lg font-bold">
          <button onClick={() => navigate(`/customer/${projectId}`)} className="text-grey hover:text-inherit">
            <ArrowLeft size={16} />
          </button>
          <FileText size={18} /> Notes & Documents
        </h1>
        <button
          onClick={() => void load()}
          className="inline-flex items-center gap-1 rounded border border-line px-2 py-1 text-[11px] font-semibold hover:bg-ice-soft dark:hover:bg-ice-soft/10"
        >
          <RefreshCw size={11} /> Refresh
        </button>
      </div>

      {error && <div className="rounded border border-red-200 bg-red-50 p-3 text-[12px] text-red-700">{error}</div>}
      {loading && <p className="py-8 text-center text-[12px] text-grey">Loading…</p>}

      {!loading && (
        <>
          {/* Notes */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-[11px] font-bold uppercase tracking-wider text-grey">Notes ({notes.length})</h2>
              <button
                onClick={startNew}
                className="inline-flex items-center gap-1 rounded bg-indigo-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-indigo-700"
              >
                <Plus size={12} /> New note
              </button>
            </div>

            {editingId && (
              <div className="space-y-2 rounded border border-line bg-card p-3">
                <input
                  value={draftTitle}
                  onChange={(e) => setDraftTitle(e.target.value)}
                  placeholder="Title (optional)"
                  className="w-full rounded border border-line px-2.5 py-1.5 text-[12px] focus:outline-none focus:ring-1 focus:ring-indigo-400"
                />
                <textarea
                  value={draftBody}
                  onChange={(e) => setDraftBody(e.target.value)}
                  placeholder="Write in markdown…"
                  rows={6}
                  className="w-full rounded border border-line px-2.5 py-1.5 font-mono text-[12px] focus:outline-none focus:ring-1 focus:ring-indigo-400"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => void saveNote()}
                    className="inline-flex items-center gap-1 rounded bg-emerald-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-emerald-700"
                  >
                    <Save size={12} /> Save
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    className="rounded border border-line px-3 py-1.5 text-[11px] font-semibold hover:bg-ice-soft dark:hover:bg-ice-soft/10"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {notes.length === 0 && !editingId && (
              <div className="rounded-lg border border-dashed border-line p-6 text-center text-[12px] text-grey">
                No notes yet.
              </div>
            )}

            {notes.map((n) => (
              <div key={n.id} className="rounded border border-line bg-card p-3">
                <div className="flex items-center gap-2">
                  {n.pinned && <Pin size={11} className="text-amber-500" />}
                  <span className="text-[12px] font-bold">{n.title || 'Untitled'}</span>
                  <span className="text-[10px] text-grey">v{n.currentVersion}</span>
                  <span className="ml-auto text-[10px] text-grey">{fmtDate(n.updatedAt)}</span>
                </div>
                <pre className="mt-1.5 whitespace-pre-wrap font-sans text-[11px] text-grey">{n.body}</pre>
                <div className="mt-2 flex gap-2">
                  <button onClick={() => startEdit(n)} className="text-[10px] font-semibold text-cyan-600 hover:underline">Edit</button>
                  <button onClick={() => void togglePin(n)} className="text-[10px] font-semibold text-amber-600 hover:underline">
                    {n.pinned ? 'Unpin' : 'Pin'}
                  </button>
                  <button onClick={() => void deleteNote(n)} className="inline-flex items-center gap-1 text-[10px] font-semibold text-red-600 hover:underline">
                    <Trash2 size={10} /> Delete
                  </button>
                </div>
              </div>
            ))}
          </section>

          {/* Documents */}
          <section className="space-y-2">
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-grey">Documents ({docs.length})</h2>

            <div className="space-y-2 rounded border border-line bg-card p-3">
              <input
                value={docName}
                onChange={(e) => setDocName(e.target.value)}
                placeholder="Document name"
                className="w-full rounded border border-line px-2.5 py-1.5 text-[12px] focus:outline-none focus:ring-1 focus:ring-indigo-400"
              />
              <input
                value={docUrl}
                onChange={(e) => setDocUrl(e.target.value)}
                placeholder="External URL (optional)"
                className="w-full rounded border border-line px-2.5 py-1.5 text-[12px] focus:outline-none focus:ring-1 focus:ring-indigo-400"
              />
              <textarea
                value={docContent}
                onChange={(e) => setDocContent(e.target.value)}
                placeholder="Or paste inline text (max 200 KB)"
                rows={3}
                className="w-full rounded border border-line px-2.5 py-1.5 font-mono text-[12px] focus:outline-none focus:ring-1 focus:ring-indigo-400"
              />
              <button
                onClick={() => void addDoc()}
                className="inline-flex items-center gap-1 rounded bg-indigo-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-indigo-700"
              >
                <Paperclip size={12} /> Add document
              </button>
            </div>

            {docs.map((d) => (
              <div key={d.id} className="flex items-center gap-2 rounded border border-line bg-card p-2.5 text-[11px]">
                <Paperclip size={12} className="text-grey" />
                <span className="font-semibold">{d.name}</span>
                <span className="text-grey">{d.mime}</span>
                {d.sizeBytes > 0 && <span className="text-grey">{fmtBytes(d.sizeBytes)}</span>}
                {d.url && (
                  <a href={d.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-cyan-600 hover:underline">
                    open <ExternalLink size={10} />
                  </a>
                )}
                <button onClick={() => void deleteDoc(d)} className="ml-auto text-red-600 hover:text-red-700">
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
