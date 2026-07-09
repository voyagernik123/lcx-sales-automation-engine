# LCX Sales Automation — Operator SOP

## Daily Operator Checklist

1. **Health check** — verify API + DB
   ```bash
   curl https://<api>/health
   ```
   Expect `{"status":"up","db":"up"}`

2. **KPI Dashboard** — open `/bd-kpis`
   - Check new high-score leads this week
   - Review funnel drop-off (enrolled → replied → proposal → won)
   - Check stalled deals table (anything >14d without update)
   - Review weekly operator view (hot/stalled/overdue)

3. **Handoff Queue** — open `/outreach`
   - Claim any open handoffs
   - Process re-nurture items
   - Check for unresolved handoffs >48h

4. **BD Pipeline** — open `/bd-pipeline`
   - Scan new high-band leads (immediate/high)
   - Verify US CLARITY toggle is set correctly
   - Check recommended market filter for US-first leads

## Weekly Pipeline Review

1. **Scoring review** — run enrichment if COINGECKO_API_KEY is set:
   ```bash
   npx tsx src/enrich/index.ts enrich:all --concurrency 3
   ```

2. **Deal pipeline** — review all deals past discovery:
   - Check objection log for blockers
   - Generate proposals for deals in proposal stage
   - Push stalled deals or mark as lost with reason

3. **Trigger review** — `/bd-kpis` → triggers table:
   - Review upcoming 30/60/90 post-listing triggers
   - Draft content for pending triggers (human send only)
   - Mark completed triggers as done

4. **Audit log** — open `/audit-log`
   - Filter by entity/action to verify data integrity
   - Spot-check recent automated operations

5. **Export** — KPI CSV for board meeting:
   ```bash
   curl -H "Authorization: Bearer $API_KEY" https://<api>/v1/kpis/export > kpis-$(date +%Y-%m-%d).csv
   ```

## Incident Response

### Spam / Abuse (reply from unrelated party)
1. Open project in LeadDetail
2. Suppress project → `POST /v1/projects/:id/suppress`
3. Verify outreach sequences are paused
4. Log incident in audit trail
5. Add to suppression table if needed

### Wrong Contact (bounce / wrong person)
1. Update person email status → `invalid`
2. Re-enroll with correct contact
3. Update fromEmail if domain changed

### API Down
1. Check logs: `docker compose logs -f lcx-sales-api` (local) or deployment dashboard
2. Verify Postgres: `docker compose logs -f postgres` or `PGPASSWORD=... pg_isready`
3. Restart: `docker compose restart` or trigger re-deploy
4. If persistent, restore from latest backup:
   ```bash
   ./scripts/backup.sh list ./data/backups
   ./scripts/backup.sh restore ./data/backups/lcx_sales_latest.dump
   ```

### Rate Limiting (429 errors)
1. Check `X-RateLimit-Remaining` and `X-RateLimit-Reset` headers
2. Back off automated tasks
3. If legitimate traffic exceeds limits, adjust `middleware/rateLimit.ts`

### Data Integrity
1. Audit log captures all mutations — check `/audit-log` for anomaly patterns
2. Daily snapshots in `kpi_daily_snapshots` table for point-in-time comparison
3. Backup before any bulk operation (import, score all, enrich all):
   ```bash
   ./scripts/backup.sh backup
   ```

## Rollback Plan

### Database rollback
1. Identify the offending migration number (e.g., `0007_us_intel`):
   ```sql
   SELECT * FROM schema_migrations ORDER BY version;
   ```
2. Restore from backup taken before migration:
   ```bash
   ./scripts/backup.sh restore ./data/backups/lcx_sales_<pre-migration>.dump
   ```
3. Re-run any later migrations:
   ```bash
   psql ... -f apps/api/src/db/migrations/...
   ```

### Code rollback (CF Pages)
1. Cloudflare Pages dashboard → Deployments tab
2. Find the previous successful deployment
3. Click "Rollback to this deployment"
4. Verify health: `GET /health`

### API rollback (Fly/Railway/Cloud Run)
1. Revert to previous Docker image tag
2. Trigger re-deploy from CI or dashboard
3. Verify with smoke test: `./scripts/smoke-e2e.sh`

## Backup Strategy
- **Automated**: Daily via cron:
  ```cron
  0 2 * * * /app/scripts/backup.sh backup /data/backups
  ```
- **Retention**: Keep 7 daily, 4 weekly, 3 monthly
- **Restore drill**: Test restore quarterly in staging
- **Verification**: After backup, run `pg_restore --list <dump> | head` to validate

## Security Notes
- **No secrets in frontend** — API key stored only in localStorage, never in bundle
- **PII** — email, linkedin, telegram stored for outreach; suppression table honors opt-out
- **Rate limits** — 60 req/min default, 300 req/min for authenticated operators
- **CORS** — restricted to known origins in production
- **Post-listing triggers** — draft only; all human send, never automated
