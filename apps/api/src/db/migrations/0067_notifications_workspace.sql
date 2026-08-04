-- 0067 — notifications.workspace (LCX OS 100x, P0 / F3)
--
-- WHY: `listNotifications` was `SELECT … FROM notifications ORDER BY created_at
-- DESC LIMIT n` with no workspace filter and no entitlement check, so every
-- operator's bell showed every compartment's alerts — elevated ones included —
-- in a system whose founding premise is need-to-know (packages/shared/src/
-- workspaces.ts). `markRead('all')` had the same hole on the write side. The
-- table could not be filtered because it never recorded which compartment an
-- alert belonged to.
--
-- THE TWO NULLS, KEPT DISTINCT. `workspaceForPath()` (workspaces.ts:270) returns
-- null for desk-level surfaces every member always holds, so a null workspace is
-- ambiguous: deliberate desk-level, or a legacy row written before this column
-- existed whose provenance is unknown. Collapsing them would repeat the error the
-- governance register exists to prevent — absence of a marker on a pre-marker row
-- means UNKNOWN, not CLEAN. So:
--    workspace = '<id>'   compartment-scoped; visible at >= 'view'
--    workspace = '_desk'  deliberate desk-level; visible to every member
--    workspace IS NULL    UNATTRIBUTED; withheld from EVERYONE and counted aloud
-- Nothing written after this migration is ever NULL: notify() requires the scope
-- as a typed argument, so omission is a compile error, not a runtime default.
--
-- ZERO DROP/DELETE/TRUNCATE — no Supabase destructive-operations warning.

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS workspace TEXT;

-- The eight compartments plus the explicit desk sentinel. Anything else is a bug
-- we want loud at write time rather than a row that silently addresses nobody.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'notifications_workspace_check'
  ) THEN
    ALTER TABLE notifications ADD CONSTRAINT notifications_workspace_check
      CHECK (workspace IS NULL OR workspace IN (
        'command','sales','intel','regulatory','distribution','governance',
        'marketing','gps','_desk'
      ));
  END IF;
END $$;

-- BACKFILL BY RULE, not by parsing href in SQL. Rule names are stable
-- identifiers; href is display routing. Each maps to exactly one compartment via
-- that workspace's webPaths. Note `decisions` and `access` are GOVERNANCE paths,
-- not command — read off the registry, which contradicts the obvious guess.
--
-- THIRTEEN rules, not ten. The first draft of this migration listed ten: the
-- eight in evaluateAlertRules plus deal_stage_change (routes/deals.ts) and access
-- (routes/access.ts). Applying it locally left FOUR rows unattributed and named
-- the three that had been missed — `reply_received` (outreach/handoffs.ts),
-- `weekly_digest` (notifications/digest.ts) and `monitor` (actions/registry.ts),
-- all of which the type system surfaced only later. Recorded because the count
-- was wrong in a document that asserted it, and the DATA is what corrected it.
UPDATE notifications SET workspace = CASE rule
  WHEN 'deal_stalled'            THEN 'sales'
  WHEN 'deal_stage_change'       THEN 'sales'
  WHEN 'competitor_listing'      THEN 'sales'
  WHEN 'discovery_found'         THEN 'sales'
  WHEN 'reply_received'          THEN 'sales'         -- href /outreach
  WHEN 'weekly_digest'           THEN 'sales'         -- body is deals + handoffs
  WHEN 'decision_review_due'     THEN 'governance'
  WHEN 'access'                  THEN 'governance'
  WHEN 'command_rfi_stale'       THEN 'command'
  WHEN 'command_critical_open'   THEN 'command'
  WHEN 'dist_listing_stale'      THEN 'distribution'
  WHEN 'dist_campaign_uncleared' THEN 'distribution'
  ELSE NULL
END
WHERE workspace IS NULL;

-- `monitor` is DELIBERATELY ABSENT above. Its compartment depends on the href the
-- monitor's author supplied, which this migration cannot resolve without the
-- webPaths registry, so historic monitor rows stay NULL — genuinely unattributed
-- rather than guessed. New ones are attributed at write time
-- (actions/registry.ts derives workspaceForPath(href) ?? 'intel').
--
-- Any row from a rule this migration does not know likewise stays NULL. Those are
-- withheld from every reader and reported as `unattributed` with a count.
-- Guessing a compartment for them would be the exact failure this migration
-- closes: a row addressed to someone who was never meant to read it.

-- Read path: the bell lists by (workspace, created_at DESC) and counts unread by
-- (workspace, read_at). The pre-existing idx_notif_unread (read_at, created_at)
-- cannot serve either now that both are workspace-scoped.
CREATE INDEX IF NOT EXISTS idx_notif_ws_created
  ON notifications (workspace, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notif_ws_unread
  ON notifications (workspace, read_at) WHERE read_at IS NULL;

COMMENT ON COLUMN notifications.workspace IS
  'Compartment this alert belongs to. One of the eight workspace ids, or ''_desk'' '
  'for deliberate desk-level alerts every member sees. NULL means UNATTRIBUTED: a '
  'legacy row predating this column whose compartment is unknown — withheld from '
  'every reader and counted aloud as `unattributed`, never shown and never silently '
  'dropped. Writes after 0067 cannot be NULL (notify() takes the scope as a required '
  'typed argument).';
