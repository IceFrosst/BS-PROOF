"""
The v13 measured-effect SHADOW path's per-study helpers: arm aliasing, table
candidate selection and claim enrichment. Off unless SP_V13_SHADOW=1, and never
read by production scoring. Moved verbatim out of workers.py on 2026-10-03;
bsproof.workers re-exports every name. The wiring self-check that drives these
through extract_study stays in workers.py.
"""
from __future__ import annotations

import math
import re

from bsproof.worker_payload import _tables_structured, _tables_text
from bsproof.worker_quota import _quota_signal

def _shadow_arm_aliases(s3: dict | None, ingredient: str | None = None) -> tuple[dict[str, list[str]] | None, str | None, dict[str, str] | None]:
    """Build conservative aliases from explicit S3 labels only.

    Parenthetical/dose removal handles the common table header shortening.  The
    prefix aliases are deliberately generated from the labels (never from
    world knowledge); if two arm words share a first word, abbreviation would
    be ambiguous and the whole table is refused.
    """
    if not isinstance(s3, dict):
        return None, "S3 arm facts are absent", None
    if s3.get("comparator") != "ingredient_free":
        return None, "S3 comparator is not explicitly ingredient_free", None
    if s3.get("ingredient_isolated") != "yes":
        return None, "S3 ingredient_isolated is not explicitly yes", None
    arms = s3.get("arms")
    if not isinstance(arms, list):
        return None, "S3 arms are absent", None
    # Unknown arm roles are not safe to ignore: the selector requires a fully
    # explicit two-role comparison, not merely one true and one false among
    # otherwise ambiguous arms.
    if any(not isinstance(a, dict) or type(a.get("is_control")) is not bool
           for a in arms):
        return None, "S3 has an arm with unknown control status", None
    controls = [a for a in arms if a.get("is_control") is True]
    noncontrols = [a for a in arms if a.get("is_control") is False]
    if len(controls) != 1:
        return None, "S3 does not have exactly one explicit control arm", None
    if not noncontrols:
        return None, "S3 has no explicit non-control arm", None
    # More than two arms are recoverable only when exactly one non-control arm
    # explicitly contains the ingredient token.  This preserves the ingredient
    # alone vs comparator contrast while refusing Cr vs Cr+protein mixtures.
    token = str(ingredient or s3.get("ingredient") or "").strip().casefold()
    token_words = re.findall(r"[a-z0-9]+", token)
    token = token_words[0] if token_words else ""
    if len(noncontrols) != 1:
        if not token:
            return None, "S3 multi-arm trial has no ingredient token", None
        hits = [a for a in noncontrols
                if re.search(rf"(?<![a-z0-9]){re.escape(token)}(?![a-z0-9])",
                             str(a.get("label", "")).casefold())]
        if len(hits) == 0:
            return None, "S3 multi-arm trial has no ingredient-alone arm", None
        if len(hits) > 1:
            return None, "S3 multi-arm trial has multiple ingredient arms", None
        ingredients = hits
    else:
        ingredients = noncontrols
    control_label = controls[0].get("label")
    ingredient_label = ingredients[0].get("label")
    if not (isinstance(control_label, str) and control_label.strip()
            and isinstance(ingredient_label, str) and ingredient_label.strip()):
        return None, "S3 arm labels are not explicit", None
    if control_label == ingredient_label:
        return None, "S3 arm labels are not unique", None
    if not token:
        ingredient_words = re.findall(r"[a-z0-9]+", ingredient_label.casefold())
        token = ingredient_words[0] if ingredient_words else ""

    def _label_aliases(label: str) -> list[str]:
        # Strip parenthetical sample sizes, comparator details, and doses only;
        # these are formatting variants of the supplied label, not synonyms.
        bare = re.sub(r"\s*\([^)]*\)", "", label).strip()
        dose = re.sub(r"\s+(?:\d+(?:\.\d+)?\s*(?:mg|g|kg|μg|mcg)(?:\s*/\s*(?:kg|day|d))?\s*)+$",
                      "", bare, flags=re.IGNORECASE).strip()
        values = [label, bare, dose]
        text = next((a.get("intervention_text") for a in arms
                     if a.get("label") == label), None)
        if isinstance(text, str) and text.strip():
            values.append(text)
        return list(dict.fromkeys(v for v in values if v))

    # Prefix aliases are unsafe if *any* S3 arm can claim the same header,
    # including ignored multi-arm arms.  Check every explicit label before
    # returning aliases for the selected pair.
    all_labels = [a.get("label") for a in arms]
    if any(not isinstance(label, str) or not label.strip() for label in all_labels):
        return None, "S3 arm labels are not explicit", None
    first_words = []
    for label in all_labels:
        match = re.match(r"[A-Za-z]+", label)
        first_words.append(match.group(0).casefold() if match else "")
    prefixes: dict[str, str] = {}
    for label, word in zip(all_labels, first_words):
        if not word:
            continue
        for size in range(2, len(word) + 1):
            prefix = word[:size]
            prior = prefixes.get(prefix)
            if prior is not None and prior != label:
                return None, "S3 arm words share a prefix; abbreviation is ambiguous", None
            prefixes[prefix] = label
    # A control label that contains the ingredient token is not a safe control
    # alias (e.g. "Placebo (creatine-free)").
    if token and re.search(rf"(?<![a-z0-9]){re.escape(token)}(?![a-z0-9])",
                           control_label.casefold()):
        return None, "S3 control label contains the ingredient token", None

    def aliases_for(arm, label):
        values = _label_aliases(label)
        # Prefix aliases allow headers such as CR/PLA, but only for a unique
        # first word.  They are label-derived and therefore cannot invent PLC
        # or any other world-knowledge synonym.
        first = re.match(r"[A-Za-z]+", label)
        if first:
            word = first.group(0)
            values.extend(word[:i] for i in range(2, len(word) + 1))
        return list(dict.fromkeys(values))
    selected = {ingredient_label: aliases_for(ingredients[0], ingredient_label),
                control_label: aliases_for(controls[0], control_label)}
    return selected, None, {"ingredient": ingredient_label, "control": control_label}


