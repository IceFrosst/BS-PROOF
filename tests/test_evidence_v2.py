"""Evidence method v2 run block (pipeline/evidence_v2.py): the grade the app
recomputes from the stored record equals the Python grade, and the block
survives the dashboard artifact writer and its schema."""
import json
import unittest
from pathlib import Path

from pipeline import vocab
from pipeline.evidence_v2 import corpus_ncts, summarise
from pipeline.grade import grade, letter_from_record
from pipeline.pool import pool_outcomes

ROOT = Path(__file__).resolve().parents[1]
PV = vocab.population_variants()[0]
POP = {a: PV[a] for a in vocab.AXES}


def product(form="creatine_monohydrate", dose=None):
    return {"ingredient": "creatine", "form_vocab_id": form, "population": {"id": PV["id"], **POP},
            "dose_low_mg": dose, "dose_high_mg": dose}


def study(sid, mean_i, *, form="creatine_monohydrate", dose_mg=5000, n=40, raw="Leg press 1-RM (kg)"):
    verified = {"mean_ingredient": mean_i, "mean_control": 80.0, "sd_ingredient": 10.0,
                "sd_control": 10.0, "n_ingredient": n, "n_control": n}
    claim = {"contrast": "vs_ingredient_free", "design_kind": "parallel", "estimand": "endpoint",
             "effect_unit": "kg", "outcome_raw": raw, "is_primary_outcome": True}
    return {"id": sid, "record": {"ingredient": "creatine", "design_rank": 4},
            "extraction": {
                "S3": {"population_axes": dict(POP), "comparator": "ingredient_free",
                       "ingredient_isolated": "yes", "registration_id": f"NCT0000{sid[-1]}"},
                "S4": {"item1_randomisation_method": 1, "item2_double_blind_placebo": 1,
                       "item5_attrition_ok": 1},
                "S7": {"form_vocab_id": form, "elemental_dose_mg": dose_mg, "dose_basis": "elemental_stated"},
                "outcomes": [{"outcome_vocab_id": "muscle_strength", "discarded": False, "claim": claim,
                              "numbers_v2": {"verified": verified, "abs_only": []}}]}}


ITEMS = [study("s1", 86), study("s2", 84, form="creatine_hcl"), study("s3", 88, dose_mg=20000),
         study("s4", 83), study("s5", 85, form=None)]


class Block(unittest.TestCase):
    def test_record_letter_equals_python_grade_for_any_product(self):
        block = summarise(ITEMS, product())
        stored = next(o for o in block["outcomes"] if o["outcome"] == "muscle_strength")
        for prod in (product(), product(dose=5000), product(dose=1000),
                     product(form="creatine_hcl", dose=20000)):
            with self.subTest(prod=(prod["form_vocab_id"], prod["dose_low_mg"])):
                pool = pool_outcomes(ITEMS, prod)["muscle_strength"]
                expected = grade(pool, next(o for o in vocab.load("outcome")["outcomes"]
                                            if o["id"] == "muscle_strength").get("mcid"))
                # What the app does: re-match the STORED studies to this product.
                from pipeline.dose import dose_match_for
                matched = []
                for s in stored["studies"]:
                    if s["weight"] is None:
                        continue
                    matched.append({
                        "form_match": "exact" if s["form_id"] and s["form_id"] == prod["form_vocab_id"] else "other",
                        "dose_match": None if prod["dose_low_mg"] is None else dose_match_for(
                            prod["dose_low_mg"], prod["dose_high_mg"],
                            {"low": s["dose_low_mg"], "high": s["dose_high_mg"]})})
                got = letter_from_record(stored["record"], matched, [s["weight"] for s in stored["studies"]
                                                                     if s["weight"] is not None])
                self.assertEqual((got["letter"], got["level"]), (expected.letter, expected.certainty.level))

    def test_trial_form_and_dose_are_stored(self):
        stored = summarise(ITEMS, product())["outcomes"][0]
        self.assertEqual(stored["k"], 5)
        self.assertEqual({s["form_id"] for s in stored["studies"]},
                         {"creatine_monohydrate", "creatine_hcl", None})
        self.assertIn(20000, {s["dose_low_mg"] for s in stored["studies"]})

    def test_corpus_ncts(self):
        self.assertEqual(corpus_ncts(ITEMS), {f"NCT0000{i}" for i in range(1, 6)})

    def test_block_passes_the_artifact_writer_and_schema(self):
        from scripts.dashboard_artifact import build_dashboard_run
        ctx_path = next((ROOT / "reports" / "runs").glob("*_context.json"))
        ctx = json.loads(ctx_path.read_text())
        registry = {"muscle_strength": {"registered": 9, "in_corpus": 2, "unpublished": ["NCT1"],
                                        "upper_bound": True}}
        ctx["evidence_v2"] = summarise(ITEMS, product(dose=5000), registry)
        run_id = ctx_path.name.split("_creatine")[0] if "_creatine" in ctx_path.name else "20260904_185830"
        art = build_dashboard_run(ctx, run_id=run_id)            # validates against the schema
        self.assertEqual(art["evidence_v2"]["method"], "evidence-v2")
        self.assertTrue(art["evidence_v2"]["registry_checked"])


if __name__ == "__main__":
    unittest.main()
