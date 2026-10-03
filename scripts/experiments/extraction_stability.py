#!/usr/bin/env python3
"""
Evidence method v2, Phase 1b: does extraction REPRODUCE?
(docs/EVIDENCE_METHOD.md §8.) The same studies are extracted twice by the
production Claude backend, each run with its OWN EMPTY cache (a shared cache
would replay run A into run B and measure nothing), then compared field by field
and score by score.

    # 1. two independent runs (live model calls: run SOLO, see below)
    .venv/bin/python scripts/experiments/extraction_stability.py run --label A
    .venv/bin/python scripts/experiments/extraction_stability.py run --label B
    # 2. compare (offline)
    .venv/bin/python scripts/experiments/extraction_stability.py compare A B

    # harness check with a fake model (no model calls)
    .venv/bin/python scripts/experiments/extraction_stability.py run --label FAKE --fake --n 3

COST. ~10 model calls per study per run: the default 25 studies x 2 runs is
~500 calls on the Claude subscription. Run it SOLO -- no other Claude session,
team or extraction at the same time (CLAUDE.md "Extraction backends").

Outputs go to out/stability/ (gitignored): <label>.json holds every study's
record and extraction; cache_<label>.sqlite is that run's private LLM cache.
"""
from __future__ import annotations

import argparse
import collections
import json
import os
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

RUN = ROOT / "reports" / "runs" / "20260904_185830_creatine_creatine-monohydrate_claude-sr-ft-top5-suppl_context.json"
OUT = ROOT / "out" / "stability"
SHOWCASE = ["muscle_strength", "muscle_power", "lean_body_mass", "exercise_endurance", "energy_levels"]

S3_FIELDS = ("comparator", "ingredient_isolated", "self_declared_underpowered", "n_randomised",
             "n_analysed", "duration_days", "deficiency_status")
S4_FIELDS = ("item1_randomisation_method", "item2_double_blind_placebo", "item3_prospective_registration",
             "item4_outcome_matches_registry", "item5_attrition_ok", "item6_itt")
S7_FIELDS = ("form_vocab_id", "elemental_dose_mg", "compound_dose_mg", "dose_per_kg_mg", "dose_basis")
S8_FIELDS = ("funding_class",)
CLAIM_FIELDS = ("direction", "effect_favours", "effect_size", "ci_low", "ci_high", "p_value", "contrast")


# ----------------------------------------------------------------- selection
def select_studies(n: int) -> list[dict]:
    """Deterministic: full-text studies with a mapped ingredient-free contrast,
    taken round-robin across outcomes so no outcome dominates."""
    ctx = json.loads(RUN.read_text(encoding="utf-8"))
    buckets: dict[str, list[dict]] = collections.defaultdict(list)
    for s in sorted(ctx["studies_list"], key=lambda s: s["canonical_id"]):
        if s.get("skipped") or s.get("oa") != "full_text":
            continue
        mapped = [c.get("outcome_vocab_id") for c in (s.get("extraction") or {}).get("s5_claims") or []
                  if not c.get("discarded") and c.get("outcome_vocab_id") in SHOWCASE
                  and c.get("contrast") == "vs_ingredient_free"]
        if mapped:
            buckets[mapped[0]].append(s)
    picked, seen = [], set()
    while len(picked) < n and any(buckets.values()):
        for oid in SHOWCASE:
            if buckets.get(oid) and len(picked) < n:
                s = buckets[oid].pop(0)
                if s["canonical_id"] not in seen:
                    seen.add(s["canonical_id"])
                    picked.append(s)
    return picked


def rebuild_record(study: dict) -> dict | None:
    """The retrieval-shaped record for one study, via Europe PMC (cached)."""
    from sources import europepmc as ep
    queries = ([f'DOI:"{study["doi"]}"'] if study.get("doi") else []) + \
              ([f"EXT_ID:{study['pmid']} AND SRC:MED"] if study.get("pmid") else [])
    for q in queries:
        hits = ep.search(q, page_size=5, max_records=5)
        if hits:
            rec = ep.normalise(hits[0])
            rec.update({"_canonical": study["canonical_id"], "canonical_id": study["canonical_id"],
                        "ingredient": "creatine", "design_rank": 4})
            return rec
    return None


# ----------------------------------------------------------------------- run
def _fake_call(agent, payload, **_kw):
    return None, {"error": "fake call (harness check): no model was called"}


