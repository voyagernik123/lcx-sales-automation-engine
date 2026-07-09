#!/usr/bin/env bash
set -euo pipefail

# LCX Sales Automation — Postgres Backup & Restore
# Usage:
#   ./scripts/backup.sh backup [output_dir]    — Dump all databases
#   ./scripts/backup.sh restore <dump_file>     — Restore from dump
#
# Environment: DATABASE_URL must be set (or use .env)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"

# Load .env from API directory if present
if [ -f "$PROJECT_ROOT/apps/api/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$PROJECT_ROOT/apps/api/.env"
  set +a
fi

DB_URL="${DATABASE_URL:-postgresql://lcx:lcx_dev_password@localhost:5432/lcx_sales}"

# Parse DB_URL into components
DB_USER="$(echo "$DB_URL" | sed -n 's|postgresql://\([^:]*\):.*|\1|p')"
DB_PASS="$(echo "$DB_URL" | sed -n 's|postgresql://[^:]*:\([^@]*\)@.*|\1|p')"
DB_HOST="$(echo "$DB_URL" | sed -n 's|postgresql://.*@\([^:]*\):.*|\1|p')"
DB_PORT="$(echo "$DB_URL" | sed -n 's|postgresql://.*:\([^/]*\)/.*|\1|p')"
DB_NAME="$(echo "$DB_URL" | sed -n 's|postgresql://.*/\(.*\)|\1|p')"

: "${DB_USER:=lcx}"
: "${DB_PASS:=lcx_dev_password}"
: "${DB_HOST:=localhost}"
: "${DB_PORT:=5432}"
: "${DB_NAME:=lcx_sales}"

export PGPASSWORD="$DB_PASS"

backup() {
  local output_dir="${1:-$PROJECT_ROOT/data/backups}"
  mkdir -p "$output_dir"

  local dump_file="$output_dir/lcx_sales_${TIMESTAMP}.dump"
  local latest_link="$output_dir/lcx_sales_latest.dump"

  echo "=== Backup: $DB_NAME @ $DB_HOST:$DB_PORT ==="
  echo "Output: $dump_file"

  pg_dump \
    --host="$DB_HOST" \
    --port="$DB_PORT" \
    --username="$DB_USER" \
    --dbname="$DB_NAME" \
    --format=custom \
    --verbose \
    --no-owner \
    --no-privileges \
    --file="$dump_file"

  # Create/update symlink to latest
  ln -sf "$dump_file" "$latest_link"

  local size
  size="$(du -h "$dump_file" | cut -f1)"
  echo "=== Backup complete: $size ==="
  echo "  File: $dump_file"
  echo "  Latest: $latest_link"
}

restore() {
  local dump_file="${1:-}"
  if [ -z "$dump_file" ]; then
    echo "Usage: $0 restore <dump_file>"
    exit 1
  fi
  if [ ! -f "$dump_file" ]; then
    echo "Dump file not found: $dump_file"
    exit 1
  fi

  echo "=== Restore: $dump_file → $DB_NAME @ $DB_HOST:$DB_PORT ==="
  read -rp "This will DROP and recreate $DB_NAME. Continue? [y/N] " confirm
  if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
    echo "Restore cancelled."
    exit 0
  fi

  # Terminate existing connections
  psql \
    --host="$DB_HOST" \
    --port="$DB_PORT" \
    --username="$DB_USER" \
    --dbname="postgres" \
    -c "SELECT pg_terminate_backend(pg_stat_activity.pid) FROM pg_stat_activity WHERE pg_stat_activity.datname = '$DB_NAME' AND pid <> pg_backend_pid();"

  # Drop and recreate
  dropdb --host="$DB_HOST" --port="$DB_PORT" --username="$DB_USER" --if-exists "$DB_NAME"
  createdb --host="$DB_HOST" --port="$DB_PORT" --username="$DB_USER" "$DB_NAME"

  pg_restore \
    --host="$DB_HOST" \
    --port="$DB_PORT" \
    --username="$DB_USER" \
    --dbname="$DB_NAME" \
    --no-owner \
    --no-privileges \
    --verbose \
    "$dump_file"

  echo "=== Restore complete ==="
}

list_backups() {
  local dir="${1:-$PROJECT_ROOT/data/backups}"
  if [ ! -d "$dir" ]; then
    echo "No backups directory found at $dir"
    exit 0
  fi
  echo "=== Available backups ($dir) ==="
  ls -lhS "$dir"/*.dump 2>/dev/null || echo "No backups found."
}

case "${1:-help}" in
  backup)
    backup "${2:-}"
    ;;
  restore)
    restore "${2:-}"
    ;;
  list)
    list_backups "${2:-}"
    ;;
  *)
    echo "LCX Sales — Postgres Backup & Restore"
    echo ""
    echo "Usage:"
    echo "  $0 backup [output_dir]   Create a new backup dump"
    echo "  $0 restore <dump_file>   Restore from a dump file"
    echo "  $0 list [dir]            List available backups"
    echo ""
    echo "Uses DATABASE_URL env var or defaults to dev connection."
    ;;
esac
