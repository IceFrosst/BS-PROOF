"""Did the v1.27 S7 prompt actually recover the per-kg body masses?

WHY SURGICAL AND NOT A FULL RE-RUN. A PROMPT_VERSION bump invalidates the whole
S1-S8 cache (~1,000 calls on this corpus). The v1.27 change touches ONE field's
guidance -- per-arm mean_body_mass_kg may carry the paper's stated whole-sample
baseline mean -- so replay S7 alone on exactly the studies that exhibit the
defect: every study whose v1.26 extraction has a per-kg-dosed arm with a null
mass (32 on the creatine corpus, 13 of which had their stated mass captured by
the v1.23 top-level contract and lost by v1.24 arm keying).

Same discipline as scripts/null_numbers_experiment.py (the v1.15 S5 check):
one agent, a fixed study set, before/after measured, drift on every OTHER
field counted -- the fix must add masses, not move doses or forms.

Usage (needs httpx + signed-in Claude CLI, so use the venv python):
    .venv/bin/python scripts/s7_mass_experiment.py
"""
from __future__ import annotations

import hashlib
import json
import sys
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import claude_adapter
import workers
from pipeline.storage import Store
from run_pipeline import _best_text, _sections

BASELINE = ROOT / "out/creatine_v126_sr_extractions.json"
BASELINE_SHA256 = "dc834ea012ea419876658bf2a85b6e33027d7aef81d178f598a409c2c8a45526"
EXPECTED_AFFECTED = 32
KNOWN_REGRESSIONS = {
    "doi:103390nu18111789", "doi:1014814phy270539",
    "doi:1010801550278320252542369", "doi:103390nu16091324",
    "doi:1010801550278320232193556", "doi:103389fpubh20231062832",
    "doi:1010801550278320222108683", "doi:103390ijerph19137992",
    "doi:103390nu13072303", "doi:103390nu12061880",
    "doi:103390nu12102961", "doi:101186s1297001701622",
    "doi:102147copd200614445",
}
assert len(KNOWN_REGRESSIONS) == 13, "known-regression roster edited; re-verify"
OUT = ROOT / "out/s7_mass_experiment.json"


def _perkg_null_mass(s7: dict | None) -> bool:
    arms = (s7 or {}).get("arms") or []
    kg = [a for a in arms if isinstance(a, dict)
          and a.get("dose_per_kg_mg") is not None]
    return bool(kg) and all(a.get("mean_body_mass_kg") is None for a in kg)


def _arm_drift(old_rows: list, new_rows: list) -> list:
    """Every non-mass field drift, including arm structure and duplicates."""
    old_rows = [a for a in old_rows if isinstance(a, dict)]
    new_rows = [a for a in new_rows if isinstance(a, dict)]
    old_labels = [a.get("label") for a in old_rows]
    new_labels = [a.get("label") for a in new_rows]
    changed = []
    if Counter(old_labels) != Counter(new_labels):
        changed.append(("__structure__", "arm_label_multiset",
                        old_labels, new_labels))
    # Compare fields only where the label is unique on BOTH sides. Duplicate
    # labels are already structural drift and must never collapse in a dict.
    old_counts, new_counts = Counter(old_labels), Counter(new_labels)
    old_unique = {a.get("label"): a for a in old_rows
                  if old_counts[a.get("label")] == 1}
    new_unique = {a.get("label"): a for a in new_rows
                  if new_counts[a.get("label")] == 1}
    for label in old_unique.keys() & new_unique.keys():
        for field in ("form_vocab_id", "dose_per_kg_mg", "elemental_dose_mg",
                      "compound_dose_mg", "dose_basis"):
            if old_unique[label].get(field) != new_unique[label].get(field):
                changed.append((label, field, old_unique[label].get(field),
                                new_unique[label].get(field)))
    return changed


