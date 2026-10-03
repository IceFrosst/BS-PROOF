# Main-PC research worker — contract, install, health, rollback

Status (2026-10-03): **coded and locally tested only.** Nothing is installed or
running on the main PC, no token exists, and no job has been run. Keep runtime OFF
until the complete integration is reviewed and a human provisions it.

Files: `scripts/pc_research_worker.py` (loop, HTTP, leases, validation),
`pipeline/claude_research_adapter.py` (only model boundary),
`prompts/research_audit_live.md` (`live-research-v0.2`),
`schemas/research_audit.json` (unchanged strict audit validator),
`schemas/source_access_v2.json` (canonical V2 schema), `deploy/` (examples and
release script), and focused Python/TypeScript tests.

## What it does

Polls the website outbound over HTTPS, claims one job at a time, runs one audit
through the already logged-in Claude subscription CLI (model
`claude-sonnet-5-5`, `--effort xhigh`, `--safe-mode`, `WebSearch,WebFetch` only,
no API key), validates the audit and transient SourceAccessV2 evidence, and posts
it back. It computes no score and opens no listening socket. There is no runtime,
turn, token, or model-call cap and no API fallback.

The CLI binary is explicitly pinned: set `BS_PROOF_CLAUDE_BIN` to the absolute
executable `/home/icefrost/.local/bin/claude`; no PATH fallback is permitted.
The executable and displayed/init CLI version must be exactly 2.1.287. Run the
worker's `check` preflight before enabling a service; it performs no model call.
The CLI command is tool-restricted and does not add `--max-turns`, a token/budget
cap, or an API credential. Do not enable overage or change account settings.

## Wire contract

One endpoint, `POST {BS_PROOF_RESEARCH_API_BASE}/api/scan/research/worker/`, JSON,
`Authorization: Bearer $BS_PROOF_RESEARCH_WORKER_TOKEN`. Redirects are not followed.
`API_BASE` is an HTTPS origin (HTTP only to localhost in explicit tests).

| action | exact request body | accepted response |
|---|---|---|
| `claim` | `{"action":"claim"}` | `{"job":null}` or job with `id,lease_token,target,prompt_version` |
| `heartbeat` | `{"action":"heartbeat","job_id","lease_token"}` | any 2xx |
| `complete` | `{"action":"complete","job_id","lease_token","audit":{…},"source_access_v2":{…}}` | any 2xx |
| `fail` | `{"action":"fail","job_id","lease_token","code","message","retryable"}` | any 2xx |

Complete's entire UTF-8 JSON request is limited to 768 KiB (route ceiling 1 MiB
leaves headroom for server/SQL handling). Oversize reports are failed as
`source_report_too_large`; cited evidence and audit are never truncated. V2 is
transient validation input, never persisted. The worker's full diagnostic report
is private on its local disk and is never sent on either wire. Fail message is
sanitized to <=300 characters and has no nested error or `source_access` field.

`SourceAccessV2` records exact decoded WebSearch/WebFetch `tool_result` text,
its recomputed UTF-8 bytes and SHA-256, pinned runner metadata, event classes and
summary counters. It deliberately contains no URL/query/host, path, terminal,
quota, cost, or model-usage diagnostics. WebFetch results are model summaries,
not original papers; V2 has no original-document enum. Only snippet inventory
items with normalized IDs present in a content-bearing returned tool result are
accepted. ID matching does not prove study numbers or clinical validity. The
server stores the audit, owner-safe `SourceAccessSummaryV2` (summary, deduplicated
ID/evidence-class inventory and fixed limitations), and server-stamped
experimental provenance only. The owner GET never returns receipts or worker
diagnostics. Frozen SourceAccessV1 validation remains standalone only; live V2
completion never accepts V1.

A job with an old prompt version is explicitly failed as
`unsupported_prompt_version`, without running the CLI. Server SQL compare-and-set
on current unexpired lease remains authoritative. Heartbeats continue while a
job runs and while delivery retries. There is no retry-count cap; lease loss
stops the worker's stale delivery.

## Target and grounding

The server builds `ResearchJobV1` from the owner's saved scan. The worker accepts
only JSON data and preserves explicit numbers unchanged. `printed_elemental_per_serving_mg`
may be null or explicitly recorded at the top dose or active row; no unit
conversion or serving inference is performed. Unknown daily dose stays unknown,
blend component evidence is not blend efficacy, and prompt/scoring rules remain
unchanged. Prompt wording explicitly says that only snippets/model summaries are
available; it must not imply full-paper access or guessed study details.

## Local health check and operations

`python3 scripts/pc_research_worker.py check` performs local preflight only; it
requires executable absolute `BS_PROOF_CLAUDE_BIN=/home/icefrost/.local/bin/claude`,
CLI 2.1.287 and runtime dependencies. It does not claim a job or call a model.
`run` polls continuously; `run --once` claims at most one job.

`deploy/worker.env.example` is an example only. The dedicated worker token is the
only worker secret; never commit its real value. `deploy/bsproof-research-worker.service.example`
is not installed or enabled. `deploy/pc_research_worker_release.sh` can package
an isolated versioned runtime; build/install/start/provisioning are human-owned
operations and are not part of local validation. No account, network, service,
secret, or SQL provisioning was done in this phase.

Per-job worker diagnostics stay under a private unique directory at the configured
data path. The lease token is not written there. They may include raw stream and
operational details, so keep that directory private and out of owner-facing APIs.

## Residual limits

The stream's returned text is transient evidence only; grounding uses identifier
string matches and does not independently verify scientific claims. Research is
experimental/unvalidated and does not change score, clinical approval, or user
risk classification. There has been no actual model call or runtime deployment.
Review, provisioning and clinical validation remain separate human gates.

## Fixed validation gates (offline, no model)

- `npx vitest run tests/scan-research.test.ts tests/scan-research-v2.test.ts tests/scan-research-target-sql.test.ts tests/research-audit-schema.test.ts`
- `python3 -m unittest tests.test_pc_research_worker tests.test_source_access_v2`
- `npm run typecheck`
- `npx eslint <changed TypeScript files>`
- `python3 -m pipeline.invariants`
- `python3 -m pipeline.selftest`
- `git diff --check`

These tests use fake streams and fake HTTP queue clients only. They do not prove
model behavior, account state, provisioning, or clinical validity.

## Handoff

Runtime remains OFF pending the required independent security review and parent
approval. Do not provision accounts, tokens, services, or database objects from
this documentation without the separate human authorization step.
---
Previous local status note: the initial V1 worker had been exercised during an
earlier benchmark; that historical benchmark is not proof of this V2 integration.
No V2 live research run has been performed.

Output remains experimental and unvalidated.