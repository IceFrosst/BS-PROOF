# Main-PC research worker — contract, install, health, rollback

Status (2026-10-03): **coded and locally tested; runtime release staged, not active.**
Release `bsproof-research-worker-f8e8df82117e` is installed (unprivileged, isolated venv)
under `~/.local/share/bsproof-research-worker/` on the main PC. No `worker.env`, token,
system unit, service or job exists, and no model has been called. Keep runtime OFF until
a human provisions it.

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
(user unit) and `deploy/bsproof-research-worker.system.service.example` (system unit,
preferred on the mainPC; see the owner install section) are not installed or enabled. `deploy/pc_research_worker_release.sh` can package
an isolated versioned runtime; build/install/start/provisioning are human-owned
operations and are not part of local validation. No account, network, service,
secret, or SQL provisioning was done in this phase.

Per-job worker diagnostics stay under a private unique directory at the configured
data path. The lease token is not written there. They may include raw stream and
operational details, so keep that directory private and out of owner-facing APIs.

## Owner-only install path on the mainPC (prepared, NOT executed)

Status: prepared and reviewed as text only. Nothing below has been run; the mainPC
runtime is untouched, no env file, token, service, or SQL exists. The run order
(each step is an owner decision) is: provision scoped SQL/token (parent), install the
runtime, create the 0600 env file, `check`, install the unit, one model smoke.

Why a system unit: on the mainPC (WSL2, systemd 249) the user manager's private socket
is orphaned and there is no user D-Bus, so `systemctl --user` cannot work. A system
unit running as `User=icefrost` avoids the user manager entirely.
`deploy/bsproof-research-worker.system.service.example` is that unit: `User=icefrost`,
`Group=icefrost`, `HOME=/home/icefrost`, absolute paths (`%h` would be `/root` in a
system unit), `EnvironmentFile=/home/icefrost/.config/bsproof-research-worker/worker.env`,
runtime `/home/icefrost/.local/share/bsproof-research-worker/current`, data
`/home/icefrost/.local/share/bsproof-research-worker/data` (0700), `UMask=0077`,
`NoNewPrivileges=yes`, `Restart=on-failure`, `WantedBy=multi-user.target`, and PATH
including `/home/icefrost/.nvm/versions/node/v22.23.2/bin`. The Claude CLI is a
native ELF binary that does not need node; the node dir is kept on PATH only in case a
CLI subprocess needs it. ProtectHome is deliberately NOT set: the CLI needs its
own `~/.claude`. API-credential variables are explicitly unset in the unit. The user unit
example got the same PATH fix and is only for a host where `systemctl --user` works.

Rules: never restart `user@1000`, dbus, WSL, or any session for this. Do not change
sudoers, permissions, auth, or provider configuration. Never paste the sudo password
to an agent or write it down. `sudo` below is typed by the owner only.

Verify the template off-box before installing (needs no sudo; copy to a `.service` name
because `systemd-analyze` rejects other suffixes; on a laptop the mainPC paths do not
exist, so "executable not found" findings are expected there and are NOT a PASS for the
real paths):

```bash
cp deploy/bsproof-research-worker.system.service.example /tmp/bsproof-research-worker.service
systemd-analyze verify /tmp/bsproof-research-worker.service
```

On the mainPC (owner), after the runtime is installed and the 0600 env file exists,
the same command must report no missing-path findings. Then:

```bash
# 0. pre-install check: the unit has Group=icefrost, so that group must exist and be
#    icefrost's primary group (verify will not catch this; start would fail with 216/GROUP)
id -gn icefrost
# 1. one-time install of the runtime (as icefrost; writes only under ~/.local/share and ~/.config)
deploy/pc_research_worker_release.sh install <tgz> <sha256>
# 2. owner creates ~/.config/bsproof-research-worker/worker.env (chmod 0600, dir 0700) from worker.env.example
#    with the dedicated token; research stays OFF until the flag is flipped on the website.
# 3. local preflight, no model call (see the note below this block)
env -u ANTHROPIC_API_KEY -u ANTHROPIC_AUTH_TOKEN \
  BS_PROOF_CLAUDE_BIN=/home/icefrost/.local/bin/claude \
  PATH=/home/icefrost/.local/bin:/home/icefrost/.nvm/versions/node/v22.23.2/bin:/usr/local/bin:/usr/bin:/bin \
  /home/icefrost/.local/share/bsproof-research-worker/current/venv/bin/python \
  /home/icefrost/.local/share/bsproof-research-worker/current/scripts/pc_research_worker.py check
# 4. install ONLY this unit
sudo install -o root -g root -m 0644 deploy/bsproof-research-worker.system.service.example \
  /etc/systemd/system/bsproof-research-worker.service
sudo systemd-analyze verify /etc/systemd/system/bsproof-research-worker.service
sudo systemctl daemon-reload
# 5. enable and start only when the single smoke is authorized
sudo systemctl enable bsproof-research-worker.service
sudo systemctl start bsproof-research-worker.service
# 6. status / logs
systemctl status bsproof-research-worker.service --no-pager
journalctl -u bsproof-research-worker.service -n 100 --no-pager
```

Step 3 note: `check` reads the token and API base from `worker.env`, but that file is
NOT exported into the process environment (the worker merges it into its own config
only). `BS_PROOF_CLAUDE_BIN` must therefore be in the process environment of the `check`
command, as above (the unit sets it itself via `Environment=`). Without it `check`
raises an uncaught error instead of a clean PASS/FAIL. The `env -u` clears any API
credential from the owner shell so the preflight uses only the subscription login.

Runtime rollback (this unit only; the unit stays installed):

```bash
sudo systemctl stop bsproof-research-worker.service          # SIGTERM; running lease is left to expire
deploy/pc_research_worker_release.sh rollback                # switch to the previous release
sudo systemctl start bsproof-research-worker.service         # only if desired
```

Full removal of the unit (separate from runtime rollback; do not run both blocks in
sequence):

```bash
sudo systemctl disable --now bsproof-research-worker.service
sudo rm /etc/systemd/system/bsproof-research-worker.service
sudo systemctl daemon-reload
```

Revoking the dedicated worker token (parent/owner, server side) is the actual kill
switch; stopping the unit does not by itself invalidate it. After revoking the token,
ALSO run `sudo systemctl disable --now bsproof-research-worker.service`: a revoked
token makes the worker log auth errors and keep polling with backoff (up to 300 s)
rather than exit, and a bad config exits and, under `Restart=on-failure` with
`RestartSec=30` (which never hits the default start limit), restarts every 30 s and
fills the journal with config errors. The token is created by the
parent only after the reviewed scoped provision, never by this doc or the unit.

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