"""
Span check: is every number the extractor reported actually printed in the
paper? NO MODEL MAY ENTER THIS FILE.

Evidence method v2 (docs/EVIDENCE_METHOD.md §3 stage 3): a model may only COPY
numbers. This module verifies each numeric field of an S5 claim against what it
was copied from and REFUSES (never repairs) anything it cannot find:

  span     the claim's own `evidence_span` quote
  table    the row of the paper table named by the claim's `table_provenance`
           (caption + row label, matched after whitespace/case normalisation)
  s3_arm   an arm size (n) only: the S3 arm record with the same label as the
           claim's ingredient_arm / control_arm (S3 carries its own quote)

A number is "printed" when a token in the source equals it at the token's own
printed precision (12.30 matches 12.3; 0.5 matches .5; a Unicode minus is a
minus). When only the magnitude is printed ("decreased by 3.2" for -3.2) the
match is accepted as `abs` and flagged, because the sign then came from words.

Refusal is the safe direction: an unverified number makes an effect size
unavailable (pipeline/effect_size.py), it never becomes a guessed one.
"""
from __future__ import annotations

import math
import re

# Numeric S5 claim fields a meta-analysis can consume.
NUMERIC_FIELDS = ("effect_size", "ci_low", "ci_high", "p_value", "standard_error", "effect_sd",
                  "mean_ingredient", "mean_control", "sd_ingredient", "sd_control",
                  "n_ingredient", "n_control",
                  # per-arm SE / CI of the mean (S5N), for the derived-SD route
                  "se_ingredient", "se_control", "ci_ingredient_low", "ci_ingredient_high",
                  "ci_control_low", "ci_control_high",
                  # per-arm baseline / post values (S5N), for the consistency guard
                  "pre_ingredient", "post_ingredient", "pre_control", "post_control")
_N_FIELDS = {"n_ingredient": "ingredient_arm", "n_control": "control_arm"}

# A number token: optional sign (ASCII or Unicode minus / en dash used as minus),
# digits with optional thousands separators, optional decimals; or a bare
# leading-dot decimal (".006").
_TOKEN = re.compile(r"(?<![\w.])([-−–]?)(\d{1,3}(?:,\d{3})+|\d+)?(?:[.·](\d+))?(?![\w])")


def _tokens(text: str) -> list[tuple[float, int, bool]]:
    """(value, decimals, has_sign) for every number printed in `text`."""
    out = []
    for m in _TOKEN.finditer(text or ""):
        sign, whole, frac = m.group(1), m.group(2), m.group(3)
        if whole is None and frac is None:
            continue
        if whole and whole.startswith("0,") and not frac:
            # "0,001" is a decimal comma (0.001), never one thousand: no number
            # is written with a leading zero before a thousands separator.
            whole, frac = "0", whole[2:]
        whole_digits = (whole or "0").replace(",", "")
        try:
            value = float(f"{whole_digits}.{frac}" if frac else whole_digits)
        except ValueError:
            continue
        if sign:
            value = -value
        out.append((value, len(frac) if frac else 0, bool(sign)))
    return out


def _printed_equal(value: float, token: float, decimals: int) -> bool:
    """`value` rounds to `token` at the token's printed precision."""
    tolerance = 0.5 * 10 ** (-decimals) + 1e-12
    return abs(value - token) <= tolerance


def find_number(value: float, text: str) -> str | None:
    """'exact' if `value` is printed in `text` with its sign, 'abs' if only its
    magnitude is, else None."""
    if value is None or not isinstance(value, (int, float)) or isinstance(value, bool) \
            or not math.isfinite(value):
        return None
    toks = _tokens(text)
    if any(_printed_equal(value, t, d) for t, d, _ in toks):
        return "exact"
    if value < 0 and any(_printed_equal(-value, t, d) for t, d, signed in toks if not signed):
        return "abs"
    return None


def _norm(text) -> str:
    return re.sub(r"\s+", " ", str(text or "")).strip().lower()


def _caption_key(text) -> str:
    """Captions are matched on letters and digits only: the model's verbatim copy
    and the parsed caption differ in dashes, spacing and punctuation."""
    return " ".join(re.findall(r"[a-z0-9]+", str(text or "").lower()))


