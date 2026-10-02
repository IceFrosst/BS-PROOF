"""Shared fixtures and imports for the selftest groups."""
import sys, os, pathlib
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
from pipeline.scoring import (Study, score_ecu, band_for, S_VALUE,
                             standardise_effect)
from pipeline.dedup import dedup, canonical_id, registry_id
from pipeline import vocab

ROB_CLEAN = {f"i{i}": 1 for i in range(1, 7)}
def rcts(n, **kw):
    base = dict(design_rank=4, n=120, rob_items=ROB_CLEAN, funding="independent",
                oa="full_text", form_match="exact", dose_match="in_band",
                pop_match="exact", direction="benefit", magnitude="meaningful")
    base.update(kw)
    return [Study(id=f"p{i}", **base) for i in range(n)]



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
