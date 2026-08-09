from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from scripts.dashboard_artifact import (
    ROOT,
    SCHEMA_PATH,
    build_dashboard_run,
    normalize_usage,
    validate_dashboard_run,
    write_dashboard_artifact,
)


HISTORICAL_RUN = (
    "20260807_164410_creatine_creatine-monohydrate_grok-sr-ft-per-o"
)
HISTORICAL_COMMIT = "c29c570f7139bd1b3e3816b5e19213af193089a0"


class DashboardArtifactTests(unittest.TestCase):
    def test_default_is_experimental_and_full_ecu_is_safe(self) -> None:
        context = {
            "ingredient": "magnesium",
            "form": "magnesium_glycinate",
            "scope": "intervention",
            "ecu_rows": [{
                "ecu_key": "magnesium|magnesium_glycinate|unbanded|sleep_quality|general_adult",
                "ingredient": "magnesium",
                "form_vocab_id": "magnesium_glycinate",
                "outcome_vocab_id": "sleep_quality",
                "score": 8,
                "composite": 12,
                "band": "inconclusive",
                "components": {"c": 0.2, "d": 1.0, "E": 0.7},
                "arcs": {
                    "effect": {"verdict": 1.0, "coverage": 1.0},
                    "form": {"verdict": None, "coverage": 0.0},
                    "dose": {"verdict": None, "coverage": 0.0},
                    "evidence": {"verdict": None, "coverage": 0.2,
                                 "is_quantity": True},
                },
                "dose": {"low": 200, "high": 400, "basis": "benefit_trials"},
                "evidence": {"n_primaries": 3, "study_ids": ["doi:one"]},
                "applicability": {"form": {"match": 0.0, "assessable": 1.0}},
                "raw_prompt": "DO-NOT-EXPORT-PROMPT",
                "cache_key": "DO-NOT-EXPORT-CACHE-KEY",
            }],
        }
        artifact = build_dashboard_run(
            context,
            run_id="20990101_000000_magnesium_magnesium-glycinate_claude",
            mode="claude",
        )
        row = artifact["ecu_rows"][0]
        self.assertEqual("experimental", artifact["validity"]["status"])
        self.assertFalse(artifact["validity"]["public_claims_allowed"])
        self.assertEqual("unavailable", artifact["usage"]["telemetry_status"])
        self.assertIsNone(artifact["usage"]["tokens"]["total"])
        self.assertEqual("works, but not tested for your product", row["verdict"])
        self.assertEqual(200, row["dose"]["low"])
        self.assertEqual(["doi:one"], row["evidence"]["study_ids"])
        payload = json.dumps(artifact)
        self.assertNotIn("DO-NOT-EXPORT-PROMPT", payload)
        self.assertNotIn("DO-NOT-EXPORT-CACHE-KEY", payload)

    def test_legacy_usage_normalizes_without_zero_filling_unknowns(self) -> None:
        usage = normalize_usage({
            "calls": 3,
            "cache_hits": 0,
            "failures": 1,
            "api_equivalent_usd": 1.25,
            "subscription_spend_usd": 0.0,
            "tokens": {"input": 10, "cache_write": 20,
                       "cache_read": 30, "output": 4},
            "by_agent": {"S3": {"calls": 1, "cost": 0.2}},
        })
        self.assertIsNotNone(usage)
        self.assertEqual(3, usage["live_calls"])
        self.assertEqual(0, usage["cache_hits"])
        self.assertIsNone(usage["retries"])
        self.assertEqual(64, usage["tokens"]["total"])
        self.assertEqual(0.0, usage["metered_run_spend"])
        self.assertEqual("S3", usage["by_agent"][0]["agent"])
        self.assertEqual("partial", usage["breakdown_status"])

    def test_rich_usage_keeps_safe_records_and_exact_efficiency(self) -> None:
        usage = normalize_usage({
            "version": "1",
            "telemetry_status": "complete",
            "currency": "USD",
            "metered_run_spend": 0.0,
            "metered_spend_basis": "subscription",
            "api_equivalent_cost": 8.0,
            "live_calls": 20,
            "cache_hits": 2,
            "retries": 1,
            "failures": 0,
            "tokens": {"fresh_input": 40, "cache_write": 20,
                       "cache_read": 30, "output": 10, "total": 100},
            "latency": {"wall_time_s": 60.0, "average_s": 3.0,
                        "p95_s": 4.0, "peak_concurrency": 6,
                        "basis": "adapter activity"},
            "by_agent_rows": [{"agent": "S3", "calls": 4}],
            "by_tier": [{"tier": "B", "calls": 20}],
            "by_model": [{"model": "claude", "calls": 20}],
            "raw_structured_usage": {
                "source": "test envelope",
                "records": [{"agent": "S3", "model": "claude",
                             "tokens": {"fresh_input": 4},
                             "prompt": "DO-NOT-EXPORT-RICH-PROMPT",
                             "cache_key": "DO-NOT-EXPORT-RICH-CACHE"}],
                "redactions": ["prompts", "cache_keys", "authentication"],
            },
        }, context={"studies_ok": 4, "ecu_rows": [{}, {}],
                    "wall_time_s": 123.4}, provider="claude")
        self.assertEqual("complete", usage["breakdown_status"])
        self.assertEqual(123.4, usage["latency"]["wall_time_s"])
        self.assertEqual("full pipeline run, monotonic clock", usage["latency"]["basis"])
        self.assertEqual(5.0, usage["efficiency"]["per_successful_study"]["calls"])
        self.assertEqual(25.0, usage["efficiency"]["per_successful_study"]["tokens"])
        self.assertEqual(2.0,
                         usage["efficiency"]["per_successful_study"]["api_equivalent_cost"])
        safe = json.dumps(usage["raw_structured_usage"])
        self.assertNotIn("DO-NOT-EXPORT-RICH-PROMPT", safe)
        self.assertNotIn("DO-NOT-EXPORT-RICH-CACHE", safe)

    def test_historical_creatine_truth_and_invalid_override(self) -> None:
        path = ROOT / "reports" / "runs" / f"{HISTORICAL_RUN}_context.json"
        context = json.loads(path.read_text(encoding="utf-8"))
        artifact = build_dashboard_run(
            context,
            run_id=HISTORICAL_RUN,
            mode="grok-sr-ft-per_o",
            source_commit=HISTORICAL_COMMIT,
        )
        self.assertEqual("DashboardRunV1", artifact["schema_version"])
        self.assertEqual("invalid", artifact["validity"]["status"])
        self.assertFalse(artifact["validity"]["public_claims_allowed"])
        self.assertEqual(HISTORICAL_COMMIT, artifact["run"]["source_commit"])
        self.assertEqual(80, artifact["corpus"]["study_count"])
        self.assertEqual(80, artifact["stats"]["studies"]["targeted"])
        self.assertEqual(
            {"total": 30, "scored": 19, "gated": 11},
            artifact["stats"]["ecus"],
        )
        usage = artifact["usage"]
        self.assertEqual("partial", usage["telemetry_status"])
        self.assertEqual(797, usage["live_calls"])
        self.assertEqual(711, usage["operations"]["successful_calls"])
        self.assertEqual(86, usage["operations"]["failed_calls"])
        self.assertEqual(6, usage["cache_hits"])
        self.assertEqual(5, usage["operations"]["timeouts"])
        self.assertEqual(0, usage["operations"]["auth_failures"])
        self.assertEqual(113.6, usage["latency"]["average_s"])
        self.assertEqual(146.9, usage["latency"]["p95_s"])
        self.assertEqual(43, usage["latency"]["peak_concurrency"])
        self.assertIsNone(usage["tokens"]["total"])
        self.assertAlmostEqual(9.9625,
                               usage["efficiency"]["per_successful_study"]["calls"])
        self.assertAlmostEqual(26.5667,
                               usage["efficiency"]["per_outcome"]["calls"])
        self.assertEqual("grok-4.3", usage["model_routing"][0]["configured_model"])
        self.assertFalse(usage["model_routing"][0]["aggregate_complete"])
        self.assertTrue(artifact["validity"]["limitations"])
        self.assertEqual(
            f"reports/runs/{HISTORICAL_RUN}_full.md",
            artifact["reports"]["full"],
        )

    def test_writer_is_idempotent_but_refuses_changed_overwrite(self) -> None:
        context = {"ingredient": "x", "form": "x", "ecu_rows": []}
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / "run_dashboard.json"
            kwargs = {
                "run_id": "20990101_000001_x_x_claude",
                "mode": "claude",
                "output": output,
            }
            write_dashboard_artifact(context, **kwargs)
            write_dashboard_artifact(context, **kwargs)
            with self.assertRaises(FileExistsError):
                write_dashboard_artifact(
                    {**context, "studies_targeted": 1}, **kwargs,
                )

    def test_validation_rejects_usage_breakdown_mismatch(self) -> None:
        artifact = build_dashboard_run(
            {"ingredient": "x", "form": "x", "ecu_rows": []},
            run_id="20990101_000002_x_x_claude",
            mode="claude",
        )
        artifact["usage"].update({
            "breakdown_status": "complete",
            "live_calls": 2,
            "cache_hits": 0,
            "retries": 0,
            "failures": 0,
            "terminal_failures": 0,
            "api_equivalent_cost": 1.0,
            "tokens": {
                "fresh_input": 2, "cache_write": 0, "cache_read": 0,
                "output": 1, "total": 3,
            },
            "by_agent": [{
                "agent": "S1", "calls": 1, "cache_hits": 0, "retries": 0,
                "failures": 0, "terminal_failures": 0,
                "api_equivalent_cost": 1.0,
                "tokens": {"fresh_input": 2, "cache_write": 0,
                           "cache_read": 0, "output": 1, "total": 3},
            }],
            "by_tier": [{
                "tier": "A", "calls": 2, "cache_hits": 0, "retries": 0,
                "failures": 0, "terminal_failures": 0,
                "api_equivalent_cost": 1.0,
                "tokens": {"fresh_input": 2, "cache_write": 0,
                           "cache_read": 0, "output": 1, "total": 3},
            }],
            "by_model": [{
                "model": "model", "calls": 2, "cache_hits": 0, "retries": 0,
                "failures": 0, "terminal_failures": 0,
                "api_equivalent_cost": 1.0,
                "tokens": {"fresh_input": 2, "cache_write": 0,
                           "cache_read": 0, "output": 1, "total": 3},
            }],
        })
        with self.assertRaisesRegex(ValueError, "by_agent sum"):
            validate_dashboard_run(artifact)

    def test_schema_declares_exact_version_and_public_sections(self) -> None:
        schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
        self.assertEqual(
            "DashboardRunV1",
            schema["properties"]["schema_version"]["const"],
        )
        required = set(schema["required"])
        self.assertTrue({"validity", "reports", "usage", "ecu_rows"} <= required)


if __name__ == "__main__":
    unittest.main()
