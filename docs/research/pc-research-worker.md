# Main-PC research worker — contract, install, health, rollback

Status (2026-10-06, UTC) — **CANDIDATE ONLY: fixes the CAUSE of the Vitamin D failures, plus ONE attempt per job and MEDIUM effort. NOT applied, NOT installed, NOT deployed, NO model run to test it.**
The user asked for live research on `claude-sonnet-5-5` at effort **medium** with **one** attempt per job (no automatic second or
third model run), and then said the real question is *why an attempt fails*, so a cap alone is not the fix. **Why it failed** (replayed
from the three original captures, section "Why the Vitamin D job failed three times"): the worker's inventory-grounding guard refused
each audit because cited ids were not "printed in returned tool text". That was TRUE for 4 of the 33 cited ids over the three runs
(the model asserted an id no returned result printed) and FALSE for 14 of them: those papers WERE retrieved, and the ids WERE in
returned text, but in a form the extraction did not recognise (a Markdown-bold `**PMID:** 123` label the small summariser model
wrote; a DOI inside a URL ending `/full`). The other 15 were accepted. The guard is unchanged and strict: it was the id *recognition*
that was too narrow, plus a model that did not know the check exists. In the repository this candidate changes: (1) the id
extraction, in lockstep in the worker and the server, for exactly those two measured forms; (2) the live prompt `live-research-v0.2`
-> `live-research-v0.3` = v0.2 plus ONE rule block (L7, the citation check; proven by test to be the only difference), with every
tier accepting both versions so no queued job and no old runtime is stranded; (3) effort `xhigh` -> `medium`, model unchanged;
(4) one attempt per job in the SQL (`docs/research-jobs.sql`, migration 001), and `bsproof_research_complete` accepting the v0.3
job version (migration 002); (5) the grounding refusal is classified `audit_contract_violation`, not a retryable worker fault.
**Nothing here is live until the owner follows "One attempt per job and medium effort: what changed, install order, drain" (the order
matters). Even then a research run can still fail**: the replay shows 4 residual unprinted ids that no parser change may accept; L7
is the fix for those and it is UNPROVEN until a model runs it (none has). Medium does not guarantee success. Everything below that
says "three attempts", "requeued" or "re-claimed" describes the 2026-10-04/05 production state until the migrations are applied.

