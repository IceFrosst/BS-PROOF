"""
The verify-after queue. NO MODEL MAY ENTER THIS FILE.

Founder decision 2026-08-10: Claude Code owns every file; Grok and Codex are
helpers who may write freely, and Claude verifies their changes afterwards. This
script is how that duty gets discharged in seconds instead of by reading every
diff.

    python3 scripts/verify_helpers.py            # what still needs verifying
    python3 scripts/verify_helpers.py --accept    # record HEAD as verified

WHAT THIS CANNOT DO, stated up front because it changes how you read the output:
it cannot tell Grok from Codex from the founder. Measured 2026-08-10 -- all 210
commits in this repository are authored by `IceFrosst`, because every agent
commits with the same git identity on the same machine. The one reliable signal is
the `Co-Authored-By: Claude ...` trailer, present on 94 commits.

So commits are classified two ways only:

    claude          carries a Co-Authored-By: Claude trailer
    unattributed    no trailer -- founder, Grok or Codex, indistinguishable

`unattributed` is the queue. It is deliberately not called "helper": calling it
that would assert an attribution this tool has not earned. AGENTS.md now asks
helpers to add their own trailer, which is what would make this precise.

The highest-value part is not the commit list -- it is the CONSTANT DIFF. A
changed number in pipeline/scoring.py reprices every score in the system and looks
like nothing in a diff stat. Invariant 4 says constants are founder decisions;
this is the check that notices when one moved.
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LAST_VERIFIED = ROOT / "docs" / "last_verified"

# Paths where an unreviewed change is expensive, and why. Ordered most to least.
CRITICAL = {
    "pipeline/grade.py": "GRADE certainty and the letter table; every rule is a constant",
    "pipeline/pool.py": "per-outcome pooling, study selection, population policy",
    "pipeline/effect_size.py": "numbers -> signed effect and variance",
    "pipeline/span_check.py": "every extracted number checked against its quote",
    "pipeline/review.py": "the second reviewer's disagreement rule",
    "pipeline/eligibility.py": "the invariant-7 scope refusals",
    "pipeline/dose.py": "the tested arm's dose",
    "pipeline/meta_effects.py": "Hedges' g, REML, Hartung-Knapp",
    "pipeline/benchmark.py": "the pass rule against published meta-analyses",
    "bsproof/claude_adapter.py": "model boundary, tiers, PROMPT_VERSION",
    "prompts/": "extraction contract -- needs a PROMPT_VERSION bump",
    "schemas/": "extraction contract -- needs a PROMPT_VERSION bump",
    "vocab/": "outcome/form vocabulary, polarity and MCIDs",
}

# Constants whose value must never move without a founder decision (invariant 4),
# by file. (The v14 ones lived in pipeline/scoring.py until 2026-10-15.)
WATCHED_CONSTANTS = {
    "pipeline/grade.py": ("RULES", "LEVELS", "OFF_DOSE", "TABLE", "VARIANTS"),
    "pipeline/review.py": ("RULES",),
    "pipeline/pool.py": ("ROUTE_RANK", "CONFIDENCE"),
    "pipeline/benchmark.py": ("RULES",),
}


def _git(*args: str) -> str:
    return subprocess.run(("git", *args), cwd=ROOT, capture_output=True,
                          text=True, check=False).stdout.strip()


def baseline() -> str | None:
    """The last commit Claude recorded as verified, or None if never recorded."""
    if not LAST_VERIFIED.exists():
        return None
    for line in LAST_VERIFIED.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#"):
            return line.split()[0]
    return None


def commits_since(sha: str | None, limit: int = 200) -> list[dict]:
    """Commits after `sha` (or the last `limit` if there is no baseline)."""
    rng = f"{sha}..HEAD" if sha else f"-{limit}"
    raw = _git("log", "--format=%H%x00%an%x00%s%x00%b%x1e", rng)
    out = []
    for chunk in raw.split("\x1e"):
        chunk = chunk.strip("\n")
        if not chunk:
            continue
        parts = chunk.split("\x00")
        if len(parts) < 4:
            continue
        h, author, subject, body = parts[0], parts[1], parts[2], parts[3]
        by_claude = "co-authored-by: claude" in body.lower()
        files = [f for f in _git("show", "--name-only", "--format=", h).splitlines() if f]
        out.append({"sha": h[:9], "author": author, "subject": subject,
                    "who": "claude" if by_claude else "unattributed",
                    "files": files})
    return out


def critical_touches(files: list[str]) -> list[tuple[str, str]]:
    hits = []
    for f in files:
        for path, why in CRITICAL.items():
            if f == path or (path.endswith("/") and f.startswith(path)):
                hits.append((f, why))
                break
    return hits


def constant_drift(sha: str | None) -> list[str]:
    """
    Watched constants whose VALUE differs from `sha`.

    Reuses pipeline.invariants.literal_module_assign, so it reads the AST of each
    revision rather than diffing text -- a reformat, a moved comment or a
    reordered dict is not a change, and a moved threshold is, even if the line
    moved 40 lines down.
    """
    if not sha:
        return []
    sys.path.insert(0, str(ROOT))
    from pipeline.invariants import literal_module_assign

    out = []
    for path, names in WATCHED_CONSTANTS.items():
        old_src = _git("show", f"{sha}:{path}")
        if not old_src:
            continue
        new_src = (ROOT / path).read_text(encoding="utf-8")
        for name in names:
            try:
                was = literal_module_assign(old_src, name, path)
                now = literal_module_assign(new_src, name, path)
            except (SyntaxError, ValueError):
                continue
            if was != now:
                out.append(f"{path} {name}: {was!r} -> {now!r}")
    return out


def gates() -> list[tuple[str, bool, str]]:
    """The deterministic gates. Zero tokens, no network, no model."""
    results = []
    for label, cmd in (("structural invariants", ("python3", "-m", "pipeline.invariants")),
                       ("selftest", ("python3", "-m", "pipeline.selftest"))):
        p = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, check=False)
        tail = [ln for ln in p.stdout.splitlines() if "FAIL" in ln or "PROBLEM" in ln]
        results.append((label, p.returncode == 0, "; ".join(tail[:4])))
    return results


def main(argv: list[str]) -> int:
    sha = baseline()

    if "--accept" in argv:
        head = _git("rev-parse", "HEAD")
        ok = all(passed for _, passed, _ in gates())
        if not ok:
            print("REFUSING to accept: the deterministic gates are not green.")
            print("Verification means the gates passed, so recording HEAD now "
                  "would make this file a lie.")
            return 1
        LAST_VERIFIED.parent.mkdir(parents=True, exist_ok=True)
        LAST_VERIFIED.write_text(
            f"# Last commit verified by Claude Code (scripts/verify_helpers.py --accept).\n"
            f"# Written only when pipeline.invariants and pipeline.selftest both pass.\n"
            f"{head}\n")
        print(f"recorded {head[:9]} as verified")
        return 0

    commits = commits_since(sha)
    if sha:
        print(f"baseline: {sha[:9]} (last verified)")
    else:
        print(f"baseline: NONE -- {LAST_VERIFIED.relative_to(ROOT)} does not exist "
              f"yet, so showing recent history only")

    queue = [c for c in commits if c["who"] == "unattributed"]
    print(f"\n{len(commits)} commit(s) since baseline; "
          f"{len(queue)} unattributed (founder, Grok or Codex -- this tool "
          f"cannot tell them apart, see the module docstring)")

    for c in queue:
        crit = critical_touches(c["files"])
        marker = "  <-- CRITICAL" if crit else ""
        print(f"\n  {c['sha']}  {c['subject'][:66]}{marker}")
        print(f"           {len(c['files'])} file(s)")
        for f, why in crit[:6]:
            print(f"           ! {f} -- {why}")

    drift = constant_drift(sha)
    print("\nconstant drift in " + ", ".join(WATCHED_CONSTANTS) + ":")
    if drift:
        for d in drift:
            print(f"  CHANGED  {d}")
        print("\n  A constant moved since the last verified commit. Invariant 4:")
        print("  these are founder decisions and need docs/REVIEW_PENDING.md +")
        print("  SPEC 13. If this was not a founder call, it must be reverted.")
    else:
        print("  none -- every watched constant holds its verified value")

    print("\ndeterministic gates:")
    failed = False
    for label, passed, detail in gates():
        print(f"  {'PASS' if passed else 'FAIL'}  {label}  {detail}")
        failed |= not passed

    print("\n" + ("gates are RED -- fix before accepting" if failed else
                  "gates are green. Review the commits above, then: "
                  "python3 scripts/verify_helpers.py --accept"))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
