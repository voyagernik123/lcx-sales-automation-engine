#!/usr/bin/env bash
#
# ONE COMMAND. Everything that has to happen on Nik's machine, in the order it has to happen.
#
# There are exactly two things I cannot do from here, and this script exists to reduce them to
# the smallest possible actions:
#
#   1. PASTE THE CONNECTION STRING INTO RENDER. Render API keys are account-wide with no
#      per-service scope, so a key that could set DATABASE_URL could also read every other
#      secret on the account — which is the credential we are fixing. So the paste stays
#      manual. What this removes is the GUESSING: phase 1 finds the string that actually
#      connects, before it goes anywhere near the dashboard, so the paste happens once instead
#      of three times with a redeploy between each.
#
#   2. SIGN THE DESKTOP UPDATE. `tauri build` needs the minisign private key at
#      ~/.lcx-terminal/updater.key. It never leaves this machine and it is never read by any
#      script here — `tauri build` takes a PATH and the publisher reads only the `.sig`.
#
# IDEMPOTENT BY DESIGN. Every phase checks whether it is still needed and skips itself if not,
# so running this twice is safe and running it after a partial failure resumes rather than
# repeats.
#
# THE PASSWORD IS NEVER WRITTEN DOWN. Read with echo off, passed to node over a PIPE (a
# here-string would put it in a temp file under bash), never in `argv` where `ps` would show
# it, and the finished URL goes to the clipboard rather than to stdout. Nothing here is safe to
# run non-interactively and it refuses to try.
#
#   Usage:  bash scripts/go-live.sh            # all phases
#           bash scripts/go-live.sh --db        # database only
#           bash scripts/go-live.sh --desktop   # desktop release only
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

API="https://lcx-sales-api.onrender.com"
CHANNEL="https://github.com/voyagernik123/lcx-terminal-releases/releases/latest/download/latest.json"

WANT_DB=1
WANT_DESKTOP=1
FROM_CLIP=0
for arg in "$@"; do
  case "$arg" in
    --db)      WANT_DESKTOP=0 ;;
    --desktop) WANT_DB=0 ;;
    # READ THE PASSWORD FROM THE CLIPBOARD INSTEAD OF ASKING FOR IT.
    #
    # Supabase generates ~30 characters of mixed case and symbols and shows them ONCE. Asking
    # an operator to retype that into a prompt with echo off means a typo and a wrong
    # credential are indistinguishable — which is exactly the confusion that burned three
    # attempts here. Copy it in the dashboard, pass --clip, never type it.
    --clip)    FROM_CLIP=1 ;;
    *) echo "unknown flag: $arg (expected --db, --desktop, --clip, or nothing)"; exit 2 ;;
  esac
done

bold() { printf '\n\033[1m%s\033[0m\n' "$1"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$1"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$1"; }
bad()  { printf '  \033[31m✗\033[0m %s\n' "$1"; }

