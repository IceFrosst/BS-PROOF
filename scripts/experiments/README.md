# Experiments

Measurements that back a decision, re-runnable to re-check it. Nothing in the
pipeline or the app imports them. The v14 experiments (vote counting, effect
size scale, null penalty, form ladder, S7 body mass) were removed with v14 on
2026-10-15; they are in `git show v14-final:scripts/experiments/` and summarised
in `docs/history/v14-scoring-model.md`.

| script | question |
|---|---|
| `extraction_stability.py` | Does extracting the same studies twice give the same facts and the same v2 grades? **Makes live Claude calls** (~350 for 25 studies x 2) -- run solo with `.venv/bin/python` |
| `spot_audit.py` | Are the facts behind the pooled effects right? Samples 20 pooled effects (fixed seed) from a run artifact into a checklist to check against the papers. Offline |
