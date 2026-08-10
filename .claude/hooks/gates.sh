#!/usr/bin/env bash
# PostToolUse: after an edit to the deterministic layer, run the deterministic
# gates. Zero tokens, zero network, ~0.5s. Exit 2 feeds the failing check names
# back to the model so it self-corrects before moving on.
#
# Why a hook and not a subagent: a subagent costs ~31.5k tokens to read output
# this produces for free. Why PostToolUse and not Stop: by Stop the model has
# already told you it finished.
set -uo pipefail
cd "$(dirname "$0")/../.." || exit 0

FILE=$(python3 -c 'import json,sys
try: print((json.load(sys.stdin).get("tool_input") or {}).get("file_path",""))
except Exception: print("")' 2>/dev/null)

# Only the layers the gates actually cover.
case "$FILE" in
  *pipeline/*.py|*sources/*.py|*vocab/*.json|*claude_adapter.py|*grok_adapter.py|*pilot_adapter.py) ;;
  *) exit 0 ;;
esac

OUT=$(python3 -m pipeline.invariants 2>&1); INV=$?
if [ $INV -ne 0 ]; then
  echo "pipeline.invariants FAILED after editing $FILE" >&2
  echo "$OUT" | grep -E "PROBLEM" >&2
  exit 2
fi

OUT=$(python3 -m pipeline.selftest 2>&1); ST=$?
if [ $ST -ne 0 ]; then
  echo "pipeline.selftest FAILED after editing $FILE" >&2
  echo "$OUT" | grep -E "^  FAIL|^FAILURES" >&2
  exit 2
fi
exit 0