# ── what does production say right now ────────────────────────────────────────────────
health() { curl -s --max-time 25 "$API/health" 2>/dev/null || echo '{}'; }
health_field() { node -e '
  let s=""; process.stdin.on("data",d=>s+=d).on("end",()=>{
    let j={}; try { j=JSON.parse(s) } catch {}
    const path=process.argv[1].split(".");
    let v=j; for (const k of path) v = (v==null?undefined:v[k]);
    console.log(v==null?"":String(v));
  });' "$1"; }

bold "LCX · go-live"

HEALTH_SNAPSHOT="$(health)"
DB_STATE="$(printf '%s' "$HEALTH_SNAPSHOT" | health_field db)"
# `db=up` is NOT the finish line, and treating it as one made this script skip the work it exists
# to do. See the skip condition below.
DB_SOURCE="$(printf '%s' "$HEALTH_SNAPSHOT" | health_field dbUrlSource)"
DB_POOLER="$(printf '%s' "$HEALTH_SNAPSHOT" | health_field dbUrlShape.pooler)"
if [ -z "$DB_STATE" ]; then
  warn "the API did not answer in 25s — it may be cold-starting on the free plan. Continuing."
else
  printf '  API says db=%s' "$DB_STATE"
  [ -n "$DB_SOURCE" ] && printf '  (config source: %s)' "$DB_SOURCE"
  printf '\n'
fi

# ══ PHASE 1 · the database ════════════════════════════════════════════════════════════
# ── WHY THIS SKIPS ON THE CONFIG AND NOT ON `db=up` ──────────────────────────────────
#
# It used to skip whenever `db=up`, and on 2026-08-18 that made it refuse to help at the exact
# moment it was needed. The owner had pasted a DIRECT-host string into Render three times;
# `/health` reported `db=up` because the API probes pooler forms and adopts one that answers, so
# it was healing the bad config at boot. The script saw `up`, printed "already up — nothing to
# do", and skipped — while `dbUrlSource` said `pooler-fallback` and `dbUrlShape.pooler` said
# `false`. The system was working for a reason nobody had configured, and the one tool built to
# fix that declined to run.
#
# `up` means the database answers. `dbUrlSource: env` means it answers because of what is in the
# dashboard. Only the second is finished, so only the second skips.
#
# The fields are read defensively: an older API that predates `dbUrlShape` returns empty strings
# for both, and an empty `DB_SOURCE` falls back to the old behaviour rather than looping forever
# on a deployment that cannot report its own config.
if [ "$WANT_DB" = 1 ] && [ "$DB_STATE" = "up" ]; then
  if [ "$DB_SOURCE" = "pooler-fallback" ] || [ "$DB_POOLER" = "false" ]; then
    bold "1 · database — up, but by SELF-REPAIR rather than by configuration"
    #
    # ── THE FIRST VERSION OF THIS TEXT WAS WRONG, AND WRONG IN THE DIRECTION THAT COSTS TIME ──
    #
    # It said the fallback "adopts whichever form answers", called it "undiagnosed luck", and
    # told the owner a future cold start "rolls the dice again". None of that is true.
    # `poolerCandidates` in apps/api/src/db/poolerFallback.ts builds its list with eu-central-1
    # FIRST and `aws-0` before `aws-1` — so `aws-0-eu-central-1.pooler.supabase.com` is the very
    # first candidate probed, and it is the one that works. Healing is deterministic and repeats
    # identically on every boot.
    #
    # The earlier "no pooler form answered" was not a lost dice roll either: the boot loop
    # swallowed 28P01 and swept all 28 candidates, so a WRONG PASSWORD reported itself as an
    # unreachable host. That is now fixed at source (`healFailure`, reported as `dbHealFailure`).
    #
    # Scaring someone into a fix is a way of being obeyed rather than understood, and it makes
    # the next warning worth less. State the cost accurately and let the owner decide.
    #
    ok   "Nothing is broken, and nothing here is at risk of breaking."
    warn "db=up with dbUrlSource=${DB_SOURCE:-unknown}: DATABASE_URL still names the DIRECT host,"
    warn "and the API derives the session-pooler form at boot and uses that instead."
    warn "That derivation is DETERMINISTIC — aws-0-eu-central-1 is the first candidate it tries"
    warn "and it is the one that works — so every cold start heals the same way."
    printf '\n'
    warn "What it actually costs you: the dashboard no longer describes the running system. The"
    warn "next person to read DATABASE_URL — including me in a later session — sees a string that"
    warn "cannot work, and each boot spends one doomed connection attempt before healing."
    printf '\n'
    warn "This is HYGIENE, not an outage. Fixing it takes one paste."
    printf '  \033[1mFix it now? [Enter = yes · s = skip and accept it as-is]: \033[0m'
    read -r FIX_DB_ANSWER || true
    case "${FIX_DB_ANSWER:-}" in
      [sSnN]*)
        printf '\n'
        ok "Skipped, deliberately. Recorded as an accepted difference between config and behaviour,"
        ok "not as an open task. Re-run with --db whenever you want it closed."
        WANT_DB=0
        ;;
      *) printf '\n' ;;
    esac
  else
    bold "1 · database"
    ok "already up, from the configured value (dbUrlSource=${DB_SOURCE:-env}) — nothing to do."
    WANT_DB=0
  fi
fi

