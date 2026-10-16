"""A table the span check could not FETCH is never treated as a number the paper
did not print (docs/DECISIONS.md item 2, measured 2026-10-15: one failed fetch
moved creatine strength from k = 9 C- to k = 7 I)."""
import unittest
from unittest.mock import patch

from bsproof import worker_payload, workers
from bsproof.run import extract
from pipeline.pool import pool_outcomes
from sources import fulltext
from sources.http import SourceError

CLAIM = {"outcome_raw": "1RM bench press", "measure": "kg", "ingredient_arm": "CR", "control_arm": "PL",
         "contrast": "vs_ingredient_free", "design_kind": "parallel", "estimand": "final_value",
         "effect_favours": "ingredient", "effect_unit": "kg",
         "mean_ingredient": 82.1, "sd_ingredient": 5.2, "n_ingredient": 20,
         "mean_control": 79.9, "sd_control": 4.8, "n_control": 19,
         "evidence_span": "Table 3 shows the results.",
         "table_provenance": {"caption": "Table 3", "row": "1RM bench press"}}
S3 = {"arms": [{"label": "CR", "n": 20, "role": "administered", "target_ingredient_presence": "yes",
                "active_cointerventions": []},
               {"label": "PL", "n": 19, "role": "administered", "target_ingredient_presence": "no",
                "active_cointerventions": []}],
      "comparator": "ingredient_free", "ingredient_isolated": "yes"}
RECORD = {"pmcid": "PMC1", "ingredient": "creatine"}
PRODUCT = {"ingredient": "creatine", "form_vocab_id": "creatine_monohydrate",
           "population": {"id": "general_adult"}, "dose_low_mg": None, "dose_high_mg": None}


def _verify(fetch):
    out = {"S3": S3, "S5": {"claims": [CLAIM]}}
    with patch.object(worker_payload, "_tables_structured", fetch):
        return out, workers._verify_numbers(out, RECORD)


class TableFetch(unittest.TestCase):
    def test_a_fetch_failure_is_marked_not_called_unprinted(self):
        def boom(_record):
            raise SourceError("http 503 for PMC1", status=503)
        out, (res,) = _verify(boom)
        self.assertEqual(res["table_fetch_failed"], "http 503 for PMC1")
        self.assertEqual(out["_table_fetch_failed"], "http 503 for PMC1")
        self.assertNotIn("mean_ingredient", res["verified"])        # still refused, never passed

    def test_a_paper_without_the_table_is_not_a_fetch_failure(self):
        out, (res,) = _verify(lambda _record: [])
        self.assertNotIn("table_fetch_failed", res)
        self.assertNotIn("_table_fetch_failed", out)

    def test_the_pool_names_the_fetch_failure(self):
        _, (res,) = _verify(lambda _r: (_ for _ in ()).throw(SourceError("timeout")))
        item = {"id": "doi:x", "record": {"design_rank": 4},
                "extraction": {"S3": S3, "outcomes": [{"outcome_vocab_id": "muscle_strength", "claim": CLAIM,
                                                       "numbers_v2": res}]}}
        pool = pool_outcomes([item], PRODUCT)["muscle_strength"]
        self.assertEqual(pool.refused, {"cited table could not be fetched (re-run)": 1})

    def test_no_report_while_a_fetch_is_unresolved(self):
        raw = [{"record": {"canonical_id": "doi:a"}, "extraction": {"_table_fetch_failed": "timeout"}},
               {"record": {"canonical_id": "doi:b"}, "extraction": {}}]
        self.assertEqual(extract._table_fetch_failed(raw), ["doi:a"])

    def test_fetch_xml_retries_transient_errors(self):
        calls = []

        class R:
            def __init__(self, code, text=""):
                self.status_code, self.text = code, text

        def fake_get(*_a, **_k):
            calls.append(1)
            return R(503) if len(calls) < 3 else R(200, "<article/>")
        import httpx
        with patch.object(httpx, "get", fake_get), patch("time.sleep", lambda *_: None):
            self.assertEqual(fulltext.fetch_xml("PMC999999001", use_cache=False), "<article/>")
        self.assertEqual(len(calls), 3)

    def test_fetch_xml_gives_up_with_an_error_not_none(self):
        import httpx
        with patch.object(httpx, "get", lambda *_a, **_k: type("R", (), {"status_code": 502, "text": ""})()), \
                patch("time.sleep", lambda *_: None):
            with self.assertRaises(SourceError):
                fulltext.fetch_xml("PMC999999002", use_cache=False)


