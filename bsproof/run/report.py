"""
Report stage: label the run by the backend that produced it and write the
immutable report + dashboard artifact. Moved out of run_pipeline.py on 2026-10-03.
"""
from __future__ import annotations

import time

def _auto_push_report(ingredient: str, form: str, mode: str,
                      run_context: dict | None = None) -> None:
    try:
        from scripts.auto_report_push import write_report, git_push_reports
        write_report(ingredient, form, mode, run_context=run_context)
        git_push_reports()
    except Exception as e:
        print(f"Auto-report/push failed: {e}")



def finish(opts, outcome_allowlist, run_context, run_started: float) -> None:
    ingredient, form, scope = opts.ingredient, opts.form, opts.scope
    grok, demo, with_sr = opts.grok, opts.demo, opts.with_sr
    full_text_only, wiring = opts.full_text_only, opts.wiring
    # The label is the BACKEND that produced the numbers. It was hardcoded to
    # "grok" for every run, and only --grok and --pilot wrote a report at all --
    # so the production path, the one backend allowed to back a public claim,
    # silently produced no report. Invariant 9 requires the provider on every
    # report; a run labelled by the wrong backend is worse than an unlabelled
    # one, because it invites exactly the cross-provider comparison that
    # invariant forbids. Fixed 2026-08-09.
    mode = "grok" if grok else "claude"
    if demo:
        mode += "-demo"
    if with_sr:
        mode += "-sr"
    if full_text_only:
        mode += "-ft"
    if outcome_allowlist:
        mode += f"-top{len(outcome_allowlist)}"
    mode += f"-{scope[:5]}"
    # Wiring is synthetic and never a claim, so it stays out of reports/runs/.
    if not wiring:
        run_context["mode"] = mode
        run_context["provider"] = (
            "grok" if grok else "claude"
        )
        run_context["wall_time_s"] = round(time.monotonic() - run_started, 4)
        _auto_push_report(ingredient, form, mode, run_context=run_context)