def table_rows(provenance: dict | None, tables: list[dict] | None) -> list[list[str]]:
    """Every row of the cited table carrying the cited row label. Tables that
    put each ARM in its own row repeat the label ("SJ (cm) | CrM | ...",
    "SJ (cm) | CON | ..."), so there can be several."""
    if not isinstance(provenance, dict) or not tables:
        return []
    caption, row_label = _caption_key(provenance.get("caption")), _norm(provenance.get("row"))
    if not row_label:
        return []
    for table in tables:
        if not isinstance(table, dict):
            continue
        tcap = _caption_key(table.get("caption"))
        if caption and caption not in tcap and tcap not in caption:
            continue
        rows = [[str(c) for c in row] for row in table.get("rows") or []
                if any(_norm(c) == row_label for c in row)]
        if rows:
            return rows
    return []


_ARM_OF_FIELD = {"mean_ingredient": "ingredient_arm", "sd_ingredient": "ingredient_arm",
                 "n_ingredient": "ingredient_arm", "mean_control": "control_arm",
                 "sd_control": "control_arm", "n_control": "control_arm",
                 "se_ingredient": "ingredient_arm", "ci_ingredient_low": "ingredient_arm",
                 "ci_ingredient_high": "ingredient_arm", "se_control": "control_arm",
                 "ci_control_low": "control_arm", "ci_control_high": "control_arm",
                 "pre_ingredient": "ingredient_arm", "post_ingredient": "ingredient_arm",
                 "pre_control": "control_arm", "post_control": "control_arm"}


def _row_text_for(field: str, claim: dict, rows: list[list[str]]) -> str | None:
    """The table text a field may be verified against. An arm-specific field in
    an arm-per-row table is checked ONLY against its own arm's row, so a control
    value can never be "verified" by the ingredient row (or vice versa)."""
    if not rows:
        return None
    arm = _norm(claim.get(_ARM_OF_FIELD.get(field, ""), ""))
    if arm:
        own = [r for r in rows if any(_norm(c) == arm for c in r)]
        if own:
            return " | ".join(own[0]) if len(own) == 1 else None
        if any(any(_norm(c) == _norm(claim.get(k)) for c in r)
               for r in rows for k in ("ingredient_arm", "control_arm") if claim.get(k)):
            return None  # arm-per-row table, but this arm's row is absent
    return " | ".join(" | ".join(r) for r in rows)


def _s3_arm_n(claim: dict, field: str, s3_arms: list[dict] | None) -> int | None:
    label = _norm(claim.get(_N_FIELDS[field]))
    if not label:
        return None
    matches = [a for a in s3_arms or [] if isinstance(a, dict) and _norm(a.get("label")) == label]
    if len(matches) != 1:
        return None
    n = matches[0].get("n")
    return n if isinstance(n, int) and not isinstance(n, bool) and n > 0 else None


def verify_claim_numbers(claim: dict, *, tables: list[dict] | None = None,
                         s3_arms: list[dict] | None = None) -> dict:
    """Verify every numeric field present on one S5 claim.

    Returns {"verified": {field: value}, "source": {field: "span"|"table"|"s3_arm"},
             "abs_only": [fields matched by magnitude only], "rejected": {field: reason}}.
    """
    span = claim.get("evidence_span") or ""
    rows = table_rows(claim.get("table_provenance"), tables)
    verified, source, rejected, abs_only = {}, {}, {}, []
    for field in NUMERIC_FIELDS:
        value = claim.get(field)
        if value is None:
            continue
        if field == "p_value" and claim.get("p_value_kind") not in (None, "exact"):
            # A bounded or "not significant" p is not an exact number; it is
            # never used to derive a standard error.
            rejected[field] = f"p is {claim.get('p_value_kind')}, not exact"
            continue
        hit, where = find_number(value, span), "span"
        row = _row_text_for(field, claim, rows)
        if hit is None and row is not None:
            hit, where = find_number(value, row), "table"
        if hit is None and field in _N_FIELDS and _s3_arm_n(claim, field, s3_arms) == value:
            hit, where = "exact", "s3_arm"
        if hit is None:
            rejected[field] = ("not printed in the quoted span or the cited table row"
                               if claim.get("table_provenance") else "not printed in the quoted span")
            continue
        verified[field], source[field] = value, where
        if hit == "abs":
            abs_only.append(field)
    return {"verified": verified, "source": source, "abs_only": abs_only, "rejected": rejected}
