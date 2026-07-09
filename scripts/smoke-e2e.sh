#!/usr/bin/env bash
set -euo pipefail

# LCX Sales Automation — E2E Smoke Test
# Validates the full lifecycle: seed → score → enroll → handoff sim → deal
#
# Usage:
#   ./scripts/smoke-e2e.sh [api_base_url] [api_key]
#
# Defaults:
#   API_BASE=http://127.0.0.1:8787
#   API_KEY=dev-operator-key-change-me

API_BASE="${1:-http://127.0.0.1:8787}"
API_KEY="${2:-dev-operator-key-change-me}"
AUTH="Authorization: Bearer $API_KEY"
PASS=0
FAIL=0

green() { echo "  ✓ $1"; }
red() { echo "  ✗ $1"; FAIL=$((FAIL + 1)); }
check() { local label="$1" cmd="$2" msg="$3"; if eval "$cmd" >/dev/null 2>&1; then green "$label"; PASS=$((PASS + 1)); else red "$label: $msg"; fi; }

echo "=== LCX Sales — E2E Smoke Test ==="
echo "API: $API_BASE"
echo "Started: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo ""

# ── 1. Health ──
check "Health endpoint responds" \
  "curl -sf '$API_BASE/health' | jq -e '.status' >/dev/null" \
  "Health endpoint down"

# ── 2. Auth ──
check "Auth valid key" \
  "curl -sf -H '$AUTH' '$API_BASE/v1/me' | jq -e '.data.id' >/dev/null" \
  "Auth failed for valid key"

check "Auth rejects bad key" \
  "curl -sf -o /dev/null -w '%{http_code}' -H 'Authorization: Bearer wrong-key' '$API_BASE/v1/me' | grep -q 401" \
  "Auth should 401 bad key"

# ── 3. Projects ──
check "List projects" \
  "curl -sf -H '$AUTH' '$API_BASE/v1/projects?limit=5' | jq -e '.data | length > 0' >/dev/null" \
  "No projects in pipeline"

PROJECT_ID=$(curl -sf -H "$AUTH" "$API_BASE/v1/projects?limit=1" | jq -r '.data[0].id // empty')
if [ -z "$PROJECT_ID" ]; then
  red "Get project: no project found"
else
  green "Get project: $PROJECT_ID"
  PASS=$((PASS + 1))
fi

# ── 4. Score a project ──
check "Score a project" \
  "curl -sf -X POST -H '$AUTH' -H 'Content-Type: application/json' '$API_BASE/v1/projects/$PROJECT_ID/score' | jq -e '.data.band' >/dev/null" \
  "Scoring failed"

check "Score returns recommended market" \
  "curl -sf -X POST -H '$AUTH' -H 'Content-Type: application/json' '$API_BASE/v1/projects/$PROJECT_ID/score' | jq -e '.data.recommendedMarket' >/dev/null" \
  "Scoring did not include recommendedMarket"

# ── 5. People / Gate Check ──
check "Gate check endpoint" \
  "curl -sf -H '$AUTH' '$API_BASE/v1/projects/$PROJECT_ID/gate' | jq -e '.data' >/dev/null" \
  "Gate check failed"

# ── 6. Enroll dry-run (channel: email) ──
check "Enroll in sequence" \
  "curl -sf -X POST -H '$AUTH' -H 'Content-Type: application/json' -d '{\"channel\":\"email\"}' '$API_BASE/v1/outreach/projects/$PROJECT_ID/enroll' | jq -e '.data.id' >/dev/null" \
  "Enrollment failed"

SEQUENCE_ID=$(curl -sf -H "$AUTH" "$API_BASE/v1/outreach/projects/$PROJECT_ID/sequences" | jq -r '.data[0].id // empty')
if [ -z "$SEQUENCE_ID" ]; then
  red "List sequences: no sequence found"
else
  green "List sequences: $SEQUENCE_ID"
  PASS=$((PASS + 1))
fi

# ── 7. Handoff simulation ──
check "Create synthetic handoff" \
  "curl -sf -X POST -H '$AUTH' -H 'Content-Type: application/json' -d '{\"projectId\":\"$PROJECT_ID\",\"channel\":\"email\",\"triggerReason\":\"test\"}' '$API_BASE/v1/handoffs/synthetic' | jq -e '.data.id' >/dev/null" \
  "Handoff creation failed"

