"""
Arm-level counterfactual firewall for one extracted claim. NO MODEL MAY ENTER
THIS FILE. Moved verbatim out of pipeline/assemble.py on 2026-10-03; assemble
re-exports every name, so `assemble._claim_firewall` etc. still resolve.

Decides whether a claim compares the target ingredient against a genuine
counterfactual (CLAUDE.md invariant 7, docs/SPEC.md §13).
"""
from __future__ import annotations
import math
import re


def _arm_norm(value) -> str:
    """Stable arm-label comparison; never invents aliases or ingredient names."""
    return re.sub(r"[^a-z0-9]+", " ", str(value or "").casefold()).strip()


def _claim_has_target_exposure(claim: dict, s3: dict | None) -> bool:
    """Whether this claim names one uniquely evidenced target-exposed arm."""
    requested = _arm_norm(claim.get("ingredient_arm"))
    arms = (s3 or {}).get("arms") if isinstance(s3, dict) else None
    if not requested or not isinstance(arms, list):
        return False
    matches = [arm for arm in arms if isinstance(arm, dict)
               and _arm_norm(arm.get("label")) == requested]
    return (len(matches) == 1
            and matches[0].get("role") == "administered"
            and matches[0].get("target_ingredient_presence") == "yes")


def _claim_equivalence_valid(claim: dict) -> bool:
    """Validate a typed, successful equivalence/non-inferiority result.

    Prose such as ``"authors considered it equivalent"`` is not a statistical
    basis.  The margin, metric, estimate and interval must be explicit and
    internally compatible; ordinary nonsignificant NHST therefore cannot
    revive the negative null penalty.
    """
    basis = claim.get("equivalence_basis")
    if not isinstance(basis, dict):
        return False
    method = basis.get("method")
    conclusion = basis.get("conclusion")
    if method not in ("equivalence", "noninferiority"):
        return False
    if conclusion not in ("successful", "equivalent", "noninferior"):
        return False
    margin = basis.get("margin")
    if isinstance(margin, dict):
        margin_value, margin_unit = margin.get("value"), margin.get("unit")
    else:
        margin_value = basis.get("margin_value")
        margin_unit = basis.get("margin_unit")
    try:
        margin_value = float(margin_value)
        if not math.isfinite(margin_value) or margin_value <= 0:
            return False
    except (TypeError, ValueError):
        return False
    unit = str(claim.get("effect_unit") or "").strip().casefold()
    margin_unit = str(margin_unit or "").strip().casefold()
    if not unit or not margin_unit or unit != margin_unit:
        return False
    try:
        estimate = float(claim.get("effect_size"))
        low, high = float(claim.get("ci_low")), float(claim.get("ci_high"))
        precision = float(claim.get("null_precision"))
    except (TypeError, ValueError):
        return False
    if not all(math.isfinite(v) for v in (estimate, low, high, precision)):
        return False
    if low > high or precision <= 0 or abs(estimate) > margin_value:
        return False
    # The interval is the actual deterministic success criterion. A successful
    # equivalence CI is wholly inside +/- margin; non-inferiority only needs the
    # lower bound above the tolerated loss. Both require a reported CI, not p.
    if method == "equivalence":
        valid_ci = low >= -margin_value and high <= margin_value
    else:
        valid_ci = low >= -margin_value
    if not valid_ci:
        return False
    # null_precision is a legacy scalar retained for audit, but must agree with
    # the typed margin rather than act as an arbitrary switch.
    return math.isclose(precision, margin_value, rel_tol=1e-9, abs_tol=1e-12)


def _normalise_cointerventions(values) -> frozenset[str] | None:
    if not isinstance(values, list):
        return None
    return frozenset(_arm_norm(v) for v in values if _arm_norm(v))


