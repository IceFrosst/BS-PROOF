"""
Is the score reproducible? Same corpus, same prompt, two cold passes.
MODEL CALLS: yes, S5 only. Run with the venv interpreter.

    ./.venv/bin/python scripts/determinism_experiment.py --limit 15 --pass 1
    ./.venv/bin/python scripts/determinism_experiment.py --limit 15 --pass 2
    ./.venv/bin/python scripts/determinism_experiment.py --compare

WHY THIS EXISTS, and it is a control on a claim of mine rather than a new question.

Measured 2026-08-12: two clean 149-study runs, same SCORING_MODEL v8, differing
only in the WORDING of one prompt field (`effect_favours`, v1.17 -> v1.18), scored
23 points apart in total absolute terms -- lean_body_mass alone moved -1 -> +14 --
while the scoring-model change those runs were built to test moved 2 points. I
recorded that as "extraction variance exceeds the model effect".

That attribution is NOT established by those two runs. A prompt edit and ordinary
run-to-run non-determinism are confounded in them: S5 is a one-shot call at
whatever temperature the CLI defaults to, and nothing pins its output to be
identical across calls. If two passes over the SAME prompt disagree as much as the
v1.17/v1.18 pair did, then my finding is noise wearing a mechanism's clothes and
the honest statement is "the score is not reproducible", which is a different and
worse problem than "wording matters".

HOW THE CACHE IS BYPASSED. `claude_adapter.CACHE_DB` honours SP_LLM_CACHE, read at
import. Each pass therefore points at its own fresh sqlite file, so both passes are
genuinely cold. Nothing else changes: same PROMPT_VERSION, same model ids, same
payload builder, same text.

WHAT IS COMPARED. Per study: claim count, the multiset of directions, and per
claim the (direction, effect_favours, effect_size) triple. Claim ORDER is not
compared -- S5 is not asked to order its output, so a reordering is not a defect.
The score-level consequence is estimated by counting how many claims changed a
field that feeds s_i: direction, effect_favours, or effect_size.

Deliberately S5 only, and deliberately a subset. S5 supplies direction, magnitude
and the effect numbers, so it is where score-moving variance would come from; a
full two-pass run of every agent over 150 studies would be ~2000 cold calls
against a subscription session limit that a truncated run has already cost this
project once today.
"""
from __future__ import annotations

import argparse
import collections
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SHOWCASE = ("muscle_strength", "muscle_power", "lean_body_mass", "exercise_endurance")


def out_path(n: int) -> Path:
    return Path(os.environ.get("SP_DETERMINISM_DIR", "/tmp")) / f"determinism_pass{n}.json"


def run_pass(n: int, limit: int, dump: str) -> int:
    """One cold pass: replay S5 over `limit` studies into its own cache file."""
    cache = Path(os.environ.get("SP_DETERMINISM_DIR", "/tmp")) / f"det_cache_pass{n}.sqlite"
    if cache.exists():
        cache.unlink()
    os.environ["SP_LLM_CACHE"] = str(cache)      # MUST precede the import
    sys.path.insert(0, str(ROOT))

    import claude_adapter                        # noqa: E402
    from sources import fulltext                 # noqa: E402
    import workers                               # noqa: E402

    print(f"pass {n}: PROMPT_VERSION={claude_adapter.PROMPT_VERSION} "
          f"cache={cache.name} (cold)")
    corpus = json.load(open(dump))
    picked = [r for r in corpus
              if (r.get("record") or {}).get("oa") == "full_text"][:limit]
    print(f"pass {n}: replaying S5 on {len(picked)} full-text studies")

    results = {}
    for i, rec in enumerate(picked, 1):
        record = rec.get("record") or {}
        pmcid = record.get("pmcid")
        xml = fulltext.fetch_xml(pmcid, use_cache=True) if pmcid else None
        sections = fulltext.sections(xml) if xml else None
        text, _tier = fulltext.best_text(record)
        if not text:
            continue
        payload = workers._payload("S5", record, text, None, sections)
        res, meta = claude_adapter.call("S5", payload)
        if not res:
            print(f"  {i:>2}. {pmcid} FAILED ({meta.get('error')})")
            continue
        results[record.get("_canonical") or pmcid] = res.get("claims") or []
        print(f"  {i:>2}. {pmcid} {len(results[record.get('_canonical') or pmcid])} claims")

    out_path(n).write_text(json.dumps(results, indent=1, default=str))
    print(f"pass {n}: wrote {out_path(n)}")
    return 0


