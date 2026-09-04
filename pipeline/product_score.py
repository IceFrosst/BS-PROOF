"""
Score a PRODUCT (ingredient + form + dose) against retained runs. NO MODEL.

This is the lookup behind the label-upload flow. It exists because of one
property of SCORING_MODEL v12: the composite's dose term is the product's
CLOSENESS to the range of doses where benefit occurred, so the headline is
partly a function of the dose on the tub in front of you. A stored run scored
one product dose (`product.dose.low_mg`); a different tub is a different number.

So this module does NOT replay a stored composite. It reuses the run's
dose-INDEPENDENT evidence (effect verdict, form strength, confidence) and
recomputes the dose term and the headline for the dose actually supplied,
through `pipeline.arcs.composite` and `pipeline.dose.dose_factor_for` -- the
real functions, never a reimplementation. Two copies of a formula is how they
disagree later.

WHAT IT REFUSES, and why each refusal is scope rather than a discount:

  form is not the run's form   The form arc is EXACT-form evidence about the
                               run's form. Reusing monohydrate's form arc for
                               an HCl product would answer a different
                               question at full confidence. Transferring
                               across forms needs the transfer ladder applied
                               to Study objects, which an artifact does not
                               carry -- so this is a real re-run, not a lookup.
  no `arcs.form.strength`      Pre-2026-08-21 artifacts omitted it (see
                               scripts/dashboard_artifact._safe_arcs). It can
                               be inverted out of the rounded composite, but
                               rounding makes that lossy -- measured on run
                               20260812_072850's muscle_power row, strengths
                               0.800..0.810 all round to 43. Inventing +/-0.005
                               of precision to avoid saying "re-run it" is
                               exactly the trade this project does not make.
  gated row                    `composite is None` means the scorer already
                               declined. Nothing to recompute.

Population is NOT re-derived: the run scored one population and we cannot read
a person off a label. It travels with the answer so the caller can disclose it.
"""
from __future__ import annotations

import json
from pathlib import Path

from pipeline import arcs as arcsmod
from pipeline import dose as dosemod
from pipeline import vocab

RUNS_DIR = Path(__file__).resolve().parent.parent / "reports" / "runs"
STATUSES = Path(__file__).resolve().parent.parent / "reports" / "run_statuses.json"

# A run whose status is one of these cannot back a displayed score. `invalid`
# runs are retained for provenance (CLAUDE.md, reports archive) and the
# dashboard shows them in the Lab archive -- but an invalid run is one whose
# extraction is known broken, so quoting its number at a consumer is precisely
# the thing `run_statuses.json` exists to prevent.
UNUSABLE_STATUSES = frozenset({"invalid"})