if [ "$WANT_DB" = 1 ]; then
  bold "1 · database — find the string that works, THEN paste it once"

  HINT="$(health | health_field dbHint.code)"
  [ -n "$HINT" ] && printf '  the API names its own defect: %s\n' "$HINT"

  # NOTHING HERE IS RATIONED. There is no lockout at the pooler and no attempt budget
  # anywhere — the loop below just saves re-running the script. Run this as often as needed.
  RC=1

  if [ "$FROM_CLIP" = 1 ]; then
    if ! command -v pbpaste >/dev/null 2>&1; then
      bad "pbpaste not available — drop --clip and type it instead."
      exit 3
    fi
    #
    # READ THE CLIPBOARD **AFTER** THE OPERATOR CONFIRMS, NOT AT LAUNCH.
    #
    # Reading it at launch guaranteed the bug it was meant to prevent: to run this command you
    # copy this command, so the clipboard holds the command and --clip reads it straight back.
    # Three runs tested the 65-character string
    #     bash /Users/nik/Downloads/usclaude-main/scripts/go-live.sh --clip
    # and each reported a confident authentication failure about it. Pausing here means the
    # clipboard can hold the command when the script STARTS and the connection string when it
    # is actually read.
    #
    printf '\n  --clip · the clipboard is read AFTER you press Enter, not now.\n\n'
    printf '     1. Supabase → your project → Connect → Session pooler\n'
    printf '     2. Copy that string, and replace [YOUR-PASSWORD] with the real one\n'
    printf '     3. Come back here and press Enter\n'
    if [ -t 0 ]; then
      printf '\n  Copied it? Press Enter (Ctrl-C to abort): '
      read -r _ || true
      printf '\n'
    else
      warn "no terminal — reading the clipboard immediately."
    fi
    set +e
    pbpaste | node "$ROOT/scripts/check-db-url.mjs"
    RC=$?
    set -e
  else
    if [ ! -t 0 ]; then
      bad "no terminal attached. This phase reads a password with echo off and refuses to run"
      bad "without a TTY — run it yourself in Terminal, or use --clip."
      exit 3
    fi

    # ASK FOR EITHER, because the dashboard's copy button gives you the whole string and
    # three attempts were burned pasting that into a prompt that said "password".
    printf '\n  Paste EITHER of these — the checker works out which it got:\n'
    printf '    · the whole connection string from Supabase → Connect → Session pooler\n'
    printf '      (starting postgresql:// — replace [YOUR-PASSWORD] with the real one first)\n'
    printf '    · or just the DATABASE password on its own\n'
    printf '\n  NOT the anon key, NOT service_role, NOT your account login password — it will\n'
    printf '  say so if you paste one of those rather than guessing at the result.\n'
    printf '  Nothing is echoed, saved or logged.\n'
    printf '\n  Easier: copy it in Supabase and re-run with --clip so you never retype it.\n'

    for try in 1 2 3; do
      printf '\n  Password (try %s — not rationed, just a convenience loop): ' "$try"
      # `IFS=` MATTERS. Without it `read` strips leading and trailing whitespace, so a paste
      # that picked up a space silently becomes a different password and the resulting 28P01
      # is unexplainable. Preserve exactly what arrived; the checker reports and tries both.
      IFS= read -rs PW
      printf '\n\n'
      if [ -z "$PW" ]; then bad "empty — nothing to test."; unset PW; continue; fi

      # printf is a SHELL BUILTIN, so the value never becomes a process argument, and a pipe
      # means it never touches a temp file the way a here-string would under bash.
      set +e
      printf '%s' "$PW" | node "$ROOT/scripts/check-db-url.mjs"
      RC=$?
      set -e
      unset PW
      [ "$RC" = 0 ] && break
      [ "$try" != 3 ] && warn "nothing was sent to Render. Try again, or Ctrl-C and use --clip."
    done
  fi

  if [ "$RC" != 0 ]; then
    bad "no working connection string found. Stopping BEFORE Render — nothing was changed."
    bad "Re-running costs nothing: there is no lockout and no attempt limit."
    exit "$RC"
  fi

  bold "  → now paste it into Render (one field, once)"
  cat <<'STEPS'
     1. Render → lcx-sales-api → Environment
     2. DATABASE_URL → Edit → SELECT ALL → paste → Save Changes
     3. Events tab should show a new deploy starting

  ⚠ PASTE THE STRING THIS SCRIPT JUST PUT ON YOUR CLIPBOARD. Do NOT go back to Supabase
    and copy one from there. The Connect panel DEFAULTS to "Direct connection", whose host
    resolves to IPv6 only and is unreachable from Render's IPv4-only free tier — so that
    string is valid, carries the right password, and can never work. Pasting it produced a
    successful deploy that still reported SUPABASE_DIRECT_HOST_IS_IPV6_ONLY, which looked
    exactly like the save having failed.

    The clipboard string is the SESSION POOLER form and it has just been proven to connect
    from this machine. If the clipboard has since been overwritten, re-run this with --db;
    it regenerates and re-verifies in seconds.
