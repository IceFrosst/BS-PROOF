"""
Report stage: label the run and write the immutable report artifacts.
"""
from __future__ import annotations

import time


def finish(opts, outcome_allowlist, run_context, run_started: float) -> None:
    # Wiring is synthetic and never a claim, so it stays out of reports/runs/.
    if opts.wiring:
        return
    mode = "claude"
    if opts.full_text_only:
        mode += "-ft"
    if outcome_allowlist:
        mode += f"-top{len(outcome_allowlist)}"
    mode += f"-{opts.scope[:5]}"
    run_context["mode"] = mode
    run_context["provider"] = "claude"
    run_context["wall_time_s"] = round(time.monotonic() - run_started, 4)
    try:
        from scripts.auto_report_push import write_report, git_push_reports
        write_report(opts.ingredient, opts.form, mode, run_context=run_context)
        git_push_reports()
    except Exception as e:
        print(f"Auto-report/push failed: {e}")