if __name__ == "__main__":
    unittest.main()


class SectionHeaderTables(unittest.TestCase):
    """Tables whose outcome label spans a whole row, with one row per group
    underneath (measured 2026-10-16: PMC8427883 Table 4, PMC7019716 Table 2)."""
    from pipeline import span_check as sc
    TABLE = [{"caption": "Table 4 — Mean ± SD of peak torque",
              "columns": ["Group", "Pre", "Post", "p"],
              "rows": [["Peak Torque (N·m)"] * 4,
                       ["Creatine Group (n = 12)", "99.95 ± 22.50", "111.97 ± 24.50*", "0.009"],
                       ["Placebo Group (n = 10)", "99.82 ± 36.51", "107.52 ± 44.11", "0.112"],
                       ["Average Power (Watts)"] * 4,
                       ["Creatine Group", "143.42 ± 33.84", "159.78 ± 31.20*", "0.021"],
                       ["Placebo Group", "141.94 ± 51.92", "150.79 ± 64.30", "0.279"]]}]
    PROV = {"caption": "Table 4 Mean ± SD of peak torque", "row": "Peak Torque (N·m)"}

    def claim(self, **kw):
        return {"table_provenance": self.PROV, "ingredient_arm": "Creatine Group", "control_arm": "Placebo Group",
                "evidence_span": "", **kw}

    def test_the_block_under_a_header_is_the_cited_row(self):
        rows = self.sc.table_rows(self.PROV, self.TABLE)
        self.assertEqual([r[0] for r in rows], ["Creatine Group (n = 12)", "Placebo Group (n = 10)"])

    def test_values_verify_against_their_own_arm_row_only(self):
        res = self.sc.verify_claim_numbers(self.claim(mean_ingredient=111.97, sd_ingredient=24.5,
                                                      mean_control=107.52, sd_control=44.11),
                                           tables=self.TABLE)
        self.assertEqual(sorted(res["verified"]), ["mean_control", "mean_ingredient", "sd_control", "sd_ingredient"])
        swapped = self.sc.verify_claim_numbers(self.claim(mean_ingredient=107.52), tables=self.TABLE)
        self.assertNotIn("mean_ingredient", swapped["verified"])     # the control row cannot verify it

    def test_the_next_section_is_never_borrowed(self):
        res = self.sc.verify_claim_numbers(self.claim(mean_ingredient=159.78), tables=self.TABLE)
        self.assertNotIn("mean_ingredient", res["verified"])

    def test_a_normal_label_row_is_unchanged(self):
        table = [{"caption": "Table 2", "columns": ["Outcome", "CR", "PL"],
                  "rows": [["1RM bench (kg)", "82.1 (5.2)", "79.9 (4.8)"]]}]
        rows = self.sc.table_rows({"caption": "Table 2", "row": "1RM bench (kg)"}, table)
        self.assertEqual(rows, [["1RM bench (kg)", "82.1 (5.2)", "79.9 (4.8)"]])


class UnpoolableDetail(unittest.TestCase):
    """The generic "no verified effect estimate" refusal names what was missing
    (docs/DECISIONS.md item 3)."""
    from pipeline.pool import unpoolable_detail as d

    def test_each_gap_is_named(self):
        d = UnpoolableDetail.d
        self.assertIn("no outcome values", d({"n_ingredient": 10, "n_control": 9}, {}, {}))
        self.assertIn("only a p-value", d({"p_value": 0.03, "n_ingredient": 10}, {}, {}))
        self.assertIn("not found in the paper", d({"mean_ingredient": 5.1}, {"rejected": {"mean_ingredient": "x"}}, {}))
        self.assertIn("without an SD", d({"post_ingredient": 5.1, "post_control": 4.0},
                                         {}, {"post_ingredient": 5.1, "post_control": 4.0}))