STEPS
  printf '\n  Press Enter once you have saved it (or Ctrl-C to stop here): '
  read -r _ || true

  #
  # WATCH FOR A RESTART, NOT JUST FOR SUCCESS.
  #
  # `dbHint` comes from DATABASE_URL, which is read once at boot, so a stale hint means either
  # "the variable is still wrong" or "it was fixed and the old process is still serving" —
  # opposite problems. The first version of this loop waited six minutes and then announced
  # that Render's copy of the string must be wrong, having never established that the deploy
  # had finished. `uptimeSeconds` settles it: if uptime keeps climbing past the moment the
  # save was made, nothing has restarted.
  #
  # This is a DOCKER service on Render's free plan. A redeploy rebuilds the image, which takes
  # far longer than a restart, so the window is 12 minutes rather than 6.
  #
  #
  # ── THE EXIT CONDITION HERE WAS THE SAME DEFECT AS THE SKIP CONDITION ABOVE ─────────
  #
  # `if [ "$S" = "up" ]; then ok "DATABASE IS UP."` — which is true BEFORE the paste, because
  # the API heals the bad value at boot. On 2026-08-18 this printed a single line,
  # `db=up uptime=178s`, against a recorded pre-deploy uptime of 178s — the same process,
  # never restarted, nothing deployed — and declared success. I fixed the skip at the top of
  # this phase and left the identical bug ten lines further down, in the same commit.
  #
  # A save has landed when BOTH are true: a new process is serving, and that new process reports
  # `dbUrlSource: env`. `up` alone proves neither.
  #
  bold "  waiting for Render to redeploy and reconnect"
  START_UP="$(health | health_field uptimeSeconds)"
  [ -n "$START_UP" ] && printf '  process uptime before the deploy: %ss\n' "$START_UP"
  RESTARTED=0
  SETTLE=0
  for i in $(seq 1 48); do
    H_JSON="$(health)"
    S="$(printf '%s' "$H_JSON" | health_field db)"
    HINT="$(printf '%s' "$H_JSON" | health_field dbHint.code)"
    UP="$(printf '%s' "$H_JSON" | health_field uptimeSeconds)"
    SRC="$(printf '%s' "$H_JSON" | health_field dbUrlSource)"
    # New at 28f1d6a: names WHICH failure, so a rejected password stops looking like a bad host.
    HEALFAIL="$(printf '%s' "$H_JSON" | health_field dbHealFailure)"
    # Uptime going DOWN is a new process. That is the deploy landing, observed rather than assumed.
    if [ -n "$UP" ] && [ -n "$START_UP" ] && [ "$UP" -lt "$START_UP" ] 2>/dev/null; then RESTARTED=1; fi
    printf '  %s  db=%-5s uptime=%-7s src=%-15s %s\n' \
      "$(date -u +%H:%M:%S)" "${S:-?}" "${UP:-?}s" "${SRC:-?}" "${HEALFAIL:-$HINT}${HEALFAIL:+ (credential, not host)}"

    # A wrong password needs no further waiting: the host answered, so no deploy will fix it.
    if [ "$HEALFAIL" = "WRONG_PASSWORD" ]; then
      printf '\n'
      bad "A pooler host ANSWERED and rejected the password (28P01)."
      bad "The host in DATABASE_URL is fine; the PASSWORD in it is wrong. Waiting cannot help."
      bad "Re-run with --db, and when it asks for the password use the one you just reset."
      break
    fi

    # SUCCESS: a live database reached through the CONFIGURED value.
    # `-z "$SRC"` keeps an older API that predates `dbUrlSource` working on the old, weaker test
    # rather than looping for twelve minutes against a field it will never return.
    if [ "$S" = "up" ] && { [ "$SRC" = "env" ] || [ -z "$SRC" ]; }; then
      ok "DATABASE IS UP, from the configured value${SRC:+ (dbUrlSource=$SRC)}."
      break
    fi

    # Up, restarted, and STILL healing: the value that deployed is not the one on the clipboard.
    # Two polls of grace first — heal is async and a fresh process reads `env` for a moment.
    if [ "$S" = "up" ] && [ "$SRC" = "pooler-fallback" ] && [ "$RESTARTED" = 1 ]; then
      SETTLE=$((SETTLE + 1))
      if [ "$SETTLE" -ge 2 ]; then
        printf '\n'
        bad "A NEW process is running and it still reports dbUrlSource=pooler-fallback."
        bad "So the value that deployed still names the DIRECT host. The save reached the service"
        bad "but not the field: most often SELECT ALL was missed and the paste landed beside the"
        bad "old value, or it was pasted from Supabase's Connect panel, which defaults to Direct."
        warn "The database is UP throughout — this is the hygiene item, not an outage."
        warn "Re-run with --db to put the proven string back on the clipboard."
        break
      fi
    fi

    if [ "$i" = 48 ]; then
      printf '\n'
      if [ "$RESTARTED" = 1 ]; then
        bad "The service DID restart and still reports ${HEALFAIL:-${HINT:-a failure}}."
        bad "So the new process booted with the old value: the save did not change"
        bad "DATABASE_URL on the service this URL points at. Check you edited"
        bad "lcx-sales-api (not another service), and that Save Changes was clicked."
      else
        warn "The service has NOT restarted — uptime only ever climbed. So nothing has"
        warn "deployed yet, and the stale hint says nothing about your new value."
        warn "Either the save did not register, or the Docker rebuild is still running."
        warn "Check Render → lcx-sales-api → Events for a deploy in progress."
      fi
      warn "Re-run with --db to re-verify the credential; nothing here is lost."
    fi
    sleep 15
  done