Status (2026-10-05, times UTC): **RELEASED_EVERYONE under a USER-ACCEPTED HELD-OPEN hosting condition (not a fully hosted service).**
Production `SCAN_LIVE_RESEARCH_ENABLED` is `on` (it was `owners`): live research is open to every signed-in Google user; an
anonymous or unauthenticated caller gets 401. The user explicitly decided to finish research for everyone now and move to the
VPS later, and accepted the hosting condition: keep one Ubuntu/WSL terminal open, the PC awake and online ("Held-open hosting
mode" below). That condition REPLACES the WSL-survival gate G4 for this temporary period. **G4 was NOT performed and is NOT
claimed**: nothing here says the worker survives with every terminal closed, a PC sleep, a reboot, a Windows restart or an
autostart (there is none). The app code on production is unchanged (`273c2d5`, the same app tree as `9e9c0d3`); the only
production change is the one Production variable `SCAN_LIVE_RESEARCH_ENABLED`; the Sensitive `SCAN_LIVE_RESEARCH_OWNER_IDS`
and `BS_PROOF_RESEARCH_WORKER_TOKEN` were not touched (the owner-id variable is the one-step rollback to `owners`). The
worker is the TEMPORARY supervised process on the founder's main PC ("Temporary main-PC background worker (until the VPS)").
What was verified is in "Verified when the flag went `on`" below. Wherever this file says research for everyone is "NOT
enabled" or G4 is a "hard gate", that is the history before this decision.

Earlier status (2026-10-04, times UTC; superseded by the status above): **RELEASED_RESTRICTED.** The reviewed code is on `main`
(`9e9c0d30becd1cc70fff2f115205dfbdeb8d7514`, the privacy-clean commit that the Claude Code
owner's second read-only verification passed) and live on production in the private `owners`
mode; the worker runtime was reinstalled from that commit; ONE real owned job ran end to end;
the persistent service is NOT active (it needs the owner's sudo, see "Owner-only install path");
research for everyone was NOT enabled in that earlier state. A TEMPORARY detached supervisor for the same installed runtime
(code + runbook; see "Temporary main-PC background worker (until the VPS)") is the founder-authorised bridge to the VPS.

Facts, none of them secret:

- **Remote and production.** `origin/main` = `9e9c0d3...` (fast-forward from `224715a`; the
  older private candidate `8eccc35` was never pushed and is not an ancestor). The canonical alias
  `bs-proof-dashboard.vercel.app` was READY on that exact SHA twice: first from the git push with
  every research setting UNSET (`POST /api/scan/research/` answered 503 `research_disabled`
  before authentication, owner `GET` 401, worker door 503), then after the owner step below.
  Production variables added (values never printed): `BS_PROOF_RESEARCH_WORKER_TOKEN` (Sensitive,
  the existing main-PC token, passed by stdin and not regenerated), `SCAN_LIVE_RESEARCH_OWNER_IDS`
  (Sensitive, the designated test account's `auth.users.id`) and `SCAN_LIVE_RESEARCH_ENABLED=owners`.
  The service-role key stays a Sensitive Production variable only; no PC holds it. After the
  redeploy anonymous or bogus-bearer `POST`/`GET` answer 401 `no-store`, and the worker door
  answers 401 for a missing or wrong token (the right token claimed the job below).
- **Runtime.** `bsproof-research-worker-9e9c0d30becd` (tarball sha256 `7986b36ef2b0...`) is
  installed; every runtime file equals the promoted commit's blob; `jsonschema` 4.26.0
  (Draft 2020-12); `check` is ok under the unit's scrubbed environment (note: `check` and `run`
  take the pinned CLI path from the PROCESS environment, which the unit supplies; run by hand
  with `env -i ... BS_PROOF_CLAUDE_BIN=...`). The older `f8e8df821` release is kept as `previous`.
- **The one job.** The designated test account, signed in with Google on production, entered
  through the app's "Search your supplement": creatine, "form not stated" (typed as is, no form
  guessed), 4000 mg per serving, servings per day LEFT BLANK. The panel queued the job with one
  `POST` (201). The target sent to the model had `servings_per_day: null` and
  `daily_elemental_mg: null`; unknown servings were never treated as 1.
  - Attempt 1 (376 s): the model returned an audit, but the worker's own grounding guard
    refused to deliver it because one cited DOI was not in any tool output. It reported
    `worker_internal_error` (retryable); the server requeued the job (attempt 1 of 3; this is the
    3-attempt policy that the 2026-10-06 change removes).
    This is the fail-closed design working, not data loss.
  - Attempt 2 (397 s, 22:24:48 to 22:31:55): delivered; the server answered `completed`; the
    strict canonical result is stored.
- **Actual model and access (from the worker's diagnostics of attempt 2).** Primary producer
  `claude-sonnet-5-5` (53,350 output tokens), effort `xhigh`, CLI 2.1.287, `apiKeySource: none`
  (subscription login), tools WebSearch and WebFetch only, 47 turns; the CLI's own fetch
  summariser `claude-haiku-4-5` also ran (15,825 output tokens, 24 searches), as documented.
  No budget, turn, deadline or fallback flag was passed. Real access: 24 search snippets and
  11 fetch summaries (35 requests), 5 walls or cookie checks, 5 errors, 0 original documents,
  14 source IDs, all `derived_snippet`; 7 outcomes. The audit is a model's reading of snippets
  and summaries, not of the papers. The CLI's notional list-price figure (about 1.7 USD per
  attempt) was not billed: the run is on the subscription.
- **Provenance stored with the result.** `affects_score: false`, `human_verified: false`,
  `clinically_approved: false`, `evidence_status: experimental_unvalidated`,
  `source_access_version: SourceAccessV2`, `billing: subscription_no_api_spend`.
- **What the owner sees.** The owner `GET` answers 200 `no-store`; the live panel moved from
  Queued to Completed with no percentage, estimate or progress bar and listed the facts the scan
  did not record; History replay opened the saved scan with ZERO `POST`s and showed the same
  audit, tagged EXPERIMENTAL and UNGRADED with the Haiku-summary note.
- **What this does NOT prove.** Pipeline mechanics, ownership, provenance and the strict
  contract only. Nobody checked the audit's studies, numbers or conclusions; it is not a clinical
  assessment and is not scored. A live cross-owner 404 was NOT tested (no second genuine
  identity exists; it stays offline-tested), and no phone check was done.
- **Tradeoff the owner accepted.** The CLI run has no budget, turn or time cap. The app-side
  queue caps (3 open jobs per user, no global cap) are separate and are the only brake; this is
  why opening research to everyone is a separate explicit founder decision (step 7).

Files: `scripts/pc_research_worker.py` (loop, HTTP, leases, validation),
`pipeline/claude_research_adapter.py` (only model boundary),
`prompts/research_audit_live.md` (`live-research-v0.2`),
`schemas/research_audit.json` (unchanged strict audit validator),
`schemas/source_access_v2.json` (canonical V2 schema), `deploy/` (examples and
release script), and focused Python/TypeScript tests.

## What it does

Polls the website outbound over HTTPS, claims one job at a time, runs one audit
through the already logged-in Claude subscription CLI (model
`claude-sonnet-5-5`, `--effort medium` (was `xhigh` until 2026-10-06), `--safe-mode`, `WebSearch,WebFetch` only,
no API key), validates the audit and transient SourceAccessV2 evidence, and posts
it back. It computes no score and opens no listening socket. There is no runtime,
turn, token, or model-call cap and no API fallback; the only limit on model runs is
the one-attempt rule of the queue (one run per job, no automatic re-run).

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

Shutdown never finishes a job (the WORKER posts nothing). On SIGTERM/SIGINT the worker cancels the CLI and
posts nothing: the lease is left to expire. **Under the one-attempt policy (2026-10-06) a job is not re-claimed**: the next
claim's sweep of expired leases in `docs/research-jobs.sql` (`attempts >= 1`) ends it as `failed` with `lease_expired`.
(Under the 3-attempt policy it was re-claimed, and only a stop on the THIRD attempt lost it.) This also holds when the same
signal killed the CLI first (systemd signals the whole cgroup, so the CLI can die before the worker's own cancel
propagates): while the worker is stopping, an abnormal CLI exit
(`claude_cli_error`, `claude_no_result_event`, `claude_no_structured_output`) is not
posted as a `fail`, so the owner sees the server's honest `lease_expired` rather than a made-up CLI error. A finished valid
result is still delivered, and real findings (quota, authentication, billing guard, contract violations) are still reported.

Consequence for operations: **cutting a running job now loses it** (one attempt, no re-offer). Use `stop --drain` to let it
finish; `stop` refuses while a job runs unless `--now`. The same goes for a quota/rate-limit, authentication, `claude_cli_not_found`
or any other failure the worker reports: the job ends as `failed` with that code, whatever its `retryable` hint says (the
hint is still sent; the server ignores it for requeueing). Network retries are not model runs and are unchanged: claim polling,
heartbeats and the delivery of a `complete`/`fail` are retried with back-off until they land or the lease is lost.

An audit is never "validated" by skipping validation: without `jsonschema` (Draft
2020-12) the worker fails the job as `worker_internal_error`, and the server's
Ajv validators run in strict mode and refuse any schema that does not itself
declare Draft 2020-12 (`compileStrict2020`).

## Target and grounding

The server builds `ResearchJobV1` from the owner's saved scan. The worker accepts
only JSON data and preserves explicit numbers unchanged. `printed_elemental_per_serving_mg`
may be null or explicitly recorded at the top dose or active row; no unit
conversion or serving inference is performed. Unknown daily dose stays unknown,
blend component evidence is not blend efficacy, and prompt/scoring rules remain
unchanged.

The worker's contract checks read the REAL `ResearchJobV1` shape (`version`,
`servings_per_day`, `dose.daily_elemental_mg`, `is_multi_ingredient`, `actives`,
`other_actives`), pinned by the shared fixture `tests/fixtures/research-target-v1.json`:
a daily amount exists only when the scan recorded a numeric `servings_per_day` or
`dose.daily_elemental_mg`. With neither, the audit's `daily_dose` must be exactly
`unknown` (no "one serving a day" default, no guessed multiplier). A target is a
blend only when the scan says so (`is_multi_ingredient` true, several `actives`, or
any `other_actives`); a `null` flag is unknown and is never defaulted to a blend. A
blend's `outcomes[0]` must be the whole-formula row, never a `CONTEXT ONLY` row.
Violations are failed as `audit_contract_violation`; nothing is patched. Prompt wording explicitly says that only snippets/model summaries are
available; it must not imply full-paper access or guessed study details.

An inventory `id` that appears in no returned tool text (the guard in `validate_live_receipts_and_inventory`: "inventory ID is not
grounded in returned tool text") is a refusal of the MODEL'S audit, not a worker fault: since 2026-10-06 it is raised as
`InventoryNotGroundedError` and reported as `audit_contract_violation` with `retryable: false` (it was `worker_internal_error`
with `retryable: true`, which is how the same refused audit came to be run three times). The guard is unchanged: the same IDs are
accepted and refused, the audit is never delivered, repaired or forced through, and no citation or audit field is touched. Every
OTHER refusal in that function (receipt bytes/hash, counters, non-snippet access, pinned model/CLI) keeps the generic
`worker_internal_error` classification.

## Local health check and operations

`python3 scripts/pc_research_worker.py check` performs local preflight only; it
requires executable absolute `BS_PROOF_CLAUDE_BIN=/home/icefrost/.local/bin/claude`,
CLI 2.1.287 and runtime dependencies. It does not claim a job or call a model.
`run` polls continuously; `run --once` claims at most one job.

`deploy/worker.env.example` is an example only. The dedicated worker token is the
only worker secret; never commit its real value. `deploy/bsproof-research-worker.service.example`
(user unit; the preferred install path on the mainPC since 2026-10-04) and
`deploy/bsproof-research-worker.system.service.example` (system unit; fallback only, needs
sudo; see the owner install section) are not installed or enabled. `deploy/pc_research_worker_release.sh` can package
an isolated versioned runtime; build/install/start/provisioning are human-owned
operations and are not part of local validation. No account, network, service,
secret, or SQL provisioning was done in this phase.

Per-job worker diagnostics stay under a private unique directory at the configured
data path. The lease token is not written there. They may include raw stream and
operational details, so keep that directory private and out of owner-facing APIs.

## Owner-only install path on the mainPC (service NOT installed: owner sudo needed)

Status (2026-10-04 evening): the runtime from the promoted commit is installed and `check` is
ok, but NO unit is installed and no persistent worker runs; the one real job above was run by
hand with `run --once` in the unit's scrubbed environment. Persistence is BLOCKED on a human
decision for one reason: `systemctl --user` currently fails ("Failed to connect to bus", no
user D-Bus: `dbus-user-session` is not installed) because `systemd-analyze --user verify` was
run against the REAL runtime dir (twice by the fix worker and, earlier, once by the release
operator), which orphaned the live user manager's private socket (the manager, pid 306, is alive
and still bound to the unlinked inode). No non-root, non-restart way exists to rebind it, and
agents must not restart `user@1000`, dbus or WSL. Nothing was restarted. Two owner choices:

```bash
# A (recommended: touches neither user@1000, dbus nor WSL; asks for the owner's sudo password).
# The repo's system unit is byte-identical to the privately staged copy used here.
sudo install -m 0644 /home/icefrost/.cache/bsproof-research-setup-20261003/bsproof-research-worker.system.service.example /etc/systemd/system/bsproof-research-worker.service
sudo systemd-analyze verify /etc/systemd/system/bsproof-research-worker.service
sudo systemctl daemon-reload && sudo systemctl enable --now bsproof-research-worker.service
systemctl status bsproof-research-worker.service --no-pager      # then: journalctl -u bsproof-research-worker.service -n 50 --no-pager

# B (the user unit; only after the owner deliberately recovers the user manager, e.g. a decided
# `sudo systemctl restart user@1000.service`, which ends that user's systemd-managed services):
systemctl --user is-system-running     # must say running; then install deploy/bsproof-research-worker.service.example
```

Until one of them is done the queue still works: a job simply waits, and the owner can run
`env -i HOME=$HOME PATH=... BS_PROOF_CLAUDE_BIN=$HOME/.local/bin/claude .../current/venv/bin/python .../current/scripts/pc_research_worker.py run --once`.

### Current path: the USER unit (no sudo)

On 2026-10-04 the user systemd manager on the mainPC was found working
(`systemctl --user is-system-running` = `running`, `loginctl` `Linger=yes`, so a user unit
survives logout). That makes the earlier "user manager unreachable" note obsolete and sudo
unnecessary, as long as the manager's private socket is intact (see the CAUTION below).
The unit is `deploy/bsproof-research-worker.service.example`. Compared with
the earlier user template it now also carries `WorkingDirectory=` on the current runtime
and the same credential scrub the reviewed system unit already had:
`UnsetEnvironment=ANTHROPIC_API_KEY ANTHROPIC_AUTH_TOKEN CLAUDE_CODE_OAUTH_TOKEN ANTHROPIC_BASE_URL`
(subscription login only; no API credential can reach the CLI). Everything else is
unchanged: the absolute-`%h` `EnvironmentFile`, `NoNewPrivileges=yes`, `UMask=0077`,
`KillMode=control-group`, `TimeoutStopSec=60`, `Restart=on-failure`, `RestartSec=30`. That
is a CONFIGURATION change, not documentation: it was checked with
`systemd-analyze --user verify` but NOT installed, and the owner must review the unit
file (and re-run that verify on the mainPC) BEFORE installing it.

```bash
# 0. confirm the user manager (no sudo)
systemctl --user is-system-running                        # expect: running
loginctl show-user "$USER" -p Linger                       # expect: Linger=yes
# 1. runtime, env file and `check`: steps 1-3 of the system-unit block below (no sudo needed)
# 2. verify the template off-box (copy to a .service name; installs nothing). Use a THROWAWAY
#    runtime dir: see the CAUTION below, never the real $XDG_RUNTIME_DIR
cp deploy/bsproof-research-worker.service.example /tmp/bsproof-research-worker.service
XDG_RUNTIME_DIR=$(mktemp -d) systemd-analyze --user verify /tmp/bsproof-research-worker.service
# 3. the owner reviews the unit text, then installs ONLY this unit (user scope, no sudo)
install -D -m 0644 deploy/bsproof-research-worker.service.example ~/.config/systemd/user/bsproof-research-worker.service
systemctl --user daemon-reload
# 4. enable and start only when the single smoke is authorized
systemctl --user enable --now bsproof-research-worker.service
# 5. status / logs; stop (SIGTERM; a running lease is left to expire)
systemctl --user status bsproof-research-worker.service --no-pager
journalctl --user -u bsproof-research-worker.service -n 100 --no-pager
systemctl --user disable --now bsproof-research-worker.service
```

CAUTION (measured in an isolated test on 2026-10-04): `systemd-analyze --user verify`
starts a throw-away manager that RE-BINDS `$XDG_RUNTIME_DIR/systemd/private`. Run against
the real runtime dir (`/run/user/1000`) it replaces the live user manager's private socket
file, the live manager keeps running but becomes unreachable, and `systemctl --user` then
fails with "Failed to connect to bus: No such file or directory" (there is no user D-Bus to
fall back to). This is the most likely cause of the "orphaned private socket" seen on
2026-10-03. Always verify with a throwaway runtime dir as above (a verify run that way
leaves the live socket untouched). If `systemctl --user` already fails that way, do not
retry in a loop and do not restart anything automatically: the manager needs a deliberate
restart decided by the human owner, or use the system-unit fallback below.

Never restart `user@1000`, dbus, WSL or any session for this, and do not change linger,
sudoers or permissions. Runtime rollback is the same `deploy/pc_research_worker_release.sh
rollback` as below (stop the user unit first; start it again only if desired).

### Fallback only: the system unit (needs the owner's sudo)

Why a system unit was the plan on 2026-10-03: the user manager's private socket was
orphaned and there was no user D-Bus, so `systemctl --user` could not work. A system
unit running as `User=icefrost` avoids the user manager entirely. It is kept only as a
fallback in case the user manager breaks again.
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
example got the same PATH fix and, since 2026-10-04, the same credential scrub; it is the
current path (above).

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

Revoking the dedicated worker token (parent/owner, server side: on Vercel, and it takes
effect only after a redeploy) is the actual kill
switch; stopping the unit does not by itself invalidate it. After revoking the token,
ALSO run `systemctl --user disable --now bsproof-research-worker.service` (user unit; the
system-unit fallback uses `sudo systemctl disable --now bsproof-research-worker.service`): a revoked
token makes the worker log auth errors and keep polling with backoff (up to 300 s)
rather than exit, and a bad config exits and, under `Restart=on-failure` with
`RestartSec=30` (which never hits the default start limit), restarts every 30 s and
fills the journal with config errors. The token is created by the
parent only after the reviewed scoped provision, never by this doc or the unit.

## Temporary main-PC background worker (until the VPS)

Founder decision (2026-10-05): research is to be opened to EVERY signed-in Google user while the
VPS is still a later step. The persistent service is still blocked (`sudo -n` needs a password, the user
manager's private socket is orphaned), so a TEMPORARY, supervised, detached process runs the SAME
installed and reviewed runtime. This is NOT a managed service and it is NOT boot-persistent: after a PC, WSL
or Windows restart (or while the PC sleeps, loses the network or WSL is shut down) nothing is running until
someone runs `start` again. Persistent host startup stays UNAVAILABLE until the VPS or an owner-installed unit.
`deploy/pc_research_supervisor.py` (Python stdlib, one file, no new runtime, never root, no listening
socket) is the launcher + supervisor; it changes no app, scorer, model, prompt, schema, SQL, auth or provider code.

What it does (every item is a test in `tests/test_pc_research_supervisor.py`, 54 tests, 26 mutants caught):

- **The command is the reviewed one, not invented.** It parses the owner-reviewed user-unit template
  (`deploy/bsproof-research-worker.service.example`, sha256 printed by `describe`) as DATA and refuses any
  directive, environment name, `ExecStart` or specifier outside that template. `describe` prints the resolved command.
  It runs `setpriv --no-new-privs --pdeathsig TERM -- <release>/venv/bin/python <release>/scripts/pc_research_worker.py run`
  with an absolute working directory, `umask 0077`, never as root, in its own session (`setsid -f`, orphaned to init,
  no controlling terminal), so it outlives the terminal and the Pi session.
- **Pinned runtime.** `--expect-commit` must equal the full commit in `RELEASE.json`; `current` must resolve to
  `bsproof-research-worker-<12 hex>` of it (the promoted `9e9c0d30becd`, never the stale `f8e8df821`), and the six
  runtime files must match `SHA256SUMS` before EVERY (re)start. A rollback or tampering blocks restarts.
- **Scrubbed environment, built from nothing.** The worker sees only `HOME USER LOGNAME PATH BS_PROOF_CLAUDE_BIN
  PYTHONUNBUFFERED PYTHONDONTWRITEBYTECODE`: no `ANTHROPIC_*`, `CLAUDE_CODE_*` (OAuth / cloud flags), OpenAI, DeepSeek,
  Google credential, Supabase service key, Vercel / GitHub / SSH variable, no `XDG_RUNTIME_DIR` or D-Bus. Subscription
  login only. The worker adapter then applies its own allowlist for the CLI child, as before.
- **No secret in argv or environment.** `worker.env` is parsed as data (no shell, eval or `source`); only the three
  non-secret names `BS_PROOF_CLAUDE_BIN`, `BS_PROOF_RESEARCH_DATA_DIR`, `BS_PROOF_RESEARCH_API_BASE` are taken, every
  other line (the token included) is skipped. The worker reads its own token from the 0600 file. The supervisor never
  reads another process's argv or environment (`/proc/<pid>/stat`, `/proc/locks` only).
- **Never the model.** The supervisor never runs `claude`; a guard refuses to spawn any program named `claude*`.
  The worker and `pipeline/claude_research_adapter.py` stay the ONLY business model boundary. There is no turn,
  token, budget, deadline or fallback flag and no research cap: the only timings are the RESTART cadence and the stop timeout.
- **Locks and no duplicates.** `supervisor/supervisor.lock` (flock) + `supervisor.pid` (pid + start time + boot id) in a
  0700 directory (files 0600) next to the worker's own data-dir `worker.lock`. A worker the supervisor did not start (a
  manual `run`) blocks `start`; `status` names its pid (from `/proc/locks`) without reading its argv. The server lease
  (300 s) still decides job ownership.
- **Restart after ANY worker exit, with back-off (corrected 2026-10-05).** While the supervisor runs, the worker is restarted
  after every exit, exit code 0 included (the worker answers a direct `kill <worker pid>` with a clean exit 0 and is restarted
  anyway): `stop` is the ONLY way to stop it, never kill the worker. Back-off: `RestartSec` from the unit (30 s) doubling to a 600 s
  cap with jitter, reset after a 300 s stable run; exits 78 (config) and 75 (lock) wait at least 120 s. Stderr EOF is not an exit
  and never restarts or spins. A crash sweeps any CLI the dead worker left (it runs in its own session, so no group signal
  reaches it): subreaper + `/proc` parent chain, SIGTERM then SIGKILL. (The launcher's `describe` line still says "on unexpected
  exit only": that wording understates the code, which is frozen at the reviewed commit; this paragraph is the correct statement.)
- **Stop.** SIGTERM to the worker's group (the worker cancels its CLI and leaves the lease to expire; nothing is posted),
  `TimeoutStopSec` (60 s) then SIGKILL, then every leftover descendant is swept; never a restart while stopping. A supervisor
  that dies by SIGKILL takes the worker with it (`--pdeathsig`). `stop` REFUSES while a job runs unless `--now` (the lease then
  expires within 300 s and, with one attempt per job since 2026-10-06, the job ends as failed (`lease_expired`) and is NOT re-offered;
  under the earlier 3-attempt policy it was re-offered); `stop --drain` waits with no deadline until
  the worker is idle, then stops.
- **Logs.** `supervisor/supervisor.log` (0600, rotated 3 x 1 MiB, bounded line reads): fixed supervisor events plus the worker's
  own log lines with tokens, bearer values, JWTs, e-mails, UUIDs (user / job / lease ids) and any 32+ character opaque string
  masked; anything that is not a worker log line (a traceback, any stray text) is counted and only its exception TYPE recorded.
  Model text never reaches this log (the worker never prints it); per-job diagnostics stay in the worker's private run directories.
- **Readiness is observable, with no model.** `status` exits 0 only when: supervisor identity verified (pid file + start time +
  lock), worker alive and holding `worker.lock`, `status.json` is THIS worker's, state is `polling` (fresh) or `running`, and
  at least two poll writes were seen (the worker's own status file: it proves the worker is polling, NOT by itself that the
  server answered; the server's `200` answers were seen separately in the production request logs; an idle queue answers `{"job": null}`, which calls no model).
  A leftover `status.json` of a dead pid is reported as stale, never as a heartbeat; `backoff` / `cooldown` are NOT ready.
  Limits of READY: `running` counts as READY with no heartbeat-age check (the worker writes `status.json` once when a job starts, so
  `worker.age_s` is then the job's elapsed time, not a heartbeat); watch a long job in `supervisor.log` and the queue, and use `stop --now`
  only on a real stall. Run `start` once, sequentially, never in parallel (a second concurrent `start` can lose the lock race and
  report a collision); do not retry blindly after a collision, read `status` first.

Install (owner-reviewed first; the file is copied once, read-only, from the reviewed commit):

```bash
R=$HOME/.local/share/bsproof-research-worker; S=$R/supervisor; C=<full 40-hex commit that contains this file>
install -d -m 0700 "$S"
git -C <checkout> show "$C:deploy/pc_research_supervisor.py"                > "$S/pc_research_supervisor.py"
git -C <checkout> show "$C:deploy/bsproof-research-worker.service.example"  > "$S/reviewed-unit.service"
chmod 0500 "$S/pc_research_supervisor.py"; chmod 0400 "$S/reviewed-unit.service"
sha256sum "$S/pc_research_supervisor.py" "$S/reviewed-unit.service"        # compare with the reviewed values
```

`start` and `serve` REFUSE without `--expect-unit-sha256` (the reviewed unit file's sha256), so an edited template cannot be launched.

Run (RT = the promoted runtime commit, `9e9c0d30becd1cc70fff2f115205dfbdeb8d7514` at the time of writing):

```bash
SUP="/usr/bin/python3 $HOME/.local/share/bsproof-research-worker/supervisor/pc_research_supervisor.py"
$SUP describe --expect-commit $RT      # prints the exact resolved command; starts nothing
$SUP check    --expect-commit $RT      # + preflight + the worker's own `check` (no model, no claim)
U=<sha256 of reviewed-unit.service, as reviewed>
$SUP start    --expect-commit $RT --expect-unit-sha256 $U --wait-ready 90   # detached; idempotent; exit 0 only when READY
$SUP status [--json]                   # read-only; exit 0 only when READY
$SUP stop --drain [--wait N]           # let a running job finish, then stop
$SUP stop                              # refuses while a job runs; add --now to cut it
```

Opening research to everyone (the founder's decision of 2026-10-05) must happen in this order, and a failed step at any
point fails CLOSED (leave or restore `SCAN_LIVE_RESEARCH_ENABLED=owners`, or set it to `off`): (1) `check`, (2) `start --wait-ready`
and `status` READY, (2b) the user's explicit held-open hosting condition (below) is accepted and the worker is READY (this REPLACES the WSL-survival
gate G4, which was NOT performed; DONE 2026-10-05), (3) then set Production `SCAN_LIVE_RESEARCH_ENABLED=on` (the literal `1`, `true`, `yes` do the same),
redeploy, verify the deployment is READY at the intended commit. Kill switches, fastest first: flag `off` + redeploy (no new work
can be queued; running jobs finish); `stop --drain` or `stop --now`; revoke the worker token on Vercel + redeploy.
Rollback of the runtime: `stop --drain`, `deploy/pc_research_worker_release.sh rollback`, then `start` with the OTHER release's commit.

### Held-open hosting mode (the user-accepted condition under which the public flag is `on`)

Decision (the user, 2026-10-05, explicit): research for every signed-in Google user now, VPS later, with the PC kept awake and
online and ONE Ubuntu/WSL terminal kept open (two tabs were confirmed open; a read-only check saw three interactive shells on
pts/0-2 and the supervisor READY with the same pids, zero restarts, a growing poll counter and no duplicate process). This is a
hosting CONDITION, not a pass of gate G4. What it means, stated plainly:

- **G4 was NOT performed and is not claimed.** The closed-terminal test does not apply to the mode the user chose. Never write
  that the worker survives with every terminal closed, a PC sleep, a reboot, a Windows restart or an autostart.
- **When the condition ends** (the last terminal closes, the PC sleeps or reboots, WSL stops) the worker stops, no job is claimed
  and every job stays `queued` until someone runs `start` by hand. The supervisor is temporary: no systemd, no autostart, no service.
  Nothing is lost or mis-scored by this (a queued job spends nothing); users only wait with no ETA.
- **The panel queues automatically**: it POSTs once per stored fresh scan of every signed-in user (not opt-in), so the queue fills
  while the worker is down. A user whose 3 open jobs are all waiting sees the "research running" 429, which is misleading while the PC is down.
- **The flag stops QUEUEING only.** The worker door ignores the flag: jobs already queued are still claimed and run (one at a
  time, about 400 s each on the founder's subscription, no global cap, no budget/turn/deadline cap, no fallback model) while the
  worker is up, even after `owners` or `off`. To stop spend on a backlog, `stop` the worker (queued jobs stay queued); after an
  outage the worker works through the whole backlog sequentially.
- **Before ending the held-open period for long** (shutdown, travel), set `SCAN_LIVE_RESEARCH_ENABLED` to `owners` or `off` and
  redeploy FIRST, otherwise users keep queuing jobs nobody runs. Never `kill` the worker; `stop` is the only stop.
- **Who can use it:** every Supabase-verified GOOGLE user (no session or a bogus token is 401 and never queues, shown live; an anonymous Supabase session has no Google identity and is refused by the same gate, read from the code and not exercised live);
  a user reads and queues only their own saved scans. The output is experimental, ungraded and not approved: its sources are
  search snippets and page summaries written by a small model (Claude Haiku), not the papers, and it never changes a score.

Verified when the flag went `on` (2026-10-05, nothing secret printed, no new model job):

- The actual Claude Code owner, read-only (`claude-sonnet-5-5`, `--effort xhigh`, tools Read/Grep/Glob only, subscription login
  `apiKeySource: none`, no turn/budget/deadline cap, no fallback), read the mode parser, the POST/GET/worker routes, the Google gate,
  this amendment and its earlier supervisor PASS, and returned `VERDICT: PASS` with no Critical. Its conditions are the text above:
  say the panel queues automatically, say the flag stops queueing only, the operator rules, and rewrite every "G4 hard gate" statement.
- The focused existing tests `tests/scan-research-owner-smoke.test.ts` and `tests/scan-research.test.ts` pass (50 tests; `on`/`1`/`true`/`yes`
  in any case or padding parse to everyone, only the word `owners` to owners, everything else to off).
- Metadata first (`GET /v10/projects/{id}/env`, no decrypt; only the research keys were printed), then ONE single-entry `PATCH` of
  `SCAN_LIVE_RESEARCH_ENABLED` (Production only) from `owners` to `on`, value passed as plain input; read back with the single-entry
  `GET /v1/projects/{id}/env/{envId}` (NOT the deprecated bulk decrypt): value `on`, target production only, type unchanged. The two
  Sensitive research variables kept their `updatedAt` (untouched; their values were never read).
- The unchanged production deployment of `273c2d5` was redeployed (`dpl_2TGnxu8kASXBaEVjjLVTrgDXi4TV`): READY, the canonical
  alias points at it. Unauthenticated and bogus-bearer `POST /api/scan/research/` and `GET /api/scan/research/<id>/` answer 401
  `no-store`; the worker door answers 401 for no token and for a wrong token.
- Prior real job: through the designated test account's existing genuine Google session, History replay of the earlier scan
  and "Look up live research" sent ONE `POST` that answered 200 `created:false` with the job `succeeded` (the per-scan key makes
  a repeat idempotent: no new job, no model call), and the panel showed the same EXPERIMENTAL / UNGRADED audit (24 snippets, 11 Haiku
  page summaries, 0 original documents).
- NOT proved: gate G4 (not performed); a live check with a non-allow-listed Google identity (none exists; `on` is proved by the
  parser tests and the read-back, not by a second account); the phone; that the audit's studies or conclusions are right.
- Rollback: set Production `SCAN_LIVE_RESEARCH_ENABLED` back to `owners` (or `off`) and redeploy; the owner-id variable is intact.

### WSL-survival gate G4 (NOT performed; replaced by the held-open mode above; kept as the procedure for an attended measurement)

Why: WSL2 ties a distro's life to the Windows `wsl.exe` sessions attached to it. Read-only on 2026-10-05: `Ubuntu-22.04` is held by ONE
terminal (a `wsl.exe ~ -d Ubuntu-22.04` pair, the window that hosts the Pi session); Docker Desktop keeps ITS OWN distros alive with a
dedicated `wsl.exe -d docker-desktop-data -e /wsl-keepalive` (consistent with, not proof of, a distro being torn down when its last session closes); `/etc/wsl.conf` is
only `[boot] systemd=true` and no `.wslconfig` exists, so `vmIdleTimeout` is the default and unknown. If the last Ubuntu session closes and the
distro is torn down, the supervisor and worker die and every public job would sit `queued` with no ETA. That is INFERRED from WSL's documented
behaviour, NOT measured here; uptime with a session attached proves nothing about it.

An agent must not run this test: the only session that reaches this distro is the agent's own, and closing it ends the agent (agents
also never run `wsl --shutdown` / `wsl -t`, never touch `.wslconfig`, Windows startup/scheduler/power settings, systemd, `user@1000` or dbus).
It is a human, attended, read-only measurement; the script only observes and changes nothing:

```bash
G=$HOME/.local/share/bsproof-wsl-gate
python3 $G/gate.py baseline     # while `status` is READY (already recorded on 2026-10-05 10:05Z; refuses to overwrite: move an old baseline.json aside to redo)
# HUMAN: close EVERY Ubuntu-22.04 terminal / wsl.exe / SSH / editor session (the Pi session ends), leave the PC awake and online,
#        wait at least 6 minutes, open ONE new terminal, then:
python3 $G/gate.py verify       # exit 0 = PASS
```

`verify` passes only if ALL hold: `status` READY now; same `boot_id`; same PID 1 start time (the distro was not torn down and restarted);
same `supervisor.pid` (pid, start ticks, boot id); same worker pid; no worker restart; the poll counter grew; journald/logind shows a window of
at least 360 s with NO session attached (measured, not asserted); and the Vercel production request log (read-only, an independent
observer) shows the worker polling `/api/scan/research/worker/` through that window with no gap above 120 s. Any FAIL means survival is not shown (it was the old NO-GO for the
flag; the flag decision now rests on the held-open mode above). `gate.py` lives on the PC only (`~/.local/share/bsproof-wsl-gate/`, not in this repository, not an independently reviewed artefact); its
parsing and window logic were unit-tested on synthetic input and it correctly FAILS while a session is attached.
G4 was not performed; the smallest honest options were: (a) keep one `Ubuntu-22.04` window open and run research only while it is, never described as
"always on"; or (b) an owner-reviewed host keepalive (for example Docker's `wsl.exe -d <distro> -e sleep infinity` approach, which touches the
Windows side) as its own plan. Neither is done by default; the VPS removes the problem. Option (a) is the user-accepted mode now in force (above).

Honest limits: not boot-persistent; needs the PC awake, online, WSL running and the Claude login valid; one worker, one job
at a time, no global queue cap (3 open jobs per user is the only brake); a quota / rate-limit makes the worker cool down
(900 s) and `status` says NOT READY; the supervisor passed an independent review and the Claude Code owner's read-only
verification (2026-10-05, `claude-sonnet-5-5` xhigh, verdict PASS for the push and for starting it in `owners` mode only; a second, narrow owner pass the same day covers the held-open
amendment and the flag `on`, see the Status); the reviewed unit's own `Restart=` / `systemd` semantics are re-implemented here, not delegated to systemd.

## Staged rollout: controls, secrets and the private owner-smoke

Research is released in two steps so that nobody but the genuine Google owner running
the smoke can queue work (and spend the founder's subscription) before ONE real job has
been proven end to end. All three settings are SERVER-side (no `NEXT_PUBLIC_`), set on
the Vercel Production project only, and take effect on the next deployment.

| setting | where | meaning |
|---|---|---|
| `SCAN_LIVE_RESEARCH_ENABLED` | Vercel Production (non-secret) | unset / empty / any typo = **off** (503 `research_disabled` before auth). Exactly `owners` = **private owner-smoke**: only the user ids in the next row may queue. `1`, `true`, `on`, `yes` = every signed-in Google user (general use). |
| `SCAN_LIVE_RESEARCH_OWNER_IDS` | Vercel Production (non-secret) | Supabase `auth.users.id` UUIDs, comma / semicolon / whitespace separated, at most 20, read ONLY in `owners` mode. An e-mail, wildcard or typo matches nothing; `owners` with an unset or empty list admits nobody. A listed id never opens anything by itself. |
| `BS_PROOF_RESEARCH_WORKER_TOKEN` | Vercel Production (**sensitive**) and `~/.config/bsproof-research-worker/worker.env` (0600) | The worker's only credential. The two values must be identical; at least 32 characters, otherwise the server treats it as not configured (503 `worker_unavailable`). Never the service-role key, never a Google token. |

Behaviour of `owners` mode (`app/api/scan/research/route.ts`, tests in
`tests/scan-research-owner-smoke.test.ts`): authentication first (Supabase-verified
Google bearer, 401 otherwise), then the listed-id check, then the body, the owner's scan
read and the queue. A verified user who is not listed gets the byte-identical
`research_disabled` answer that OFF gives, so the list cannot be probed. The id compared
is the one Supabase Auth returned for the bearer token, never a header, body field,
e-mail or `user_metadata` value. The owner-only job read (`GET /api/scan/research/<id>/`)
and the worker door are not affected by the mode (the read spends nothing; the worker
follows only its token).

Getting the owner id without a service key (step 3 of the sequence below): the genuine
owner signs in with Google once (the first sign-in creates the `auth.users` row), then the
id is read with a SELECT-only query through the Management API's read-only endpoint
(`POST /v1/projects/<ref>/database/query/read-only`, token from the main-PC environment,
never printed), selecting the one row for the designated test account. Do not list or paste
other users' ids or e-mails. The id is kept only in a private 0600 file outside the
repository (for the designated test account: `/tmp/bsproof-release-private/designated-owner-uid.txt`);
no account handle, e-mail or id value belongs in the repository, a commit message or a log.

Checking that the server and worker tokens match without printing either: the worker's
first `claim` is the probe. 200 `{"job":null}` = match and empty queue (no model is called
when nothing is queued); 401 = mismatch; 503 `worker_unavailable` = the server has no
(or a too-short) token. Put the token on Vercel through stdin so it is never an
argument or an echo, e.g. `grep '^BS_PROOF_RESEARCH_WORKER_TOKEN=' worker.env | cut -d= -f2- | tr -d '\n' | vercel env add BS_PROOF_RESEARCH_WORKER_TOKEN production --sensitive --project <id> --scope <team>`,
and preserve the token already in `worker.env` rather than generating a new one.

Sequence (each step needs the previous one green; none of it is run by this commit):

1. Independent review and the Claude Code owner's read-only verification of this
   (privacy-clean) branch. It must say OWNER_PASS, including the user-unit CONFIG change in
   `deploy/bsproof-research-worker.service.example` (configuration, not documentation: it
   needs `systemd-analyze --user verify` and an owner review before any install).
2. Merge the verified branch to `main` and let the production deployment finish with the
   research settings still UNSET (research off). Check the deployment is READY at the
   intended commit, `POST /api/scan/research/` answers 503 `research_disabled`, the owner
   GET answers 401 without a bearer, and the worker door answers 503 or 401 as expected.
   Do not mistake the following for a bug: with the flag unset the deployment still
   mounts the Experimental / Ungraded "Live research" panel on a signed-in user's stored
   fresh scan (`components/scan-flow.tsx` mounts it with `enabled=auth.configured`). The
   panel sends ONE POST per stored fresh scan, receives the 503 and shows that live
   research is off; History replay shows a "Look up live research" button
   (`lib/i18n/copy/research.ts`). No job is queued and nothing is spent.
3. Genuine Google sign-in and the verified user id. The designated test account signs in
   with Google on the production site at least once (the first sign-in creates its
   `auth.users` row; use the fixed Google button, any MFA / human challenge is handed to the
   human and never bypassed), and its `auth.users.id` is read with the read-only query above
   and saved only in the private 0600 file. This step comes BEFORE step 4: `owners` with a
   missing or wrong id admits nobody. DONE for the designated test account on 2026-10-04
   (genuine production sign-in succeeded at 2026-10-04T21:10:51Z with no password / MFA /
   challenge; one Google identity row exists; id file as above). No value is in this repo.
4. Add the worker token, `SCAN_LIVE_RESEARCH_ENABLED=owners` and the owner id; redeploy (an
   environment change takes effect only on the next deployment).
5. On the main PC build and install the runtime from the PROMOTED commit with
   `deploy/pc_research_worker_release.sh` (the staged `bsproof-research-worker-f8e8df82117e`
   predates the shutdown / target-contract fixes), run `check`, then install the USER unit
   after `systemd-analyze --user verify` and the owner's review of the unit file (see "Owner-only
   install path"; no sudo).
6. The designated Google account (already signed in on production, step 3) saves ONE real
   manual scan (creatine, 4000 mg, servings recorded by the person, never assumed; unknown
   servings are never treated as 1), and the panel queues research. The worker runs the real
   `claude-sonnet-5-5` job; the owner reads it live and by History replay. Anonymous and
   non-listed calls are checked to fail before any body is read; a cross-owner 404 is claimed
   only with a genuine second identity (none exists yet: report it as untested live).
7. Everyone. Only after that job passes, and ONLY as a separate, explicit founder decision
   that is never part of the same deploy as `owners` and is not implied by the smoke
   passing. It is NOT activated by this documentation or by any earlier step: the panel
   POSTs on its own for every stored fresh scan of every signed-in Google user, each job
   spends the founder's subscription, the only cap is 3 open jobs per user and there is NO
   global cap. If the founder decides to widen it: set `SCAN_LIVE_RESEARCH_ENABLED=on`
   (`1`, `true` and `yes` do the same), remove or leave the id list (it is ignored outside
   `owners` mode), redeploy, and start the persistent service (here: the temporary supervisor, held open). DONE 2026-10-05 by the
   founder's separate decision; see the Status at the top and "Held-open hosting mode".

Kill switches, fastest first: set `SCAN_LIVE_RESEARCH_ENABLED` to the literal `off` (or
remove it) and redeploy (no new work can be queued; running jobs finish). Do not rely on
"anything but `owners` / `on`": `1`, `true` and `yes` also open research to every signed-in
user. Then revoke the worker token on Vercel and redeploy (the worker gets 401 and backs
off). A flag change and a token revoke BOTH take effect only after a redeploy. Finally stop
the worker: `systemctl --user disable --now bsproof-research-worker.service` (the
system-unit fallback uses `sudo systemctl disable --now bsproof-research-worker.service`).
Experimental, ungraded audits are never a score input in any of these modes.

Stale header text in `docs/research-jobs.sql` (the file is hash-locked, so the correction
lives here and not in the SQL): its header still says "NOT RUN YET" and tells the reader to
"set SCAN_LIVE_RESEARCH_ENABLED=1". Both are out of date. The file HAS been applied to the
shared project (re-verified read-only on 2026-10-04), and `1` is the wrong first switch: use
`owners` as above; `1` / `true` / `on` / `yes` is the separate general-use decision of step 7.
(Until 2026-10-06 its sha256 stayed `48783cd3a6d9535b0a8ca8a792c0f73b3d32a98d3b0550c730731b5d9cd9a4fb`; that file is the one
that was APPLIED and is kept byte-for-byte as `tests/fixtures/research-jobs-baseline-48783cd3.sql`. The current file is the
one-attempt + v0.3 revision, sha256 `7fb43b838f6191072ffe268704ea7a30ce13fcfe7aefd5ff48751080e078e9ec`; the migrations are 001 `9d147ecf30bd5ba4c47c33e50dd18fc11bbca10e5371354240eb919aff33fb41` and 002 `1f2368e155e5c36cf79b27eba8d05e7b7aac4d62b9cd084e1e88a5ec392c46fb`.)

## Why the Vitamin D job failed three times

**Evidence.** The three original raw streams (`runs/20261005T111436Z-…`, `…112130Z-…`, `…112912Z-…`; 0400, untouched; sha256
pinned in `tests/fixtures/grounding-replay-vitd-20261005.json`) were replayed through the REAL guard with `tests/test_grounding_replay.py`.
A fresh session each, `claude-sonnet-5-5` at `xhigh`, 409 s / 457 s / 468 s, 12+29 / 10+24 / 21+23 WebSearch+WebFetch calls. Each run
returned a schema-valid audit and was refused only by `validate_live_receipts_and_inventory`. The worker's message names only the FIRST
refused id; the real extent was 10 of 10 cited rows (run 1), 5 of 13 (run 2), 3 of 10 (run 3).

| stage | what the capture shows | rows | verdict |
|---|---|---|---|
| **A. Extraction missed a printed PMID** (`extract_ids`, and its twin `idsIn` on the server) | A content-bearing WebFetch summary printed `**PMID:** 35939577` with the title, journal, year. The pattern `PMID[:\s#]*digits` does not allow the `**` the summariser put after the colon. Run 1's summariser used that form throughout: the OLD pattern recognised **0** labelled PMIDs in run 1's returned text (18 now), 33 of 43 in run 2. | 13 | **parser fault. The model had retrieved the paper.** |
| **B. Extraction mangled a printed DOI** | A search result printed `https://frontiersin.org/articles/10.3389/fpubh.2022.979649/full`. The DOI regex captures `…979649/full`, which is not the cited `…979649`. (`/pdf` did the same in run 1.) | 1 | **parser fault.** |
| **C. The id is not printed by any returned result** | (1) a bare number in a "The PMID list … is:" line, then an efetch whose question did not ask for the PMID; (2) an id typed into the model's own Europe PMC request, whose summary returned the title but not the id; (3) a number inside the address of a third-party "full citation" link in a search result that was never opened; (4) a DOI assembled from the tails of two `pubs.rsc.org` link addresses. | 4 | **model citation process. The guard is right to refuse; it must stay.** |
| accepted as printed | | 15 | — |

So the answer to "did it hallucinate the papers": **not in these runs**. Every id in stage A/B had a retrieved page that printed its title and year
(where the same PMID occurs in more than one run it carries the same title); in stage C the papers in (1) and (2) were retrieved in that same run,
but the model's question asked for title, authors, journal and year and NOT for the identifier (the grounded records were fetched with "give PMID, title …"), so the
model asserted an identifier the tool never printed, which is exactly what the guard exists to refuse. Not established: that any number
the audit reports from those pages is right (nobody checked). With stages A and B fixed each of the three runs still ends with 1, 1 and 2
refused rows, so the extraction fix ALONE rescues none of them: stage C is why rule L7 exists.

**What the fix does and does not do.**
- A + B (`PMID_RE`, `DOI_WEB_VIEW_SUFFIXES`; `idsIn` on the server; one shared fixture `tests/fixtures/id-extraction-cases.json` run by Python and
  TypeScript): a PMID is recognised when the returned text labels it `PMID` with only whitespace, `:`, `#` or `*` before the digits; a DOI
  read out of a URL ending exactly `/full` or `/pdf` also yields the bare DOI (the full capture is kept too). Still NOT recognised, by test:
  a bare number, "PMID list … 123", "PMIDs: 123", a table cell, a number in a link address, an id that appears only in the model's own
  request, `__PMID:__`, any other URL tail, a different DOI behind `/full`. A receipt that is missing, failed (error/wall/refusal), for a
  different paper, or an invented id cannot ground a row (`test_negative_*`).
- The server recomputes this grounding in `complete` and answers 422 `invalid_result`, which the worker never retries; so the two sides MUST
  agree (a worker-only fix would turn an accepted audit into a lost job). Deploy order below.
- C (`prompts/research_audit_live.md` rule L7, `live-research-v0.3`): tells the model the check exists and how it works (exact text match on
  returned results; one unprinted id loses the whole run; there is no second run), to ask WebFetch to print the PMID/DOI/NCT exactly as printed
  when it opens a record, to check every inventory row against a returned result before answering, to delete a row it cannot find (and the
  claims that rested on it, and list it in `could_not_access`), and that a shorter audit with an empty inventory and `unclear` is a complete,
  accepted answer. No unit, number, constant, gate or schema field changed; `tests/test_pc_research_worker.py` proves v0.3 = the v0.2 text
  (kept verbatim in `tests/fixtures/research_audit_live_v0.2.md`) + L7 + the version strings.
- Nothing is whitelisted, repaired, stripped or re-run. No id is accepted because the model asserted it or because a URL was requested.
  Haiku summaries stay summaries (`access` must be `snippet`, `original_documents` 0).

**Limits, plainly.** One invocation can still fail (the model may ignore L7 or the summariser may not print the id), and with one attempt
that job then ends `failed`. L7 has been tested against nothing but its own text; the replay proves the extraction fix, not the prompt. A
scoped validation run (one job, on the owner's decision) is the only way to learn whether L7 works. This is also why a third path was NOT
taken: accepting "the model requested this PMID and a page came back" would let a redirect or a wrong page ground an invented id.

## One attempt per job and medium effort: what changed, install order, drain

**Status: a CANDIDATE in the repository. Migrations 001 and 002 have NOT been applied, the new runtime has NOT been built or installed, the
website has NOT been deployed with it, and no real job was run to test any of it.** Research stays EXPERIMENTAL and UNGRADED; the
ENLT-error / progress copy is unchanged apart from the one stalled-notice line below.

What changed (and what did not):

| | before | after (candidate) |
|---|---|---|
| model / effort | `claude-sonnet-5-5` / `xhigh` | `claude-sonnet-5-5` / **`medium`** (live research only; the S1-S8 and label adapters are untouched) |
| live prompt | `live-research-v0.2` | **`live-research-v0.3`** = v0.2 + rule L7 (citation check), nothing else (proved by test) |
| id recognition (worker `extract_ids`, server `idsIn`) | `PMID: 123`, `PMID 123`, pubmed URL, DOI, PMC, NCT | the same + Markdown-bold `**PMID:** 123` + the bare DOI behind a `/full` or `/pdf` URL tail; nothing else |
| claims per job | up to 3 (`attempts < 3`) | **1** (`attempts < 1`) |
| posted `fail` with `retryable: true` | requeued while `attempts < 3` | **final** (`failed`, the posted code); `retryable` is ignored for requeueing |
| expired lease | re-claimed; third expiry -> `failed(lease_expired)` | **final**: the next claim ends it as `failed(lease_expired)` |
| inventory id not printed by any returned result | `worker_internal_error`, retryable | `audit_contract_violation`, not retryable; guard unchanged |
| job prompt versions | `complete` accepts v0.2 only | `complete` (migration 002) and the server accept v0.2 AND v0.3; the worker serves both; the website stamps v0.3 on new jobs |
| unchanged | lease 300 s (30-900 s clamp), heartbeat, completion CAS and replay, owner filter, 3 open jobs per owner, no global cap, RLS, grants, tokens, `SCAN_LIVE_RESEARCH_ENABLED` (public flag stays on), Google-only ownership, no turn/token/budget/runtime cap, delivery/heartbeat/poll retries (network, not model runs), the `schemas/research_audit.json` audit schema, every unit and constant | |

What the one-attempt rule costs, said plainly: a transient local fault (quota or rate limit, an expired login, a missing CLI path,
a PC that sleeps or is stopped mid-job) now ends THAT job as `failed` instead of retrying it, and the owner sees the failure code. There
is no "research again" path (an owner's repeat request returns the same failed job: the per-scan key is unchanged). That is the
user's decision, not an oversight. It is also why the CAUSE of grounding failures had to be fixed: with one attempt, a refused audit is a
lost job.

Legacy jobs: nothing is cancelled, requeued, deleted or edited by either migration. A job `running` with a live lease keeps it (heartbeat and
completion unchanged, whatever its `attempts` value: 2 or 3 from the old policy still finishes on its current token). A
finished job (`succeeded` / `failed`) stays final. An ALREADY-expired legacy running job, and any later expiry, ends as
`lease_expired` at the next claim instead of being re-offered. A `queued` job with `attempts >= 1` (requeued by the old policy) would
never be claimed again, so migration 001 REFUSES to apply while one exists (nothing changed); finish it under the old policy first. A job
queued under `live-research-v0.2` before the website upgrade is still served and completed (the worker runs the v0.3 prompt for it; the
audit's `meta.prompt` and the stored provenance say v0.3, the job row keeps its old stamp).

**Which tier must be upgraded before which.** Four tiers carry the rules (website, database, worker runtime, prompt) and a wrong order
loses jobs, because a refused completion or a refused claim is final under one attempt:

| website | SQL | worker | outcome |
|---|---|---|---|
| old | old | old | production today |
| old | 001+002 | old | fine (the SQL is a superset), one attempt per job |
| **new** | 001+002 | **old, RUNNING** | **bad:** the old worker claims a v0.3 job and refuses it (`unsupported_prompt_version`, final). Never leave the old worker running once the website is deployed |
| new | **old** | any | **bad:** a v0.3 job cannot complete (`unsupported_prompt_version` 409) |
| **old** | any | **new** | **bad:** the old website rejects the v0.3 audit (422) and the lease then expires |
| new | 001+002 | new | the target; also fine with a v0.2 job or a v0.2 result |

Hence the order: **stop the worker first, SQL second, website third, worker last.** (Pushing `main` IS the website deploy.)

Install order (owner-run, in this order; nothing here was run):

1. **Stop the worker (drain).** `$SUP stop --drain` waits, with no deadline, for the running job to finish and then stops the worker; do not
   use `stop --now` (a cut job is lost). Leave it stopped until step 5. New jobs simply stay `queued`.
2. **Read-only queue check**, then the SQL: `select status, attempts, count(*) from public.bsproof_research_jobs group by 1, 2 order by 1, 2;`
   Expect no `running` row and no `queued` row with `attempts >= 1`. If a `queued` row with `attempts >= 1` exists, start the CURRENT (old) runtime, let
   it finish that job, drain again, re-check. Then apply, each once and verifying its sha256 first, through the path that applied the first file:
   `docs/research-jobs-migration-001-one-attempt.sql` (sha256 `9d147ecf30bd5ba4c47c33e50dd18fc11bbca10e5371354240eb919aff33fb41`) and `docs/research-jobs-migration-002-prompt-v0.3.sql` (sha256 `1f2368e155e5c36cf79b27eba8d05e7b7aac4d62b9cd084e1e88a5ec392c46fb`).
   Each is one transaction behind a read-only guard (nothing changes unless it is safe), idempotent, in either order, and each prints a VERIFY query
   in its header (read-only; expect `true`). Neither touches a table, grant, owner, RLS or any job.
3. **Push `main`** (review first). The website now stamps v0.3, accepts the two id forms and both prompt versions. Check the Vercel deployment is READY on that
   commit. No Vercel setting, token or flag changes; the public flag stays `on`. (While the worker is stopped nothing claims the new jobs.)
4. **Build and install the new runtime** from that commit: `deploy/pc_research_worker_release.sh build` (refuses uncommitted runtime files), `install <tgz> <sha256>`,
   `check` (no model, no claim). `deploy/pc_research_supervisor.py` is not part of the runtime tarball (it is copied separately, see "Install" above): the
   installed copy keeps the OLD `stop` message ("re-offers it, using one of its 3 attempts"), which is merely wrong, not unsafe, until the owner re-copies it.
5. **Start**: `$SUP start --expect-commit <new> --expect-unit-sha256 <U> --wait-ready 90`, then `status` READY.
6. Verify without a model call: `status` READY, both VERIFY queries `true`, the owner `GET` of an existing failed job unchanged. Do not queue a test job unless the
   owner decides to: one job is the only way to learn whether rule L7 works, it spends the subscription once at medium, and its result is still an unvalidated model audit.

Rollback (owner decision only): the order reverses: `stop --drain`, `rollback` the runtime, promote the previous website deployment, THEN (optionally) re-apply the
2026-10-04 function bodies (`git show f7664b2:docs/research-jobs.sql`; idempotent, keeps every job; migration 002 is a superset and can stay). A job already ended
as `lease_expired` or `failed` under the new policy is final and is not undone. Do not roll back the runtime alone while the new website is deployed (table above).

Not proved here: any live behaviour (no model call, no SQL on the real database, no runtime install, no deploy), that rule L7 changes what the model does,
that `medium` grounds better or worse than `xhigh`, or that a medium run is faster. The result is still an unvalidated model audit.

## Verification (offline; no network, no model, no live database)

`docs/research-jobs.sql` is proven by EXECUTING it, not by reading its text:
`tests/research-jobs-sql-exec.test.ts` applies the committed file verbatim to an
in-memory PostgreSQL 17 (PGlite) behind stand-ins for the `anon`, `authenticated` and
`service_role` roles (with Supabase's default privileges), and checks the queue
semantics (idempotent enqueue, owner cap, owner-filtered reads, hashed leases,
heartbeat, expiry (final: ONE attempt per job, no re-claim), a retryable fail that is still final, jobs a legacy
3-attempt policy left behind, completion compare-and-set and replay,
conflict, stale-lease failure, immutability) and the privilege model (RLS, no direct
table access for any role, six service-role-only functions, pinned `search_path`),
the shared-project guard (refuses to run next to a foreign table/function/index/trigger
and leaves everything intact), and idempotent re-application. A 20-mutant suite removes
one guarantee at a time and requires a scenario to catch each (the former 3-attempt knobs are mutants now: each one put back is
caught). The same file also executes migration 001 on top of the byte-for-byte 2026-10-04 baseline
(`tests/fixtures/research-jobs-baseline-48783cd3.sql`, the file that was applied): the migrated project equals a fresh
provisioning from the current file (catalog, owners, ACLs, comments, search_path, RLS, policies), changes no row, keeps a
running attempt-2 job on its current lease, leaves finished jobs final, refuses (changing nothing) to run while a
`queued` job with `attempts >= 1` exists, is idempotent, and has its own mutant suite. Migration 002 (`bsproof_research_complete` accepts the v0.2 and
v0.3 job versions) is executed the same way: exactly one function body changes (owner, ACL, comment, `search_path`, security definer unchanged), 001 then 002 equals 002
then 001 equals a fresh provisioning, a v0.3 job and a queued v0.2 job complete while v0.1 is refused, no row changes, and its guard and mutants are caught.
`tests/scan-research-queue-parity.test.ts` runs one scripted history through the
in-memory queue the route tests use and through the real SQL and requires identical
answers. Limits: PGlite is one connection, so concurrent `for update skip locked`
claims cannot be raced, and it is PostgreSQL 17.5 rather than the project's 17.6.
Python: `python3 -m unittest tests.test_source_access_v2 tests.test_pc_research_worker tests.test_grounding_replay`
(needs `jsonschema`; a missing module fails, it does not skip). `tests.test_grounding_replay` replays verbatim excerpts of the three original Vitamin D raw
streams through the real guard (old extraction patched back in reproduces the three recorded failures exactly; the fixed one grounds exactly the printed ids and refuses the
four assertions; receipt missing / failed / for another paper / invented id cannot ground a row) and, where the private captures exist, replays the untouched originals
(hash-pinned, opened read-only; a different file fails, a missing directory skips only that class). `tests/fixtures/id-extraction-cases.json` is run by Python
(`tests.test_source_access_v2`) and TypeScript (`tests/scan-research-id-parity.test.ts`) so the worker's and the server's id recognition cannot drift. No test depends on the
machine clock, calls a model or touches the network.

An installed runtime is a COPY (`deploy/pc_research_worker_release.sh build`): changes
to the worker, adapter, prompt or schemas reach the mainPC only through a new release
that the owner installs.

## Residual limits

The stream's returned text is transient evidence only; grounding uses identifier
string matches and does not independently verify scientific claims. Research is
experimental/unvalidated and does not change score, clinical approval, or user
risk classification. There has been no model call, migration or runtime deployment of the 2026-10-06 candidate.
Review, provisioning and clinical validation remain separate human gates. An id the tool printed grounds a row; that proves the paper was
retrieved, not that the audit's numbers or conclusions are right.

## Fixed validation gates (offline, no model)

- `npx vitest run tests/scan-research.test.ts tests/scan-research-v2.test.ts tests/scan-research-target-sql.test.ts tests/research-audit-schema.test.ts tests/research-jobs-sql-exec.test.ts tests/scan-research-queue-parity.test.ts tests/scan-research-id-parity.test.ts tests/scan-research-owner-smoke.test.ts tests/scan-research-wire.test.ts tests/scan-research-client.test.ts tests/scan-research-panel.test.tsx`
- `.venv/bin/python -m unittest tests.test_pc_research_supervisor` (54 tests: fake and REAL worker under the supervisor; needs
  jsonschema>=4 for the real-worker class; no model, no network beyond loopback, no root)
- `.venv/bin/python -m unittest tests.test_pc_research_worker tests.test_source_access_v2 tests.test_grounding_replay tests.test_label_elemental_dose`
  (the repo `.venv` has jsonschema 4.x; a system Python with jsonschema 3.x cannot validate Draft 2020-12, so
  the worker tests FAIL there by design instead of skipping)
- `npm run typecheck`
- `npm run lint`
- `python3 -m pipeline.invariants`
- `python3 -m pipeline.selftest`
- `git diff --check`
- `cp deploy/bsproof-research-worker.service.example /tmp/bsproof-research-worker.service && XDG_RUNTIME_DIR=$(mktemp -d) systemd-analyze --user verify /tmp/bsproof-research-worker.service`
  (the user unit is configuration; ALWAYS with a throwaway `XDG_RUNTIME_DIR`, never the real one, see the CAUTION in the install section; on a host without the mainPC paths, "executable not found" is expected and is not a PASS for the real paths)
- `sha256sum tests/fixtures/research-jobs-baseline-48783cd3.sql` must stay `48783cd3a6d9535b0a8ca8a792c0f73b3d32a98d3b0550c730731b5d9cd9a4fb`
  (the file that was applied to production); `sha256sum docs/research-jobs.sql docs/research-jobs-migration-001-one-attempt.sql docs/research-jobs-migration-002-prompt-v0.3.sql`
  must equal `7fb43b838f6191072ffe268704ea7a30ce13fcfe7aefd5ff48751080e078e9ec`, `9d147ecf30bd5ba4c47c33e50dd18fc11bbca10e5371354240eb919aff33fb41` and `1f2368e155e5c36cf79b27eba8d05e7b7aac4d62b9cd084e1e88a5ec392c46fb` (the candidate, NOT applied)

These tests use fake streams and fake HTTP queue clients only. They do not prove
model behavior, account state, provisioning, or clinical validity.

## Handoff

State (2026-10-06, UTC) — **READ THIS FIRST. The objective is NOT "cap the retries"; it is "make one research invocation produce a usable audit, and
stop paying for the same failure three times".** A candidate on a local branch (NOT on `main`, NOT pushed) holds: id-recognition fix (worker + server, shared
fixture), prompt `live-research-v0.3` (v0.2 + rule L7 only), medium effort, one attempt per job, migrations 001 and 002. Nothing is applied, installed or
deployed, and no model has run any of it. Root cause (replayed from the three immutable captures): of 33 cited ids, 14 were retrieved and printed in a form
the extraction did not recognise (parser fault, fixed), 4 were asserted by the model without any returned result printing them (model process; the guard must
refuse them; rule L7 is the attempted fix and is UNPROVEN), 15 were fine. A release that ships only the cap/effort would still lose jobs to this. Next, owner-run,
in THIS order (a wrong order loses jobs; see the table in "One attempt per job and medium effort"): `stop --drain` and leave the worker stopped -> read-only queue
check -> apply migrations 001 and 002 -> push `main` and confirm the Vercel deploy -> build + install the runtime -> `start` -> `status`. The state below
(2026-10-05) is the PRODUCTION state until then.

State (2026-10-05, UTC): RELEASED_EVERYONE under the held-open hosting condition. Production runs `273c2d5` with
`SCAN_LIVE_RESEARCH_ENABLED=on` (every signed-in Google user; the Git deploy of this documentation commit is checked after its push
and reported in the release report, not in this file). The temporary supervisor/worker run on the main PC and only while the user keeps
a terminal open with the PC awake and online; G4 was NOT performed. Open items: keep the terminal open; if that ends for long, set
`owners`/`off` and redeploy first and `stop` the worker if the backlog must stop; after any PC/WSL/Windows restart run `start` again; a
non-allow-listed identity check and the phone check are untested; watch a long `running` job (no heartbeat check); the VPS is next and
needs its own permission. Kill switches: flag `owners`/`off` + redeploy (queueing only), `stop --drain`/`stop --now`, token revoke + redeploy.

Earlier state (2026-10-04, UTC; superseded): `main` = `9e9c0d30becd1cc70fff2f115205dfbdeb8d7514`, production READY on it in
the private `owners` mode, runtime reinstalled from it, one owned job passed end to end
(experimental, ungraded, not scored). Open items, in order: (1) the owner installs the
persistent service (commands in "Owner-only install path"); (2) optional: a phone check and a
live cross-owner 404 with a genuine second Google identity (both untested live); (3) a SEPARATE
explicit founder decision before research is opened to everyone (step 7; not implied by this smoke);
(4) hygiene: delete the unused `~/.config/bsproof-research-worker/smoke.env`; the release
script's header still calls the system unit "preferred". Kill switch: set the flag to the
literal `off` and redeploy. The older private candidate `component/final-release-live-research-20261004`
must never be pushed: its tip carries a real account handle in `CLAUDE.md`.
---
Previous local status note: the initial V1 worker had been exercised during an earlier
benchmark; that historical benchmark is not proof of this V2 integration. The ONE V2 run is the
owned smoke recorded in the Status above (one job, two attempts).

Output remains experimental and unvalidated.