# mainPC research worker — contract, install, health, rollback

Status (2026-10-03): **coded and tested on the laptop only.** Nothing is installed or
running on the mainPC, no token exists, nothing is published. Do the steps under
"Install" only after the backend integration has been reviewed.

Files: `scripts/pc_research_worker.py` (loop, HTTP, leases, validation),
`pipeline/claude_research_adapter.py` (the only model boundary), `prompts/research_audit_live.md`
(`live-research-v0.1`), `schemas/research_audit.json` (unchanged, the strict validator),
`deploy/` (unit, env example, release script), `tests/test_pc_research_worker.py`.

## What it does

Polls the website outbound over HTTPS, claims one job at a time, runs one live research
audit through the already-logged-in Claude CLI **subscription** (model `claude-sonnet-5-5`,
`--effort xhigh`, `--safe-mode`, tools `WebSearch,WebFetch` only, no Bash/Read/MCP/plugins,
no API key), validates the audit against `schemas/research_audit.json`, and reports the
result with `source_access` provenance. It computes no score. It opens no listening socket.

The command line is the one verified on 2026-10-03 (CLI 2.1.287):
`claude -p --safe-mode --strict-mcp-config --tools WebSearch,WebFetch --allowedTools WebSearch,WebFetch
--permission-mode dontAsk --model claude-sonnet-5-5 --effort xhigh --no-session-persistence
--output-format stream-json --verbose --json-schema <schema minus $schema> --system-prompt <live prompt>`
run in an empty per-job working directory. No `--max-turns`, no budget flag, no timeout.

## Wire contract (exact)

One endpoint, `POST {BS_PROOF_RESEARCH_API_BASE}/api/scan/research/worker/`, JSON body,
`Authorization: Bearer $BS_PROOF_RESEARCH_WORKER_TOKEN`, `Content-Type: application/json`.
Redirects are never followed (the token is never re-sent elsewhere). `API_BASE` is an https
origin only; the canonical one is `https://bs-proof-dashboard.vercel.app` (plain http only to
localhost, for tests, behind `BS_PROOF_RESEARCH_ALLOW_INSECURE_LOCALHOST=1`).

| action | request body | accepted response |
|---|---|---|
| `claim` | `{"action":"claim"}` | `{"job":null}` or `{"job":{"id","lease_token","target","prompt_version"}}` |
| `heartbeat` | `{"action":"heartbeat","job_id","lease_token"}` | any 2xx |
| `complete` | `{"action":"complete","job_id","lease_token","audit":{…},"source_access":{…}}` | any 2xx |
| `fail` | `{"action":"fail","job_id","lease_token","error":{"code","message","retryable"},"source_access"?:{…}}` | any 2xx |

