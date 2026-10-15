"""Shared imports and helpers for the selftest groups."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
from pipeline.dedup import dedup, canonical_id, registry_id  # noqa: E402,F401
from pipeline import vocab  # noqa: E402,F401


def _reasonless_probe(_inv):
    """Temporarily plant an empty-reason exception and confirm it is reported.

    Restores the real allowlist on the way out. Without this the 'reason
    required' rule is untested and an entry could be added with '' forever.
    """
    real = dict(_inv.IMPORT_EXCEPTIONS)
    try:
        _inv.IMPORT_EXCEPTIONS[("pipeline/selftest/extraction.py", "claude_adapter")] = ""
        return _inv.exception_problems()
    finally:
        _inv.IMPORT_EXCEPTIONS.clear()
        _inv.IMPORT_EXCEPTIONS.update(real)
