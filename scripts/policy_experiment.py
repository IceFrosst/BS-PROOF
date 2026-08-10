"""
Offline scope-policy experiment.  NO MODEL MAY ENTER THIS FILE.

    SP_DUMP_EXTRACTIONS=/tmp/x.json ./.venv/bin/python run_pipeline.py creatine ...
    python3 scripts/policy_experiment.py /tmp/x.json

Replays a dumped extraction set through build_ecus under different scope
policies, so a founder decision about WHICH TRIALS MAY VOTE can be made from
numbers instead of argument. Costs nothing: the extractions are already paid for.
 Zero model calls -- replays the dumped extractions
through build_ecus under different scope policies and reports what each does to
d, c and the signed score.

This is the number REVIEW_PENDING #4 needs: not "here are three options" but
"option 1 moves muscle_strength from -12 to X".
"""
import json
import re
import sys

sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parent.parent))
from pipeline.assemble import build_ecus

DUMP = sys.argv[1] if len(sys.argv) > 1 else "extractions.json"
PRODUCT = {"ingredient": "creatine", "form_vocab_id": "creatine_monohydrate",
           "population": {"id": "general_adult", "age_band": "adult",
                          "sex": "mixed", "deficiency_status": "unknown",
                          "pregnancy": "not_pregnant", "health_status": "healthy"},
           "dose_low_mg": None, "dose_high_mg": None}
SHOWCASE = ["energy_levels", "muscle_strength", "lean_body_mass",
            "exercise_endurance", "muscle_power"]

# A second ACTIVE ingredient named in a treatment arm, with a combining word.
# Deliberately conservative: it must name a known co-supplement AND read as a
# combination, so "creatine monohydrate and placebo" does not match.
OTHER = re.compile(r"\b(hmb|caffeine|protein|whey|leucine|beta-?alanine|bcaa|"
                   r"citrate|blueberry|carbohydrate|dextrose|arginine|taurine|"
                   r"tamoxifen|creatinol|nitrate)\b", re.I)
COMBINE = re.compile(r"(\+|\bplus\b|\bcombined\b|\bco-?ingest|\band\b|\bwith\b)", re.I)


def is_co_ingestion(rec: dict) -> bool:
    s3 = (rec.get("extraction") or {}).get("S3") or {}
    arms = s3.get("arms") or []
    treat = [a for a in arms if isinstance(a, dict) and a.get("is_control") is False]
    txt = " ; ".join(f"{a.get('label') or ''} {a.get('intervention_text') or ''}"
                     for a in treat)
    return bool(OTHER.search(txt) and COMBINE.search(txt))


def is_disease(rec: dict) -> bool:
    s3 = (rec.get("extraction") or {}).get("S3") or {}
    return ((s3.get("population_axes") or {}).get("health_status")) == "disease"


def run(extractions, **kw):
    rows = build_ecus(extractions, PRODUCT, prompt_version="v1.10",
                      searched_outcomes=SHOWCASE, **kw)
    return {r.get("outcome_vocab_id"): r for r in rows}


def show(label, rows, n_corpus):
    print(f"\n--- {label}  (corpus n={n_corpus}) ---")
    print(f"    {'outcome':<21}{'signed':>7}{'comp':>6}{'n':>5}{'d':>8}{'c':>7}{'H':>7}")
    for o in SHOWCASE:
        r = rows.get(o)
        if not r:
            print(f"    {o[:20]:<21}{'absent':>7}")
            continue
        c = r.get("components") or {}
        ev = r.get("evidence") or {}
        f = lambda v, w, nd=3: (f"{v:>{w}.{nd}f}" if isinstance(v, float)
                                else f"{str(v) if v is not None else '—':>{w}}")
        print(f"    {o[:20]:<21}{f(r.get('score'),7)}{f(r.get('composite'),6)}"
              f"{f(ev.get('n_primaries'),5)}{f(c.get('d'),8)}{f(c.get('c'),7)}"
              f"{f(c.get('H'),7)}")


