"""Python SourceAccessV2 emission and shared-contract tests (offline)."""
import copy
import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from pipeline import claude_research_adapter as ad  # noqa: E402

FIXTURE = json.loads((ROOT / "tests/fixtures/source-access-v2.json").read_text())


try:
    import jsonschema  # noqa: F401
    HAS_JSONSCHEMA = True
except ImportError:
    HAS_JSONSCHEMA = False


@unittest.skipUnless(HAS_JSONSCHEMA, "jsonschema is required for SourceAccessV2 schema validation")
class SourceAccessV2Tests(unittest.TestCase):
    def test_shared_phase1_fixture_passes_python_validation(self):
        ad.validate_live_receipts_and_inventory(FIXTURE["audit"], FIXTURE["source_access_v2"])

    def test_actual_decoded_receipts_emit_fixture_compatible_payload(self):
        events = FIXTURE["fake_stream"]
        self.assertEqual(ad.sanitize_target(FIXTURE["target"]), FIXTURE["target"])
        with tempfile.TemporaryDirectory() as td:
            raw = Path(td) / "stream.jsonl"
            raw.write_text("".join(json.dumps(x) + "\n" for x in events))
            analysis = ad.analyze_stream(raw)
        # analyze_stream only reads physical newline-delimited JSON records.
        self.assertEqual(analysis.events, 4)
        # Feed known timestamps / pinned CLI metadata without touching the CLI.
        rr = ad.RunResult(Path("."), Path("."), Path("."), Path("."), Path("."), Path("."),
                          FIXTURE["source_access_v2"]["runner"]["started_at"],
                          ended_utc=FIXTURE["source_access_v2"]["runner"]["finished_at"],
                          cli_version="2.1.287")
        access = ad.source_access_v2(analysis, rr)
        self.assertEqual(access["summary"], {"requests": 2, "errors": 1, "walls": 1, "refusals": 0,
                                               "search_snippets": 1, "fetch_summaries": 1,
                                               "original_documents": 0})
        self.assertEqual(access, FIXTURE["source_access_v2"])
        ad.validate_live_receipts_and_inventory(FIXTURE["audit"], access)

    def test_rejects_hash_bytes_counter_claims_and_non_snippet_grounding(self):
        for mutate in (
            lambda x: x["events"][0].update(text_bytes=999),
            lambda x: x["events"][0].update(text_sha256="0" * 64),
            lambda x: x["summary"].update(requests=99),
        ):
            bad = copy.deepcopy(FIXTURE["source_access_v2"])
            mutate(bad)
            with self.assertRaises(ad.ResearchAdapterError):
                ad.validate_live_receipts_and_inventory(FIXTURE["audit"], bad)
        unsupported = copy.deepcopy(FIXTURE["audit"])
        unsupported["outcomes"][0]["inventory"][0]["access"] = "full_text"
        with self.assertRaisesRegex(ad.ResearchAdapterError, "must be snippet"):
            ad.validate_live_receipts_and_inventory(unsupported, FIXTURE["source_access_v2"])
        ungrounded = copy.deepcopy(FIXTURE["audit"])
        ungrounded["outcomes"][0]["inventory"][0]["id"] = "PMID 99999999"
        with self.assertRaisesRegex(ad.ResearchAdapterError, "not grounded"):
            ad.validate_live_receipts_and_inventory(ungrounded, FIXTURE["source_access_v2"])

    def test_requires_pinned_cli_init_model_key_and_usage(self):
        for path, value in (("model", "wrong-model"), ("apiKeySource", "api_key")):
            access = copy.deepcopy(FIXTURE["source_access_v2"])
            access["runner"][path] = value
            with self.assertRaises(ad.ResearchAdapterError):
                ad.validate_live_receipts_and_inventory(FIXTURE["audit"], access)
        events = [
            {"type": "system", "subtype": "init", "model": ad.MODEL, "apiKeySource": "none"},
            {"type": "result", "modelUsage": {ad.MODEL: {"outputTokens": 3}, "unexpected-model": {"outputTokens": 1}}},
        ]
        with tempfile.TemporaryDirectory() as td:
            raw = Path(td) / "no-init.jsonl"
            raw.write_text(json.dumps(events[1]) + "\n")
            missing_init = ad.analyze_stream(raw)
            raw.write_text("".join(json.dumps(event) + "\n" for event in events))
            extra_usage = ad.analyze_stream(raw)
        for analysis in (missing_init, extra_usage):
            rr = ad.RunResult(Path("."), Path("."), Path("."), Path("."), Path("."), Path("."),
                              "2026-10-03T01:02:03Z", ended_utc="2026-10-03T01:02:04Z", cli_version="2.1.287")
            with self.assertRaises(ad.ResearchAdapterError):
                ad.source_access_v2(analysis, rr)
        env = {}
        with self.assertRaisesRegex(ad.ResearchAdapterError, "absolute executable"):
            ad.claude_bin(env)


if __name__ == "__main__":
    unittest.main()
