#!/bin/bash
# Live verification by CONTENT, not by "the deploy finished".
#   verify-live.sh <full-sha> [--js 'needle']... [--css 'needle']... [--css-absent 'needle']...
# Pages: every --js needle must appear in SOME deployed JS asset; every --css needle must appear in
# SOME deployed CSS asset; every --css-absent needle must appear in NO deployed CSS asset (a deletion
# is only live when the old bytes are gone). Render: the latest GitHub deployment's sha must START
# WITH the given sha (the API's short sha is compared by prefix — the S3 script compared short to
# full and printed "waiting" forever after the deploy had landed) and its newest status be success.
BASE='https://lcx-sales-automation-engine.pages.dev'
SHA="$1"; shift
JS=(); CSS=(); CSS_ABSENT=(); JS_ABSENT=(); LAZY_JS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --js) JS+=("$2"); shift 2;;
    --css) CSS+=("$2"); shift 2;;
    --css-absent) CSS_ABSENT+=("$2"); shift 2;;
    --js-absent) JS_ABSENT+=("$2"); shift 2;;
    --lazy-js) LAZY_JS+=("$2"); shift 2;;
    *) echo "unknown arg $1"; exit 3;;
  esac
done
P=0; R=0
for i in $(seq 1 20); do
  if [ "$P" = "0" ]; then
    html=$(curl -s --max-time 15 "$BASE/")
    css_bodies=""
    for c in $(echo "$html" | grep -oE '/assets/[A-Za-z0-9._-]+\.css' | sort -u); do css_bodies+=$(curl -s --max-time 15 "$BASE$c"); css_bodies+=$'\n'; done
    js_bodies=""
    for f in $(echo "$html" | grep -oE '/assets/[A-Za-z0-9._-]+\.js' | sort -u); do js_bodies+=$(curl -s --max-time 15 "$BASE$f"); js_bodies+=$'\n'; done
    # Lazy chunks: the ones the entry imports dynamically (one level) — desk pages live there, not in the index.
    lazy_bodies=""
    if [ ${#LAZY_JS[@]} -gt 0 ]; then
      # depth 1: chunks the entry imports dynamically; depth 2: what those chunks import (static or dynamic) —
      # a component shared by many pages (e.g. <Fig>) lives at depth 2.
      l1=$(echo "$js_bodies" | grep -oE 'import\("\./[A-Za-z0-9._-]+\.js"\)' | grep -oE '[A-Za-z0-9._-]+\.js' | sort -u | head -120)
      for f in $l1; do lazy_bodies+=$(curl -s --max-time 15 "$BASE/assets/$f"); lazy_bodies+=$'\n'; done
      l2=$(echo "$lazy_bodies" | grep -oE '(from|import\()"\./[A-Za-z0-9._-]+\.js"' | grep -oE '[A-Za-z0-9._-]+\.js' | sort -u | grep -vxF -f <(echo "$l1") | head -120)
      for f in $l2; do lazy_bodies+=$(curl -s --max-time 15 "$BASE/assets/$f"); lazy_bodies+=$'\n'; done
      echo "probe $i: lazy chunks fetched: depth1 $(echo "$l1" | grep -c .) depth2 $(echo "$l2" | grep -c .)"
    fi
    ok=1
    for n in "${LAZY_JS[@]}"; do if echo "$lazy_bodies" | grep -qF -- "$n"; then echo "probe $i: lazy js has '$n'"; else echo "probe $i: lazy js LACKS '$n'"; ok=0; fi; done
    for n in "${JS[@]}"; do if echo "$js_bodies" | grep -qF -- "$n"; then echo "probe $i: js has '$n'"; else echo "probe $i: js LACKS '$n'"; ok=0; fi; done
    for n in "${CSS[@]}"; do if echo "$css_bodies" | grep -qF -- "$n"; then echo "probe $i: css has '$n'"; else echo "probe $i: css LACKS '$n'"; ok=0; fi; done
    for n in "${JS_ABSENT[@]}"; do if echo "$js_bodies" | grep -qF -- "$n"; then echo "probe $i: js STILL HAS '$n'"; ok=0; else echo "probe $i: js free of '$n'"; fi; done
    for n in "${CSS_ABSENT[@]}"; do if echo "$css_bodies" | grep -qF -- "$n"; then echo "probe $i: css STILL HAS '$n'"; ok=0; else echo "probe $i: css free of '$n'"; fi; done
    # The index must also reference at least one asset of each kind, or "free of" is vacuous.
    [ -z "$css_bodies" ] && { echo "probe $i: no css assets found in index"; ok=0; }
    [ -z "$js_bodies" ] && { echo "probe $i: no js assets found in index"; ok=0; }
    [ "$ok" = "1" ] && P=1 && echo "PAGES LIVE (probe $i)"
  fi
  if [ "$R" = "0" ]; then
    dep=$(gh api "repos/voyagernik123/lcx-sales-automation-engine/deployments?per_page=1" --jq '.[0] | "\(.id) \(.sha)"' 2>/dev/null)
    dep_id=${dep%% *}; dep_sha=${dep##* }
    case "$dep_sha" in
      "$SHA"*|"${SHA:0:7}"*)
        state=$(gh api "repos/voyagernik123/lcx-sales-automation-engine/deployments/$dep_id/statuses" --jq '.[0].state' 2>/dev/null)
        echo "probe $i: render deployment $dep_id ${dep_sha:0:7} state=$state"
        [ "$state" = "success" ] && R=1 && echo "RENDER LIVE: ${dep_sha:0:7} success"
        { [ "$state" = "failure" ] || [ "$state" = "error" ]; } && echo "RENDER DEPLOY FAILED: $state" && exit 2
        ;;
      *) echo "probe $i: latest render deployment is ${dep_sha:0:7} (waiting for ${SHA:0:7})";;
    esac
  fi
  [ "$P" = "1" ] && [ "$R" = "1" ] && echo "BOTH SURFACES VERIFIED LIVE" && exit 0
  sleep 40
done
echo "TIMEOUT: pages=$P render=$R"; exit 1
