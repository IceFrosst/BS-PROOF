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


# REQUIRED, never skipped: the worker refuses to validate an audit without jsonschema, so these tests fail
# (they do not silently skip) in an environment that lacks it.
import jsonschema  # noqa: E402
from jsonschema import Draft202012Validator  # noqa: E402

DRAFT_2020_12 = "https://json-schema.org/draft/2020-12/schema"


class SourceAccessV2Tests(unittest.TestCase):
    def test_canonical_schemas_declare_draft_2020_12_and_are_themselves_valid(self):
        for name in (ad.AUDIT_SCHEMA_FILE, "schemas/source_access_v2.json"):
            schema = json.loads((ROOT / name).read_text())
            self.assertEqual(schema.get("$schema"), DRAFT_2020_12, name)
            Draft202012Validator.check_schema(schema)  # raises on an invalid or non-2020-12 schema

    def test_a_schema_that_is_not_valid_2020_12_is_refused_not_ignored(self):
        with self.assertRaises(jsonschema.SchemaError):
            Draft202012Validator.check_schema({"$schema": DRAFT_2020_12, "type": "no-such-type"})

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
        with self.assertRaisesRegex(ad.ResearchAdapterError, "not grounded") as ctx:
            ad.validate_live_receipts_and_inventory(ungrounded, FIXTURE["source_access_v2"])
        # strict and unchanged, but classified: this is the model's audit being refused, not a worker fault
        self.assertIsInstance(ctx.exception, ad.InventoryNotGroundedError)
        self.assertIn("inventory ID is not grounded in returned tool text: 'PMID 99999999'", str(ctx.exception))
        # only the grounding refusal has that class; the other refusals above stay generic adapter errors
        with self.assertRaises(ad.ResearchAdapterError) as other:
            ad.validate_live_receipts_and_inventory(unsupported, FIXTURE["source_access_v2"])
        self.assertNotIsInstance(other.exception, ad.InventoryNotGroundedError)

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


ID_CASES = json.loads((ROOT / "tests/fixtures/id-extraction-cases.json").read_text())


class IdExtractionParity(unittest.TestCase):
    """The same fixture is run by tests/scan-research-id-parity.test.ts against the server's `idsIn`: the worker
    grounds with extract_ids before it posts and the server recomputes the grounding, so they must never disagree."""

    def test_extract_ids_matches_every_shared_case(self):
        for case in ID_CASES["cases"]:
            self.assertEqual(sorted(ad.extract_ids(case["text"])), case["ids"], case["name"])

    def test_normalise_audit_id_matches_every_shared_case(self):
        for case in ID_CASES["audit_ids"]:
            self.assertEqual(ad.normalise_audit_id(case["raw"]), case["normalised"], repr(case["raw"]))


if __name__ == "__main__":
    unittest.main()
