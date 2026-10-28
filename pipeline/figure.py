"""
The figure route: numbers read off a figure by two readers (S5F, S5FR), kept
only when they agree. NO MODEL MAY ENTER THIS FILE.

Founder decision 2026-10-28 (Claude per the founder rule; docs/DECISIONS.md),
from the pilot of 2026-10-26 (scripts/experiments/figure_pilot.py, 19 panels
checked against numbers the same papers print): plotted means were read with a
median error of 0.7 % of the y-axis (0.03 SD); the error they put into a
between-arm SMD had a median of 0.01-0.04 and a 90th percentile of 0.15-0.17;
the two readers agreed within 2 % of the axis on 42 of 50 readings; individual
points could not be counted reliably. Hence:

  - plotted MEANS only, never individual points, never a percent change;
  - every value both readers report agrees within RULES["agree_axis_share"] of
    the y-axis range, or the claim is refused for human review (reader 1's
    value is kept on agreement, as for numbers; never averaged);
  - both readers name the same error-bar kind; an SD comes from it only when
    the caption says what the bars are (sd, se or ci95; se and ci95 go through
    the Cochrane conversion in effect_size); unstated bars give no SD;
  - the route `figure_means` ranks last (pool.ROUTE_RANK) and every outcome
    that uses it is also reported without it (evidence_v2 `sensitivity`).
"""
from __future__ import annotations

import re

# Founder constant (CLAUDE.md invariant 4), decided 2026-10-28: 2 % of the
# y-axis range kept 42 of 50 pilot readings (1 %: 37; 5 %: 46).
RULES = {"agree_axis_share": 0.02}

_STOP = {"the", "of", "and", "in", "at", "for", "test", "mean", "total", "score", "during",
         "with", "after", "before", "to", "kg", "cm", "w", "performance", "group", "groups",
         "data", "are"}
_NOT_RESULTS = re.compile(r"schematic|study design|experimental design|flow|consort|recruitment|"
                          r"protocol|timeline|overview|fluxogram|diagram|correlation|percent|%", re.I)


def pick_figure(claim: dict, figures: list[dict]) -> dict | None:
    """The figure whose caption names this claim's measure best: its
    abbreviation in parentheses, or at least half (and two) of its words.
    Design, flow, correlation and percent-change figures are never picked.
    None when no caption names it (counted, never guessed)."""
    name = claim.get("outcome_raw") or ""
    words = {w for w in re.findall(r"[a-z0-9]{2,}", name.lower()) if w not in _STOP}
    abbrevs = {a.lower() for a in re.findall(r"\(([A-Za-z0-9\-]{2,8})\)", name)}
    best, best_score = None, 0
    for fig in figures:
        cap = (fig.get("caption") or "").lower()
        if not cap or _NOT_RESULTS.search(cap):
            continue
        hits = sum(bool(re.search(rf"\b{re.escape(w)}\b", cap)) for w in words)
        score = hits + 2 * sum(bool(re.search(rf"\b{re.escape(a)}\b", cap)) for a in abbrevs)
        enough = any(re.search(rf"\b{re.escape(a)}\b", cap) for a in abbrevs) or (
            words and hits >= max(2, (len(words) + 1) // 2))
        if enough and score > best_score:
            best, best_score = fig, score
    return best


def _close(a, b, span: float) -> bool:
    return a is not None and b is not None and abs(a - b) <= RULES["agree_axis_share"] * span


def accept(claim: dict, r1: dict | None, r2: dict | None) -> tuple[dict | None, str]:
    """(verified numbers, "") from two agreeing readings, else (None, reason).
    The numbers use effect_size's own fields (mean_*, sd_* / se_* / ci_*,
    pre_*, arm_ci_level, estimand), so the effect is computed by the same
    code as for printed numbers."""
    if not r1 or not r2:
        return None, "figure: a reader returned nothing"
    if not (r1.get("panel_found") and r2.get("panel_found")):
        return None, "figure: the panel was not found"
    kind1, kind2 = r1.get("plotted_quantity"), r2.get("plotted_quantity")
    if kind1 != kind2:
        return None, "figure: readers disagree on what is plotted"
    if kind1 not in ("values_at_timepoints", "change_from_baseline"):
        return None, f"figure: plots {kind1 or 'an unstated quantity'}, not means or changes"
    if r1.get("error_bar") != r2.get("error_bar"):
        return None, "figure: readers disagree on what the error bars are"
    lo, hi = r1.get("y_axis_min"), r1.get("y_axis_max")
    if not isinstance(lo, (int, float)) or not isinstance(hi, (int, float)) or hi <= lo:
        return None, "figure: no readable y-axis"
    span = hi - lo
    read1 = {(v["arm"], v["timepoint"]): v for v in r1.get("readings") or []}
    read2 = {(v["arm"], v["timepoint"]): v for v in r2.get("readings") or []}
    arms = (claim.get("ingredient_arm"), claim.get("control_arm"))
    tp = claim.get("timepoint") or "end"
    out: dict = {}
    for side, arm in zip(("ingredient", "control"), arms):
        a, b = read1.get((arm, tp)) or {}, read2.get((arm, tp)) or {}
        if a.get("mean") is None or b.get("mean") is None:
            return None, "figure: an arm's mean was not read"
        if not _close(a["mean"], b["mean"], span):
            return None, "figure: readers disagree (more than 2 % of the axis)"
        out[f"mean_{side}"] = a["mean"]
        if kind1 == "values_at_timepoints":
            out[f"post_{side}"] = a["mean"]
            pa, pb = read1.get((arm, "baseline")) or {}, read2.get((arm, "baseline")) or {}
            if _close(pa.get("mean"), pb.get("mean"), span):
                out[f"pre_{side}"] = pa["mean"]
        bar = r1.get("error_bar")
        if bar in ("sd", "se", "ci95"):
            ta, tb = a.get("error_bar_top"), b.get("error_bar_top")
            if ta is None or tb is None or not _close(ta, tb, span):
                return None, "figure: readers disagree on an error bar"
            half = ta - a["mean"]
            if half <= 0:
                return None, "figure: an error bar has no upper half"
            if bar == "sd":
                out[f"sd_{side}"] = half
            elif bar == "se":
                out[f"se_{side}"] = half
            else:
                out[f"ci_{side}_low"], out[f"ci_{side}_high"] = a["mean"] - half, ta
    if r1.get("error_bar") == "ci95":
        out["arm_ci_level"] = 0.95
    if not any(k.startswith(("sd_", "se_", "ci_")) for k in out):
        return None, "figure: error bars unstated or absent, no SD"
    out["estimand"] = "endpoint" if kind1 == "values_at_timepoints" else "change_from_baseline"
    return out, ""
