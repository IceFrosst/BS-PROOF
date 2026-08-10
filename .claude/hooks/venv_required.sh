#!/usr/bin/env bash
# PreToolUse(Bash): the entry points that hit the NETWORK need httpx, which lives
# only in .venv. Exit 2 blocks and tells the model which interpreter to use.
#
# Deliberately narrow. `python3 -m pipeline.selftest` and `python3 -m
# pipeline.invariants` work on the bare interpreter as of 2026-08-10 -- the
# module-level httpx import that broke them was moved into get_json, and
# pipeline.invariants.dependency_problems keeps it that way. Blocking bare
# python3 generally would enforce a workaround for a bug that is fixed.
set -uo pipefail

CMD=$(python3 -c 'import json,sys
try: print((json.load(sys.stdin).get("tool_input") or {}).get("command",""))
except Exception: print("")' 2>/dev/null)

# Only the network entry points, and only when not already using the venv.
case "$CMD" in
  *.venv/bin/python*) exit 0 ;;
  *run_pipeline.py*|*run_sr_inheritance.py*|*run_coverage.py*|*grok_adapter.py*|*-m\ pipeline.retrieve*) ;;
  *) exit 0 ;;
esac

case "$CMD" in
  python3\ *|python\ *|*\;\ python3\ *|*\;\ python\ *|*\&\&\ python3\ *|*\&\&\ python\ *) ;;
  *) exit 0 ;;
esac

echo "That entry point reaches the network, so it needs httpx: use" >&2
echo "  ./.venv/bin/python ${CMD#python* }" >&2
echo "(bare python3 is correct for pipeline.selftest and pipeline.invariants," >&2
echo " which are offline by design -- just not for retrieval or extraction.)" >&2
exit 2