def run(label: str, n: int, fake: bool, resume: bool, in_flight: int = 5) -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    cache = OUT / f"cache_{label}.sqlite"
    dest = OUT / f"{label}.json"
    if (cache.exists() or dest.exists()) and not resume:
        print(f"{cache.name} / {dest.name} already exist. A stability run needs its own "
              "EMPTY cache; use a new --label, or --resume to continue this one.")
        return 1
    # Must be set BEFORE claude_adapter is imported: it reads CACHE_DB at import.
    os.environ["SP_LLM_CACHE"] = str(cache)
    from bsproof import claude_adapter as ca
    from bsproof import workers
    from bsproof.run.corpus import _best_text, _sections
    assert Path(ca.CACHE_DB) == cache, "the private cache did not take effect"
    if not fake and not ca.preflight():
        return 1
    call = _fake_call if fake else ca.call

    done = json.loads(dest.read_text()) if dest.exists() else {}
    todo = [s for s in select_studies(n) if s["canonical_id"] not in done]
    lock = threading.Lock()
    started = time.monotonic()

    def one(study: dict) -> None:
        cid = study["canonical_id"]
        rec = rebuild_record(study)
        if rec is None:
            result = {"error": "record not found in Europe PMC"}
        else:
            ext = workers.extract_study(rec, _best_text(rec), call=call, outcome_allowlist=SHOWCASE,
                                        sections=_sections(rec))
            result = {"record": rec, "extraction": ext}
        with lock:  # save after every study, so an interrupted run resumes
            done[cid] = result
            dest.write_text(json.dumps(done, indent=1, default=str), encoding="utf-8")
            failed = [f.get("agent") for f in (result.get("extraction") or {}).get("_failed") or []]
            print(f"[{label}] {len(done)}/{n} {cid}  failed agents: {failed or 0}  "
                  f"({time.monotonic() - started:.0f}s)", flush=True)

    # Several studies in flight, like extract_corpus: one at a time took ~2.2 min
    # per study (measured 2026-10-03). The adapter's own semaphore still caps the
    # total number of simultaneous model calls (SP_MAX_CONCURRENCY).
    with ThreadPoolExecutor(max_workers=max(1, in_flight)) as pool:
        for fut in [pool.submit(one, s) for s in todo]:
            fut.result()
    print(f"wrote {dest}")
    return 0


# ------------------------------------------------------------------- compare
def _kappa(pairs: list[tuple]) -> float | None:
    """Cohen's kappa for two raters over categorical values (None is a value)."""
    if not pairs:
        return None
    n = len(pairs)
    po = sum(a == b for a, b in pairs) / n
    ca, cb = collections.Counter(a for a, _ in pairs), collections.Counter(b for _, b in pairs)
    pe = sum(ca[k] * cb.get(k, 0) for k in ca) / (n * n)
    return 1.0 if pe == 1 else round((po - pe) / (1 - pe), 3)


def _same(a, b) -> bool:
    if isinstance(a, (int, float)) and isinstance(b, (int, float)) and not isinstance(a, bool):
        return abs(a - b) <= 0.01 * max(abs(a), abs(b), 1e-9)
    return a == b


def _field_stats(pairs: list[tuple]) -> dict:
    agree = sum(_same(a, b) for a, b in pairs)
    return {"n": len(pairs), "agree": round(agree / len(pairs), 3) if pairs else None,
            "kappa": _kappa([(json.dumps(a, sort_keys=True), json.dumps(b, sort_keys=True)) for a, b in pairs])}


def _claims_by_outcome(ext: dict) -> dict[str, dict]:
    """First non-discarded claim per mapped outcome (the scoring path's view)."""
    out = {}
    for o in ext.get("outcomes") or []:
        oid = o.get("outcome_vocab_id")
        if oid and not o.get("discarded") and oid not in out:
            out[oid] = o.get("claim") or {}
    return out


def _effects_by_outcome(ext: dict) -> dict[str, tuple]:
    """Evidence method v2 view: (route, smd) per mapped outcome from the first
    claim whose span-verified numbers yield an effect, else (refusal, None)."""
    from pipeline import vocab
    from pipeline.effect_size import effect_from_claim
    polarity = {o["id"]: o.get("polarity") for o in vocab.load("outcome")["outcomes"]}
    out: dict[str, tuple] = {}
    for o in ext.get("outcomes") or []:
        oid = o.get("outcome_vocab_id")
        nums = o.get("numbers_v2")
        if not oid or o.get("discarded") or not isinstance(nums, dict):
            continue
        eff, why = effect_from_claim(o.get("claim") or {}, nums.get("verified") or {},
                                     polarity=polarity.get(oid), abs_only=nums.get("abs_only") or ())
        if eff is not None and (oid not in out or out[oid][1] is None):
            out[oid] = (eff.route, eff.smd if eff.smd is not None else eff.md)
        elif oid not in out:
            out[oid] = ("refused", None)
    return out


def _failed_agents(ext: dict) -> set[str]:
    return {f.get("agent") for f in ext.get("_failed") or [] if f.get("agent")}


