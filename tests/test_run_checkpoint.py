"""Run checkpoints and the incomplete-run guard (bsproof/workers.extract_corpus
`checkpoint=`, bsproof/run/extract._incomplete_quota). A run cut short by the
subscription limit must stop before any report; resuming is re-running the
same command (finished calls replay from the adapter cache)."""
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock

REC = {"_canonical": "doi:10.1/a", "canonical_id": "doi:10.1/a", "ingredient": "creatine",
       "title": "t", "abstract": "oral creatine supplementation 5 g/day", "design_rank": 4}
TEXT = "x" * 500


def fake(agent, payload):
    return ({"claims": []} if agent == "S5" else {}), {}


class Checkpoint(unittest.TestCase):
    def test_one_record_per_finished_study(self):
        from bsproof import workers
        recs = [REC, {**REC, "_canonical": "doi:10.1/b", "canonical_id": "doi:10.1/b"},
                {**REC, "_canonical": "doi:10.1/c", "canonical_id": "doi:10.1/c", "abstract": "iv infusion"}]
        texts = {"doi:10.1/a": TEXT, "doi:10.1/b": "", "doi:10.1/c": TEXT}
        with tempfile.TemporaryDirectory() as d, \
                mock.patch.dict(os.environ, {}):
            cp = Path(d) / "sub" / "creatine_x.json"
            workers.extract_corpus(recs, text_for=lambda r: texts[r["canonical_id"]],
                                   call=fake, checkpoint=cp)
            data = json.loads(cp.read_text())
        self.assertEqual((data["studies_total"], data["studies_finished"]), (3, 3))
        self.assertEqual(data["studies"]["doi:10.1/a"], "ok")
        self.assertEqual(data["studies"]["doi:10.1/b"], "skipped")             # no text
        self.assertFalse((Path(d) / "sub" / "creatine_x.tmp").exists())

    def test_no_checkpoint_by_default(self):
        from bsproof import workers
        with mock.patch.object(workers, "_write_checkpoint") as w, \
                mock.patch.dict(os.environ, {}):
            workers.extract_corpus([REC], text_for=lambda r: TEXT, call=fake)
        w.assert_not_called()


class IncompleteGuard(unittest.TestCase):
    def test_quota_failures_are_found(self):
        from bsproof.run.extract import _incomplete_quota
        raw = [{"record": {"canonical_id": "a"}, "extraction": {"_failed": [{"agent": "S5", "error": "usage limit reached"}]}},
               {"record": {"canonical_id": "b"}, "extraction": {"_failed": [{"agent": "S7", "error": "exit 1: max_turns"}]}},
               {"record": {"canonical_id": "c"}, "extraction": {"_quota_exhausted": "session limit"}},
               {"record": {"canonical_id": "d"}, "extraction": {}}]
        self.assertEqual(_incomplete_quota(raw), ["a", "c"])

    def test_the_guard_returns_before_scoring(self):
        src = (Path(__file__).resolve().parents[1] / "bsproof" / "run" / "extract.py").read_text()
        self.assertIn("return EXIT_INCOMPLETE", src)
        self.assertIn('SP_ALLOW_INCOMPLETE', src)
        from bsproof.run.extract import EXIT_INCOMPLETE
        self.assertIsInstance(EXIT_INCOMPLETE, int)          # run_pipeline.main returns an int stage result


if __name__ == "__main__":
    unittest.main()


class WeeklyLimit(unittest.TestCase):
    """Measured 2026-10-17: the weekly ceiling's wording matched no quota string,
    so calls were retried and the run never paused (~900 failed calls)."""
    MSG = "exit 1: You've hit your weekly limit · resets 6am (Europe/Vilnius)"

    def test_every_limit_wording_is_a_quota_hit_and_fatal(self):
        from bsproof.claude_adapter import _is_fatal
        from bsproof.worker_quota import _hit_quota, _quota_signal
        for msg in (self.MSG, "api_error: usage_limit_reached", "Claude AI usage limit reached",
                    "5-hour limit reached", "session limit", "rate_limit_error"):
            with self.subTest(msg=msg):
                self.assertTrue(_quota_signal(msg))
                self.assertTrue(_is_fatal(msg))
        self.assertTrue(_hit_quota({"_failed": [{"agent": "S7", "error": self.MSG}]}))
        self.assertFalse(_quota_signal("exit 1: max_turns"))
        self.assertFalse(_quota_signal("the dose limit was 5 g"))

    def test_a_failed_mapping_call_is_recorded_and_requeues_on_quota(self):
        from bsproof import workers

        def call(agent, payload):
            if agent == "S5":
                return {"claims": [{"outcome_raw": "1RM", "measure": "kg"}]}, {}
            if agent == "S6B":
                return None, {"error": self.MSG}
            return {}, {}
        with mock.patch.dict(os.environ, {"SP_SECOND_REVIEWER": "0"}):
            out = workers.extract_study(REC, TEXT, call=call)
        self.assertIn({"agent": "S6B", "error": self.MSG}, out["_failed"])
        self.assertEqual(out["_quota_exhausted"], self.MSG)