def _statuses() -> dict:
    try:
        return json.loads(STATUSES.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def _status_for(run_id: str, statuses: dict) -> dict:
    runs = statuses.get("runs") or {}
    entry = runs.get(run_id)
    if isinstance(entry, dict):
        return entry
    default = statuses.get("default")
    return default if isinstance(default, dict) else {"status": "experimental"}


def _artifacts() -> list[dict]:
    """Every retained dashboard artifact, newest first."""
    out = []
    for path in sorted(RUNS_DIR.glob("*_dashboard.json"), reverse=True):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        if isinstance(data, dict) and data.get("ecu_rows"):
            data["_path"] = path.name
            out.append(data)
    return out


def _is_demo(artifact: dict) -> bool:
    """
    A synthetic fixture must never answer a product question.

    `reports/runs/20260812_000000_demo-*` is hand-written data for previewing
    the reviewer UI -- "every number, study and quote is invented" per its own
    run_statuses entry. It is marked `invalid`, so UNUSABLE_STATUSES already
    excludes it; this is the second, independent check, because a fixture that
    leaks into a consumer answer is the worst failure this module could have.
    """
    run = artifact.get("run") or {}
    product = artifact.get("product") or {}
    return (str(run.get("mode", "")).startswith("demo")
            or str(product.get("ingredient", "")).startswith("demo")
            or str(product.get("form", "")).startswith("demo"))


def available_products() -> list[dict]:
    """
    Which (ingredient, form) pairs a retained, usable run can actually answer.

    This is the honest catalogue for the UI: anything not in here returns
    `not_scored`, and the difference between "we scored this and it is weak"
    and "we have never run this" is the whole point of the evidence arc.
    """
    statuses = _statuses()
    seen: dict[tuple[str, str], dict] = {}
    for art in _artifacts():
        if _is_demo(art):
            continue
        run_id = (art.get("run") or {}).get("id") or ""
        status = _status_for(run_id, statuses)
        if str(status.get("status", "")).lower() in UNUSABLE_STATUSES:
            continue
        product = art.get("product") or {}
        ing, form = product.get("ingredient"), product.get("form")
        if not ing or not form:
            continue
        key = (str(ing), str(form))
        if key in seen:
            continue
        seen[key] = {
            "ingredient": str(ing),
            "form": str(form),
            "run_id": run_id,
            "status": status.get("status"),
            "public_claims_allowed": bool(status.get("public_claims_allowed")),
            "scoring_model": (art.get("run") or {}).get("scoring_model"),
            "prompt_version": (art.get("run") or {}).get("prompt_version"),
            "n_outcomes": len(art.get("ecu_rows") or []),
            "run_dose_mg": (product.get("dose") or {}).get("low_mg"),
        }
    return sorted(seen.values(), key=lambda r: (r["ingredient"], r["form"]))


def _pick_artifact(ingredient: str, form: str) -> tuple[dict | None, dict]:
    """Newest usable artifact for this exact (ingredient, form)."""
    statuses = _statuses()
    for art in _artifacts():
        if _is_demo(art):
            continue
        product = art.get("product") or {}
        if (str(product.get("ingredient")) != ingredient
                or str(product.get("form")) != form):
            continue
        run_id = (art.get("run") or {}).get("id") or ""
        status = _status_for(run_id, statuses)
        if str(status.get("status", "")).lower() in UNUSABLE_STATUSES:
            continue
        return art, status
    return None, {}


def _benefit_range(row: dict) -> dict:
    """
    The range of doses at which benefit was OBSERVED -- the v12 yardstick.

    Read from `dose_range_mg` (written by assemble from pipeline.dose
    .effective_range), falling back to the `dose` block's own low/high. Both
    None means no benefit trial carried a usable dose, and `dose_factor_for`
    correctly returns None for that, which `arcs.composite` then penalises at
    MISSING_DOSE_PENALTY rather than dropping.
    """
    rng = row.get("dose_range_mg")
    if isinstance(rng, dict) and rng.get("low") is not None:
        return {"low": rng.get("low"), "high": rng.get("high"),
                "basis": rng.get("basis")}
    d = row.get("dose") or {}
    return {"low": d.get("low"), "high": d.get("high"), "basis": d.get("basis")}


def score_product(ingredient: str, form: str, dose_mg: float | None,
                  *, dose_basis: str = "elemental") -> dict:
    """
    Recompute this product's rows from a retained run.

    ``dose_mg`` is active-moiety/elemental by default.  Compound input must be
    explicit and is converted only for a known exact vocabulary form; bounded
    or unknown conversions are refused rather than compared on mixed bases.

    Returns {"status": ...}. Statuses are deliberately distinct so the caller
    never has to guess which kind of nothing it got:

      scored             rows recomputed for `dose_mg`
      form_not_scored    ingredient has a run, this FORM does not
      not_scored         no usable run for this ingredient at all
      recompute_refused  a run exists but its rows predate arcs.form.strength
    """
    art, status = _pick_artifact(ingredient, form)
    if art is None:
        others = [p for p in available_products() if p["ingredient"] == ingredient]
        if others:
            return {"status": "form_not_scored", "ingredient": ingredient,
                    "form": form,
                    "scored_forms": [p["form"] for p in others]}
        return {"status": "not_scored", "ingredient": ingredient, "form": form}

    if dose_basis in {"compound", "compound_only"} and dose_mg is not None:
        converted = vocab.elemental_dose_range_mg(ingredient, form, dose_mg)
        if (converted.get("low") is None or converted.get("high") is None
                or converted["low"] != converted["high"]):
            return {"status": "recompute_refused", "ingredient": ingredient,
                    "form": form, "dose_mg": dose_mg,
                    "reason": "compound_dose_conversion_ambiguous"}
        dose_mg = converted["low"]
    elif dose_basis not in {"elemental", "elemental_stated", "converted"}:
        return {"status": "recompute_refused", "ingredient": ingredient,
                "form": form, "dose_mg": dose_mg,
                "reason": "unsupported_dose_basis"}

    run = art.get("run") or {}
    product = art.get("product") or {}
    rows, refused = [], []
    for raw in art.get("ecu_rows") or []:
        arcs = raw.get("arcs") or {}
        form_arc = arcs.get("form") or {}
        effect_arc = arcs.get("effect") or {}
        components = raw.get("components") or {}
        effect_d = effect_arc.get("verdict")
        c = components.get("c")
        h = components.get("H")
        strength = form_arc.get("strength")

        if raw.get("composite") is None or effect_d is None or c is None:
            refused.append({"outcome": raw.get("outcome_vocab_id"),
                            "reason": "gated_in_run"})
            continue
        if strength is None:
            # Refuse rather than invert out of the rounded headline. See module
            # docstring: the inversion is lossy and would invent precision.
            refused.append({"outcome": raw.get("outcome_vocab_id"),
                            "reason": "artifact_predates_form_strength"})
            continue
        if h is None:
            # v14's composite is the signed score rescaled, and the signed
            # score carries the heterogeneity discount. Defaulting H to 0 here
            # would silently INFLATE a disputed outcome, so a row without it is
            # refused on the same footing as one without a form strength.
            refused.append({"outcome": raw.get("outcome_vocab_id"),
                            "reason": "artifact_lacks_heterogeneity"})
            continue

        band = _benefit_range(raw)
        closeness = dosemod.dose_factor_for(dose_mg, dose_mg, band)
        match = dosemod.dose_match_for(dose_mg, dose_mg, band)
        fit = arcsmod.applicability(strength, closeness)
        composite = arcsmod.composite(effect_d, strength, closeness, c, h)
        verdict = arcsmod.label(
            composite, c, effect_verdict=effect_d,
            applicability_limited=(strength is None or closeness is None),
            applicability_score=fit,
        )
        rows.append({
            "outcome": raw.get("outcome_vocab_id"),
            "outcome_label": (raw.get("outcome") or {}).get("label"),
            "polarity": (raw.get("outcome") or {}).get("polarity"),
            "composite": composite,
            "verdict": verdict,
            "n_primaries": (raw.get("evidence") or {}).get("n_primaries"),
            # The four arcs, always. Invariant 8: the centre number never
            # travels without them, so this dict has no shape in which the
            # composite exists alone.
            "arcs": {
                "effect": {"verdict": effect_d, "coverage": effect_arc.get("coverage")},
                "form": {"verdict": form_arc.get("verdict"),
                         "coverage": form_arc.get("coverage"),
                         "strength": strength, "basis": form_arc.get("basis")},
                "dose": {"verdict": (arcs.get("dose") or {}).get("verdict"),
                         "coverage": (arcs.get("dose") or {}).get("coverage"),
                         "closeness": closeness, "product_match": match},
                "evidence": {"coverage": c, "is_quantity": True},
            },
            "benefit_dose_range_mg": band,
            "null_dose_range_mg": (raw.get("dose") or {}).get("null_range"),
            # What the run itself scored, so a reader can see that the dose term
            # was recomputed and by how much it moved.
            "run_composite": raw.get("composite"),
            "run_dose_closeness": (arcs.get("dose") or {}).get("closeness"),
            # The v14 applicability term for THIS dose, so a reader can see how
            # much of the signed evidence was allowed to reach the headline.
            "applicability": round(fit, 3),
        })

    rows.sort(key=lambda r: (r["composite"] is None, -(r["composite"] or 0)))
    return {
        "status": "scored" if rows else "recompute_refused",
        "ingredient": ingredient,
        "form": form,
        "dose_mg": dose_mg,
        "rows": rows,
        "refused": refused,
        "population": product.get("population"),
        "run": {
            "id": run.get("id"),
            "scoring_model": run.get("scoring_model"),
            "prompt_version": run.get("prompt_version"),
            "generated_at": run.get("generated_at"),
            "provider": run.get("provider"),
            "scored_product_dose_mg": (product.get("dose") or {}).get("low_mg"),
        },
        # Never optional. Every retained run is currently
        # public_claims_allowed=false, and a UI that omits this is publishing a
        # claim the registry withheld.
        "validity": {
            "status": status.get("status"),
            "public_claims_allowed": bool(status.get("public_claims_allowed")),
            "limitations": list(status.get("limitations") or []),
            "note": status.get("note"),
        },
    }