def main() -> int:
    if claude_adapter.PROMPT_VERSION != "v1.28":
        print(f"expected PROMPT_VERSION v1.28, got {claude_adapter.PROMPT_VERSION}")
        return 1
    raw = BASELINE.read_bytes()
    got_hash = hashlib.sha256(raw).hexdigest()
    if got_hash != BASELINE_SHA256:
        raise RuntimeError(f"baseline SHA-256 mismatch: {got_hash}")
    baseline = json.loads(raw)
    affected = [r for r in baseline if _perkg_null_mass(r["extraction"].get("S7"))]
    if len(affected) != EXPECTED_AFFECTED:
        raise RuntimeError(f"expected {EXPECTED_AFFECTED} affected, got {len(affected)}")
    print(f"PROMPT_VERSION = {claude_adapter.PROMPT_VERSION}")
    print(f"affected studies (per-kg arm, no mass under v1.26): {len(affected)}")

    with Store() as store:
        by_id = {s["canonical_id"]: s for s in store.studies(syntheses=False)}

        def replay(r):
            cid = r["record"].get("_canonical") or r["record"].get("canonical_id")
            # A legitimate envelope refusal (RuntimeError) must become one
            # recorded failure, not abort the whole pool with a traceback.
            try:
                rec = {**by_id[cid], "_canonical": cid, "ingredient": "creatine"}
                payload = workers._payload(
                    "S7", rec, _best_text(rec), None, _sections(rec),
                    s3_facts=r["extraction"].get("S3") or {})
                result, meta = claude_adapter.call("S7", payload)
            except Exception as exc:
                return cid, None, {"error": str(exc)}
            return cid, result, meta

        with ThreadPoolExecutor(max_workers=6) as pool:
            replayed = list(pool.map(replay, affected))

    gained, still_null, failed, drift = [], [], [], []
    rows = []
    for (cid, new_s7, meta), r in zip(replayed, affected):
        old_s7 = r["extraction"].get("S7") or {}
        if new_s7 is None:
            failed.append((cid, (meta or {}).get("error")))
            rows.append({"study_id": cid, "status": "failed",
                         "error": (meta or {}).get("error")})
            continue
        old_rows = old_s7.get("arms") or []
        new_rows = new_s7.get("arms") or []
        # Drift guard: the fix may ADD masses; every other dose/form fact and
        # the complete arm-label multiset must be unchanged, or the surgical
        # fix is actually re-rolling the extraction.
        changed = _arm_drift(old_rows, new_rows)
        if changed:
            drift.append((cid, changed))
        kg_arms = [a for a in new_rows if isinstance(a, dict)
                   and a.get("dose_per_kg_mg") is not None]
        masses = [(a.get("label"), a.get("dose_per_kg_mg"),
                   a.get("mean_body_mass_kg")) for a in kg_arms]
        if any(m is not None for _, _, m in masses):
            gained.append((cid, masses))
        else:
            still_null.append(cid)
        rows.append({"study_id": cid, "status": "ok",
                     "kg_arms": masses, "field_drift": changed,
                     "old_kg_arms": [(a.get("label"), a.get("dose_per_kg_mg"),
                                      a.get("mean_body_mass_kg"))
                                     for a in old_rows if isinstance(a, dict)
                                     and a.get("dose_per_kg_mg") is not None],
                     "new_s7": new_s7})

    gained_ids = {cid for cid, _ in gained}
    known_recovered = sorted(KNOWN_REGRESSIONS & gained_ids)
    known_missing = sorted(KNOWN_REGRESSIONS - gained_ids)
    OUT.write_text(json.dumps({
        "prompt_version": claude_adapter.PROMPT_VERSION,
        "baseline_sha256": got_hash,
        "affected": len(affected), "gained_mass": len(gained),
        "known_regressions": len(KNOWN_REGRESSIONS),
        "known_recovered": known_recovered,
        "known_missing": known_missing,
        "still_null": len(still_null), "failed": len(failed),
        "drift_studies": len(drift), "rows": rows,
        "usage": claude_adapter.USAGE.as_dict(),
    }, indent=1, default=str))

    print(f"\nwrote {OUT}")
    print(f"mass recovered : {len(gained)}/{len(affected)}")
    print(f"still null     : {len(still_null)}")
    print(f"failed         : {len(failed)}  {failed if failed else ''}")
    print(f"field drift on : {len(drift)} studies")
    print(f"known regressions recovered: {len(known_recovered)}/{len(KNOWN_REGRESSIONS)}")
    for cid, masses in gained:
        print(f"  + {cid}: {masses}")
    for cid, changed in drift:
        print(f"  ~ DRIFT {cid}: {changed}")
    # Missing known regressions are a measured result, not a transport failure:
    # print and persist them so docs cannot overclaim recovery. Only failed live
    # calls make the surgical replay incomplete.
    return 0 if not failed else 2


if __name__ == "__main__":
    raise SystemExit(main())
