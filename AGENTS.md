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
either of the other agents.

**Push completed, verified work straight to `main`** (founder, 2026-08-10). This
replaces the old "never push directly to `main` without confirmation" rule, which
was making agents open branches and then sit waiting — unpushed work is invisible
work, and three agents cannot coordinate on a tree they cannot see. "Verified"
means both gates below are green; that is the only gate on a push.

**Worktree-first workflow** (founder, 2026-08-12): changes are made in a working
tree/worktree first and only pushed to `main` later, once verified. Since
`IceFrosst/BS-PROOF` is connected to the `bs-proof-dashboard` Vercel project,
**every push to `main` triggers a production deploy** — so do not push
half-done or unverified work to `main`. Iterate locally (or on a branch), get
both gates green, then push.

## Ownership (changed 2026-08-10)

**Claude Code owns every file. Grok and Codex are helpers.** You may write to any
path — no permission needed, no ownership table to consult. In exchange, every
change you make is **verified by Claude Code afterwards**, so:

1. Make your commit self-contained and reviewable. One concern per commit.
2. Say in the commit body **what you changed and what you checked**. That is the
   input to the verification pass; "misc fixes" makes it worthless.
3. Run both gates before committing (see below). A helper commit that fails them
   costs the owner a debugging session to attribute.
4. **Never change a constant** — `k`, transfer factors, RoB thresholds, `S_VALUE`,
   `H_PENALTY`, `H_NORM`, the OA penalty. Propose it in `docs/REVIEW_PENDING.md`.
   Invariant 4, and sole ownership does not move that decision to Claude either.
5. **Grok model ids**: run `grok models` and verify before setting one. `grok-4.3`
   is not a valid CLI id and setting it failed S8 0/80 on the 2026-08-07 run.

`.claude/` is Claude Code harness configuration, not shared instructions. Do not
read `.claude/agents/` as guidance for yourself and do not edit it.

After any change to `pipeline/`, run both of these and keep them green. That is
non-negotiable.

```bash
python3 -m pipeline.invariants    # structural: model boundary, offline imports, agent wiring
python3 -m pipeline.selftest      # 433 checks, no model, no network, ~0.5s
```

Use `python3`, not `python` — bare `python` exists only inside `.venv`. Neither
command needs a dependency installed; if either fails on a missing module that is
a bug in the deterministic layer, not in your environment (see
`pipeline.invariants.dependency_problems`).

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
