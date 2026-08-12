#!/usr/bin/env python3
"""Build the public, immutable dashboard projection for one BS-PROOF run.

The pipeline's ``*_context.json`` is an internal report-writing payload.  It is
not a stable API: older contexts contain abbreviated ECU rows, while current
runs can carry the complete ``pipeline.assemble.build_ecus`` result.  This
module turns either shape into ``DashboardRunV1`` without copying model prompts,
adapter error output, secrets, or cache keys into a deployable artifact.

Run validity is governance data, not a model output.  It comes only from
``reports/run_statuses.json``.  A run without an explicit entry is always
experimental and cannot back a public claim.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from pipeline import arcs as arcsmod
from pipeline import vocab
from pipeline.scoring import SCORING_MODEL

REPORTS = ROOT / "reports"
RUNS = REPORTS / "runs"
STATUS_REGISTRY = REPORTS / "run_statuses.json"
SCHEMA_PATH = ROOT / "schemas" / "dashboard_run_v1.schema.json"
# Read once per process by dashboard_schema(); tests patch it to try a
# different contract without touching the file on disk.
_SCHEMA_CACHE: dict | None = None

SCHEMA_VERSION = "DashboardRunV1"
USAGE_VERSION = "UsageV1"

_RUN_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]*$")
_STAMP_RE = re.compile(r"^(\d{8})_(\d{6})(?:_|$)")

_DEFAULT_VALIDITY = {
    "status": "experimental",
    "public_claims_allowed": False,
    "reason_codes": ["not_explicitly_validated"],
    "limitations": [
        "This run has not passed explicit validation for public claims.",
    ],
    "note": "Not approved for public claims; explicit registry review is required.",
}


def _json_copy(value: Any) -> Any:
    """Return JSON-compatible data without invoking arbitrary object reprs."""
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, list):
        return [_json_copy(v) for v in value]
    if isinstance(value, tuple):
        return [_json_copy(v) for v in value]
    if isinstance(value, dict):
        return {str(k): _json_copy(v) for k, v in value.items()}
    return None


def _present(mapping: dict, *keys: str) -> Any:
    """First present value, preserving measured zero and explicit null."""
    for key in keys:
        if key in mapping:
            return mapping[key]
    return None


def _number(value: Any) -> int | float | None:
    if isinstance(value, bool):
        return None
    return value if isinstance(value, (int, float)) else None


def _integer(value: Any) -> int | None:
    value = _number(value)
    return int(value) if value is not None else None


def _safe_run_id(run_id: str) -> str:
    if not _RUN_ID_RE.fullmatch(run_id):
        raise ValueError(f"unsafe dashboard run id: {run_id!r}")
    return run_id


def _generated_at(run_id: str) -> str | None:
    match = _STAMP_RE.match(run_id)
    if not match:
        return None
    stamp = datetime.strptime("".join(match.groups()), "%Y%m%d%H%M%S")
    return stamp.replace(tzinfo=timezone.utc).isoformat().replace("+00:00", "Z")


def _slug(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-") or "x"


def _provider_for(mode: str | None) -> str | None:
    value = (mode or "").lower()
    if "grok" in value:
        return "grok"
    if "pilot" in value:
        return "claude-pilot"
    if "claude" in value:
        return "claude"
    if "wiring" in value or "synthetic" in value:
        return "synthetic"
    return None


def _load_status_registry(path: Path = STATUS_REGISTRY) -> dict:
    if not path.exists():
        return {"schema_version": "DashboardRunStatusesV1",
                "default": dict(_DEFAULT_VALIDITY), "runs": {}}
    data = json.loads(path.read_text(encoding="utf-8"))
    if data.get("schema_version") != "DashboardRunStatusesV1":
        raise ValueError(f"unsupported run-status registry at {path}")
    if not isinstance(data.get("runs", {}), dict):
        raise ValueError(f"run-status registry 'runs' must be an object at {path}")
    return data


def _validity_for(run_id: str, registry_path: Path = STATUS_REGISTRY) -> dict:
    registry = _load_status_registry(registry_path)
    default = {**_DEFAULT_VALIDITY, **(registry.get("default") or {})}
    override = (registry.get("runs") or {}).get(run_id)
    selected = {**default, **override} if isinstance(override, dict) else default
    status = selected.get("status") or "experimental"
    allowed = bool(selected.get("public_claims_allowed", False))
    # A typo or incomplete registry entry can never make an unvalidated run
    # publishable. Only the explicit validated state may carry true.
    if status != "validated":
        allowed = False
    return {
        "status": status,
        "public_claims_allowed": allowed,
        "reason_codes": [str(x) for x in (selected.get("reason_codes") or [])],
        "limitations": [str(x) for x in (selected.get("limitations") or [])],
        "note": selected.get("note"),
        "registry_key": run_id if isinstance(override, dict) else "__default__",
    }


def _normalise_breakdown(value: Any, identity_key: str) -> list[dict] | None:
    allowed = (
        "agent", "tier", "model", "provider", "effort", "reasoning_effort",
        "prompt_version", "calls", "live_calls", "cache_hits", "hits",
        "retries", "failures", "fail", "terminal_failures",
        "api_equivalent_cost", "cost", "input", "cache_write", "cache_read",
        "output", "average_latency_s", "p95_latency_s",
    )

    def safe(item: dict) -> dict:
        row = {key: _json_copy(item.get(key)) for key in allowed if key in item}
        tokens = item.get("tokens")
        if isinstance(tokens, dict):
            row["tokens"] = {
                key: _number(tokens.get(key))
                for key in ("fresh_input", "cache_write", "cache_read", "output", "total")
                if key in tokens
            }
        return row

    if value is None:
        return None
    if isinstance(value, list):
        return [safe(v) for v in value if isinstance(v, dict)]
    if isinstance(value, dict):
        rows = []
        for key, item in sorted(value.items()):
            if isinstance(item, dict):
                rows.append({**safe(item), identity_key: key})
        return rows
    return None


def _string_map(value: Any) -> dict:
    """Only string->string pairs, because the reader types this as one."""
    if not isinstance(value, dict):
        return {}
    result = {}
    for key, item in sorted(value.items()):
        if isinstance(item, str) and item:
            result[str(key)] = item
    return result


def _usage_schema_accepts(field: str) -> bool:
    """True when the deploy schema permits ``field`` inside ``usage``.

    The JSON schema closes ``usage`` with ``additionalProperties: false`` and
    the TypeScript Zod mirror closes it with ``.strict()``.  Emitting a field
    those two reject does not produce a richer dashboard, it produces an
    artifact that fails validation at write time and, if it ever got past that,
    at ``lib/dashboard/catalog.ts`` load time.  The schema is therefore the
    authority on what may be written, not this module.
    """
    try:
        usage_schema = (dashboard_schema().get("$defs") or {}).get("usage") or {}
    except Exception:
        return False
    if usage_schema.get("additionalProperties") is False:
        return field in (usage_schema.get("properties") or {})
    return True


def _agent_tiers(raw: Any, context: dict | None) -> dict:
    """The agent -> tier map, wherever the run put it.

    ``run_pipeline`` writes ``run_context["agent_tiers"]`` at TOP LEVEL, while
    ``lib/dashboard/normalize.ts`` reads ``agent_tiers`` from INSIDE the usage
    object.  The two never met, so the mapping rendered empty for every run.
    This reads either location and the artifact publishes the one the reader
    looks at.
    """
    raw = raw if isinstance(raw, dict) else {}
    context = context if isinstance(context, dict) else {}
    return (_string_map(_present(raw, "agent_tiers", "agentTiers"))
            or _string_map(_present(context, "agent_tiers", "agentTiers")))


def _attach_agent_tiers(payload: dict, raw: Any, context: dict | None) -> dict:
    tiers = _agent_tiers(raw, context)
    if tiers and _usage_schema_accepts("agent_tiers"):
        payload["agent_tiers"] = tiers
    return payload


def _safe_usage_records(value: Any) -> dict:
    value = value if isinstance(value, dict) else {}
    records = []
    for record in value.get("records") or []:
        if not isinstance(record, dict):
            continue
        safe = {
            key: _json_copy(record.get(key))
            for key in (
                "agent", "tier", "provider", "model", "reasoning_effort",
                "prompt_version", "cached", "outcome", "latency_s",
                "api_equivalent_cost",
            ) if key in record
        }
        tokens = record.get("tokens")
        if isinstance(tokens, dict):
            safe["tokens"] = {
                key: _number(tokens.get(key))
                for key in ("fresh_input", "cache_write", "cache_read", "output", "total")
                if key in tokens
            }
        records.append(safe)
    return {
        "source": value.get("source"),
        "records": records,
        "redactions": [str(x) for x in (value.get("redactions") or [
            "prompts", "cache_keys", "authentication",
        ])],
    }


def _parse_speed_report(value: Any) -> dict:
    """Read only the exact aggregate measurements retained in Grok reports."""
    text = value if isinstance(value, str) else ""

    def match(pattern: str, casts: tuple = (int,)) -> tuple | None:
        found = re.search(pattern, text, flags=re.IGNORECASE)
        if not found:
            return None
        return tuple(cast(part) for cast, part in zip(casts, found.groups()))

    calls = match(r"live calls ok/fail/cache:\s*(\d+)\s*/\s*(\d+)\s*/\s*(\d+)",
                  (int, int, int))
    failures = match(r"timeouts:\s*(\d+)\s+auth failures:\s*(\d+)", (int, int))
    latency = match(r"avg latency \(ok\):\s*([\d.]+)s\s+p95:\s*([\d.]+)s",
                    (float, float))
    peak = match(r"peak in-flight observed:\s*(\d+)", (int,))
    limit = match(r"concurrent limit[^:]*:\s*(\d+)", (int,))
    fail_rate = match(r"fail rate:\s*([\d.]+)%", (float,))
    return {
        "successful_calls": calls[0] if calls else None,
        "failed_calls": calls[1] if calls else None,
        "cache_hits": calls[2] if calls else None,
        "timeouts": failures[0] if failures else None,
        "auth_failures": failures[1] if failures else None,
        "average_s": latency[0] if latency else None,
        "p95_s": latency[1] if latency else None,
        "peak_concurrency": peak[0] if peak else None,
        "concurrency_limit": limit[0] if limit else None,
        "fail_rate": round(fail_rate[0] / 100, 4) if fail_rate else None,
    }


def _known_model_routing(context: dict | None) -> list[dict]:
    """Known routing facts only; never pretend this is a full call breakdown."""
    context = context if isinstance(context, dict) else {}
    s8 = ((context.get("agent_stats") or {}).get("S8") or {})
    errors = s8.get("errors") if isinstance(s8, dict) else {}
    error_text = " ".join(str(key) for key in (errors or {}))
    if "grok-4.3" in error_text and "invalid params" in error_text.lower():
        failures = _integer(s8.get("fail"))
        return [{
            "agent": "S8",
            "tier": "A",
            "configured_model": "grok-4.3",
            "attempts": failures,
            "failures": failures,
            "status": "invalid_model_id",
            "aggregate_complete": False,
        }]
    return []


def _efficiency(usage: dict, context: dict | None) -> dict:
    """Exact ratios only: recorded numerators divided by exact run counts."""
    context = context if isinstance(context, dict) else {}
    studies = _integer(context.get("studies_ok"))
    ecu_rows = context.get("ecu_rows")
    outcomes = len(ecu_rows) if isinstance(ecu_rows, list) else None
    calls = _number(usage.get("live_calls"))
    tokens = _number((usage.get("tokens") or {}).get("total"))
    cost = _number(usage.get("api_equivalent_cost"))

    def ratio(denominator: int | None) -> dict:
        usable = denominator if denominator and denominator > 0 else None
        return {
            "denominator": usable,
            "calls": round(calls / usable, 4) if calls is not None and usable else None,
            "tokens": round(tokens / usable, 4) if tokens is not None and usable else None,
            "api_equivalent_cost": (
                round(cost / usable, 8) if cost is not None and usable else None
            ),
        }

    return {
        "per_successful_study": ratio(studies),
        "per_outcome": ratio(outcomes),
    }


def _unavailable_usage(context: dict | None, provider: str | None) -> dict:
    context = context if isinstance(context, dict) else {}
    speed = _parse_speed_report(context.get("speed_report"))
    has_speed = any(value is not None for value in speed.values())
    successful = speed.get("successful_calls")
    failed = speed.get("failed_calls")
    live_calls = successful + failed if successful is not None and failed is not None else None
    provider_label = {
        "grok": "Grok", "claude": "Claude", "claude-pilot": "Claude",
    }.get(provider)
    spend_basis = (f"{provider_label} subscription; no marginal per-call metered charge"
                   if provider_label else None)
    explanation = (
        "Aggregate calls and latency were retained, but token and price fields "
        "were not recorded for this run. Unknown fields remain null."
        if has_speed else
        "Token, price, call and latency telemetry were not retained for this run. "
        "Unknown fields remain null."
    )
    payload = {
        "version": "1",
        "telemetry_status": "partial" if has_speed else "unavailable",
        "telemetry_explanation": explanation,
        "currency": "USD",
        "metered_run_spend": 0.0 if spend_basis else None,
        "metered_spend_basis": spend_basis,
        "api_equivalent_cost": None,
        "live_calls": live_calls,
        "cache_hits": speed.get("cache_hits"),
        "retries": None,
        "failures": failed,
        "terminal_failures": None,
        "usage_records_missing_tokens": live_calls,
        "usage_records_missing_cost": live_calls,
        "tokens": {
            "fresh_input": None, "cache_write": None, "cache_read": None,
            "output": None, "total": None,
        },
        "latency": {
            "wall_time_s": None,
            "average_s": speed.get("average_s"),
            "p95_s": speed.get("p95_s"),
            "peak_concurrency": speed.get("peak_concurrency"),
            "basis": ("retained Grok speed report; latency covers successful live calls"
                      if has_speed else None),
        },
        "operations": {
            "successful_calls": successful,
            "failed_calls": failed,
            "cache_hits": speed.get("cache_hits"),
            "timeouts": speed.get("timeouts"),
            "auth_failures": speed.get("auth_failures"),
            "fail_rate": speed.get("fail_rate"),
            "concurrency_limit": speed.get("concurrency_limit"),
        },
        "breakdown_status": "unavailable",
        "by_agent": [],
        "by_tier": [],
        "by_model": [],
        "model_routing": _known_model_routing(context),
        "raw_structured_usage": {
            "source": "retained Grok speed report" if has_speed else None,
            "records": [],
            "redactions": ["prompts", "cache_keys", "authentication"],
        },
    }
    payload["efficiency"] = _efficiency(payload, context)
    return _attach_agent_tiers(payload, None, context)


def normalize_usage(raw: Any, *, context: dict | None = None,
                    provider: str | None = None) -> dict:
    """Normalize legacy and rich adapter telemetry without inventing zeros."""
    if not isinstance(raw, dict) or not raw:
        return _unavailable_usage(context, provider)

    tokens_in = raw.get("tokens") if isinstance(raw.get("tokens"), dict) else {}
    fresh_input = _number(_present(tokens_in, "fresh_input", "input"))
    cache_write = _number(_present(tokens_in, "cache_write"))
    cache_read = _number(_present(tokens_in, "cache_read"))
    output = _number(_present(tokens_in, "output"))
    total = _number(_present(tokens_in, "total"))
    if total is None and all(v is not None for v in
                             (fresh_input, cache_write, cache_read, output)):
        total = fresh_input + cache_write + cache_read + output

    latency_in = raw.get("latency") if isinstance(raw.get("latency"), dict) else {}
    metered_spend = _number(_present(raw, "metered_run_spend",
                                    "subscription_spend_usd"))
    api_equivalent = _number(_present(raw, "api_equivalent_cost",
                                     "api_equivalent_usd"))
    by_agent = _normalise_breakdown(
        _present(raw, "by_agent_rows", "by_agent"), "agent")
    by_tier = _normalise_breakdown(raw.get("by_tier"), "tier")
    by_model = _normalise_breakdown(raw.get("by_model"), "model")
    missing_token_records = _integer(
        _present(raw, "usage_records_missing_tokens"))
    missing_cost_records = _integer(
        _present(raw, "usage_records_missing_cost"))
    breakdowns_present = all(
        value is not None for value in (by_agent, by_tier, by_model))
    breakdowns_partial = any(
        value is not None for value in (by_agent, by_tier, by_model))
    breakdown_measurements_complete = (
        (missing_token_records in (None, 0))
        and (missing_cost_records in (None, 0)))
    full_run_wall = _number((context or {}).get("wall_time_s"))
    payload = {
        "version": raw.get("version") or USAGE_VERSION,
        # Never null. Unknown completeness is "unavailable" -- the reader's enum
        # has no null member, and "we do not know" must not render as complete.
        "telemetry_status": raw.get("telemetry_status") or "unavailable",
        "telemetry_explanation": raw.get("telemetry_explanation"),
        "currency": raw.get("currency"),
        "metered_run_spend": metered_spend,
        "metered_spend_basis": raw.get("metered_spend_basis"),
        "api_equivalent_cost": api_equivalent,
        "live_calls": _integer(_present(raw, "live_calls", "calls")),
        "cache_hits": _integer(_present(raw, "cache_hits")),
        "retries": _integer(_present(raw, "retries")),
        "failures": _integer(_present(raw, "failures")),
        "terminal_failures": _integer(_present(raw, "terminal_failures")),
        "usage_records_missing_tokens": missing_token_records,
        "usage_records_missing_cost": missing_cost_records,
        "tokens": {
            "fresh_input": fresh_input,
            "cache_write": cache_write,
            "cache_read": cache_read,
            "output": output,
            "total": total,
        },
        "latency": {
            "wall_time_s": (full_run_wall if full_run_wall is not None
                            else _number(_present(latency_in, "wall_time_s"))),
            "average_s": _number(_present(latency_in, "average_s")),
            "p95_s": _number(_present(latency_in, "p95_s")),
            "peak_concurrency": _integer(_present(latency_in, "peak_concurrency")),
            "basis": ("full pipeline run, monotonic clock"
                      if full_run_wall is not None else latency_in.get("basis")),
        },
        "operations": {
            "successful_calls": None,
            "failed_calls": _integer(_present(raw, "failures")),
            "cache_hits": _integer(_present(raw, "cache_hits")),
            "timeouts": None,
            "auth_failures": None,
            "fail_rate": None,
            "concurrency_limit": None,
        },
        "breakdown_status": (
            "complete" if breakdowns_present and breakdown_measurements_complete
            else "partial" if breakdowns_partial
            else "unavailable"
        ),
        "by_agent": by_agent or [],
        "by_tier": by_tier or [],
        "by_model": by_model or [],
        "model_routing": _known_model_routing(context),
        "raw_structured_usage": _safe_usage_records(raw.get("raw_structured_usage")),
    }
    payload["efficiency"] = _efficiency(payload, context)
    return _attach_agent_tiers(payload, raw, context)


def _safe_study(study: Any) -> dict | None:
    if not isinstance(study, dict):
        return None
    keys = (
        "title", "year", "doi", "pmid", "pmcid", "nct_id",
        "canonical_id", "journal", "publisher", "oa", "predatory_venue",
        "skipped", "failed_partial",
    )
    return {key: _json_copy(study.get(key)) for key in keys if key in study}


def _safe_agents(value: Any) -> dict:
    if not isinstance(value, dict):
        return {}
    result = {}
    for agent, stats in sorted(value.items()):
        if not isinstance(stats, dict):
            continue
        result[str(agent)] = {
            key: _integer(stats.get(key))
            for key in ("ok", "fail", "cache")
        }
    return result


def _safe_predatory(value: Any) -> dict:
    value = value if isinstance(value, dict) else {}
    keys = (
        "list_entries", "studies_checked", "publishers_resolved",
        "studies_predatory", "publishers_predatory_n", "journals_predatory_n",
        "publishers_predatory", "journals_predatory", "zero_weight", "source",
    )
    return {key: _json_copy(value.get(key)) for key in keys if key in value}


def _safe_sr(value: Any) -> dict:
    value = value if isinstance(value, dict) else {}
    keys = (
        "requested", "s2_ok", "resolved", "review_bands", "overlap", "derived",
    )
    return {key: _json_copy(value.get(key)) for key in keys if key in value}


def _safe_arcs(value: Any) -> dict:
    value = value if isinstance(value, dict) else {}
    result = {}
    for name in ("effect", "form", "dose", "evidence"):
        arc = value.get(name)
        if not isinstance(arc, dict):
            continue
        result[name] = {
            key: _json_copy(arc.get(key))
            for key in ("verdict", "coverage", "is_quantity") if key in arc
        }
    return result


def _safe_components(value: Any) -> dict:
    value = value if isinstance(value, dict) else {}
    return {key: _number(value.get(key)) for key in
            ("d", "c", "H", "E", "E_prime", "coverage") if key in value}


def _safe_population(value: Any) -> dict | None:
    if not isinstance(value, dict):
        return None
    keys = ("id", *vocab.AXES)
    return {key: _json_copy(value.get(key)) for key in keys if key in value}


def _safe_evidence(value: Any) -> dict:
    value = value if isinstance(value, dict) else {}
    result = {}
    for key in ("n_primaries", "n_syntheses"):
        if key in value:
            result[key] = _integer(value.get(key))
    if "study_ids" in value:
        result["study_ids"] = [str(x) for x in (value.get("study_ids") or [])]
    # Per-study score attribution (2026-08-12). `effect_route` is the single
    # most important interpretive fact about a v8+ score -- how much of it rests
    # on MEASURED effects versus on direction labels -- and it was silently
    # dropped here, so the dashboard could not show it. Fixed keys only, same
    # allowlist discipline as everything else in this file: evidence spans,
    # prompts and cache keys stay out.
    if "contributions" in value:
        rows = []
        for c in value.get("contributions") or []:
            if not isinstance(c, dict):
                continue
            rows.append({
                "id": None if c.get("id") is None else str(c.get("id")),
                "w": _number(c.get("w")),
                "s": _number(c.get("s")),
                "design_rank": _integer(c.get("design_rank")),
                "direction": None if c.get("direction") is None else str(c.get("direction")),
                "form_match": None if c.get("form_match") is None else str(c.get("form_match")),
                "d_share": _number(c.get("d_share")),
                "points": _number(c.get("points")),
                "effect_route": None if c.get("effect_route") is None else str(c.get("effect_route")),
                "effect_s": _number(c.get("effect_s")),
            })
        result["contributions"] = rows
    return result


def _safe_dose(value: Any) -> dict | None:
    if not isinstance(value, dict):
        return None
    keys = (
        "low", "high", "n_benefit", "n_null", "null_range", "band_version",
        "basis", "observed", "evidence_with_dose", "product_match",
    )
    return {key: _json_copy(value.get(key)) for key in keys if key in value}


def _safe_applicability(value: Any) -> dict | None:
    if not isinstance(value, dict):
        return None
    result = {}
    for axis in ("form", "dose", "population"):
        item = value.get(axis)
        if isinstance(item, dict):
            result[axis] = {
                key: _number(item.get(key))
                for key in ("match", "assessable") if key in item
            }
    return result


def _safe_provenance(value: Any) -> dict | None:
    if not isinstance(value, dict):
        return None
    keys = (
        "prompt_version", "vocab_versions", "scorer_version", "computed_at",
        "demo_exact_form_only", "demo_ignore_population",
    )
    return {key: _json_copy(value.get(key)) for key in keys if key in value}


def _outcome_meta(outcome_id: str | None) -> dict:
    found = vocab.outcome(outcome_id) if outcome_id else None
    found = found or {}
    return {
        "id": outcome_id,
        "label": found.get("label"),
        "kind": found.get("kind"),
        "definition": found.get("definition"),
        "polarity": found.get("polarity"),
    }


def _dashboard_ecu(raw: Any) -> dict:
    raw = raw if isinstance(raw, dict) else {}
    arcs = _safe_arcs(raw.get("arcs"))
    components = _safe_components(raw.get("components"))
    composite = _integer(raw.get("composite"))
    effect = (arcs.get("effect") or {}).get("verdict")
    applicability_limited = any(
        (arcs.get(axis) or {}).get("verdict") is None for axis in ("form", "dose")
    )
    verdict = arcsmod.label(
        composite,
        components.get("c"),
        effect_verdict=effect,
        applicability_limited=applicability_limited,
    )

    evidence = _safe_evidence(raw.get("evidence"))
    legacy_n = _integer(raw.get("n_primaries"))
    if "n_primaries" not in evidence and legacy_n is not None:
        evidence["n_primaries"] = legacy_n
    n_primaries = evidence.get("n_primaries")

    outcome_id = raw.get("outcome_vocab_id")
    result = {
        "ecu_key": raw.get("ecu_key"),
        "ingredient": raw.get("ingredient"),
        "form_vocab_id": raw.get("form_vocab_id"),
        "dose_band": raw.get("dose_band"),
        "band_version": _integer(raw.get("band_version")),
        "outcome_vocab_id": outcome_id,
        "outcome": _outcome_meta(outcome_id),
        "population": _safe_population(raw.get("population")),
        "score": _integer(raw.get("score")),
        "composite": composite,
        "verdict": verdict,
        "band": raw.get("band"),
        "gate_fired": (bool(raw.get("gate_fired")) if "gate_fired" in raw
                       else composite is None),
        "components": components,
        "arcs": arcs,
        "dose": _safe_dose(raw.get("dose")),
        "dose_range_mg": _safe_dose(raw.get("dose_range_mg")),
        "evidence": evidence,
        "n_primaries": n_primaries,
        "form_mix": (_json_copy(raw.get("form_mix"))
                     if isinstance(raw.get("form_mix"), dict) else None),
        "applicability": _safe_applicability(raw.get("applicability")),
        "flags": [str(x) for x in (raw.get("flags") or [])],
        "provenance": _safe_provenance(raw.get("provenance")),
    }
    # Historical contexts exposed prompt_version beside the abbreviated row.
    # Preserve that safe alias; future full rows carry it in provenance.
    if "prompt_version" in raw:
        result["prompt_version"] = raw.get("prompt_version")
    return result


def _reports_for(run_id: str, supplied: dict | None = None) -> dict:
    base = f"reports/runs/{run_id}"
    defaults = {
        "summary": f"{base}_summary.md",
        "full": f"{base}_full.md",
        "context": f"{base}_context.json",
        "dashboard": f"{base}_dashboard.json",
    }
    return {**defaults, **(supplied or {})}


def build_dashboard_run(context: dict, *, run_id: str, mode: str | None = None,
                        reports: dict | None = None,
                        source_commit: str | None = None,
                        registry_path: Path = STATUS_REGISTRY) -> dict:
    """Return one stable DashboardRunV1 document from an internal context."""
    run_id = _safe_run_id(run_id)
    context = context if isinstance(context, dict) else {}
    mode = mode or context.get("mode")
    provider = context.get("provider") or _provider_for(mode)

    raw_rows = context.get("ecu_rows") if isinstance(context.get("ecu_rows"), list) else []
    rows = [_dashboard_ecu(row) for row in raw_rows]
    studies = [s for s in (_safe_study(v) for v in (context.get("studies_list") or []))
               if s is not None]
    scored = sum(row.get("composite") is not None for row in rows)
    gated = len(rows) - scored

    product_in = context.get("product") if isinstance(context.get("product"), dict) else {}
    product_population = _safe_population(product_in.get("population"))
    if product_population is None:
        product_population = next((row.get("population") for row in rows
                                   if row.get("population") is not None), None)
    product = {
        "ingredient": context.get("ingredient") or product_in.get("ingredient"),
        "form": context.get("form") or product_in.get("form_vocab_id"),
        "dose": ({"low_mg": _number(product_in.get("dose_low_mg")),
                  "high_mg": _number(product_in.get("dose_high_mg"))}
                 if product_in else None),
        "population": product_population,
    }

    artifact = {
        "schema_version": SCHEMA_VERSION,
        "run": {
            "id": run_id,
            "generated_at": _generated_at(run_id),
            "provider": provider,
            "mode": mode,
            "scope": context.get("scope"),
            "scoring_model": context.get("scoring_model") or SCORING_MODEL,
            "prompt_version": context.get("prompt_version"),
            "source_commit": source_commit or context.get("source_commit"),
            "models": (_json_copy(context.get("models"))
                       if isinstance(context.get("models"), dict) else None),
        },
        "validity": _validity_for(run_id, registry_path),
        "product": product,
        "reports": _reports_for(run_id, reports),
        "score_semantics": {
            "display_field": "composite",
            "display_range": [0, 100],
            "internal_signed_field": "score",
            "internal_signed_range": [-100, 100],
            "verdict_field": "verdict",
            "requires_arcs": True,
            "gated_value": None,
        },
        "corpus": {
            "study_count": len(studies),
            "studies": studies,
            "systematic_reviews": _safe_sr(context.get("sr")),
            "predatory_screen": _safe_predatory(context.get("predatory")),
        },
        "stats": {
            "studies": {
                "targeted": _integer(context.get("studies_targeted")),
                "usable": _integer(context.get("studies_ok")),
                "skipped": _integer(context.get("studies_skipped")),
                "partial_failures": _integer(context.get("studies_failed_partial")),
            },
            "ecus": {"total": len(rows), "scored": scored, "gated": gated},
            "agents": _safe_agents(context.get("agent_stats")),
            "execution": {
                "concurrency": _integer(context.get("concurrency")),
                "studies_in_flight": _integer(context.get("studies_in_flight")),
            },
        },
        "usage": normalize_usage(context.get("usage"), context=context,
                                 provider=provider),
        "ecu_rows": rows,
    }
    validate_dashboard_run(artifact)
    return artifact


def _usage_row_number(row: dict, *keys: str) -> int | float | None:
    return _number(_present(row, *keys))


def _usage_row_tokens(row: dict) -> int | float | None:
    tokens = row.get("tokens")
    if isinstance(tokens, (int, float)) and not isinstance(tokens, bool):
        return tokens
    if not isinstance(tokens, dict):
        return _usage_row_number(row, "total_tokens")
    explicit = _number(_present(tokens, "total", "total_tokens"))
    if explicit is not None:
        return explicit
    parts = [_number(tokens.get(key)) for key in
             ("fresh_input", "cache_write", "cache_read", "output")]
    return sum(parts) if all(part is not None for part in parts) else None


def _same_usage_number(expected: int | float, actual: int | float) -> bool:
    return abs(float(expected) - float(actual)) <= 0.000001


def _validate_usage_totals(usage: Any) -> None:
    """Reject internally inconsistent totals before an artifact can deploy."""
    if not isinstance(usage, dict):
        raise ValueError("dashboard usage must be an object")

    tokens = usage.get("tokens")
    if isinstance(tokens, dict):
        total = _number(tokens.get("total"))
        parts = [_number(tokens.get(key)) for key in
                 ("fresh_input", "cache_write", "cache_read", "output")]
        if total is not None and all(part is not None for part in parts):
            actual = sum(parts)
            if not _same_usage_number(total, actual):
                raise ValueError(
                    f"dashboard token total {total} does not match components {actual}")

    operations = usage.get("operations")
    if isinstance(operations, dict):
        live_calls = _number(usage.get("live_calls"))
        successful = _number(operations.get("successful_calls"))
        failed = _number(operations.get("failed_calls"))
        if live_calls is not None and successful is not None and failed is not None:
            actual = successful + failed
            if not _same_usage_number(live_calls, actual):
                raise ValueError(
                    f"dashboard live calls {live_calls} do not match outcomes {actual}")
        for total_key, operation_key in (("failures", "failed_calls"),
                                         ("cache_hits", "cache_hits")):
            expected = _number(usage.get(total_key))
            actual = _number(operations.get(operation_key))
            if (expected is not None and actual is not None
                    and not _same_usage_number(expected, actual)):
                raise ValueError(
                    f"dashboard {total_key} {expected} does not match operations {actual}")

    if usage.get("breakdown_status") != "complete":
        return

    metrics = (
        ("live_calls", ("calls", "live_calls"), None),
        ("cache_hits", ("cache_hits", "hits"), None),
        ("retries", ("retries",), None),
        ("failures", ("failures", "fail"), None),
        ("terminal_failures", ("terminal_failures",), None),
        ("api_equivalent_cost", ("api_equivalent_cost", "cost"), None),
        ("tokens.total", (), _usage_row_tokens),
    )
    for breakdown_key in ("by_agent", "by_tier", "by_model"):
        rows = usage.get(breakdown_key)
        if not isinstance(rows, list) or (not rows and (usage.get("live_calls") or 0) > 0):
            raise ValueError(
                f"dashboard usage {breakdown_key} is marked complete but has no rows")
        for total_key, aliases, getter in metrics:
            if total_key == "tokens.total":
                expected = _number((usage.get("tokens") or {}).get("total"))
            else:
                expected = _number(usage.get(total_key))
            if expected is None:
                continue
            values = [getter(row) if getter else _usage_row_number(row, *aliases)
                      for row in rows if isinstance(row, dict)]
            if len(values) != len(rows) or any(value is None for value in values):
                raise ValueError(
                    f"dashboard usage {breakdown_key} is marked complete but omits {total_key}")
            actual = sum(values)
            if not _same_usage_number(expected, actual):
                raise ValueError(
                    f"dashboard usage {total_key} {expected} does not match "
                    f"{breakdown_key} sum {actual}")


def dashboard_schema(path: Path = SCHEMA_PATH) -> dict:
    """The one deploy contract, read from disk and cached for the process."""
    global _SCHEMA_CACHE
    if _SCHEMA_CACHE is None or path != SCHEMA_PATH:
        schema = json.loads(path.read_text(encoding="utf-8"))
        if path != SCHEMA_PATH:
            return schema
        _SCHEMA_CACHE = schema
    return _SCHEMA_CACHE


def validate_against_schema(artifact: dict, path: Path = SCHEMA_PATH) -> None:
    """Enforce ``schemas/dashboard_run_v1.schema.json`` on the Python writer.

    The TypeScript loader runs Ajv against this exact file, and the file closes
    roughly thirty objects with ``additionalProperties: false``.  Without this
    call the writer and the reader enforce different contracts: Python happily
    emits a field the schema rejects and nothing notices until a deploy fails,
    hours after the extraction run that produced it.  Failing here is the
    point -- the run that wrote the artifact is still on screen.
    """
    try:
        from jsonschema.validators import validator_for
    except ImportError as exc:  # pragma: no cover - environment defect
        raise ValueError(
            "jsonschema is required to write a dashboard artifact "
            "(pip install -r requirements.txt); refusing to emit an "
            "unvalidated artifact"
        ) from exc
    schema = dashboard_schema(path)
    validator = validator_for(schema)(schema)
    errors = sorted(validator.iter_errors(artifact), key=lambda e: list(e.path))
    if not errors:
        return
    details = "; ".join(
        f"{'/' + '/'.join(str(p) for p in error.path) if error.path else '/'} "
        f"{error.message}" for error in errors[:8]
    )
    more = f" (+{len(errors) - 8} more)" if len(errors) > 8 else ""
    raise ValueError(f"dashboard artifact violates {path.name}: {details}{more}")


def validate_dashboard_run(artifact: dict, *,
                           schema_path: Path = SCHEMA_PATH) -> None:
    """Contract check used by writer and unit tests.

    Two layers, in order.  The hand-written invariants first, because they say
    what is wrong in the pipeline's own language ("token total does not match
    components").  Then the JSON schema, which is what actually ships.
    """
    if artifact.get("schema_version") != SCHEMA_VERSION:
        raise ValueError("dashboard schema_version must be DashboardRunV1")
    for key in ("run", "validity", "product", "reports", "score_semantics",
                "corpus", "stats", "ecu_rows"):
        if key not in artifact:
            raise ValueError(f"dashboard artifact missing {key!r}")
    rows = artifact["ecu_rows"]
    if not isinstance(rows, list):
        raise ValueError("dashboard ecu_rows must be an array")
    counts = artifact["stats"]["ecus"]
    if counts.get("total") != len(rows):
        raise ValueError("dashboard ECU total does not match ecu_rows")
    if counts.get("scored", 0) + counts.get("gated", 0) != len(rows):
        raise ValueError("dashboard scored + gated counts do not match ecu_rows")
    for row in rows:
        if "verdict" not in row or "arcs" not in row:
            raise ValueError("every dashboard ECU must travel with verdict and arcs")
    _validate_usage_totals(artifact.get("usage"))
    validate_against_schema(artifact, schema_path)


def write_dashboard_artifact(context: dict, *, run_id: str,
                             mode: str | None = None,
                             reports: dict | None = None,
                             source_commit: str | None = None,
                             output: Path | None = None,
                             registry_path: Path = STATUS_REGISTRY,
                             overwrite: bool = False) -> Path:
    """Write an immutable artifact; identical replays are idempotent."""
    run_id = _safe_run_id(run_id)
    output = output or (RUNS / f"{run_id}_dashboard.json")
    artifact = build_dashboard_run(
        context, run_id=run_id, mode=mode, reports=reports,
        source_commit=source_commit, registry_path=registry_path,
    )
    payload = json.dumps(artifact, indent=2, ensure_ascii=False) + "\n"
    if output.exists() and not overwrite:
        if output.read_text(encoding="utf-8") == payload:
            return output
        raise FileExistsError(f"refusing to overwrite immutable dashboard run: {output}")
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(payload, encoding="utf-8")
    return output


def _infer_run_id(context_path: Path) -> str:
    suffix = "_context.json"
    if not context_path.name.endswith(suffix):
        raise ValueError("context filename must end in _context.json or pass --run-id")
    return context_path.name[:-len(suffix)]


def _infer_mode(run_id: str, context: dict) -> str | None:
    if context.get("mode"):
        return context["mode"]
    prefix = f"{run_id[:16]}_{_slug(str(context.get('ingredient') or ''))}_" \
             f"{_slug(str(context.get('form') or ''))}_"
    return run_id[len(prefix):].replace("-per-o", "-per_o") \
        if run_id.startswith(prefix) else None


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--context", required=True, type=Path,
                        help="Internal reports/runs/*_context.json")
    parser.add_argument("--run-id", default=None)
    parser.add_argument("--mode", default=None)
    parser.add_argument("--source-commit", default=None,
                        help="Git commit containing the code used for this run")
    parser.add_argument("--output", type=Path, default=None)
    parser.add_argument("--force", action="store_true",
                        help="Replace an existing artifact (manual repair only)")
    args = parser.parse_args(argv)

    context = json.loads(args.context.read_text(encoding="utf-8"))
    run_id = args.run_id or _infer_run_id(args.context)
    mode = args.mode or _infer_mode(run_id, context)
    path = write_dashboard_artifact(
        context, run_id=run_id, mode=mode, source_commit=args.source_commit,
        output=args.output,
        overwrite=args.force,
    )
    print(path.relative_to(ROOT) if path.is_relative_to(ROOT) else path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
