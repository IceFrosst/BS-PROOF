#!/usr/bin/env bash
# PostToolUse: a changed number in pipeline/scoring.py reprices every score in
# the system and looks like nothing in a diff stat. Invariant 4 makes those
# founder decisions requiring docs/REVIEW_PENDING.md + SPEC 13.
#
# Warning, not a block: a founder-approved change is legitimate and must be able
# to land. The point is that it can never land SILENTLY.
set -uo pipefail
cd "$(dirname "$0")/../.." || exit 0

FILE=$(python3 -c 'import json,sys
try: print((json.load(sys.stdin).get("tool_input") or {}).get("file_path",""))
except Exception: print("")' 2>/dev/null)

case "$FILE" in *pipeline/scoring.py) ;; *) exit 0 ;; esac

DRIFT=$(python3 -c "
import sys; sys.path.insert(0,'.')
from scripts.verify_helpers import constant_drift, baseline
for d in constant_drift(baseline()): print(d)
" 2>/dev/null)

[ -z "$DRIFT" ] && exit 0

echo "invariant 4: a scoring constant moved from its last verified value." >&2
echo "$DRIFT" >&2
echo "" >&2
echo "These are FOUNDER decisions, not refactors. If this was deliberate, record" >&2
echo "it in docs/REVIEW_PENDING.md and docs/SPEC.md 13. If it was incidental," >&2
echo "revert it -- k, S_VALUE, H_PENALTY, H_NORM and the transfer factors reprice" >&2
echo "every published score, and no anchor may be made to pass by tuning one." >&2
exit 2
