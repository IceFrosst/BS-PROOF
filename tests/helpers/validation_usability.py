#!/usr/bin/env python3
"""
Test-only reading of the owner's validation criterion 6 ("Usable") for a live-research result. NOT runtime code: nothing in
`pipeline/` or `scripts/` imports it, and it changes no guard.

Why it exists. The one private validation run of `live-research-v0.3` (2026-10-05) ended `completed` with ONE WebSearch,
no WebFetch and an empty inventory. The worker's guard and the server's check accepted that BY DESIGN: an empty inventory
has nothing to ground. Only the owner's criterion 6 caught it ("at least one outcome with a non-empty inventory; if every
inventory is empty, call it 'complete but empty: guard satisfied by deletion, usability not shown'"). An all-empty audit
must therefore never be reportable as a success of the citation fix, whatever the guard says. This file is that one
criterion, in code, so a test can pin it and a later validation harness can call it.

It does NOT judge the other criteria (pairing, honest access, ids) and it never says an audit is good: `usable: True` means
only that criterion 6 is met. It counts tool calls for the record; it is NOT a gate on them (a code gate on the number of
fetches would turn a thin audit into a lost job under one attempt).

    python3 tests/helpers/validation_usability.py <json with an "audit" key>     # exit 0 = criterion 6 met, 1 = not met
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

EMPTY_LABEL = "complete but empty; usability not shown"
MET_LABEL = "at least one outcome has a non-empty inventory (criterion 6 only; the other criteria are judged separately)"


def tool_calls(source: dict) -> dict:
    """WebSearch / WebFetch request counts from a SourceAccessV2 object (`events`) or a replay fixture (`receipts`)."""
    events = source.get("events") or source.get("receipts") or []
    return {tool: sum(1 for e in events if e.get("tool") == tool) for tool in ("WebSearch", "WebFetch")}


def analyse(audit: dict, access: dict | None = None) -> dict:
    outcomes = [o for o in (audit.get("outcomes") or []) if isinstance(o, dict)]
    non_empty = [o for o in outcomes if o.get("inventory")]
    usable = bool(non_empty)
    return {
        "outcomes_total": len(outcomes),
        "non_empty_outcomes": len(non_empty),
        "inventory_rows": sum(len(o.get("inventory") or []) for o in outcomes),
        "tool_calls": tool_calls(access or {}),
        "usable": usable,
        "label": MET_LABEL if usable else EMPTY_LABEL,
        "verdict": "criterion 6 met" if usable else "NON-PASS",
    }


def exit_code(result: dict) -> int:
    return 0 if result["usable"] else 1


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print(__doc__, file=sys.stderr)
        return 2
    data = json.loads(Path(argv[1]).read_text(encoding="utf-8"))
    result = analyse(data["audit"], data.get("source_access_v2") or {"receipts": data.get("receipts") or []})
    print(json.dumps(result, indent=1, ensure_ascii=False))
    return exit_code(result)


if __name__ == "__main__":
    sys.exit(main(sys.argv))
