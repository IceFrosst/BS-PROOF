"""
Deterministic study-design classification. NO MODEL MAY ENTER THIS FILE.

PubMed's own publicationType and MeSH tags settle the design for most records.
Those tags are curated by humans at indexing time, so trusting them is both
cheaper and more reproducible than asking a model to re-derive what a librarian
already decided.

S1 exists only for what is left over. `classify()` returns `needs_model=True`
rather than picking a rank it cannot justify -- an unjustified rank is worse
than an unresolved one, because design weight is the single largest term in
w_study (rank 4 = 1.00, rank 12 = 0.004, a 250x spread).

Ranks are SPEC section 7 / prompts/s1_design.md. The two files must agree.
"""
from __future__ import annotations

RANK_LABEL = {
    1: "umbrella review", 2: "systematic review with meta-analysis",
    3: "systematic review", 4: "randomised controlled trial",
    5: "non-randomised controlled trial", 6: "prospective cohort",
    7: "retrospective cohort", 8: "case-control", 9: "cross-sectional",
    10: "case series", 11: "case report", 12: "animal study",
    13: "in vitro study", 14: "expert opinion / narrative review",
}

SYNTHESIS_RANKS = frozenset({1, 2, 3})


def _low(items) -> list[str]:
    return [str(i).lower().strip() for i in (items or [])]


def classify(rec: dict) -> dict:
    """
    rec: a normalised source record (see sources/europepmc.normalise).

    Returns {design_rank, design_label, needs_model, basis}. `design_rank` is
    None exactly when needs_model is True.

    Rules are applied in the order given in prompts/s1_design.md, because the
    order is load-bearing: non-human subjects override design quality, so a
    randomised blinded placebo-controlled rat study is rank 12, not rank 4.
    """
    types = _low(rec.get("pub_types"))
    mesh = _low(rec.get("mesh_terms"))
    title = (rec.get("title") or "").lower()
    blob = " ".join(types)

    def has_type(*needles):
        return any(n in t for t in types for n in needles)

    def has_mesh(*needles):
        return any(n in m for m in mesh for n in needles)

    # --- 1. Non-human subjects override everything else. -------------------
    # MeSH indexes "Animals" and "Humans" separately; animal-only means no
    # "Humans" tag. Absence of both tags is NOT evidence of anything.
    if mesh:
        animal = has_mesh("animals") and not has_mesh("humans")
        if animal:
            return _out(12, "mesh: Animals without Humans")
        if has_mesh("in vitro techniques") and not has_mesh("humans"):
            return _out(13, "mesh: In Vitro Techniques without Humans")

    # --- 2. Publication types that are decisive on their own. ---------------
    if "umbrella review" in title or "overview of reviews" in title:
        return _out(1, "title: umbrella review")

    if has_type("meta-analysis"):
        # "Systematic Review" + "Meta-Analysis" and bare "Meta-Analysis" are both
        # rank 2; a meta-analysis without a systematic search is still pooled
        # primary data, which is what the rank encodes.
        return _out(2, f"pubType: {blob}")
    if has_type("systematic review"):
        return _out(3, "pubType: Systematic Review")

    if has_type("randomized controlled trial", "randomised controlled trial"):
        return _out(4, "pubType: Randomized Controlled Trial")

    if has_type("controlled clinical trial"):
        return _out(5, "pubType: Controlled Clinical Trial")

    if has_type("case reports"):
        return _out(11, "pubType: Case Reports")

    # Opinion-shaped types are rank 14 whatever the title claims.
    if has_type("editorial", "comment", "letter", "news", "newspaper article",
                "published erratum", "retraction of publication"):
        return _out(14, f"pubType: {blob}")

    # --- 3. Observational designs come from MeSH, not publication type. -----
    if has_mesh("case-control studies"):
        return _out(8, "mesh: Case-Control Studies")
    if has_mesh("cross-sectional studies"):
        return _out(9, "mesh: Cross-Sectional Studies")
    if has_mesh("prospective studies") or has_mesh("cohort studies") and has_mesh("follow-up studies"):
        return _out(6, "mesh: Prospective/Cohort Studies")
    if has_mesh("retrospective studies"):
        return _out(7, "mesh: Retrospective Studies")

    # --- 4. Ambiguous. This is S1's entire job. -----------------------------
    # A bare "Clinical Trial" tag does NOT say whether allocation was random,
    # and that distinction is a 1.00 vs 0.55 weight. Never assume it.
    reason = "no decisive tag"
    if has_type("clinical trial"):
        reason = "pubType 'Clinical Trial' does not state whether allocation was randomised"
    elif has_type("review"):
        reason = "'Review' without a stated search strategy is rank 3 or rank 14"
    elif not types and not mesh:
        reason = "record carries no publication types or MeSH terms"
    return {"design_rank": None, "design_label": None,
            "needs_model": True, "basis": reason}


def _out(rank: int, basis: str) -> dict:
    return {"design_rank": rank, "design_label": RANK_LABEL[rank],
            "needs_model": False, "basis": basis}


def classify_all(records: list[dict]) -> tuple[list[dict], dict]:
    """
    Classify a corpus. Returns (records with classification merged in, stats).

    The stats matter operationally: `needs_model` is the S1 call volume for this
    ingredient, and the SPEC claim is that deterministic tags settle ~85-90%.
    If that fraction drops, the query is pulling in badly-indexed records and
    the fix is upstream, not a bigger model budget.
    """
    out, counts = [], {"total": 0, "needs_model": 0, "by_rank": {}}
    for rec in records:
        c = classify(rec)
        merged = {**rec, **c}
        out.append(merged)
        counts["total"] += 1
        if c["needs_model"]:
            counts["needs_model"] += 1
        else:
            k = c["design_rank"]
            counts["by_rank"][k] = counts["by_rank"].get(k, 0) + 1
    counts["deterministic_pct"] = (
        round(100 * (counts["total"] - counts["needs_model"]) / counts["total"], 1)
        if counts["total"] else 0.0)
    return out, counts