check "List handoffs" \
  "curl -sf -H '$AUTH' '$API_BASE/v1/handoffs' | jq -e '.data | length > 0' >/dev/null" \
  "No handoffs listed"

HANDOFF_ID=$(curl -sf -H "$AUTH" "$API_BASE/v1/handoffs?limit=1" | jq -r '.data[0].id // empty')
if [ -n "$HANDOFF_ID" ]; then
  check "Claim handoff" \
    "curl -sf -X POST -H '$AUTH' '$API_BASE/v1/handoffs/$HANDOFF_ID/claim' | jq -e '.data.status == \"in_progress\"' >/dev/null" \
    "Handoff claim failed"
fi

# ── 8. Deal pipeline ──
check "Get or create deal" \
  "curl -sf -H '$AUTH' '$API_BASE/v1/deals/projects/$PROJECT_ID' | jq -e '.data != null' >/dev/null" \
  "Deal lookup failed"

DEAL_ID=$(curl -sf -H "$AUTH" "$API_BASE/v1/deals/projects/$PROJECT_ID" | jq -r '.data.id // empty')
if [ -z "$DEAL_ID" ]; then
  DEAL_ID=$(curl -sf -X POST -H "$AUTH" -H "Content-Type: application/json" -d "{\"projectId\":\"$PROJECT_ID\"}" "$API_BASE/v1/deals" | jq -r '.data.id // empty')
  if [ -n "$DEAL_ID" ]; then
    green "Create deal: $DEAL_ID"; PASS=$((PASS + 1))
  else
    red "Create deal: failed"; FAIL=$((FAIL + 1))
  fi
else
  green "Deal exists: $DEAL_ID"; PASS=$((PASS + 1))
fi

# ── 9. Deal stage transitions ──
if [ -n "$DEAL_ID" ]; then
  for stage in contacted discovery proposal; do
    check "Transition deal → $stage" \
      "curl -sf -X PATCH -H '$AUTH' -H 'Content-Type: application/json' -d '{\"stage\":\"$stage\"}' '$API_BASE/v1/deals/$DEAL_ID/stage' | jq -e '.data.stage == \"$stage\"' >/dev/null" \
      "Stage transition to $stage failed"
  done
fi

# ── 10. Proposal generation ──
check "Generate proposal" \
  "curl -sf -X POST -H '$AUTH' -H 'Content-Type: application/json' -d '{\"packageType\":\"listing\"}' '$API_BASE/v1/deals/$DEAL_ID/proposal' | jq -e '.data.validUntil' >/dev/null" \
  "Proposal generation failed"

# ── 11. KPIs ──
check "KPI endpoint" \
  "curl -sf -H '$AUTH' '$API_BASE/v1/kpis' | jq -e '.data.funnel' >/dev/null" \
  "KPI endpoint failed"

check "KPI CSV export" \
  "curl -sf -H '$AUTH' '$API_BASE/v1/kpis/export' | head -5 | grep -q 'LCX Sales'" \
  "KPI CSV export failed"

# ── 12. Post-listing triggers ──
check "Post-listing trigger creation" \
  "curl -sf -X POST -H '$AUTH' -H 'Content-Type: application/json' -d '{\"dealId\":\"$DEAL_ID\",\"projectId\":\"$PROJECT_ID\",\"wonAt\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}' '$API_BASE/v1/kpis/triggers' | jq -e '.data.created == 12' >/dev/null" \
  "Trigger creation should create 12 triggers (3 days × 4 types)"

check "List triggers" \
  "curl -sf -H '$AUTH' '$API_BASE/v1/kpis/triggers?projectId=$PROJECT_ID' | jq -e '.data | length == 12' >/dev/null" \
  "Should list 12 triggers"

# ── 13. Audit log ──
check "Audit log endpoint" \
  "curl -sf -H '$AUTH' '$API_BASE/v1/audit?limit=5' | jq -e '.data | length > 0' >/dev/null" \
  "Audit log endpoint failed"

# ── 14. Rate limiting ──
check "Rate limit headers present" \
  "curl -sf -I -H '$AUTH' '$API_BASE/v1/me' 2>/dev/null | grep -qi 'x-ratelimit'" \
  "Rate limit headers missing"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
if [ "$FAIL" -gt 0 ]; then exit 1; fi