def main():
    all_ex = json.load(open(DUMP))
    print(f"loaded {len(all_ex)} extractions")

    co = [r for r in all_ex if is_co_ingestion(r)]
    dis = [r for r in all_ex if is_disease(r)]
    print(f"  co-ingestion treatment arm : {len(co)}")
    print(f"  health_status = disease    : {len(dis)}")
    both = [r for r in all_ex if is_co_ingestion(r) or is_disease(r)]
    print(f"  either                     : {len(both)}")

    # A: shipped behaviour
    show("A  SHIPPED (everything counts, ignore_population=True)",
         run(all_ex, ignore_population=True), len(all_ex))

    # B: population routing (the existing founder switch)
    show("B  population B (exclude pop_match='different')",
         run(all_ex, ignore_population=False, exclude_offtarget_population=True),
         len(all_ex))

    # C: co-ingestion refusal only -- the rule that does not exist yet
    keep_c = [r for r in all_ex if not is_co_ingestion(r)]
    show("C  refuse co-ingestion only", run(keep_c, ignore_population=True), len(keep_c))

    # D: both
    keep_d = [r for r in all_ex if not is_co_ingestion(r) and not is_disease(r)]
    show("D  refuse co-ingestion AND disease", run(keep_d, ignore_population=True),
         len(keep_d))

    # E / F are SENSITIVITY probes on the two remaining terms, run on top of D.
    # They mutate the DUMPED DATA, never the scoring code, so no constant moves.
    import copy

    def upgrade_magnitude(recs):
        """Every benefit whose magnitude is unstated/None becomes 'meaningful'.

        Upper bound on fixing the S5 magnitude gap: 114 of 487 benefit claims
        carry a numeric effect_size yet report 'unstated', and s_value() maps
        unstated -> benefit_trivial (+0.3) rather than +1.0.
        """
        out = copy.deepcopy(recs)
        for r in out:
            for c in ((r.get("extraction") or {}).get("S5") or {}).get("claims") or []:
                if c.get("direction") == "benefit" and c.get("magnitude") in (None, "unstated"):
                    c["magnitude"] = "meaningful"
            for o in (r.get("extraction") or {}).get("outcomes") or []:
                c = o.get("claim") or {}
                if c.get("direction") == "benefit" and c.get("magnitude") in (None, "unstated"):
                    c["magnitude"] = "meaningful"
        return out

    def drop_half_nulls(recs):
        """Drop every 2nd null_effect claim.

        Probes the audit finding CLAUDE.md records: five verifiers reading the
        actual papers found 11 of 23 null verdicts were not evidence against
        creatine at all. This is what ~half the nulls being wrong would do.
        """
        out = copy.deepcopy(recs)
        seen = 0
        for r in out:
            for key, container in (("S5", ((r.get("extraction") or {}).get("S5") or {}).get("claims") or []),):
                keep = []
                for c in container:
                    if c.get("direction") == "null_effect":
                        seen += 1
                        if seen % 2 == 0:
                            continue
                    keep.append(c)
                if (r.get("extraction") or {}).get("S5") is not None:
                    r["extraction"]["S5"]["claims"] = keep
            outs, seen2 = [], seen
            for o in (r.get("extraction") or {}).get("outcomes") or []:
                if ((o.get("claim") or {}).get("direction")) == "null_effect":
                    seen2 += 1
                    if seen2 % 2 == 0:
                        continue
                outs.append(o)
            if (r.get("extraction") or {}).get("outcomes") is not None:
                r["extraction"]["outcomes"] = outs
        return out

    show("E  D + every benefit magnitude read as 'meaningful' (SENSITIVITY)",
         run(upgrade_magnitude(keep_d), ignore_population=True), len(keep_d))
    show("F  D + half the nulls removed, i.e. the 11-of-23 audit (SENSITIVITY)",
         run(drop_half_nulls(keep_d), ignore_population=True), len(keep_d))
    show("G  D + BOTH sensitivities (SENSITIVITY)",
         run(drop_half_nulls(upgrade_magnitude(keep_d)), ignore_population=True),
         len(keep_d))

    print("\nNOTE: C and D are EXPERIMENTS, not shipped behaviour. A co-ingestion")
    print("refusal is an invariant amendment (founder + SPEC 13). Nothing here")
    print("changes a constant.")


if __name__ == "__main__":
    main()