def _resolve_claim_arms(claim: dict, s3: dict | None, ingredient: str,
                        *, contract_version: str | None = None) -> tuple[bool, str]:
    """Firewall S5 claims against evidenced S3 intervention arms.

    A missing modern contract is retained for old cached runs. Once either side
    supplies arm-level facts, ambiguity is a refusal rather than a positional
    guess. This deliberately knows only the ingredient passed by the caller.
    """
    arms = (s3 or {}).get("arms") if isinstance(s3, dict) else None
    explicit_v124 = contract_version == "v1.24"
    modern = explicit_v124 or (isinstance(arms, list) and bool(arms) and any(
        any(k in a for k in ("target_ingredient_presence", "role",
                              "active_cointerventions", "evidenced_arm_text"))
        for a in arms if isinstance(a, dict)))
    claim_modern = modern or any(claim.get(k) is not None for k in (
        "ingredient_arm", "control_arm", "test_kind", "outcome_role",
        "statistic_provenance"))
    # Legacy is not inferred from a missing field in a modern envelope. A
    # caller may explicitly mark an old cached extraction; unmarked modern
    # provenance is a refusal.
    if not modern and not claim_modern:
        if contract_version and str(contract_version).startswith("legacy-"):
            return True, "legacy_contract"
        # Compatibility is explicit, never inferred from omitted provenance.
        # Unversioned cache rows cannot be distinguished from malformed fresh
        # output, so the only safe behaviour is to under-count and re-extract.
        return False, "extraction_version_missing"
    if explicit_v124:
        required_claim = ("ingredient_arm", "control_arm", "test_kind",
                          "outcome_role", "statistic_provenance", "contrast")
        if any(claim.get(key) is None for key in required_claim):
            return False, "modern_provenance_missing"
    if not isinstance(arms, list) or not arms:
        return False, "s3_arms_missing"
    if not isinstance(ingredient, str) or not ingredient.strip():
        return False, "target_ingredient_missing"

    def _presence(a: dict) -> str:
        p = a.get("target_ingredient_presence")
        if p in ("yes", "no", "unknown"):
            return p
        if explicit_v124:
            return "unknown"
        # Safe legacy derivation: only an explicit token in the evidenced text
        # can establish presence. Absence is never inferred from a label.
        text = " ".join(str(a.get(k) or "") for k in
                         ("evidenced_arm_text", "intervention_text", "label"))
        token = _arm_norm(ingredient)
        if token and re.search(rf"(?<![a-z0-9]){re.escape(token)}(?![a-z0-9])",
                              _arm_norm(text)):
            return "yes"
        if a.get("is_control") is True:
            return "no"
        return "unknown"

    def _role(a: dict) -> str:
        role = a.get("role")
        if role in ("administered", "measurement_only", "biomarker", "unclear"):
            return role
        return "unclear" if explicit_v124 else (
            "administered" if type(a.get("is_control")) is bool else "unclear")

    administered = []
    for a in arms:
        if not isinstance(a, dict):
            return False, "malformed_s3_arm"
        role = _role(a)
        if role != "administered":
            # Explicit non-intervention arms cannot silently become controls.
            if role in ("measurement_only", "biomarker"):
                continue
            return False, "unclear_s3_arm_role"
        p = _presence(a)
        if p == "unknown":
            return False, "unknown_s3_ingredient_presence"
        administered.append((a, p))
    targets = [a for a, p in administered if p == "yes"]
    controls = [a for a, p in administered if p == "no"]
    if not targets:
        return False, "no_administered_target_arm"
    if not controls:
        return False, "no_ingredient_free_control_arm"

    requested_target = claim.get("ingredient_arm")
    requested_control = claim.get("control_arm")
    if requested_target is None and requested_control is None:
        if len(targets) != 1 or len(controls) != 1:
            return False, "claim_arms_unresolved"
        selected_target, selected_control = targets[0], controls[0]
    else:
        if not isinstance(requested_target, str) or not isinstance(requested_control, str):
            return False, "claim_arm_names_incomplete"
        by_label: dict[str, list[dict]] = {}
        for arm, _ in administered:
            label = _arm_norm(arm.get("label"))
            if label:
                by_label.setdefault(label, []).append(arm)
        target_matches = by_label.get(_arm_norm(requested_target), [])
        control_matches = by_label.get(_arm_norm(requested_control), [])
        # Duplicate normalised labels are not a join key. Choosing one would
        # make the result depend on extraction order, so ambiguous labels
        # refuse just like a missing arm.
        if len(target_matches) != 1 or len(control_matches) != 1:
            return False, "claim_arm_not_unique_in_s3"
        selected_target = target_matches[0]
        selected_control = control_matches[0]
        if selected_target is selected_control:
            return False, "claim_arms_not_distinct"
        if _presence(selected_target) != "yes":
            return False, "named_ingredient_arm_not_target"
        if _presence(selected_control) != "no":
            return False, "named_control_contains_ingredient"
    co = _normalise_cointerventions(selected_target.get("active_cointerventions"))
    control_co = _normalise_cointerventions(selected_control.get("active_cointerventions"))
    # A factorial A+B versus B contrast isolates A when the non-target active
    # background is identical. Unmatched combinations answer a different
    # question and refuse. Unknown modern lists are never treated as equal.
    if co is None or control_co is None:
        if explicit_v124:
            return False, "cointervention_provenance_missing"
    elif co != control_co:
        return False, "unmatched_active_cointerventions"
    if selected_target.get("role") in ("measurement_only", "biomarker", "unclear"):
        return False, "named_target_nonintervention_role"

    test_kind = claim.get("test_kind")
    if test_kind in ("within_group", "baseline", "time_main_effect", "omnibus", "unknown"):
        return False, f"invalid_test_kind:{test_kind}"
    if test_kind is not None and test_kind not in ("between_arm", "group_by_time"):
        return False, f"invalid_test_kind:{test_kind}"
    provenance = str(claim.get("statistic_provenance") or "").casefold()
    statistic = str(claim.get("statistic") or "").casefold()
    omnibus = ("omnibus" in provenance or "main effect" in provenance or
               (statistic.startswith("f") and "pair" not in provenance))
    if omnibus and test_kind != "group_by_time":
        return False, "omnibus_statistic_not_pairwise"
    contrast = claim.get("contrast")
    if contrast in ("vs_ingredient_arm", "within_group", "unclear"):
        return False, f"invalid_contrast:{contrast}"
    # A named modern claim must state a usable comparison. Legacy explicit
    # vs_ingredient_free remains compatible only when arm resolution succeeded.
    if claim_modern and test_kind is None:
        return False, "test_kind_missing"
    if explicit_v124 and claim.get("outcome_role") not in (
            "primary", "secondary", "exploratory", "unknown"):
        return False, "outcome_role_missing"
    return True, "eligible"


def _claim_firewall(claim: dict, s3: dict | None, ingredient: str,
                    *, contract_version: str | None = None) -> str | None:
    ok, reason = _resolve_claim_arms(claim, s3, ingredient,
                                     contract_version=contract_version)
    return None if ok else reason