def triple(cl: dict) -> tuple:
    """The fields that actually reach s_i. Everything else is presentation."""
    return (cl.get("direction"), cl.get("effect_favours"),
            None if cl.get("effect_size") is None else round(float(cl["effect_size"]), 4),
            (cl.get("outcome_raw") or "")[:40])


def compare() -> int:
    a = json.loads(out_path(1).read_text())
    b = json.loads(out_path(2).read_text())
    shared = sorted(set(a) & set(b))
    print(f"pass1 {len(a)} studies, pass2 {len(b)} studies, {len(shared)} in both\n")
    if not shared:
        print("nothing to compare -- run both passes first.")
        return 1

    same_count = 0
    claim_delta = 0
    field_changes = collections.Counter()
    identical_studies = 0
    print(f"  {'study':<26}{'claims 1':>9}{'claims 2':>9}{'identical?':>12}")
    for sid in shared:
        ca, cb = a[sid], b[sid]
        if len(ca) == len(cb):
            same_count += 1
        claim_delta += abs(len(ca) - len(cb))
        # Compare as MULTISETS keyed on the fields that feed the score; claim
        # order is not part of S5's contract so a reorder must not read as drift.
        sa = collections.Counter(triple(c) for c in ca if isinstance(c, dict))
        sb = collections.Counter(triple(c) for c in cb if isinstance(c, dict))
        ident = sa == sb
        identical_studies += ident
        if not ident:
            for t in (sa - sb):
                field_changes["only_in_pass1"] += 1
            for t in (sb - sa):
                field_changes["only_in_pass2"] += 1
        print(f"  {sid[:25]:<26}{len(ca):>9}{len(cb):>9}{'yes' if ident else 'NO':>12}")

    n = len(shared)
    print(f"\n=== RESULT ===")
    print(f"  studies with an IDENTICAL score-relevant claim set : {identical_studies}/{n}"
          f"  ({identical_studies/n:.0%})")
    print(f"  studies with the same claim COUNT                  : {same_count}/{n}")
    print(f"  total claim-count difference                       : {claim_delta}")
    print(f"  claim triples present in only one pass             : {dict(field_changes)}")

    print("\n=== VERDICT ===")
    if identical_studies == n:
        print("    S5 is REPRODUCIBLE on this sample. The 23-point v1.17->v1.18")
        print("    movement is therefore attributable to the prompt WORDING, and")
        print("    'extraction variance exceeds the model effect' stands as stated.")
    elif identical_studies >= 0.8 * n:
        print("    Mostly reproducible, but not fully. The v1.17->v1.18 movement is")
        print("    PARTLY wording and partly noise, and neither my 23-point figure")
        print("    nor any single-run score should be quoted without an error bar.")
    else:
        print("    S5 IS NOT REPRODUCIBLE. My attribution of the 23-point movement to")
        print("    prompt wording is UNSUPPORTED -- the honest statement is that the")
        print("    score does not reproduce across identical runs, which is worse than")
        print("    'wording matters' and makes every stored score a single draw.")
        print("    Anchor calibration cannot proceed on a non-reproducible score;")
        print("    pinning temperature/seed, or averaging repeated draws, comes first.")
    print("\n    Nothing was changed. This script only measures.")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pass", dest="which", type=int, choices=(1, 2))
    ap.add_argument("--compare", action="store_true")
    ap.add_argument("--limit", type=int, default=15)
    ap.add_argument("--dump", default="/tmp/extractions_v118.json")
    args = ap.parse_args()
    if args.compare:
        return compare()
    if not args.which:
        ap.error("give --pass 1, --pass 2, or --compare")
    return run_pass(args.which, args.limit, args.dump)


if __name__ == "__main__":
    sys.exit(main())
