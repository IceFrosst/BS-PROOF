#!/usr/bin/env bash
# PostToolUse: a changed rule in the v2 grading code (scripts/verify_helpers.py
# WATCHED_CONSTANTS) regrades every outcome and looks like nothing in a diff stat. Invariant 4 makes those
# founder decisions requiring docs/REVIEW_PENDING.md + SPEC 13.
#
# Warning, not a block: a founder-approved change is legitimate and must be able
# to land. The point is that it can never land SILENTLY.
set -uo pipefail
cd "$(dirname "$0")/../.." || exit 0

FILE=$(python3 -c 'import json,sys
try: print((json.load(sys.stdin).get("tool_input") or {}).get("file_path",""))
except Exception: print("")' 2>/dev/null)

case "$FILE" in *pipeline/grade.py|*pipeline/review.py|*pipeline/pool.py|*pipeline/benchmark.py) ;; *) exit 0 ;; esac

DRIFT=$(python3 -c "
import sys; sys.path.insert(0,'.')
from scripts.verify_helpers import constant_drift, baseline
for d in constant_drift(baseline()): print(d)
" 2>/dev/null)

[ -z "$DRIFT" ] && exit 0

echo "invariant 4: a grading constant moved from its last verified value." >&2
echo "$DRIFT" >&2
echo "" >&2
echo "These are FOUNDER decisions, not refactors. If this was deliberate, record" >&2
echo "it in docs/REVIEW_PENDING.md and docs/SPEC.md 13. If it was incidental," >&2
echo "revert it -- the GRADE rules, the letter table and the benchmark pass rule" >&2
echo "regrade every outcome, and no benchmark may be made to pass by tuning one." >&2
exit 2