fi

# ══ PHASE 2 · the desktop update channel ══════════════════════════════════════════════
if [ "$WANT_DESKTOP" = 1 ]; then
  bold "2 · desktop update channel"

  REPO_V="$(node -e 'console.log(require("./apps/desktop/src-tauri/tauri.conf.json").version)')"
  WEB_V="$(node -e 'console.log(require("./apps/web/package.json").version)')"
  PUB_V="$(curl -sL --max-time 25 "$CHANNEL" | node -e '
    let s=""; process.stdin.on("data",d=>s+=d).on("end",()=>{
      try { console.log(JSON.parse(s).version) } catch { console.log("") } });')"

  printf '  repo %s · visible %s · published %s\n' "$REPO_V" "$WEB_V" "${PUB_V:-unknown}"

  if [ "$REPO_V" != "$WEB_V" ]; then
    bad "version drift: tauri.conf.json $REPO_V vs apps/web/package.json $WEB_V."
    bad "Publishing this ships an update that installs and still shows the old version."
    exit 4
  fi

  if [ "$PUB_V" = "$REPO_V" ]; then
    ok "the channel already serves $REPO_V — nothing to publish. Skipping."
  else
    KEY="$HOME/.lcx-terminal/updater.key"
    if [ ! -f "$KEY" ]; then
      bad "no signing key at $KEY."
      bad "Without it the app REFUSES the update, so an unsigned build is not publishable."
      bad "If it is genuinely lost, every installed desk needs reinstalling by hand — say so."
      exit 5
    fi
    ok "signing key present (not read by this script — tauri takes the path)"

    #
    # PUT CARGO ON PATH OURSELVES. A NON-INTERACTIVE BASH READS NO PROFILE AT ALL.
    #
    # `bash script.sh` from a zsh session sources neither .zshrc nor .bash_profile — a
    # non-interactive bash reads only $BASH_ENV, which is normally unset. rustup installs to
    # ~/.cargo/bin and puts it on PATH from a login shell's rc file, so cargo is present for
    # the human and absent for the script. `tauri build` then dies with
    #
    #   failed to run 'cargo metadata' ... No such file or directory (os error 2)
    #
    # which reads like a broken Rust install rather than an environment difference, and sends
    # the reader off reinstalling a toolchain that was never broken. Depending on the calling
    # shell's PATH is the defect; this removes the dependency.
    #
    if ! command -v cargo >/dev/null 2>&1; then
      # shellcheck disable=SC1091
      [ -f "$HOME/.cargo/env" ] && . "$HOME/.cargo/env"
      case ":$PATH:" in *":$HOME/.cargo/bin:"*) ;; *) PATH="$HOME/.cargo/bin:$PATH" ;; esac
      export PATH
    fi
    if ! command -v cargo >/dev/null 2>&1; then
      bad "cargo is not installed. Tauri compiles a Rust binary, so it cannot build without it."
      bad "Install with:  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
      exit 7
    fi
    ok "cargo on PATH ($(command -v cargo))"

    # VITE_API_URL is COMPILED IN. Without it the bundle talks to /api on its own origin and
    # every request fails, silently, on a desktop app that has no Vite proxy to save it.
    export VITE_API_URL="$API"
    export TAURI_SIGNING_PRIVATE_KEY="$KEY"
    export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="${TAURI_SIGNING_PRIVATE_KEY_PASSWORD:-}"

    bold "  building $REPO_V (signed) — this takes a few minutes"
    npm run build:dmg -w @lcx/desktop

    bold "  publishing to the update channel"
    npm run release -w @lcx/desktop

    #
    # RETRY, BECAUSE `releases/latest/download/` IS EVENTUALLY CONSISTENT.
    #
    # This check ran once, seconds after the publish, read the CDN's still-cached 0.2.4 and
    # announced "the publish did not take" — about a publish that had worked perfectly, with
    # all five assets and a valid signature already on the release. A false failure costs the
    # same as a false pass: it sent the operator back to re-run a release that was done.
    #
    # Propagation delay is the documented behaviour of the endpoint, not a flake, so tolerating
    # it is part of asking the question correctly.
    #
    bold "  verifying the channel actually moved"
    NOW_V=""
    for try in $(seq 1 24); do
      NOW_V="$(curl -sL --max-time 25 "$CHANNEL" | node -e '
        let s=""; process.stdin.on("data",d=>s+=d).on("end",()=>{
          try { console.log(JSON.parse(s).version) } catch { console.log("") } });')"
      [ "$NOW_V" = "$REPO_V" ] && break
      printf '  attempt %s: channel serves %s, waiting for it to repoint to %s\n' "$try" "${NOW_V:-unparseable}" "$REPO_V"
      sleep 5
    done
    if [ "$NOW_V" = "$REPO_V" ]; then
      ok "channel now serves $NOW_V. Installed desks will offer it on next launch."
    else
      bad "channel still says ${NOW_V:-unknown} after 2 minutes, expected $REPO_V."
      bad "The release itself may well exist — check before republishing:"
      bad "  gh release view v$REPO_V --repo voyagernik123/lcx-terminal-releases"
      exit 6
    fi
  fi
fi

# ══ the closing picture ═══════════════════════════════════════════════════════════════
bold "where things stand"
H="$(health)"
printf '  api db      : %s\n' "$(printf '%s' "$H" | health_field db)"
HC="$(printf '%s' "$H" | health_field dbHint.code)"
[ -n "$HC" ] && printf '  api dbHint  : %s\n' "$HC"
printf '  api version : %s\n' "$(printf '%s' "$H" | health_field version)"
printf '  channel     : %s\n' "$(curl -sL --max-time 25 "$CHANNEL" | node -e '
  let s=""; process.stdin.on("data",d=>s+=d).on("end",()=>{
    try { console.log(JSON.parse(s).version) } catch { console.log("unknown") } });')"
printf '\n'
