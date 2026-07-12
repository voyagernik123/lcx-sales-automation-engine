-- 0019 — team model, lead assignment, roles & permissions.
-- Single-operator today; schema is multi-user-ready. Idempotent.

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'operator', -- operator | admin | bd | analyst | viewer
  status TEXT NOT NULL DEFAULT 'active',  -- active | invited | disabled
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users (lower(email));
CREATE INDEX IF NOT EXISTS idx_users_role ON users (role);

CREATE TABLE IF NOT EXISTS teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_in_team TEXT NOT NULL DEFAULT 'member', -- lead | member
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_team_members_uniq ON team_members (team_id, user_id);
CREATE INDEX IF NOT EXISTS idx_team_members_user ON team_members (user_id);

CREATE TABLE IF NOT EXISTS project_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'owner', -- owner | collaborator | watcher
  assigned_by TEXT NOT NULL DEFAULT 'operator',
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- one assignment per (project, user, role)
CREATE UNIQUE INDEX IF NOT EXISTS idx_proj_assign_uniq ON project_assignments (project_id, user_id, role);
CREATE INDEX IF NOT EXISTS idx_proj_assign_project ON project_assignments (project_id);
CREATE INDEX IF NOT EXISTS idx_proj_assign_user ON project_assignments (user_id);

CREATE TABLE IF NOT EXISTS assignment_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  -- criteria: matched against project/score fields, e.g. {"band":"immediate","region":"eu"}
  criteria JSONB NOT NULL DEFAULT '{}'::jsonb,
  assign_to_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  assign_role TEXT NOT NULL DEFAULT 'owner',
  priority INTEGER NOT NULL DEFAULT 100,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_assign_rules_active ON assignment_rules (active, priority);

-- 2-2 roles & permissions matrix (real enforcement later; operator bypasses today).
CREATE TABLE IF NOT EXISTS permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role TEXT NOT NULL,      -- operator | admin | bd | analyst | viewer
  resource TEXT NOT NULL,  -- projects | deals | notes | documents | users | ...
  action TEXT NOT NULL,    -- read | create | update | delete | assign
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_permissions_uniq ON permissions (role, resource, action);

-- Seed the single operator user so the existing single-operator flow keeps working.
INSERT INTO users (id, email, name, role, status)
VALUES ('00000000-0000-0000-0000-000000000001', 'operator@lcx.com', 'Operator', 'operator', 'active')
ON CONFLICT DO NOTHING;
