"""
Subscription-limit detection for the corpus loop. Moved verbatim out of
workers.py on 2026-10-03; bsproof.workers re-exports every name.
"""
from __future__ import annotations

import os
import re as _re

# Subscription-limit survival. The 2026-08-10 run lost 364 of 906 calls
# because a limit hit is FATAL per call (claude_adapter._FATAL: retrying a
# time-based limit is a wasted minute) but the CORPUS loop kept marching,
# recording every remaining study as failed. The right unit of retry is the
# STUDY, and the right response to a time-based limit is to WAIT: quota-hit
# studies are requeued and the run pauses QUOTA_WAIT_S between probes, up to
# QUOTA_MAX_WAIT_S of total waiting per run. Probing while still limited is
# nearly free -- the CLI fails fast with no tokens spent.
QUOTA_WAIT_S = int(os.environ.get("SP_QUOTA_WAIT_S", "900"))          # 15 min
QUOTA_MAX_WAIT_S = int(os.environ.get("SP_QUOTA_MAX_WAIT_S", "28800"))  # 8 h
_QUOTA_STRINGS = ("session limit", "usage limit", "rate limit", "rate_limit",
                  # Measured 2026-10-17: the subscription's WEEKLY ceiling reads
                  # "You've hit your weekly limit · resets 6am" with api_error
                  # "usage_limit_reached". Neither matched the strings above, so
                  # every call was retried 3x and the run never paused: ~900
                  # failed calls across all 154 studies of the v1.38 creatine run.
                  "weekly limit", "usage_limit")
_QUOTA_RE = _re.compile(r"\b(?:session|usage|rate|weekly|daily|monthly|hourly|\d+[ -]?hour)"
                        r"[ _-]?(?:limit|limited)\b")


def _quota_signal(value) -> bool:
    """Whether an adapter error is a subscription / rate limit: time-based, so
    retrying the call is useless and the run must pause. The ONE detector --
    claude_adapter._is_fatal and the corpus loop both use it."""
    text = str(value or "").lower()
    return any(marker in text for marker in _QUOTA_STRINGS) or bool(_QUOTA_RE.search(text))


def _hit_quota(extraction: dict) -> bool:
    """True when this study's failures include a subscription-limit hit."""
    if extraction.get("_quota_exhausted"):
        return True
    return any(_quota_signal(f.get("error")) for f in extraction.get("_failed") or [])
