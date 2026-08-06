"""
ClinicalTrials.gov API v2. NO MODEL MAY ENTER THIS FILE.

Two things live here that nothing else can supply:

  RoB items 3 and 4 -- the two most informative items in the 6-item proxy, and
  the only two that need a registry. Item 3 (prospective registration) is a DATE
  COMPARISON and is computed here in code, not asked of a model. Item 4 (outcome
  switching) needs construct comparison, so this module supplies the registered
  primary outcomes and S4 does the judging.

  The unpublished-trial flag -- a completed trial with no results is evidence of
  publication bias in the corpus. It is SHOWN, NEVER SCORED (SPEC section 12):
  it says something about the literature, not about this product.

ct.gov also carries structured participant flow, which answers RoB item 5 for
studies whose paper is paywalled. That is the "methods facts without the paper"
reframe in SPEC section 4, item 2.
"""
from __future__ import annotations
from datetime import date

from sources.http import get_json, SourceError

API = "https://clinicaltrials.gov/api/v2/studies"


def fetch(nct_id: str) -> dict | None:
    """
    One registry record, or None if the trial genuinely is not registered.

    Only a 404 becomes None. Every other failure -- 403, a timeout, a blocked
    host -- is RAISED. "The registry says no such trial" and "we could not reach
    the registry" are different facts, and collapsing them would silently strip
    RoB items 3 and 4 off every study in a run while looking like a clean pass.
    """
    try:
        return get_json(f"{API}/{nct_id.upper()}", {"format": "json"})
    except SourceError as e:
        if e.status == 404:
            return None
        raise


def _section(rec: dict, *path):
    node = rec
    for p in path:
        if not isinstance(node, dict):
            return None
        node = node.get(p)
    return node


def _parse_date(s: str | None) -> date | None:
    """ct.gov dates are YYYY-MM-DD or YYYY-MM. Never guess a missing precision."""
    if not s:
        return None
    parts = s.split("-")
    try:
        if len(parts) == 3:
            return date(int(parts[0]), int(parts[1]), int(parts[2]))
        if len(parts) == 2:
            # Month precision: use the first of the month. This can only make a
            # registration look EARLIER, i.e. it biases item 3 toward 1. Where
            # that matters -- the two dates in the same month -- return None
            # instead. See item3_prospective_registration.
            return date(int(parts[0]), int(parts[1]), 1)
    except ValueError:
        return None
    return None


def item3_prospective_registration(rec: dict) -> tuple[int | None, str]:
    """
    RoB item 3, computed deterministically. Returns (1 | 0 | None, reason).

    1 = registered before the first enrolment. 0 = registered after.
    None = a date is missing, or both dates are month-precision in the same
    month, where the answer would depend on a day we do not have. S4's prompt
    says "if you have an ID but no dates, null -- do not assume", and this
    honours the same rule in code.
    """
    reg_raw = _section(rec, "protocolSection", "statusModule", "studyFirstSubmitDate")
    start_raw = _section(rec, "protocolSection", "statusModule", "startDateStruct", "date")
    reg, start = _parse_date(reg_raw), _parse_date(start_raw)
    if not reg or not start:
        return None, f"missing date (registered={reg_raw}, start={start_raw})"
    if len(str(start_raw).split("-")) == 2 and reg.year == start.year and reg.month == start.month:
        return None, "both month-precision in the same month; day unknown"
    return (1 if reg <= start else 0), f"registered {reg}, enrolment start {start}"


def registered_primary_outcomes(rec: dict) -> list[dict]:
    """
    What the trial SAID it would measure, for S4 item 4. Outcome switching is
    invisible without this -- the paper alone always looks internally consistent.
    """
    outs = _section(rec, "protocolSection", "outcomesModule", "primaryOutcomes") or []
    return [{"measure": o.get("measure"), "time_frame": o.get("timeFrame"),
             "description": o.get("description")} for o in outs]


def attrition(rec: dict) -> dict:
    """
    Structured participant flow, for RoB item 5 when the paper is unreadable.
    All-null when the trial posted no results -- which is itself informative.
    """
    periods = _section(rec, "resultsSection", "participantFlowModule", "periods") or []
    started = completed = None
    for p in periods:
        for m in p.get("milestones", []):
            total = sum(int(a.get("numSubjects") or 0) for a in m.get("achievements", [])
                        if str(a.get("numSubjects") or "").isdigit())
            if m.get("type") == "STARTED" and started is None:
                started = total
            elif m.get("type") == "COMPLETED" and completed is None:
                completed = total
    dropout = None
    if started and completed is not None and started > 0:
        dropout = round((started - completed) / started, 3)
    return {"n_started": started, "n_completed": completed, "dropout_rate": dropout,
            "per_arm_available": bool(periods)}


def design_facts(rec: dict) -> dict:
    """Structured design fields. Feeds S4 items 1-2 as evidence, never as a verdict."""
    d = _section(rec, "protocolSection", "designModule") or {}
    info = d.get("designInfo") or {}
    return {
        "allocation": info.get("allocation"),
        "masking": (info.get("maskingInfo") or {}).get("masking"),
        "who_masked": (info.get("maskingInfo") or {}).get("whoMasked") or [],
        "primary_purpose": info.get("primaryPurpose"),
        "n_enrolled": (d.get("enrollmentInfo") or {}).get("count"),
        "enrollment_type": (d.get("enrollmentInfo") or {}).get("type"),
    }


def unpublished_flag(rec: dict, *, years_overdue: int = 2,
                     today: date | None = None) -> dict:
    """
    Completed long ago, no posted results, no result publication.

    SHOWN, NEVER SCORED. This is a property of the evidence base, not of the
    product, and scoring it would double-count publication bias that the null
    handling already addresses.
    """
    today = today or date.today()
    status = _section(rec, "protocolSection", "statusModule", "overallStatus")
    completion = _parse_date(_section(rec, "protocolSection", "statusModule",
                                      "completionDateStruct", "date"))
    has_results = bool(rec.get("hasResults"))
    refs = _section(rec, "protocolSection", "referencesModule", "references") or []
    has_result_pub = any(r.get("type") == "RESULT" for r in refs)

    overdue = bool(completion and (today - completion).days > years_overdue * 365)
    return {
        "flagged": bool(status == "COMPLETED" and overdue
                        and not has_results and not has_result_pub),
        "status": status,
        "completion_date": completion.isoformat() if completion else None,
        "has_posted_results": has_results,
        "has_result_publication": has_result_pub,
    }


def facts_for(nct_id: str) -> dict | None:
    """
    Everything this registry can tell the pipeline about one trial.
    None when the record does not exist -- callers must not substitute defaults.
    """
    rec = fetch(nct_id)
    if not rec:
        return None
    item3, reason = item3_prospective_registration(rec)
    return {
        "nct_id": nct_id.upper(),
        "item3_prospective_registration": item3,
        "item3_reason": reason,
        "registered_primary_outcomes": registered_primary_outcomes(rec),
        "attrition": attrition(rec),
        "design": design_facts(rec),
        "unpublished": unpublished_flag(rec),
    }