_SHADOW_SELECTION_KEYS = frozenset({
    "selected_candidate_index", "n_ingredient", "n_control",
    "mean_ingredient", "mean_control", "sd_ingredient", "sd_control",
    "estimand", "timepoint", "design_kind", "table_provenance",
    "refusal_reason",
})
_SHADOW_NUMERIC_KEYS = ("mean_ingredient", "mean_control",
                        "sd_ingredient", "sd_control")
_SHADOW_NULL_ON_REFUSAL = (
    "selected_candidate_index", "n_ingredient", "n_control",
    "mean_ingredient", "mean_control", "sd_ingredient", "sd_control",
    "estimand", "timepoint", "design_kind", "table_provenance",
)


def _shadow_validate_selection(claim: dict, candidates: list[dict], selected: dict,
                               s1: dict, role_facts: dict) -> tuple[dict | None, str | None]:
    """Validate S5T output with dependency-free, strict schema checks."""
    if not isinstance(selected, dict):
        return None, "selector output is not an object"
    if set(selected) != _SHADOW_SELECTION_KEYS:
        return None, "selector output has missing or extra keys"

    index = selected["selected_candidate_index"]
    # A refusal is valid only when every selection field is explicitly null.
    if index is None:
        if any(selected[key] is not None for key in _SHADOW_NULL_ON_REFUSAL):
            return None, "refusal contains non-null selection fields"
        reason = selected["refusal_reason"]
        if (not isinstance(reason, str) or not reason.strip()
                or len(reason) > 500):
            return None, "refusal reason is not a nonblank string"
        return None, reason.strip()
    # type() rather than isinstance(): bool is an int subclass, and an
    # adversarial int SUBCLASS must not satisfy a strict-native-type contract.
    if type(index) is not int:
        return None, "selector index is not an integer"
    if index < 0 or index > 100000 or index >= len(candidates):
        return None, "selector index is out of range"
    if selected["refusal_reason"] is not None:
        return None, "selection refusal_reason must be null"
    for key in ("n_ingredient", "n_control"):
        value = selected[key]
        if value is not None and (type(value) is not int or value < 1
                                   or value > 1_000_000):
            return None, f"selector {key} is not null or a positive integer"
    for key in _SHADOW_NUMERIC_KEYS:
        value = selected[key]
        try:
            finite = math.isfinite(value) if type(value) in (int, float) else False
            bounded = abs(value) <= 1_000_000_000_000 if finite else False
        except (OverflowError, TypeError):
            finite = bounded = False
        if not finite or not bounded:
            return None, f"selector {key} is not a finite native number"
    if any(selected[key] <= 0 for key in ("mean_ingredient", "mean_control",
                                           "sd_ingredient", "sd_control")):
        return None, "selector means and SDs must be positive"
    if selected["estimand"] not in ("endpoint", "change_from_baseline"):
        return None, "selector estimand is invalid"
    if (not isinstance(selected["timepoint"], str)
            or not selected["timepoint"].strip()
            or len(selected["timepoint"]) > 120):
        return None, "selector timepoint is invalid"
    if selected["design_kind"] != "parallel":
        return None, "selector design_kind is not parallel"
    provenance = selected["table_provenance"]
    if (not isinstance(provenance, dict)
            or set(provenance) != {"caption", "row", "column"}
            or any(not isinstance(provenance[key], str)
                   or not provenance[key].strip()
                   for key in ("caption", "row", "column"))
            or len(provenance["caption"]) > 500
            or len(provenance["row"]) > 500
            or len(provenance["column"]) > 1000):
        return None, "selector provenance has invalid shape"

    if index < 0 or index >= len(candidates):
        return None, "selector index is out of range"
    candidate = candidates[index]
    if not isinstance(candidate, dict):
        return None, "selected candidate is malformed"

    design_kind = s1.get("design_kind") if isinstance(s1, dict) else None
    if design_kind != "parallel":
        return None, "S1 design_kind is not explicit parallel"
    estimand = claim.get("estimand")
    timepoint = claim.get("timepoint")
    if estimand not in ("endpoint", "change_from_baseline"):
        return None, "claim estimand is absent or unsupported"
    if not isinstance(timepoint, str) or not timepoint.strip():
        return None, "claim timepoint is absent"
    from pipeline.effect_harvest import _term_matches as _harvest_term_matches
    outcome_term = str(candidate.get("outcome_term", "")).strip()
    claim_terms = [str(claim.get(key, "") or "").strip()
                   for key in ("outcome_raw", "measure")]
    # Mirror the harvester's matching contract exactly: word-bounded
    # containment or paren-stripped equality against the same claim terms the
    # candidates were harvested for.  Anything looser would let a selection
    # attach a different endpoint's numbers to this claim.
    if not any(term and _harvest_term_matches(outcome_term, term)
               for term in claim_terms):
        return None, "candidate outcome does not match claim terms"

    arms = candidate.get("arms")
    if not isinstance(arms, (list, tuple)) or len(arms) != 2:
        return None, "selected candidate does not have exactly two arms"
    by_alias = {a.get("arm_alias"): a for a in arms
                if isinstance(a, dict) and isinstance(a.get("arm_alias"), str)}
    if len(by_alias) != 2:
        return None, "selected candidate arm aliases are ambiguous"
    # Aliases are S3 labels, so role assignment is explicit and not positional.
    s3_facts = role_facts
    if not isinstance(s3_facts, dict):
        return None, "missing explicit arm alias facts"
    ingredient_label = s3_facts.get("ingredient")
    control_label = s3_facts.get("control")
    ingredient = by_alias.get(ingredient_label)
    control = by_alias.get(control_label)
    if ingredient is None or control is None or ingredient is control:
        return None, "candidate cannot be mapped to one ingredient and one control arm"

    def _number(value, *, positive=False):
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            return False
        try:
            finite = math.isfinite(value)
        except (OverflowError, TypeError):
            finite = False
        if not finite:
            return False
        return value > 0 if positive else True

    for arm in (ingredient, control):
        if arm.get("n") is not None and (
                not isinstance(arm.get("n"), int) or isinstance(arm.get("n"), bool)
                or arm.get("n") <= 0):
            return None, "candidate n is invalid"
        if not _number(arm.get("mean"), positive=True) or not _number(
                arm.get("sd"), positive=True):
            return None, "candidate mean or SD is invalid"

    expected = {
        "n_ingredient": ingredient.get("n"),
        "n_control": control.get("n"),
        "mean_ingredient": ingredient.get("mean"),
        "mean_control": control.get("mean"),
        "sd_ingredient": ingredient.get("sd"),
        "sd_control": control.get("sd"),
        "estimand": estimand,
        "timepoint": timepoint,
        "design_kind": design_kind,
        "table_provenance": {
            "caption": candidate.get("caption"),
            "row": (candidate.get("outcome_cell") or {}).get("cell_verbatim"),
            "column": f"{ingredient.get('column')} | {control.get('column')}",
        },
    }
    provenance = expected["table_provenance"]
    if not all(isinstance(provenance.get(k), str) and provenance[k]
               for k in ("caption", "row", "column")):
        return None, "candidate provenance is incomplete"
    for key, value in expected.items():
        if selected.get(key) != value:
            return None, f"selector field {key} disagrees with candidate"
    if selected.get("refusal_reason") is not None:
        return None, "selector returned a selection with refusal metadata"

    # Existing non-null facts are immutable.  This includes the two fields
    # below: selecting a table cannot silently change an S5-reported estimate.
    expected.update({"estimate_kind": "mean_difference",
                     "estimate_basis": "derived_from_arms"})
    for key, value in expected.items():
        if claim.get(key) is not None and claim.get(key) != value:
            return None, f"existing claim field {key} disagrees"
    return expected, None


