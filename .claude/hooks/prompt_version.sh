#!/usr/bin/env bash
# PostToolUse: invariant 3 -- editing a prompt or schema without bumping
# PROMPT_VERSION lets the sqlite cache serve PRE-EDIT extractions under an
# identical key, AND stamps the stored rows with the new version, so provenance
# lies unrecoverably. The cache key is
# agent+PROMPT_VERSION+model+effort+payload; prompt CONTENT is not in it.
#
# This is the invariant with no automated enforcement anywhere else. It is a
# warning, not a block: the correct order is often edit-then-bump, and blocking
# the edit would make the right workflow impossible.
set -uo pipefail
cd "$(dirname "$0")/../.." || exit 0

FILE=$(python3 -c 'import json,sys
try: print((json.load(sys.stdin).get("tool_input") or {}).get("file_path",""))
except Exception: print("")' 2>/dev/null)

case "$FILE" in
  *prompts/*.md|*schemas/s*.json) ;;
  *) exit 0 ;;
esac

# vocab travels in the payload, so it is already in the key by content and is
# deliberately exempt (vocab/README.md).
case "$FILE" in *vocab/*) exit 0 ;; esac

CUR=$(python3 -c "
import ast,sys
for n in ast.parse(open('bsproof/claude_adapter.py').read()).body:
    if isinstance(n, ast.Assign) and getattr(n.targets[0],'id','')=='PROMPT_VERSION':
        print(ast.literal_eval(n.value)); break
" 2>/dev/null)

# Either the release-wide PROMPT_VERSION or the agent's own entry in
# AGENT_PROMPT_VERSION (founder 2026-10-25) counts as a bump.
if git diff HEAD -- bsproof/claude_adapter.py 2>/dev/null | grep -qE "^[+-].*(PROMPT_VERSION|\"S[0-9][A-Z0-9]*\": \"v)"; then
  exit 0   # already bumped in this working tree
fi

echo "invariant 3: you edited $(basename "$FILE") but neither PROMPT_VERSION (${CUR:-unknown})" >&2
echo "nor that agent's AGENT_PROMPT_VERSION entry changed. Bump the agent's entry in" >&2
echo "bsproof/claude_adapter.py (or PROMPT_VERSION for _shared.md) or the cache will serve" >&2
echo "pre-edit extractions under the same key while stamping rows with the new prompt." >&2
exit 2
