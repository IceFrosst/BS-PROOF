# Experiments

One-off measurements that justified a scoring or extraction decision. They are
kept because code comments and `docs/SPEC.md` cite them as the evidence for a
constant or a rule; re-run one to re-check that decision. Nothing in the
pipeline or the app imports them.

All but `s7_mass_experiment.py` are offline replays with zero model calls:
`python3 scripts/experiments/<name>.py [extractions_dump.json]`.

| script | question | decision it backs |
|---|---|---|
| `magnitude_investigation.py` | Is the score's compression (all-trivial benefits capped at 30) our extraction bug or the literature's? | Led to the vote-counting finding below (SPEC §13 "Anchor magnitude cap") |
| `vote_counting_investigation.py` | Is the null share an extraction defect or an aggregation defect? | Answer: aggregation (vote counting). Backs `SCORING_MODEL` v8 effect-size scoring (`pipeline/scoring.py`, SPEC §13) |
| `effect_size_experiment.py` | What does effect-size `s_value` do to the creatine corpus; how sensitive is it to `EFFECT_MID_SMD`/`EFFECT_FULL_SMD`? | v8; arm E is the control proving the scale must be centred on the meaningful threshold, not zero |
| `penalty_experiment.py` | What if the negative penalties came out of the score? | `S_VALUE["null_effect"]` −0.7 → −0.35 (founder, 2026-08-11). Partly superseded by v8 — read its header |
| `form_experiment.py` | Which form-ladder aggregation width? | `FORM_LADDER_TOP = 3` (`pipeline/arcs.py`; pinned by a selftest check) |
| `poolability.py` | Evidence method v2 Phase 1a: how many creatine trials carry numbers a meta-analysis can pool — as extracted now, and as present in the papers? | Phase 1a result: 93% of PMC full texts report arm-level numbers or CIs; only 5–27% of trials per outcome are poolable from current extractions (`docs/history/2026-10-03-phase1-measurements.md`). No model calls |
| `extraction_stability.py` | Phase 1b: does extracting the same studies twice give the same facts and scores? | Pending the 25-study run. **Makes live Claude calls** (~500) — run solo |
| `s7_mass_experiment.py` | Does the v1.27/v1.28 S7 prompt recover per-arm body mass without moving other fields? | `PROMPT_VERSION` v1.28 (recovered mass on 15/32, 0 failures). **Makes live Claude calls** — run with `.venv/bin/python`, solo; its `_arm_drift` guard is unit-tested in `tests/test_s7_mass_experiment.py` |