def compare_runs(a: dict, b: dict) -> dict:
    """Field agreement between two runs. An agent that FAILED in either run is
    left out of that agent's comparison only (its other agents still count), and
    every failure is reported per agent and run -- a failure is itself a
    reproducibility result, not noise to discard."""
    ids = sorted(set(a) & set(b))
    pairs = {f"S3.{f}": [] for f in S3_FIELDS} | {f"S4.{f}": [] for f in S4_FIELDS} | \
            {f"S7.{f}": [] for f in S7_FIELDS} | {f"S8.{f}": [] for f in S8_FIELDS} | \
            {f"claim.{f}": [] for f in CLAIM_FIELDS}
    failures = {"A": collections.Counter(), "B": collections.Counter()}
    jaccard, compared, scorable = [], [], []
    effect_pairs = []
    for cid in ids:
        ea, eb = a[cid].get("extraction") or {}, b[cid].get("extraction") or {}
        if ea.get("_skipped") or eb.get("_skipped") or "record" not in a[cid] or "record" not in b[cid]:
            continue
        fa, fb = _failed_agents(ea), _failed_agents(eb)
        failures["A"].update(fa)
        failures["B"].update(fb)
        compared.append(cid)
        if not fa and not fb:
            scorable.append(cid)
        for agent, fields in (("S3", S3_FIELDS), ("S4", S4_FIELDS), ("S7", S7_FIELDS), ("S8", S8_FIELDS)):
            if agent in fa or agent in fb:
                continue
            ra, rb = ea.get(agent) or {}, eb.get(agent) or {}
            for f in fields:
                pairs[f"{agent}.{f}"].append((ra.get(f), rb.get(f)))
        if "S5" in fa or "S5" in fb:
            continue
        ca, cb = _claims_by_outcome(ea), _claims_by_outcome(eb)
        union = set(ca) | set(cb)
        jaccard.append(len(set(ca) & set(cb)) / len(union) if union else 1.0)
        for oid in set(ca) & set(cb):
            for f in CLAIM_FIELDS:
                pairs[f"claim.{f}"].append((ca[oid].get(f), cb[oid].get(f)))
        fa_eff, fb_eff = _effects_by_outcome(ea), _effects_by_outcome(eb)
        for oid in set(fa_eff) | set(fb_eff):
            effect_pairs.append((fa_eff.get(oid, ("unmapped", None)), fb_eff.get(oid, ("unmapped", None))))
    produced = [(a, b) for a, b in effect_pairs if a[1] is not None or b[1] is not None]
    both = [(a, b) for a, b in produced if a[1] is not None and b[1] is not None]
    return {
        "studies_compared": len(compared), "studies_in_both_files": len(ids),
        "studies_with_no_failed_agent_in_either_run": len(scorable),
        "agent_failures": {run: dict(c) for run, c in failures.items()},
        "outcome_mapping_jaccard_mean": round(sum(jaccard) / len(jaccard), 3) if jaccard else None,
        "fields": {k: _field_stats(v) for k, v in pairs.items()},
        # v2: did the two runs produce the same effect size for an outcome?
        "effects_v2": {
            "outcome_pairs": len(effect_pairs),
            "effect_in_either_run": len(produced),
            "effect_in_both_runs": len(both),
            "same_route": sum(1 for a, b in both if a[0] == b[0]),
            "same_effect_within_0.05": sum(1 for a, b in both if abs(a[1] - b[1]) <= 0.05),
            "max_abs_difference": round(max((abs(a[1] - b[1]) for a, b in both), default=0.0), 3),
        },
        # Scores only from studies where every agent succeeded in BOTH runs, so a
        # score difference is extraction disagreement, not one run missing data.
        "scores": _score_both(a, b, scorable),
    }


def _score_both(a: dict, b: dict, ids: list[str]) -> dict:
    """Score each run's extractions with the production scorer; compare per outcome."""
    from pipeline import vocab
    from pipeline.assemble import build_ecus
    pv = vocab.population_variants()[0]
    product = {"ingredient": "creatine", "form_vocab_id": "creatine_monohydrate",
               "population": {"id": pv["id"], **{k: pv[k] for k in vocab.AXES}},
               "dose_low_mg": None, "dose_high_mg": None}

    def rows(run: dict) -> dict:
        exts = [{"record": run[c]["record"], "extraction": run[c]["extraction"], "registry": None} for c in ids]
        out = build_ecus(exts, product, exclude_offtarget_population=True, searched_outcomes=SHOWCASE)
        return {r["outcome_vocab_id"]: {"composite": r.get("composite"),
                                        "n": (r.get("evidence") or {}).get("n_primaries")} for r in out}
    ra, rb = rows(a), rows(b)
    return {oid: {"A": ra.get(oid), "B": rb.get(oid)} for oid in SHOWCASE}


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("run")
    r.add_argument("--label", required=True)
    r.add_argument("--n", type=int, default=25)
    r.add_argument("--fake", action="store_true", help="fake model: harness check only")
    r.add_argument("--resume", action="store_true")
    r.add_argument("--in-flight", type=int, default=5, help="studies extracted in parallel")
    c = sub.add_parser("compare")
    c.add_argument("a")
    c.add_argument("b")
    c.add_argument("--out", type=Path)
    args = ap.parse_args(argv)
    if args.cmd == "run":
        return run(args.label, args.n, args.fake, args.resume, args.in_flight)
    load = lambda label: json.loads((OUT / f"{label}.json").read_text(encoding="utf-8"))
    result = compare_runs(load(args.a), load(args.b))
    text = json.dumps(result, indent=1)
    print(text)
    if args.out:
        args.out.write_text(text + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
