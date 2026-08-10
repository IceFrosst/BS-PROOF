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
for n in ast.parse(open('claude_adapter.py').read()).body:
    if isinstance(n, ast.Assign) and getattr(n.targets[0],'id','')=='PROMPT_VERSION':
        print(ast.literal_eval(n.value)); break
" 2>/dev/null)

if git diff HEAD -- claude_adapter.py 2>/dev/null | grep -q "^[+-].*PROMPT_VERSION"; then
  exit 0   # already bumped in this working tree
fi

echo "invariant 3: you edited $(basename "$FILE") but PROMPT_VERSION is still ${CUR:-unknown}." >&2
echo "Bump it in claude_adapter.py or the response cache will serve pre-edit" >&2
echo "extractions under the same key while stamping rows with the new prompt." >&2
exit 2
