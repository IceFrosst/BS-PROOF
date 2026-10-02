"""BS-PROOF extraction layer: the model adapters and the per-study workers.

Everything here MAY call a model (through the three adapters, the only model
boundaries on the Python side -- CLAUDE.md invariant 1). `pipeline/` and
`sources/` may never import from this package; `python3 -m pipeline.invariants`
enforces that. Entry points (run_pipeline.py, run_sr_inheritance.py,
run_coverage.py) stay at the repo root.
"""