def _shadow_enrich_claims(out: dict, record: dict, call) -> None:
    """Run the v13 selector after the normal per-study calls, never in prod."""
    from pipeline.effect_harvest import harvest_candidates

    s1 = out.get("S1") if isinstance(out.get("S1"), dict) else {}
    s3 = out.get("S3") if isinstance(out.get("S3"), dict) else {}
    aliases, alias_reason, selected_roles = _shadow_arm_aliases(
        s3, record.get("ingredient"))
    claims = ((out.get("S5") or {}).get("claims")) or []
    audit = {"enabled": True, "selector_calls": 0, "claims": []}
    try:
        # SHADOW-ONLY structured tables: colspan/rowspan-expanded with merged
        # multi-row headers (sources/fulltext.extract_tables_structured), so
        # arm columns survive layouts the flat S5 serialisation cannot carry.
        # _tables_text stays untouched for S5 payloads (LLM cache stability);
        # it remains the fallback when structured parsing yields nothing.
        tables = _tables_structured(record) or _tables_text(record)
    except Exception as exc:
        tables = []
        table_error = str(exc)
    else:
        table_error = None

    # This role map is retained only in local validation state.  It prevents
    # role assignment from candidate order.
    role_facts = None
    if aliases:
        # Derive roles from the same explicit boolean facts, never from alias
        # insertion order or candidate arm order.
        # Use the exact pair selected by _shadow_arm_aliases; rebuilding this
        # from the first non-control arm breaks when an ignored arm precedes the
        # ingredient-alone arm.
        role_facts = dict(selected_roles or {})
    for claim_index, claim in enumerate(claims):
        item = {"claim_index": claim_index, "candidate_count": 0}
        if not isinstance(claim, dict):
            item.update({"status": "refused", "reason": "claim is malformed"})
            audit["claims"].append(item)
            continue
        terms = [claim.get(key) for key in ("outcome_raw", "measure")
                 if isinstance(claim.get(key), str) and claim.get(key).strip()]
        try:
            candidates = harvest_candidates(tables, terms, aliases or {})
            candidate_dicts = [candidate.to_dict() for candidate in candidates]
        except Exception as exc:
            # A broken table parser is an audit failure, not a reason to lose
            # the ordinary S5 claim or skip S6 for this study.
            error = str(exc) or exc.__class__.__name__
            item.update({"status": "failed", "stage": "harvester",
                         "error": error})
            audit.setdefault("failures", []).append(
                {"claim_index": claim_index, "stage": "harvester", "error": error})
            audit["claims"].append(item)
            continue
        item["candidate_count"] = len(candidate_dicts)
        if not candidates or not aliases:
            item.update({"status": "refused", "reason": alias_reason
                         if not aliases else "no deterministic table candidates"})
            audit["claims"].append(item)
            continue
        payload = {"S5_CLAIM": dict(claim), "CANDIDATES": candidate_dicts,
                   "S1_DESIGN_FACTS": s1, "S3_ARM_FACTS": s3.get("arms") or []}
        audit["selector_calls"] += 1
        try:
            selected, meta = call("S5T", payload)
        except Exception as exc:
            # Selector failures are isolated to this claim.  Only an explicit
            # quota signal is promoted to the corpus retry convention.
            error = str(exc) or exc.__class__.__name__
            item.update({"status": "failed", "stage": "selector",
                         "error": error})
            audit.setdefault("failures", []).append(
                {"claim_index": claim_index, "stage": "selector", "error": error})
            if _quota_signal(error):
                out["_quota_exhausted"] = error
                out.setdefault("_failed", []).append(
                    {"agent": "S5T", "error": error})
            audit["claims"].append(item)
            continue
        item["selector_result"] = selected
        item["selector_meta"] = meta
        # A schema-valid envelope can still contain a null result.  That is a
        # selector/adapter failure, not an evidence refusal: retain its error
        # channel for audit and do not pretend the table was inspected.
        if selected is None:
            error = (meta.get("error") if isinstance(meta, dict) else None) or \
                    "selector returned no result"
            error = str(error)
            item.update({"status": "failed", "stage": "selector", "error": error})
            audit.setdefault("failures", []).append(
                {"claim_index": claim_index, "stage": "selector", "error": error})
            if _quota_signal(error):
                out["_quota_exhausted"] = error
                out.setdefault("_failed", []).append(
                    {"agent": "S5T", "error": error})
            audit["claims"].append(item)
            continue
        # Inspect ONLY the error channel. Stringifying the whole metadata
        # mapping classified benign fields ({"rate_limit_remaining": 100}) as
        # quota exhaustion, discarding a valid selector result and requeuing
        # the study forever (second runtime review, 2026-08-23).
        meta_error = meta.get("error") if isinstance(meta, dict) else None
        if meta_error is not None and _quota_signal(meta_error):
            error = str(meta_error) or "S5T quota limit"
            item.update({"status": "failed", "stage": "selector",
                         "error": error})
            audit.setdefault("failures", []).append(
                {"claim_index": claim_index, "stage": "selector", "error": error})
            out["_quota_exhausted"] = error
            out.setdefault("_failed", []).append(
                {"agent": "S5T", "error": error})
            audit["claims"].append(item)
            continue
        enriched, reason = _shadow_validate_selection(
            claim, candidate_dicts, selected, s1, role_facts)
        if enriched is None:
            item.update({"status": "refused", "reason": reason})
        else:
            claim.update(enriched)
            item["status"] = "enriched"
        audit["claims"].append(item)
    if alias_reason:
        audit["alias_refusal"] = alias_reason
    if table_error:
        audit["table_error"] = table_error
    out["_v13_shadow"] = audit
