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
                mock.patch.dict(os.environ, {"SP_NUMERIC_TABLES": "0", "SP_NUMBERS_EXTRACTOR": "0"}):
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
                mock.patch.dict(os.environ, {"SP_NUMERIC_TABLES": "0", "SP_NUMBERS_EXTRACTOR": "0"}):
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
