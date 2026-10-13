"""BS-PROOF extraction layer: the model adapters and the per-study workers.

Everything here MAY call a model (through the three adapters, the only model
boundaries on the Python side -- CLAUDE.md invariant 1). `pipeline/` and
`sources/` may never import from this package; `python3 -m pipeline.invariants`
enforces that. The entry point (run_pipeline.py) stays at the repo root.
"""
