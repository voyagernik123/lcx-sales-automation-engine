-- 0020 — rich project notes (versioned) + document metadata blobs.
-- Documents store an inline text/base64 blob capped at 200KB (no real file storage). Idempotent.

CREATE TABLE IF NOT EXISTS project_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT,
  body TEXT NOT NULL DEFAULT '',           -- markdown
  current_version INTEGER NOT NULL DEFAULT 1,
  pinned BOOLEAN NOT NULL DEFAULT false,
  created_by TEXT NOT NULL DEFAULT 'operator',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_project_notes_project ON project_notes (project_id, updated_at DESC);

-- Immutable history — one row per saved revision of a note's body.
CREATE TABLE IF NOT EXISTS note_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id UUID NOT NULL REFERENCES project_notes(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  title TEXT,
  body TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL DEFAULT 'operator',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_note_versions_uniq ON note_versions (note_id, version);
CREATE INDEX IF NOT EXISTS idx_note_versions_note ON note_versions (note_id, version DESC);

CREATE TABLE IF NOT EXISTS project_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  mime TEXT NOT NULL DEFAULT 'text/plain',
  size_bytes INTEGER NOT NULL DEFAULT 0,
  url TEXT,                 -- optional external link instead of inline blob
  content TEXT,             -- inline text or base64 blob, capped at 200KB by the API
  created_by TEXT NOT NULL DEFAULT 'operator',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_project_documents_project ON project_documents (project_id, created_at DESC);
