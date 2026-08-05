# Shared agent instructions

`CLAUDE.md` is the canonical instruction and handoff file for Claude Code, Grok,
and Codex. Do not create a separate Codex context or handoff trail.

Before changing this repository:

1. Read the entire root `CLAUDE.md`.
2. Inspect the current branch, working tree, and recent commits so you continue
   existing work instead of replacing it.
3. Read `docs/SPEC.md` before changing scoring, transfer factors, or any constant.

Follow the multi-agent workflow in root `CLAUDE.md`. In the same change as the
code, update `Current state` and `Next` (including the shared `Handoff:` line
when work is in flight). Leave every pushed commit as a clean resume point for
either of the other agents, and never push directly to `main` without
confirmation.

After any change to `pipeline/`, run `python -m pipeline.selftest` and keep it
green. That is non-negotiable.
