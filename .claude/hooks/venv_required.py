"""
PreToolUse(Bash) hook: the entry points that hit the NETWORK need httpx, which
lives only in .venv. Exit 2 blocks the call and names the right interpreter.

Deliberately narrow, in three ways, each one learned by getting it wrong:

1. `python3 -m pipeline.selftest` and `-m pipeline.invariants` are CORRECT on the
   bare interpreter as of 2026-08-10 -- the module-level httpx import that broke
   them was moved into get_json, and pipeline.invariants.dependency_problems keeps
   it that way. Blocking bare python3 generally would enforce a workaround for a
   bug that is fixed.

2. The script name must appear as the ARGUMENT OF A PYTHON INVOCATION, not merely
   somewhere in the command string. The first version glob-matched the whole
   string and blocked `git commit` because the commit MESSAGE mentioned
   run_pipeline.py. A guard that fires on prose is worse than no guard: it trains
   you to ignore it.

3. This is a .py file invoked as `python3 venv_required.py`, not a shell script
   wrapping `python3 - <<'PY'`. That heredoc form makes Python read its PROGRAM
   from stdin, so the hook's JSON never arrives and the hook silently allows
   everything -- which is the worse failure, because it looks like it is working.
"""
from __future__ import annotations

import json
import re
import sys

NETWORK = r"(?:run_pipeline|run_sr_inheritance|run_coverage|grok_adapter)\.py"

INVOCATION = re.compile(
    r"(?:^|[;&|]\s*|\$\(\s*|`\s*)"      # start, or after ; && || | $( `
    r"(?!\S*\.venv/)"                   # not already the venv interpreter
    r"(?:python3?|py)\s+"               # python / python3 / py
    r"(?:-[A-Za-z]+\s+)*"               # optional short flags, e.g. -u
    rf"\S*{NETWORK}\b"
)


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except Exception:
        return 0  # unreadable payload must never block work
    cmd = (payload.get("tool_input") or {}).get("command") or ""

    if not INVOCATION.search(cmd):
        return 0

    m = re.search(rf"\S*{NETWORK}.*", cmd)
    rest = m.group(0) if m else "<script> ..."
    sys.stderr.write(
        "That entry point reaches the network, so it needs httpx: use\n"
        f"  ./.venv/bin/python {rest}\n"
        "(bare python3 is correct for pipeline.selftest and pipeline.invariants,\n"
        " which are offline by design -- just not for retrieval or extraction.)\n")
    return 2


if __name__ == "__main__":
    sys.exit(main())
