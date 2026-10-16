#!/usr/bin/env python3
"""
Re-run a pipeline run from the caches only: every model call is BLOCKED, so a
cache miss is a failed call, never a live one. Writes the extractions and the
`evidence_v2` block to <outdir>; writes no report and pushes nothing.

    .venv/bin/python scripts/replay_from_cache.py out/replay/before -- \\
        creatine --form creatine_monohydrate --full-text-only --intervention-scope --all-outcomes
    # change code, replay again into out/replay/after, then:
    .venv/bin/python scripts/replay_from_cache.py --compare out/replay/before out/replay/after

The regression gate for any change that should not move a grade: the two
`evidence_v2.json` files must be byte-identical (extractions are compared
ignoring fetch timestamps and timing metadata). Used 2026-10-15 to show the v14
removal left v2 unchanged. Same args as the run being replayed; a run that
originally finished from cache replays fully (misses are reported).
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

_VOLATILE = {"fetched_at", "_meta"}


def _strip(x):
    if isinstance(x, dict):
        return {k: _strip(v) for k, v in x.items() if k not in _VOLATILE}
    if isinstance(x, list):
        return [_strip(v) for v in x]
    return x


def compare(a: Path, b: Path) -> int:
    same = (a / "evidence_v2.json").read_text() == (b / "evidence_v2.json").read_text()
    ea, eb = (_strip(json.loads((d / "extractions.json").read_text())) for d in (a, b))
    same_ext = json.dumps(ea, sort_keys=True) == json.dumps(eb, sort_keys=True)
    print(f"evidence_v2: {'IDENTICAL' if same else 'DIFFERS'}")
    print(f"extractions: {'IDENTICAL' if same_ext else 'DIFFER'} ({len(ea)} vs {len(eb)} studies)")
    return 0 if same and same_ext else 1


def replay(out: Path, args: list[str]) -> int:
    out.mkdir(parents=True, exist_ok=True)
    os.environ["SP_DUMP_EXTRACTIONS"] = str(out / "extractions.json")
    os.environ["SP_AUTO_PUSH"] = "0"
    # The second reviewer is on by default since 2026-10-16; runs made before
    # that had it off, and its calls would be cache misses. Replay a run made
    # with it on by passing SP_SECOND_REVIEWER=1 (its context records
    # "second_reviewer").
    os.environ.setdefault("SP_SECOND_REVIEWER", "0")
    from bsproof import claude_adapter as ca

    class _Blocked:
        def __getattr__(self, name):
            return getattr(subprocess, name)

        @staticmethod
        def run(*_a, **_k):
            raise OSError("replay: model calls are blocked (cache miss)")

    ca.preflight = lambda: True
    ca.subprocess = _Blocked()

    import run_pipeline
    captured: dict = {}
    run_pipeline.finish = lambda _opts, _allow, ctx, _t0: captured.update(ctx)
    rc = run_pipeline.main(args)
    usage = ca.USAGE.as_dict()
    print(f"replay exit {rc}: {usage.get('cache_hits')} cache hits, "
          f"{usage.get('live_calls')} blocked calls (misses)")
    (out / "evidence_v2.json").write_text(json.dumps(captured.get("evidence_v2"), indent=1, sort_keys=True))
    return rc


def main(argv: list[str]) -> int:
    if argv[:1] == ["--compare"] and len(argv) == 3:
        return compare(Path(argv[1]), Path(argv[2]))
    if len(argv) >= 3 and argv[1] == "--":
        return replay(Path(argv[0]), argv[2:])
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