Response handling: **2xx** accepted (a 2xx body with `"ok":false` is treated as rejected);
**404/409/410**, or a body whose `error`/`code` is `lease_lost|lease_expired|stale_lease|lease_mismatch`,
means the lease is not ours: the worker kills the CLI, sends nothing more for that job and keeps any
finished result on disk (a stale worker can therefore never overwrite a newer owner's result);
**401/403** auth (logged, retried with backoff, the job is not touched); other **4xx** rejected
(logged, not retried); **5xx/network** transient (claims back off; `complete`/`fail` are retried
with the identical payload until accepted, the lease is lost, it is rejected, or the service is
stopped; there is no retry-count cap).

Heartbeats run from the claim until delivery (including while the CLI runs and while delivery is
retried), every `BS_PROOF_RESEARCH_HEARTBEAT_SECONDS` (default 30; keep it well under the server lease).

`target` (ResearchJobV1) is passed through as JSON **data**: the worker only checks it is a JSON object;
it never defaults, infers or edits a field. A `null`/missing field is unknown. The worker reads two
keys deterministically (**to be reconciled with the backend**): `daily_dose` (or `dose`) — when absent/null
the audit's `daily_dose` must be exactly `unknown`, when a string the audit must contain it verbatim —
and `components` (or `ingredients`) — more than one entry makes it a blend. Everything else (product
name, ingredient, form, outcomes, servings/day, elemental-vs-compound basis…) flows to the model as data.
`prompt_version` must be `live-research-v0.1`; any other value is failed as `unsupported_prompt_version`
without running anything.

### `complete.source_access` (provenance; facts only)

`version` `source-access-v1`; `classifier` `fetch-access-v1` (regexes ported unchanged from the immutable
2026-10-03 benchmark `access_addendum.classify_fetch`); `model_requested`, `model_reported_by_cli_init`,
`model_usage`, `api_key_source` (must be `none`), `cli_version`, `prompt_version`, `adapter_version`,
`worker_version`; `web_search_requests`, `web_fetch_requests`; `fetch_class_counts` over
`tool_flagged_error | no_result | http_error | redirect_not_followed | captcha_browser_check_cookie_wall |
haiku_refusal | content_bearing`; `non_access_total`; `content_bearing_upper_bound` (a Haiku **summary**, an
upper bound, never "papers read"); per-call `fetches[]` / `searches[]`; `retrieved_ids_in_tool_output`;
`terminal` (CLI result, notional cost, exit code); `rate_limit_last`; `raw_stream` (file name, sha256,
bytes — the stream itself stays on the PC); `run` (times, prompt/request/schema hashes); `status`
(`experimental:true, validated:false, human_verified:false, clinician_reviewed:false`);
`audit_grounding` (inventory ids seen / not seen in tool output — a string match, not verification);
`blend` (`is_blend`, `whole_formula_headline_row_index` 0, `context_only_row_indices`); `audit_sha256`;
`checks_passed`; `limits`. `fail` carries the same object when a stream exists.

### Failure codes (never repaired, never guessed)

`unsupported_prompt_version`, `invalid_target`, `claude_cli_not_found`, `claude_quota_or_rate_limit`
(followed by a cooldown, default 900 s, before the next claim), `claude_auth_error`, `claude_cli_error`,
`claude_no_result_event`, `claude_no_structured_output`, `disallowed_tool_used` (the run is killed
the moment a non-web tool appears), `billing_guard_api_key` / `billing_guard_overage` (killed: the run
must be the plain subscription login), `no_web_tools_used`, `audit_schema_invalid` (JSON-pointer errors),
`audit_contract_violation` (meta.model/prompt/run_at, experimental+unvalidated note, only
`claude-sonnet-5-5` plus the CLI's own `claude-haiku*` web summariser in `modelUsage`, unknown dose stays
`unknown`, a stated dose echoed verbatim, blend row 0 not a `CONTEXT ONLY` row), `worker_internal_error`.
`retryable` is a hint for the backend, which decides what a failed job means.
A service stop/SIGTERM cancels a running call and sends **nothing** (the lease expires and the server
decides); an unreachable/sleeping/offline PC simply stops claiming and stops heartbeating, so queued jobs
stay queued and an in-flight lease expires. The backend should show "waiting for the research PC" from the
absence of claims, not from a worker-supplied flag.

### Data on the PC

Per job, a unique directory `…/data/runs/<UTC stamp>-<uuid>/` (never named from a job id or user text), mode 0700,
files sealed 0400: `job.json` (target, **no lease token**), `system-prompt.txt`, `request.txt`,
`command-redacted.json`, `raw-stream.jsonl` (verbatim), `stderr.txt`, `result.json` or `fail.json`,
`delivery.json`. Nothing is deleted automatically. `data/status.json` records the worker state;
`data/worker.lock` stops two workers on one data dir.

## Verified on the mainPC (read-only, 2026-10-03)

CLI `~/.local/bin/claude` 2.1.287, logged in (`apiKeySource: none` in the benchmark streams), system
`python3` 3.10.12 whose `jsonschema` is 3.2.0 (no Draft 2020-12), so the runtime needs its own venv with
`jsonschema>=4` (PyPI access at install time). Both worker files compile under 3.10. `loginctl` Linger=yes
(a user service survives logout). `systemctl --user` over SSH needs `XDG_RUNTIME_DIR=/run/user/$(id -u)`.
No `~/.local/share/bsproof-research-worker` exists yet.

## Install (only after reviewed integration; a human step)

1. Laptop: from the reviewed commit, `deploy/pc_research_worker_release.sh build` → `dist/bsproof-research-worker-<commit>.tgz` + its sha256.
2. Copy the tarball and `deploy/pc_research_worker_release.sh` to the PC (`scp`, key `~/.ssh/main_pc_ed25519`, `icefrost@100.93.163.45`),
   then on the PC run `./pc_research_worker_release.sh install <tgz> <sha256>`. It verifies the hashes, unpacks into
   `~/.local/share/bsproof-research-worker/releases/<name>/` (five files + its own venv with `jsonschema>=4`), moves the
   `current` symlink and records `previous`. It never touches an app checkout, never writes a secret, never starts a service.
3. Create `~/.config/bsproof-research-worker/worker.env` from `deploy/worker.env.example`, put the token in it, `chmod 600`.
   The token is issued by the site owner (the matching secret is set in the website's environment by the integrator). It is
   the only secret on the PC; no browser/provider credentials are copied anywhere.
4. `~/.local/share/bsproof-research-worker/current/venv/bin/python ~/.local/share/bsproof-research-worker/current/scripts/pc_research_worker.py check`
   (local only: config, 0600 mode, jsonschema, prompt/schema, CLI `--version`, data dir; it never claims a job or calls a model).
5. Install the unit: copy `deploy/bsproof-research-worker.service.example` to `~/.config/systemd/user/bsproof-research-worker.service`, then
   `systemctl --user daemon-reload && systemctl --user enable --now bsproof-research-worker`.

## Health

- `systemctl --user status bsproof-research-worker`; `journalctl --user -u bsproof-research-worker -f` (no token or lease token is ever logged).
- `…/current/venv/bin/python …/scripts/pc_research_worker.py check` and `cat ~/.local/share/bsproof-research-worker/data/status.json`
  (`polling | running | backoff | cooldown | stopped`, last job outcome).
- Expect `claim not accepted kind=auth` in the journal if the token is wrong/rotated, `kind=transient` if the site or network is down.
- `claude_auth_error` failures: re-login the CLI on the PC interactively; `claude_quota_or_rate_limit`: the subscription window is used up
  (the worker pauses, then tries the next job; jobs are not silently dropped).

## Rollback / stop

- Previous release: `deploy/pc_research_worker_release.sh rollback && systemctl --user restart bsproof-research-worker`.
- Stop: `systemctl --user disable --now bsproof-research-worker` (in-flight run is cancelled, nothing sent; lease expires).
- Remove everything: stop, delete `~/.local/share/bsproof-research-worker`, `~/.config/bsproof-research-worker`, the unit file; revoke the token
  server-side.

## Honest limits

- Experimental and unvalidated: no clinician review, no human verification; the audit text says so and the worker refuses an audit that does not.
- WebFetch returns a Haiku summary; `access:"full_text"` can mean at most a summarised full-text page. In the 2026-10-03 benchmark 311 fetches gave
  116 non-access results and 21 refusals; at most 174 were content-bearing.
- Grounding checks are string matches over tool output. They do not verify numbers against papers.
- The CLI's own `--safe-mode` init still lists installed plugins/skills counts; the effective tool list is `StructuredOutput, WebFetch, WebSearch`
  (recorded in `source_access.tools_reported_by_cli_init`).
- One job at a time; no runtime/turn/token cap, so a research call can run for many minutes (the benchmark's took 7 minutes).
