# Shared agent instructions

`CLAUDE.md` is the canonical instruction and handoff file for every agent
(Claude Code, Codex, and any other AI working here). Do not create a separate
context or handoff trail. This file only adds what applies to agents other than
Claude Code.

Before changing this repository:

1. Read the entire root `CLAUDE.md` (rules and invariants).
2. Inspect the current branch, working tree and recent commits, so you continue
   existing work instead of replacing it.
3. Read `docs/METHOD.md` before changing anything that affects a grade, and
   `docs/DECISIONS.md` before proposing a constant or rule change.

**Branch first; `main` deploys.** Every push to `main` triggers a production
deploy (`IceFrosst/BS-PROOF` → Vercel `bs-proof-dashboard`). Work on a branch or
worktree, get the gates below green, then merge. In the same change as the code,
add a dated entry to `docs/history/project-log.md` (what changed, what you
verified, any handoff), and update any doc your change makes untrue. Update
`Current state` / `Next` in `CLAUDE.md` only if that snapshot changed.

## Ownership

**Claude Code owns every file; other agents are helpers.** You may write to any
path, and every change you make is verified by Claude Code afterwards
(`scripts/verify_helpers.py`), so:

1. Make each commit self-contained: one concern per commit.
2. Say in the commit body **what you changed and what you checked**.
3. Run the gates before committing.
4. **Never change a constant** (CLAUDE.md invariant 4: the GRADE rules, the
   letter table, the reviewer tolerances, the benchmark pass rule, the MCIDs).
   Propose it in `docs/DECISIONS.md`.

`.claude/` is Claude Code harness configuration, not shared instructions. Do not
read `.claude/agents/` as guidance for yourself and do not edit it.

## Gates

After any change to `pipeline/`, `sources/`, `bsproof/` or `vocab/`:

```bash
python3 -m pipeline.invariants    # structural: model boundary, offline imports, agent wiring
python3 -m pipeline.selftest      # deterministic checks, no model, no network
.venv/bin/python -m pytest -q tests/
```

After any change to the app (`app/`, `components/`, `lib/`, TS tests):

```bash
npm run typecheck && npm run lint && npm test && npm run build
```

Use `python3`, not `python` — bare `python` exists only inside `.venv`. The two
`pipeline.*` gates need no installed dependency; if one fails on a missing
module, that is a bug in the deterministic layer, not in your environment.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
