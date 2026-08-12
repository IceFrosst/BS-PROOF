#!/usr/bin/env python3
"""Write the SYNTHETIC DEMO run the dashboard uses to preview the reviewer UI.

    python3 scripts/write_demo_artifact.py

EVERY NUMBER IN THIS RUN IS INVENTED. It exists because the reviewer redesign
(2026-08-12) shows per-study score attribution and per-subagent extraction
detail that real retained runs will only carry after the next pipeline
execution -- the founder asked to SEE the finished UI populated end to end
before that. Three fences keep it from ever being mistaken for evidence:

  1. The ingredient is literally named "demo_creatine_synthetic" and every
     evidence span begins "SYNTHETIC DEMO:".
  2. reports/run_statuses.json pins it `invalid` with reason
     `synthetic_demo_fixture` -- the registry, not this script, owns validity,
     and an invalid run can never carry a public claim.
  3. The run id ends in `demo-synthetic`, so it sorts and reads as a fixture.

Deterministic, zero model calls. Regenerating overwrites in place -- this is a
fixture, not a run record, so immutability rules do not apply to it.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from scripts.dashboard_artifact import build_dashboard_run, validate_dashboard_run  # noqa: E402

RUN_ID = "20260812_000000_demo-creatine_demo-synthetic_demo"
BASE = ROOT / "reports" / "runs" / RUN_ID


def _span(text: str) -> str:
    return f"SYNTHETIC DEMO: {text}"


def _study(i: int, title: str, year: int, direction: str, *, dose_mg: float | None,
           effect: float | None = None, unit: str | None = None,
           favours: str | None = None, per_kg: float | None = None,
           mass: float | None = None, outcome: str = "muscle_strength") -> dict:
    return {
        "title": f"DEMO: {title}",
        "year": year,
        "doi": f"10.9999/demo.{i}",
        "pmid": None,
        "canonical_id": f"doi:10.9999demo{i}",
        "journal": "Journal of Synthetic Fixtures",
        "oa": "full_text",
        "predatory_venue": False,
        "skipped": False,
        "skip_reason": None,
        "failed_partial": False,
        "extraction": {
            "s3": {
                "population_axes": {"age_band": "adult", "sex": "mixed",
                                    "deficiency_status": "unknown",
                                    "pregnancy": "not_pregnant",
                                    "health_status": "healthy"},
                "population_text": _span(f"{20 + i * 4} healthy adults, invented"),
                "n_randomised": 20 + i * 4,
                "n_analysed": 18 + i * 4,
                "duration_days": 56,
                "comparator": "ingredient_free",
                "ingredient_isolated": "yes",
                "self_declared_underpowered": i == 7,
                "deficiency_status": "unknown",
                "registration_id": None,
                "evidence_spans": [_span("participants were randomised to creatine or placebo")],
            },
            "s4": {
                "item1_randomisation_method": 1,
                "item2_double_blind_placebo": 1 if i % 2 == 0 else None,
                "item3_prospective_registration": None,
                "item4_outcome_matches_registry": None,
                "item5_attrition_ok": 1,
                "item6_itt": 0 if i == 3 else 1,
                "unverifiable_items": ["item3", "item4"] if i % 3 == 0 else [],
                "evidence_spans": [_span("allocation used a computer-generated sequence")],
            },
            "s5_claims": [{
                "outcome_vocab_id": outcome,
                "discarded": False,
                "outcome_raw": "1RM bench press" if outcome == "muscle_strength" else "vertical jump height",
                "measure": "kg" if outcome == "muscle_strength" else "cm",
                "direction": direction,
                "magnitude": "meaningful" if direction == "benefit" else None,
                "effect_size": effect,
                "effect_unit": unit,
                "effect_favours": favours,
                "ci_low": None,
                "ci_high": None,
                "p_value": 0.03 if direction == "benefit" else 0.4,
                "is_primary_outcome": True,
                "contrast": "vs_ingredient_free",
                "evidence_span": _span(
                    f"the between-group difference was {effect} {unit}" if effect is not None
                    else "no significant between-group difference was observed"),
            }],
            "s7": {
                "form_vocab_id": "creatine_monohydrate",
                "form_raw": "creatine monohydrate (DEMO)",
                "salt_family": None,
                "elemental_dose_mg": dose_mg,
                "compound_dose_mg": None,
                "dose_per_kg_mg": per_kg,
                "mean_body_mass_kg": mass,
                "dose_basis": "per_kg_x_stated_mass" if per_kg else ("elemental_stated" if dose_mg else "unstated"),
                "dose_frequency_per_day": 1,
                "confidence": 0.9,
                "evidence_span": _span(f"{(dose_mg or 0) / 1000:g} g/day for eight weeks" if dose_mg else "0.1 g/kg/day, mean body mass stated"),
            },
            "s8": {
                "funding_class": "independent" if i % 2 == 0 else "industry_other",
                "funder_names": ["Synthetic Research Council"],
                "author_coi": False,
                "supplies_donated_by_industry": i % 2 == 1,
                "evidence_span": _span("funded by a university grant, no industry role"),
            },
        },
    }


def _contribution(i: int, s: float, w: float, direction: str, route: str,
                  effect_s: float | None, points: float) -> dict:
    return {"id": f"doi:10.9999demo{i}", "w": w, "s": s, "design_rank": 4,
            "direction": direction, "form_match": "exact", "d_share": round(s * w, 4),
            "points": points, "effect_route": route, "effect_s": effect_s}


def context() -> dict:
    studies = [
        _study(1, "Creatine and bench press strength in adults", 2024, "benefit",
               dose_mg=5000, effect=0.55, unit="cohen's d", favours="ingredient"),
        _study(2, "Maintenance-dose creatine and 1RM", 2023, "null_effect",
               dose_mg=4400, effect=0.43, unit="cohen's d", favours="ingredient"),
        _study(3, "Loading-protocol creatine trial", 2022, "benefit",
               dose_mg=20000, effect=8.0, unit="% difference", favours="ingredient"),
        _study(4, "Creatine vs placebo, null strength result", 2021, "null_effect",
               dose_mg=3000, effect=None, unit=None, favours=None),
        _study(5, "Per-kg dosed creatine and power", 2025, "benefit",
               dose_mg=None, per_kg=100, mass=80, effect=6.1, unit="%",
               favours="ingredient", outcome="muscle_power"),
        _study(6, "Creatine and jump height", 2024, "null_effect",
               dose_mg=5000, effect=0.05, unit="cohen's d", favours="neither",
               outcome="muscle_power"),
        _study(7, "A small pilot the authors call underpowered", 2020, "null_effect",
               dose_mg=5000, effect=None, unit=None, favours=None),
        _study(8, "Creatine and sleep quality", 2023, "null_effect",
               dose_mg=5000, effect=None, unit=None, favours=None,
               outcome="sleep_quality"),
    ]
    strength_contributions = [
        _contribution(1, 0.583, 0.9, "benefit", "smd", 0.583, 11.2),
        _contribution(2, 0.383, 0.8, "null_effect", "smd", 0.383, 6.6),
        _contribution(3, 1.0, 0.5, "benefit", "percent", 1.0, 10.7),
        _contribution(4, -0.35, 0.7, "null_effect", "no_effect_size", None, -5.3),
        _contribution(7, -0.35, 0.2, "null_effect", "no_effect_size", None, -1.5),
    ]
    power_contributions = [
        _contribution(5, 0.683, 0.85, "benefit", "percent", 0.683, 12.4),
        _contribution(6, -0.25, 0.6, "null_effect", "smd", -0.25, -3.2),
    ]
    arcs_strength = {
        "effect": {"verdict": 0.31, "coverage": 1.0},
        "form": {"verdict": 0.31, "coverage": 1.0, "strength": 0.8, "basis": "ladder", "n_in_form": 5},
        "dose": {"verdict": 0.42, "coverage": 0.64, "closeness": 0.85},
        "evidence": {"verdict": None, "coverage": 0.87, "is_quantity": True},
    }
    arcs_power = {
        "effect": {"verdict": 0.29, "coverage": 1.0},
        "form": {"verdict": 0.29, "coverage": 1.0, "strength": 0.8, "basis": "ladder", "n_in_form": 2},
        "dose": {"verdict": 0.68, "coverage": 0.59, "closeness": 1.0},
        "evidence": {"verdict": None, "coverage": 0.62, "is_quantity": True},
    }
    gated_arcs = {k: {"verdict": None, "coverage": 0.0} for k in ("effect", "form", "dose")}
    gated_arcs["evidence"] = {"verdict": None, "coverage": 0.0, "is_quantity": True}
    return {
        "ingredient": "demo_creatine_synthetic",
        "form": "creatine_monohydrate",
        "scope": "per_outcome",
        # mode/provider must be in the CONTEXT too: the catalog reconciles the
        # artifact against it, and a provider derived on one side only reads as
        # a mismatch and quarantines the fixture it was meant to showcase.
        "mode": "demo-synthetic",
        "provider": "synthetic",
        "scoring_model": "v12-dose-closeness",
        "prompt_version": "v1.19",
        "studies_targeted": 8,
        "studies_ok": 8,
        "studies_skipped": 0,
        "studies_failed_partial": 0,
        "product": {"ingredient": "demo_creatine_synthetic",
                    "form": "creatine_monohydrate",
                    "dose": {"low_mg": 4400, "high_mg": 4400}},
        "studies_list": studies,
        "agent_stats": {
            "S3": {"ok": 8, "fail": 0, "cache": 0},
            "S4": {"ok": 8, "fail": 0, "cache": 0},
            "S5": {"ok": 8, "fail": 0, "cache": 0},
            "S6B": {"ok": 8, "fail": 0, "cache": 0},
            "S7": {"ok": 8, "fail": 0, "cache": 0},
            "S8": {"ok": 8, "fail": 0, "cache": 0},
        },
        "usage": {
            "version": "1",
            "telemetry_status": "complete",
            "telemetry_explanation": "SYNTHETIC DEMO ledger; every figure is invented.",
            "currency": "USD",
            "metered_run_spend": 0.0,
            "metered_spend_basis": "Claude subscription; no marginal per-call metered charge (DEMO)",
            "api_equivalent_cost": 2.34,
            "live_calls": 48,
            "cache_hits": 0,
            "retries": 1,
            "failures": 0,
            "tokens": {"fresh_input": 61000, "cache_write": 240000,
                       "cache_read": 410000, "output": 88000, "total": 799000},
            "latency": {"wall_time_s": 180.0, "average_s": 22.5, "p95_s": 41.0,
                        "peak_concurrency": 8, "basis": "synthetic demo"},
            "operations": {"successful_calls": 48, "failed_calls": 0, "cache_hits": 0},
            "by_agent": [
                {"agent": a, "tier": t, "model": m, "provider": "anthropic",
                 "calls": 8, "cache_hits": 0, "failures": 0,
                 "api_equivalent_cost": c,
                 "tokens": {"fresh_input": 8000, "cache_write": 30000,
                            "cache_read": 51000, "output": 11000, "total": 100000}}
                for a, t, m, c in (
                    ("S3", "B", "claude-sonnet-5", 0.62), ("S4", "B", "claude-sonnet-5", 0.31),
                    ("S5", "B", "claude-sonnet-5", 0.71), ("S6B", "C", "claude-sonnet-5", 0.27),
                    ("S7", "B", "claude-sonnet-5", 0.28), ("S8", "A", "claude-haiku-4-5-20251001", 0.15))],
        },
        "ecu_rows": [
            {
                "ecu_key": "demo_creatine_synthetic|creatine_monohydrate|unbanded|muscle_strength|general_adult",
                "ingredient": "demo_creatine_synthetic",
                "form_vocab_id": "creatine_monohydrate",
                "outcome_vocab_id": "muscle_strength",
                "score": 27, "composite": 61, "band": "weak support", "gate_fired": False,
                "components": {"d": 0.31, "c": 0.87, "H": 0.21, "E": 3.1, "E_prime": 3.1},
                "arcs": arcs_strength,
                "dose": {"low": 3000, "high": 20000, "n_benefit": 2, "n_null": 3,
                         "null_range": {"low": 3000, "high": 5000},
                         "basis": "observed_benefit_doses",
                         "observed": {"low": 3000, "high": 20000, "n_with_dose": 5, "n_total": 5},
                         "evidence_with_dose": 1.0,
                         "product_match": "in_band", "product_factor": 0.85},
                "evidence": {"n_primaries": 5, "n_syntheses": 0,
                             "study_ids": [f"doi:10.9999demo{i}" for i in (1, 2, 3, 4, 7)],
                             "contributions": strength_contributions},
                "n_primaries": 5,
                "applicability": {"form": {"match": 1.0, "assessable": 1.0}},
                "prompt_version": "v1.19",
            },
            {
                "ecu_key": "demo_creatine_synthetic|creatine_monohydrate|unbanded|muscle_power|general_adult",
                "ingredient": "demo_creatine_synthetic",
                "form_vocab_id": "creatine_monohydrate",
                "outcome_vocab_id": "muscle_power",
                "score": 18, "composite": 55, "band": "weak support", "gate_fired": False,
                "components": {"d": 0.29, "c": 0.62, "H": 0.3, "E": 1.4, "E_prime": 1.4},
                "arcs": arcs_power,
                "dose": {"low": 8000, "high": 8000, "n_benefit": 1, "n_null": 1,
                         "null_range": {"low": 5000, "high": 5000},
                         "basis": "observed_benefit_doses",
                         "observed": {"low": 5000, "high": 8000, "n_with_dose": 2, "n_total": 2},
                         "evidence_with_dose": 1.0,
                         "product_match": "low_50_99", "product_factor": 1.0},
                "evidence": {"n_primaries": 2, "n_syntheses": 0,
                             "study_ids": ["doi:10.9999demo5", "doi:10.9999demo6"],
                             "contributions": power_contributions},
                "n_primaries": 2,
                "applicability": {"form": {"match": 1.0, "assessable": 1.0}},
                "prompt_version": "v1.19",
            },
            {
                "ecu_key": "demo_creatine_synthetic|creatine_monohydrate|unbanded|sleep_quality|general_adult",
                "ingredient": "demo_creatine_synthetic",
                "form_vocab_id": "creatine_monohydrate",
                "outcome_vocab_id": "sleep_quality",
                "score": None, "composite": None,
                "band": "insufficient human evidence", "gate_fired": True,
                "components": {},
                "arcs": gated_arcs,
                "dose": {"low": None, "high": None, "basis": "no_dosed_benefit_trial"},
                "evidence": {"n_primaries": 1, "n_syntheses": 0,
                             "study_ids": ["doi:10.9999demo8"], "contributions": []},
                "n_primaries": 1,
                "applicability": {"form": {"match": 1.0, "assessable": 1.0}},
                "prompt_version": "v1.19",
            },
        ],
    }


def main() -> int:
    ctx = context()
    BASE.parent.mkdir(parents=True, exist_ok=True)
    (BASE.with_name(BASE.name + "_context.json")).write_text(
        json.dumps(ctx, indent=1), encoding="utf-8")
    artifact = build_dashboard_run(ctx, run_id=RUN_ID, mode="demo-synthetic")
    validate_dashboard_run(artifact)
    (BASE.with_name(BASE.name + "_dashboard.json")).write_text(
        json.dumps(artifact, indent=1), encoding="utf-8")
    print(f"wrote {BASE.name}_context.json + _dashboard.json")
    print("validity:", artifact["validity"]["status"], artifact["validity"]["reason_codes"])
    return 0


if __name__ == "__main__":
    sys.exit(main())
