# Main-PC research worker — contract, install, health, rollback

Status (after ONE private smoke; 2026-10-05 UTC) — **`live-research-v0.5` (code commit `4228a3f`) completed ONE private smoke invocation, and the owner's read-only validation of it returned `VALIDATION: PASS` (n = 1). It is NOT released: the migrations are NOT applied, nothing is pushed, the website is NOT deployed with it, the runtime is NOT installed, and production is UNCHANGED (3 attempts, `xhigh`, v0.2; the old worker is READY on `9e9c0d30becd`). The owner's release is conditional on the founder's explicit written acceptance of two named code gaps (W1, W2), or a new candidate that closes W1: see "Smoke run on 4228a3f (n = 1)" below. The status paragraphs below that say "no model was run" were true when they were written and are kept as history.**

Status (2026-10-06, UTC) — **CANDIDATE `live-research-v0.5` on a local branch: FOLLOW-THROUGH checked against the tool receipts and enforced inside the SAME single `medium` CLI invocation. NOT applied, NOT installed, NOT deployed, NOT pushed, and NOT shown to work on a real model: no model was run to produce or test it.**
Read the section **"Follow-through (live-research-v0.5)"** below first; the v0.4 status paragraph that follows is kept as history. Two private validation runs of earlier candidates (v0.3, v0.4) both ended `completed` but EMPTY after a single search; rewording the prompt twice did not change what the model does, so v0.5 makes follow-through a property of the receipts:
the model must account for every source lead its searches listed (a LIVE-only `lead_ledger`, address / disposition / note), the worker checks that ledger against the WebSearch / WebFetch calls it really made (a model cannot certify a page "opened"), and when the leads are not followed the worker sends ONE worker-authored follow-up into the same process (`--input-format stream-json`) instead of calling the run finished.
A run whose leads are still not followed ends `research_followthrough_incomplete` (terminal, one model run) as soon as a follow-up turn reduced none of the problems reported before it (`stalled`; new tool calls and links alone are not progress) or the delivery wire's own capacity (300 receipts / 400 ledger rows) means no further turn could be delivered (`receipt_capacity`). The follow-up turns of ONE invocation are not automatic research reruns: one process, one claim, one attempt, no second `Popen`, and no turn, time or token counter. An honestly exhausted run (every lead requested or dismissed with a stated reason, every blocked page followed by an independent attempt) may legitimately return little or nothing; **that is a terminal honest result, it is NOT a successful smoke, and nothing here says any run was useful.** The ONE successful known-Vitamin-D smoke and its duration are still to be run by the parent under a NEW explicit owner approval ("Smoke record" below is intentionally unfilled). No effort level is observed (it is requested on the command line); nothing is called fixed, validated, verified, proven or approved.

Status (v0.4 history, 2026-10-06, UTC; superseded by the paragraph above) — **CANDIDATE `live-research-v0.4` on a local branch: id recognition, prompt rule L8 ("open before you conclude"), ONE attempt per job and MEDIUM effort. NOT applied, NOT installed, NOT deployed, NOT pushed, and NOT shown to work: the v0.4 prompt has had NO model run, and the one private run of its predecessor (v0.3) FAILED the owner's usability criterion (section "Validation run 1").**
The user asked for live research on `claude-sonnet-5-5` at effort **medium** with **one** attempt per job (no automatic second or
third model run), and then said the real question is *why an attempt fails*, so a cap alone is not the fix. **What the replay of the
three original captures shows** (section "Why the Vitamin D job failed three times"): the worker's inventory-grounding guard refused
each audit because cited ids were not "printed in returned tool text". That was TRUE for 4 of the 33 cited ids over the three runs
(the model asserted an id no returned result printed) and FALSE for 14 of them: those papers WERE retrieved, and the ids WERE in
returned text, but in a form the extraction did not recognise (a Markdown-bold `**PMID:** 123` label the small summariser model
wrote; a DOI inside a URL ending `/full`). The other 15 were accepted. The guard is unchanged and strict. **What the candidate changes**
(see the table in "One attempt per job and medium effort"): (1) the id extraction, in lockstep in the worker and the server, for exactly those two
measured forms (this part is replay-verified: 14 of the 18 refused rows; each original attempt STILL fails when replayed, with 1, 1 and 2 rows
refused); (2) the live prompt `live-research-v0.2` -> `v0.3` (= v0.2 plus rule L7, the citation check) -> **`v0.4`** (= v0.3 plus rule L8, which
tells the model to open with WebFetch every relevant study/trial/review lead a search surfaced before it concludes that nothing could be confirmed, and
changes three sentences so that an empty result is allowed only after L8); every tier accepts v0.4, v0.3 and v0.2 so no queued job and no old runtime is
stranded; (3) effort `xhigh` -> `medium` (REQUESTED on the command line; the CLI stream reports no effort level, so it is not observed or proven), model unchanged;
(4) one attempt per job in the SQL (`docs/research-jobs.sql`, migration 001), and `bsproof_research_complete` accepting the v0.4, v0.3 and v0.2 job versions (migration 002);
(5) the grounding refusal is classified `audit_contract_violation`, not a retryable worker fault. **What is NOT claimed:** that the Vitamin D failure, or any
failure, is fixed. Only the id-recognition part is verified (by replay). Whether L8 makes a single `medium` invocation open the leads and return a usable audit is
UNPROVEN: v0.3 was run once and ended with one search, nothing opened and an empty inventory, and v0.4 has not been run by any model. The early stop of that one run is a
reading of the prompt text and of the model's own output (n = 1; effort and prompt were changed together), not a controlled finding. No wording here may call the candidate
"fixed", "validated", "verified", "proven" or "approved". **Nothing here is live until the owner follows "One attempt per job and medium effort: what changed,
install order, drain" (the order matters), and nothing is released without a validation run that the owner judges useful (section "Validation plan for v0.4").
Even then a research run can still fail**: the replay shows 4 residual unprinted ids that no parser change may accept, and a one-attempt job that fails ends `failed`.
Everything below that says "three attempts", "requeued" or "re-claimed" describes the 2026-10-04/05 production state until the migrations are applied.

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
`prompts/research_audit_live.md` (`live-research-v0.4`; v0.2 and v0.3 are frozen verbatim in `tests/fixtures`),
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
one-attempt + v0.5 revision, sha256 `84ce6cb633ed4aa3ee3282e890db359604f8ff3dea52d923465856c5917d78be` (it was `e323562c81329bef1569fa73359a5c2835a0ba3052d0ba68ecc13b820510fef1` in the v0.4 candidate and `7fb43b838f6191072ffe268704ea7a30ce13fcfe7aefd5ff48751080e078e9ec` in the v0.3 candidate); the migrations are 001 `9d147ecf30bd5ba4c47c33e50dd18fc11bbca10e5371354240eb919aff33fb41` and 002 (`docs/research-jobs-migration-002-prompt-v0.5.sql`, renamed from `...-v0.4.sql` while still unapplied) `44bec975597cfc94d24b099c691342b943159245130af1084b93089732420d0c`.)

## Why the Vitamin D job failed three times

**Evidence.** The three original raw streams (`runs/20261005T111436Z-…`, `…112130Z-…`, `…112912Z-…`; 0400, untouched; sha256
pinned in `tests/fixtures/grounding-replay-vitd-20261005.json`) were replayed through the REAL guard with `tests/test_grounding_replay.py`.
A fresh session each, `claude-sonnet-5-5` at `xhigh`, 409 s / 457 s / 468 s, 12+29 / 10+24 / 21+23 WebSearch+WebFetch calls. Each run
returned a schema-valid audit and was refused only by `validate_live_receipts_and_inventory`. The worker's message names only the FIRST
refused id; the real extent was 10 of 10 cited rows (run 1), 5 of 13 (run 2), 3 of 10 (run 3).

| stage | what the capture shows | rows | verdict |
|---|---|---|---|
| **A. Extraction missed a printed PMID** (`extract_ids`, and its twin `idsIn` on the server) | A content-bearing WebFetch summary printed `**PMID:** 35939577` with the title, journal, year. The pattern `PMID[:\s#]*digits` does not allow the `**` the summariser put after the colon. Run 1's summariser used that form throughout: the OLD pattern recognised **0** labelled PMIDs in run 1's returned text (18 now), 33 of 43 in run 2. | 13 | **parser fault. The model had retrieved the paper.** |
| **B. Extraction mangled a printed DOI** | A search result printed `https://frontiersin.org/articles/10.3389/fpubh.2022.979649/full`. The DOI regex captures `…979649/full`, which is not the cited `…979649`. (A `/pdf` form of the same address was also printed, in the Links list of a search result in run 1 (its raw stream, line 28); run 1 cited no DOI, so no cited row depended on it. The cited DOI is in run 3.) | 1 | **parser fault.** |
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
  a bare number, "PMID list … 123", "PMIDs: 123", a table cell, a number in a third-party link slug (`…/medline/citation/<n>/full_citation`; a
  `pubmed.ncbi.nlm.nih.gov/<n>/` address IS recognised), an id that appears only in a request URL's query
  string (`…efetch…id=…`), `__PMID:__`, any other URL tail, a different DOI behind `/full`. A receipt that is missing, failed (error/wall/refusal), for a
  different paper, or an invented id cannot ground a row (`test_negative_*`).
- **What the guard still accepts (pre-existing and UNCHANGED; the owner's R1).** It grounds an id on the WHOLE text of a SUCCESSFUL returned result. A
  WebSearch result begins `Web search results for query: "<the model's own query>"`, so an id the model typed into its own search QUERY is echoed in the
  returned text and counts as grounded: in the committed replay fixture, run 3's `10.1056/NEJMoa2202106` is printed in no returned result except that header
  echo, and it is grounded. An id inside a link address of a search result that was never opened (`pubmed.ncbi.nlm.nih.gov/<n>/`, a DOI in a URL) counts, and so
  does a fetch summary that restates a requested URL. The guard also does not check that an id belongs to the paper the audit row describes. Rule L7 asks the model
  not to rely on any of these; the guard does NOT enforce it. Any tightening is a separate, explicitly authorised change on both the worker and the server. Do NOT
  read "an id that appears only in the model's own request is never recognised" into this section: that holds for a request URL's query string, not for a search query echo.
- The server recomputes this grounding in `complete` and answers 422 `invalid_result`, which the worker never retries; so the two sides MUST
  agree (a worker-only fix would turn an accepted audit into a lost job). Deploy order below.
- C (`prompts/research_audit_live.md` rule L7, added in `live-research-v0.3`): tells the model the check exists and how it works (exact text match on
  returned results; one unprinted id loses the whole run; there is no second run), to ask WebFetch to print the PMID/DOI/NCT exactly as printed
  when it opens a record, to check every inventory row against a returned result before answering, and to delete a row it cannot find (and the
  claims that rested on it, and list it in `could_not_access`). As written in v0.3 it also said that a shorter audit with an empty inventory and
  `unclear` "is a complete, accepted answer"; **v0.4 deletes that phrase** (see "Validation run 1" for why) and limits the empty finish to "only after L8".
  No unit, number, constant, gate or schema field changed. `tests/test_pc_research_worker.py` proves, on FROZEN fixtures, v0.3 = the v0.2 text
  (`tests/fixtures/research_audit_live_v0.2.md`) + L7 + the version strings, and v0.4 = the v0.3 text (`tests/fixtures/research_audit_live_v0.3.md`,
  sha256 `3ef4ecfb373d163393aa7b3d90e2492947a5f64817665716b5b43ad1e8f4ed5e`, byte-for-byte the prompt the private run used) + an enumerated list of replacements + L8.
- Nothing is whitelisted, repaired, stripped or re-run. No id is accepted merely because the model asserted it; an id counts when some SUCCESSFUL returned
  text contains it, which includes the query echo and link addresses described above. Haiku summaries stay summaries (`access` must be `snippet`, `original_documents` 0).

**Limits, plainly.** One invocation can still fail (the model may ignore L7 or the summariser may not print the id), and with one attempt
that job then ends `failed`. The replay proves the extraction fix, not the prompt, and the one private run of v0.3 cited no id, so it tested neither
L7 nor anything about ids. A scoped validation run (one invocation, on the owner's decision) is the only way to learn whether L7 and L8 work. This is also why a third path was NOT
taken: accepting "the model requested this PMID and a page came back" would let a redirect or a wrong page ground an invented id.

## One attempt per job and medium effort: what changed, install order, drain

**Status: a CANDIDATE in the repository. Migrations 001 and 002 have NOT been applied, the new runtime has NOT been built or installed, the
website has NOT been deployed with it, no real job was run to test any of it, and the v0.4 prompt has had NO model run.** (One private invocation of the predecessor
prompt v0.3 failed the owner's usability criterion; see "Validation run 1".) Research stays EXPERIMENTAL and UNGRADED; the
ENLT-error / progress copy is unchanged apart from the one stalled-notice line below.

What changed (and what did not):

| | before | after (candidate) |
|---|---|---|
| model / effort | `claude-sonnet-5-5` / `xhigh` | `claude-sonnet-5-5` / **`medium`** (live research only; the S1-S8 and label adapters are untouched) |
| live prompt | `live-research-v0.2` | **`live-research-v0.4`** = v0.3 + rule L8 ("open before you conclude") + three sentences that now say an empty result is allowed only after L8; v0.3 = v0.2 + rule L7 (citation check). Both steps are proved by test on frozen fixtures; the L8 effect on the model is UNPROVEN |
| id recognition (worker `extract_ids`, server `idsIn`) | `PMID: 123`, `PMID 123`, pubmed URL, DOI, PMC, NCT | the same + Markdown-bold `**PMID:** 123` + the bare DOI behind a `/full` or `/pdf` URL tail; nothing else |
| claims per job | up to 3 (`attempts < 3`) | **1** (`attempts < 1`) |
| posted `fail` with `retryable: true` | requeued while `attempts < 3` | **final** (`failed`, the posted code); `retryable` is ignored for requeueing |
| expired lease | re-claimed; third expiry -> `failed(lease_expired)` | **final**: the next claim ends it as `failed(lease_expired)` |
| inventory id not printed by any returned result | `worker_internal_error`, retryable | `audit_contract_violation`, not retryable; guard unchanged |
| job prompt versions | `complete` accepts v0.2 only | `complete` (migration 002) and the server accept v0.4, v0.3 AND v0.2; the worker serves all three (always with the v0.4 prompt); the website stamps v0.4 on new jobs |
| unchanged | lease 300 s (30-900 s clamp), heartbeat, completion CAS and replay, owner filter, 3 open jobs per owner, no global cap, RLS, grants, tokens, `SCAN_LIVE_RESEARCH_ENABLED` (public flag stays on), Google-only ownership, no turn/token/budget/runtime cap, delivery/heartbeat/poll retries (network, not model runs), the `schemas/research_audit.json` audit schema, every unit and constant | |

What the one-attempt rule costs, said plainly: a transient local fault (quota or rate limit, an expired login, a missing CLI path,
a PC that sleeps or is stopped mid-job) now ends THAT job as `failed` instead of retrying it, and the owner sees the failure code. There
is no "research again" path (an owner's repeat request returns the same failed job: the per-scan key is unchanged). That is the
user's decision, not an oversight. It is also why the grounding failures had to be tackled at all, not only capped: with one attempt, a refused audit is a
lost job.

Legacy jobs: nothing is cancelled, requeued, deleted or edited by either migration. A job `running` with a live lease keeps it (heartbeat and
completion unchanged, whatever its `attempts` value: 2 or 3 from the old policy still finishes on its current token). A
finished job (`succeeded` / `failed`) stays final. An ALREADY-expired legacy running job, and any later expiry, ends as
`lease_expired` at the next claim instead of being re-offered. A `queued` job with `attempts >= 1` (requeued by the old policy) would
never be claimed again, so migration 001 REFUSES to apply while one exists (nothing changed); finish it under the old policy first. A job
queued under `live-research-v0.2` (or v0.3) before the website upgrade is still served and completed (the worker runs the v0.4 prompt for it; the
audit's `meta.prompt` and the stored provenance say v0.4, the job row keeps its old stamp).

**Which tier must be upgraded before which.** Four tiers carry the rules (website, database, worker runtime, prompt) and a wrong order
loses jobs, because a refused completion or a refused claim is final under one attempt:

| website | SQL | worker | outcome |
|---|---|---|---|
| old | old | old | production today |
| old | 001+002 | old | fine (the SQL is a superset), one attempt per job |
| **new** | 001+002 | **old, RUNNING** | **bad:** the old worker claims a v0.4 job and refuses it (`unsupported_prompt_version`, final). Never leave the old worker running once the website is deployed |
| new | **old** | any | **bad:** a v0.4 job cannot complete (`unsupported_prompt_version` 409) |
| **old** | any | **new** | **bad:** the old website rejects the v0.4 audit (422) and the lease then expires |
| new | 001+002 | new | the target; also fine with a v0.3 or v0.2 job or result |

Hence the order: **stop the worker first, SQL second, website third, worker last.** (Pushing `main` IS the website deploy.)

Install order (owner-run, in this order; nothing here was run). **Step 0 is a precondition, not an action of this document:** a validation run of the v0.4 candidate
that the owner judges useful under "Validation plan for v0.4" (a NEW owner approval bound to the exact head, after a read-only review and the gates). Without it nothing below happens.

1. **Stop the worker (drain).** `$SUP stop --drain` waits, with no deadline, for the running job to finish and then stops the worker; do not
   use `stop --now` (a cut job is lost). Leave it stopped until step 5. New jobs simply stay `queued`.
2. **Read-only queue check, then the SQL.** Take read-only fingerprints first (the six function definitions, their ACLs and owners, the RLS flag and policies, and
   `select status, attempts, count(*) from public.bsproof_research_jobs group by 1, 2 order by 1, 2;`). Expect NO `running` row and NO `queued` row with `attempts >= 1`:
   - a `queued` row with `attempts >= 1` (requeued by the old policy): start the CURRENT (old) runtime, let it finish that job, drain again, re-check;
   - **a `running` row (the drain can fire while a claim POST is in flight: the supervisor treats any worker state other than `running` as idle, and the worker writes
     `running` only after the claim returns, `deploy/pc_research_supervisor.py` and `scripts/pc_research_worker.py`).** That job keeps its lease and would be failed as
     `lease_expired` by migration 001 without ever having run. Do NOT cancel, requeue or edit the row or its lease: restart the OLD runtime, let it finish the job under
     the 3-attempt SQL, drain again, and re-check until there is no `running` row. Every job and every lease is preserved.

   Then apply both files, each verified against its sha256 first, through the path that applied the first file, in ONE explicit transaction with the worker STOPPED:
   `docs/research-jobs-migration-001-one-attempt.sql` (sha256 `9d147ecf30bd5ba4c47c33e50dd18fc11bbca10e5371354240eb919aff33fb41`) and `docs/research-jobs-migration-002-prompt-v0.5.sql` (sha256 `44bec975597cfc94d24b099c691342b943159245130af1084b93089732420d0c`; it accepts v0.5, v0.4, v0.3 and v0.2).
   Each sits behind a read-only guard (nothing changes unless it is safe), is idempotent, works in either order, and prints a VERIFY query in its header
   (read-only; expect `true`). Neither touches a table, grant, owner, RLS or any job. The files hold NO `begin;`/`commit;` of their own: submit BOTH
   inside ONE `begin; ...001...002... commit;` submission (see "Scope amendment and rollout hazards": the guard and the replacement are separate statements, and the
   wrapper is untested on the real submission path; after ANY error, verify read-only that nothing applied). **Immediately after the transaction and BEFORE the push**, run
   BOTH VERIFY queries (001 and 002; expect `true`) and re-take the fingerprints: only the two function bodies may differ; no row, lease, grant or policy may.
3. **Push `main`** (review first). The website now stamps v0.5, accepts the two id forms and the four prompt versions, and takes a v0.5 result on the `source_access_v3` wire (v0.2-v0.4 results on `source_access_v2`). Check the Vercel deployment is READY on that
   commit. No Vercel setting, token or flag changes; the public flag stays `on`. (While the worker is stopped nothing claims the new jobs.)
4. **Build and install the new runtime** from that commit: `deploy/pc_research_worker_release.sh build` (refuses uncommitted runtime files), `install <tgz> <sha256>`,
   `check` (no model, no claim). `deploy/pc_research_supervisor.py` is not part of the runtime tarball (it is copied separately, see "Install" above): the
   installed copy keeps the OLD `stop` message ("re-offers it, using one of its 3 attempts"), which is merely wrong, not unsafe, until the owner re-copies it.
5. **Start exactly ONE reviewed supervisor**: `$SUP start --expect-commit <new> --expect-unit-sha256 <U> --wait-ready 90`, then `status` READY. `start` is
   idempotent: if it prints `already running`, it started nothing and an OLD runtime is still serving; stop that one and start again (never run two).
6. Verify without a model call: `status` READY, both VERIFY queries `true` again, the owner `GET` of an existing failed job unchanged. **No public job is queued or re-run to test**
   (in particular NOT the original Vitamin D job): the validation of step 0 is the only model run the release plan has, and its result is still an unvalidated model audit.

Rollback (owner decision only): the order reverses: `stop --drain`, `rollback` the runtime, promote the previous website deployment, THEN (optionally) re-apply the
2026-10-04 function bodies (`git show f7664b2:docs/research-jobs.sql`; idempotent, keeps every job; migration 002 is a superset and can stay). A job already ended
as `lease_expired` or `failed` under the new policy is final and is not undone. Do not roll back the runtime alone while the new website is deployed (table above).
**Preflight before the rolled-back (v0.2-only) runtime is started (R2, read-only):** after the website rolls back, that old worker would claim any still-queued v0.4 (or
v0.3) job and fail it permanently with `unsupported_prompt_version` (`scripts/pc_research_worker.py`). Run
`select count(*) from public.bsproof_research_jobs where status in ('queued','running') and prompt_version <> 'live-research-v0.2';` (this now also covers v0.5 jobs) -- the count MUST be 0. If it is not,
do not start the old runtime: let the NEW runtime drain those jobs first (`stop --drain` it afterwards), then re-check. A `running` row after a drain is handled as in step 2
(restart the runtime that owns it, let it finish, drain again; never cancel or edit it).

Not proved here: any live behaviour (no SQL on the real database, no runtime install, no deploy, no model run of v0.4), that rule L7 or L8 changes what the model does,
that `medium` grounds or researches better or worse than `xhigh`, or that a medium run is faster or cheaper (the 19.5 s of the one v0.3 run compares a run with no research to
runs with research). Effort is REQUESTED (`--effort medium`, recorded as `effort_requested`); the CLI stream carries no effort level, so it is not observed.
The result is still an unvalidated model audit.

## Scope amendment (durable) and rollout hazards — 2026-10-06

**What the user asked, in order.** (1) "switch to sonnet 5.5 medium ... make it go from one": `claude-sonnet-5-5` at `medium`, ONE attempt per job.
(2) Then, explicitly: "no why would an attempt fail I want you to taclkle that issue" [sic]. Latest acceptance: tackle the actual Vitamin D
grounding failures so that a SINGLE `medium` invocation can produce usable evidence; a cap-only release is NOT acceptable; strict validation never
accepts an ungrounded source id.

**Authorised by that amendment, and nothing wider:**
- a minimal source-id recognition fix in the Python worker (`PMID_RE`, `DOI_WEB_VIEW_SUFFIXES`) AND the server TypeScript (`idsIn`); the two MUST agree
  (one shared fixture runs on both);
- an explicit source-only citation rule in the live prompt (rule L7);
- the matching prompt versions (`live-research-v0.3`, then `live-research-v0.4`), the `schemas/source_access_v2.json` `runner.prompt_version` enum, and complete-RPC compatibility
  (`bsproof_research_complete` accepts v0.4, v0.3 and v0.2);
- versioned, narrow, NON-destructive SQL migrations (001 claim/fail, 002 complete): `create or replace` of the named functions, no table, grant, owner,
  RLS or job touched;
- regression tests for all of it.

**Not authorised, and not done:** any other scientific schema, rubric or model-boundary change; a source-id whitelist; any repair, stripping or invention
of evidence; any other constant (thresholds, caps, weights, units, turn/token/budget/deadline, provider fallback). The only operational values moved are
the two the user named (effort `xhigh` -> `medium`, attempts 3 -> 1) plus the prompt-version strings above. The guard is unchanged: an inventory id that
no returned tool result prints is still refused.

**Second amendment (2026-10-06, after the one failed validation run): `live-research-v0.4`.** The owner's validation review (VALIDATION: FAILED, criterion 6) gave a fix card, and this
candidate implements exactly that card and nothing wider: (1) prompt `live-research-v0.4` = the frozen v0.3 text + ONE rule block L8 ("Open before you conclude": a search result is a list
of leads; before writing that nothing could be confirmed, open with WebFetch every result that names a study, trial, systematic review or meta-analysis of the product or one of its listed
actives, asking for the identifier as L7 says; an unopenable lead is recorded in `could_not_access` with its address and what came back; "I did not open it" and "the search result printed no
identifier" are not reasons to skip a lead; an empty inventory is the right answer only after this; L8 contains no number) + exactly three sentences changed (Rule 1, L4, L7: each "only after
L8"; "a complete, accepted answer" deleted; "a fuller audit with one unprinted id is not" kept; the L7 "Not counted" bullet and everything else byte-identical); (2) the version bump carried
through the `source_access_v2` enum, `lib/scan-research/contract.ts`, the worker/adapter constants, `docs/research-jobs.sql`, migration 002 (edited in place, unapplied; renamed
`...-prompt-v0.4.sql`; list = v0.4, v0.3, v0.2) and the tests/fixtures; (3) static tests, a frozen v0.3 fixture, and a replay/negative fixture of the failed run; (4) the five documentation
corrections R1-R5. **Not changed, by instruction:** `extract_ids`, `PMID_RE`, `DOI_WEB_VIEW_SUFFIXES`, `idsIn`; `validate_live_receipts_and_inventory` and its error class;
`schemas/research_audit.json`; the one-attempt SQL (migration 001 is byte-identical); `EFFORT` (`medium`) and `MODEL`; no whitelist, repair or stripping; no turn, token, budget or deadline flag;
no fallback; and **no code gate on the number of fetches** (under one attempt it would turn a thin audit into a lost job; L8 is wording only, and "the worker rejects a thin audit" is NOT
true and is not said anywhere).

Product-scope clarifications that bound L8 (the task owner's, for this fix; not new founder decisions): L4 stays as it is -- single-ingredient evidence is CONTEXT only, context rows stay
optional, and component evidence is never a whole-formula efficacy claim; L8 asks only that the leads a search already surfaced are opened, with no numerical minimum of pages, searches,
turns, tokens or minutes; a real "no evidence" or "blocked" outcome is acceptable ONLY when every relevant lead was followed and the access record is honest -- a one-search placeholder is
not that; nothing forces an empty inventory into a false positive (L8 says not to keep or invent a row); unknown servings per day and unknown daily dose stay `unknown` (no default of one
serving), as before. The Vitamin D3 + K2 target needs no new clinical or product decision from the founder for this fix.

**Review disposition.** The independent review of `f7664b2..f2bfec3` returned NEEDS_WORK for ONE reason: its task card carried the earlier, frozen
cap-only scope and omitted the amended root-cause objective (the implementation report had recorded it). Its four "critical" items (prompt, schema
enum, complete RPC / migration 002, id recognition) are exactly the authorised items above, not scope creep. Its Fix Card option 1 (narrow back to
`777a7b0`, drop `f2bfec3`) is NOT taken: that is the cap-only release the user rejected. `f2bfec3` is preserved as it is (no reset, rebase or drop). Its
warnings stand and are the hazards below. NOT claimed: that `f2bfec3` has been reviewed against the amended scope; that review and a re-run of the
gates on the final tree are still required before anything is applied. This docs commit changes no source file, so the earlier gate results apply
to unchanged source.

**What the replay proves and does not prove.** Recognising ids in the text the tools returned rescues 14 of the 18 refused inventory ids (13 bold
`**PMID:**` + 1 DOI behind `/full`). The other 4 are the model's own unprinted assertions and stay correctly refused. Each of the three original attempts
STILL FAILS when replayed through the fixed guard (`test_the_fixed_extraction_moves_each_failure_to_the_models_unprinted_id`: 1, 1 and 2 rows refused).
No claim is made that the original job, or any attempt of it, would now succeed. The original job is NOT repaired, re-queued or re-run by this work. How
the new prompt behaves is UNPROVEN: no model has run it.

**Validation of the new prompt is the owner's decision.** The only way to learn whether L7 and L8 help is ONE private Vitamin D `medium` validation invocation
("Validation plan for v0.4"). It needs a NEW explicit owner approval bound to the exact head, after a read-only review and the gates. This document grants no such approval.
There is no hidden second model run (a failed invocation is final), no repair, re-queue or re-run of the original job or of any public job, and no new budget, deadline or provider
fallback.

**Rollout order (restated).** Stop or drain the OLD worker and leave it stopped -> read-only queue check -> the reviewed migrations 001 and 002 in one
transaction (both VERIFY queries right after it, before the push) -> deploy v0.4 (push `main`, confirm the Vercel deploy) -> build and install the exact reviewed runtime -> start ONE reviewed supervisor.
The tier table above says what each wrong order costs.

**Hazards, plainly.**
- Production today is the OLD state: 3 attempts, `xhigh`, prompt v0.2. Nothing in this candidate is applied, installed, deployed or pushed.
- A wrong order loses jobs, because one attempt makes a refused claim or completion final: the new website before migration 002 (a v0.4 job cannot
  complete, 409); a v0.2-only worker that claims a v0.4 job (final `unsupported_prompt_version`); the old website with the new worker (422, then the lease
  expires). Nothing in code enforces the order.
- The medium worker on the OLD 3-attempt SQL can still give one job up to 3 model runs (a retryable `fail` is requeued, an expired lease is re-claimed):
  migration 001 must come first.
- Migration atomicity: the guard (a `do` block) and the `create or replace` statements are separate statements. If an old worker posted a retryable
  `fail` between them, a job requeued with `attempts >= 1` would sit `queued` forever. Hence the worker is stopped first AND both files go in one explicit
  transaction. The offline SQL tests run each file as one multi-statement `exec` on PGlite (atomic there); the explicit wrapper and the real submission
  path (SQL editor or Management API) have NOT been exercised. If the path rejects the wrapper, stop and ask; do not apply the files piecemeal while any
  worker can run.
- A worker stop or lease loss is now terminal: SIGTERM, a crash, a host suspend, `stop --now`, a reboot, an OOM kill or a heartbeat outage longer than
  the lease ends the job as `lease_expired`, with no second try. Use only `stop --drain`.
- The effort is requested, never observed: it is proved at the argv level (`--effort medium`, recorded as `effort_requested`), not from the CLI stream.
- A job queued under v0.2 or v0.3 before the upgrade is served with the v0.4 prompt; its row keeps the old stamp and its provenance says v0.4.
- The server recomputes grounding on `complete` (422 on disagreement, never retried): a worker-only or website-only deploy of the id fix turns an
  accepted audit into a lost job. Both sides ship together.
- Test limits: PGlite is one connection, so `for update skip locked` concurrency is not exercised; it runs PostgreSQL 17.5, production 17.6.
- One invocation can still fail, and that job then ends `failed`. Research stays EXPERIMENTAL and UNGRADED, never scored.

## Validation run 1 (2026-10-05 UTC): FAILED -- complete but empty

**Read this before the "Status: a CANDIDATE" statements above: ONE private run of the v0.3 predecessor of the current candidate has been made, and it failed the owner's usability criterion. The v0.4 candidate below has had no model run.**

What was run (the owner approved exactly ONE invocation, after the code review and the gates): the candidate's real `scripts/pc_research_worker.py` `handle_job` against an
in-process FAKE queue client (no network, no database, no token, no new user / scan / job / row), the real `claude -p --model claude-sonnet-5-5 --effort medium` with the v0.3 prompt
on the owner subscription, and the ORIGINAL sanitized Vitamin D3 4000 IU + K2 target of the failed job. The old worker had been drained first (queue empty: 0 queued, 0 running) and was
restored afterwards; the three original captures were hash-checked before and after (unchanged). The effort is REQUESTED only: the CLI stream has no effort field.

What happened: `completed` in 19.5 s, 3 turns, ONE WebSearch, ZERO WebFetch; one outcome with an EMPTY inventory, `effectPoints: "unclear"`, and a `confidence_note` saying only one
search was run and no source was opened. Models: `claude-sonnet-5-5` (4 in / 1947 out tokens) and Haiku 4.5 (10328 in / 423 out) only; `original_documents` 0; the only returned text
is a Haiku-written search summary. The worker's guard and the server's own check (`checkLiveResearchResultV2`, applied to the byte-identical payload) accepted it.

What it does NOT show: acceptance of an EMPTY inventory is by design (there is nothing to ground) and is NOT evidence that the cause fix works. No id was cited, so the per-id table and
the pairing check are vacuous; the route, the SQL, the deploy and the supervisor were not exercised; nothing says the early stop would recur (n = 1), and effort and prompt were changed
together, so L7 and medium cannot be told apart. The owner's criterion 6 (at least one non-empty inventory) FAILED: "complete but empty; usability not shown".

Why it stopped (a reading of the prompt and of the model's own output, not a controlled experiment): `prompts/research_audit_live.md` never orders the model to open the leads a search
returns ("Search before you write" is satisfied by one search); L7 says an id read out of a link address of an unopened result does not count, that one unprinted id loses the whole run
with no second run, and that a short audit "is a complete, accepted answer"; the older Rule 1 and L4 text also sanction an empty inventory. With one attempt and no retry, citing nothing
was the cheapest compliant action. The one search result did contain leads (a Frontiers systematic review at `/full` and `/pdf`, a pubs.rsc.org record, a PubMed link), and the
three original xhigh attempts made 34-44 WebSearch + WebFetch calls each (23-29 WebFetch).

Consequence: the candidate is NOT releasable as it stands, and its one-attempt + medium + parser parts must not be released alone (a cap-only release; a `succeeded` placeholder cannot be
retried). Production is unchanged (3 attempts, `xhigh`, v0.2). Migrations 001 and 002 were NOT applied, nothing was pushed, no runtime was built or installed. The approval for a
model run is used up; a further run needs a NEW explicit owner approval bound to the new head, after a read-only review and the gates.

What the v0.4 candidate does about it (implemented by a fresh worker from the owner's fix card; **no model has run it**): prompt `live-research-v0.4` = v0.3 + rule L8 ("Open before you conclude")
and Rule 1, L4 and the L7 sentence limited to "only after L8" (the phrase "a complete, accepted answer" is gone); the version bump carried through the schema enum, `lib/scan-research/contract.ts`, the
adapter/worker constants, `docs/research-jobs.sql`, migration 002 (edited in place; unapplied) and the tests and fixtures; a frozen copy of the v0.3 prompt
(`tests/fixtures/research_audit_live_v0.3.md`, sha256 `3ef4ecfb373d163393aa7b3d90e2492947a5f64817665716b5b43ad1e8f4ed5e`, the exact text this run used) with a static lineage test (v0.4 = v0.3 + an enumerated list of replacements + L8);
a replay/negative fixture of this run (`tests/fixtures/validation-run1-one-search-empty-audit.json`: the returned search text and the empty audit, session ids and brand stripped) that pins
BOTH facts: the real guard accepts it (by design) AND the validation analysis (`tests/helpers/validation_usability.py`, test-only) labels it `usable: false`, "complete but empty; usability not shown", and exits non-zero.
No numeric constant, no code gate on the number of fetches (the guard and the parser are unchanged and are not made to count pages), no whitelist. **Still open:** an independent review, the owner's read-only review, the gates,
and a NEW explicit owner approval for ONE validation run ("Validation plan for v0.4"). Whether L8 changes what a medium invocation does is unknown.

Questions the owner raised, answered by the task owner's scope clarifications (see "Second amendment"), not by a number: a blend's single ingredients are CONTEXT only and stay optional (L4 is unchanged); no
minimum amount of research is set -- the rule is "every relevant lead the searches already surfaced"; a complete-but-empty audit is acceptable only after every relevant lead was followed and the access record is honest.

## Validation run 2 (2026-10-05 UTC, `live-research-v0.4`, head `ca6c440c70b71d488f9de2ca629e5c98b2f4b655`): FAILED -- complete but empty again

**This is the second private validation run, on a DISTINCT candidate (v0.3 -> v0.4); it is not a retry of one job or of one candidate. It failed the owner's usability criterion, so v0.4 is NOT releasable and is NOT shown to work.**

What was run (the Claude Code owner, read-only, approved exactly ONE invocation bound to `ca6c440` after a delta-only review of v0.3 -> v0.4): the same harness design as run 1 with a NEW directory and a NEW
marker; it refuses any head except `ca6c440` (so the failed `17e3231` can never be re-run) and pins the v0.3 run directory (mode 0400, result sha256) next to the three original captures. The candidate's
real `scripts/pc_research_worker.py` `handle_job` against an in-process FAKE queue client (no network, no database, no token, no new user / scan / job / row, no label re-scan), the real
`claude -p --model claude-sonnet-5-5 --effort medium` with the v0.4 prompt on the owner subscription, the ORIGINAL sanitized Vitamin D3 4000 IU + K2 target. The public worker was drained first
(`stop --drain`; queue 0 queued / 0 running, no job cut) and restored afterwards to the SAME reviewed runtime (public worker gap 1 min 33 s; READY). The three original captures and the v0.3 run
directory were hash-checked before and after (unchanged).

What happened: `completed` in 21.3 s, 5 turns: ONE WebSearch and TWO WebFetch, both on ONE record (the pubs.rsc.org page, in an English-locale and a Spanish-locale address), both "HTTP 403 Forbidden" (counted as
errors, not requests). One outcome with an EMPTY inventory, `effectPoints: "unclear"`, `could_not_access` = the two 403 addresses plus "Other search leads (pubmed 11180916, examine.com, ...) were not opened in this run."
Models: `claude-sonnet-5-5` (8 in / 2100 out tokens) and Haiku 4.5 (9954 in / 490 out) only; `original_documents` 0; the only returned text is a Haiku-written search summary. Effort is REQUESTED only.
The worker's guard and the server's own check (`checkLiveResearchResultV2` with the v0.4 parameter, applied to the byte-identical payload; the parameter is verified to matter: v0.1 is refused) accepted it by design
(nothing to ground). That is NOT evidence of anything. Payload 7720 bytes, 3 events.

Owner verdict (read-only validation review): `VALIDATION: FAILED`. Criterion 6 (usable) FAIL: "complete but empty; usability not shown". Criterion 7 FAIL on its last bullet (a `could_not_access` line saying leads
"were not opened"). Criteria 4 and 5 vacuous (0 ids). The per-id table and pairing were not exercised.

Why (the owner's reading of the prompt and of the model's own output, NOT a controlled result; the model's thinking text is blank): L8 was followed in part (it fetched and asked for the identifier) and not in its main demand.
(1) `live-research-v0.4` L8 says an empty inventory is right if every relevant lead "was opened or was recorded in `could_not_access`", and writing "were not opened in this run" is a recording, so it met the letter of that
sentence although the neighbouring sentence forbids "I did not open it" as a reason. (2) "Relevant" is keyed to titles, but the Links titles were site names ("Issue 4, 2020", "pubmed.ncbi.nlm.nih.gov", "examine.com"):
only the snippet names a study, and it is not tied to an address; the model counted ONE lead. (3) After an HTTP error the prompt only says to record it, and the tool's own 403 text suggests an authenticated tool the model does not have.
(4) The last instruction ("If the research did not work, return the honest low-confidence audit") does not mention L8. (5) L2 accepts "nothing relevant" as a reason; L7 prices a wrong id as a total loss and an empty audit at nothing;
L8 starts at line 341 of 371. STEP 1 and the schema description still permit emptiness. Two fetches here are one lead, so a "minimum fetches" gate would have passed this run.
Correction to an operator brief: the Frontiers systematic review was a lead of the v0.3 run's search result, NOT of this run's (the nine links here were pubs.rsc.org x3, pubmed 11180916, examine.com, sciencebasedmedicine, drmirkin, lenz.io x2, wbldb.lievers.net).

What n = 2 can and cannot show: the empty-after-one-or-two-calls path occurs at REQUESTED medium under two different prompt texts (1 WebSearch + 0 / 2 WebFetch, against 34-44 calls at xhigh in the three originals); effort and prompt are
perfectly confounded (xhigh went with v0.2, medium with v0.3 and v0.4; there is no medium + v0.2 run and no xhigh + v0.4 run); the v0.4 run cannot show whether L8 changed anything (WebFetch 0 -> 2 across two single draws with
different search results). It does NOT show that wording alone can or cannot fix this, a rate, or that the 403 is the cause.

Consequence: `ca6c440` is NOT releasable; no partial release (one-attempt + medium + parser alone were already judged a cap-only release; both observed medium runs end `succeeded` but empty, which under one attempt is the user's final
result). Production is unchanged (3 attempts, `xhigh`, v0.2); migrations 001 and 002 NOT applied; nothing pushed; no runtime built or installed. The approval is USED UP (marker and approval file stay).

Next (owner's recommended order; a FRESH worker implements it, the operator does not): (1) NO code and NO run: put to the founder (D) whether MEDIUM must stay, given two distinct candidates at medium that stopped after at most two calls
against three at xhigh with 34-44; the carried question whether a complete-but-empty audit is acceptable to show a user under one attempt; and the flag that option (B) changes the audit schema. (2) In parallel, a fresh worker builds
(A) prompt-only `live-research-v0.5` with (E) test-only lead accounting, and the owner reviews it read-only: delete the "or recorded" exit in L8; make every Links address a lead and open PubMed / PMC / Europe PMC / ClinicalTrials.gov /
DOI / publisher addresses; after an error go to the next lead AND search again for the study by title (another locale of the same page is the same lead); no `could_not_access` line may say a lead was "not opened"; add the L8
condition to ROLE, L2 and HOW TO RETURN; no digit in L8; STEP 1 and the schema description stay byte-equal. (3) Only if the founder confirms MEDIUM stays: ONE private validation of v0.5 (a NEW owner approval bound to the new head, directory `validation-v05`,
new marker, v0.4 run directory pinned); the owner pre-states that a criterion-6 failure on this third distinct candidate closes prompt-only at medium, after which (B) (a required schema-visible `leads[]` disposition per lead; needs
founder approval, touches the schema, the worker guard, fixtures and any TS/UI mirror) or a changed effort goes to the founder with no v0.6 wording loop. (C) (the worker refuses an audit whose `could_not_access` says "not opened") is NOT recommended: it turns a
thin audit into a lost job under one attempt and punishes honesty. Open owner warnings still to carry into the release commit: W1 (server-check parameter is v0.4 in the harness), W2 (`research-jobs.sql` defines 8 functions and 3 bodies change: claim, fail, complete),
W3 (the first full vitest run on `ca6c440` failed 2 tests in an untouched file, `tests/scan-auth-history-integration.test.tsx`, then passed 72 files / 1193 tests twice: unexplained, not proven pre-existing, not claimed fixed), W6 (a test docstring says "wherever").

May be said: two private validation runs on two distinct candidates at requested medium on the same sanitized target, each `completed` with an empty inventory; v0.3 = 1 WebSearch + 0 WebFetch, v0.4 = 1 WebSearch + 2 WebFetch (both HTTP 403 on one record);
the guard and server accepted both by design; criterion 6 not met in either; neither is releasable; production unchanged; n = 2 distinct candidates, one draw each; the wording defects above are readings of the text, not tested causes.
Must not be said: fixed / validated / verified / proven / works / passed / approved; that L7, L8 or medium caused the result, or that L8 "partly worked" or "made it open pages"; that medium is faster, cheaper or better (21 s against
409-468 s compares different amounts of research); that effort was observed; that the worker rejects thin audits (it accepted both); that acceptance means grounded or good; that Frontiers was left unopened in v0.4; any rate or percentage; that
the Haiku figures are findings; that wording alone can or cannot fix this; anything about the product's efficacy.

## Validation plan for v0.4 (it WAS approved once on head `ca6c440`, run once and FAILED -- see "Validation run 2" above; this plan is USED UP)

One private invocation, later, only on a NEW owner approval bound to the exact head after a read-only review and the gates. The previous marker and `OWNER_APPROVED.json` (bound to `17e3231`) are used up and stay; the
new run uses a NEW harness directory, a NEW `O_EXCL` marker and a harness that asserts `HEAD == the approved commit`. The harness is not told the marker in advance and no public or original job is re-run. Preconditions
(all mechanical, before the run; if any fails nothing runs and the approval is void): clean tree on the approved head; the repo `.venv` with `jsonschema >= 4` and Draft 2020-12; `claude --version` exactly `2.1.287`
with the subscription login; **no active public worker and no duplicate process** (drain first, so that quota is not contended and a second runtime cannot claim the same lease); run directory 0700 and files 0400,
outside the repository, never committed; the three original captures hash-checked before and after. What runs: the worker's real `handle_job` against a fake queue client, the real CLI at requested `medium`,
the original sanitized Vitamin D3 4000 IU + K2 target (servings per day and daily dose stay `unknown`).

**PASS needs all seven** (unchanged from the owner's criteria): (1) exactly one invocation, one marker, originals' manifest equal before and after, zero `fail` posts and exactly one `complete`; (2) diagnostics: model `claude-sonnet-5-5` in the
CLI init, `apiKeySource none`, model usage a subset of Sonnet and Haiku, `effort_requested == "medium"` (requested, not observed), prompt sha equal to the pinned v0.4 file; (3) `checkLiveResearchResultV2` returns `ok:true` on the byte-identical
payload, provenance prompt v0.4; (4) every inventory id accepted by the guard, with a per-id table of where it is printed (summary/snippet body, link address, or the query-echo header only); an id printed only as (iii) the echo is a disclosed caveat and
not evidence that L7 works; (5) pairing: each row's year, design, n or title agrees with the record printed next to that id in the same returned text, zero mismatches (link-address-only rows listed separately); (6) **usable: at least one outcome with
a non-empty inventory** (`tests/helpers/validation_usability.py`; if every inventory is empty it is "complete but empty; usability not shown" and the run FAILS); (7) honest: every row `access: "snippet"`, `original_documents` 0, Haiku
summaries counted as summaries, no invented form, dose, servings or population, no approval language. **Recorded, not gated:** the WebSearch/WebFetch counts and which leads of the Links lists were opened or recorded in `could_not_access`
(a fail is never rescued by, and a pass never requires, a particular number of fetches).

**A FAIL is not to be rationalised** as "almost passed", "only one id", "a parser fault", "L7 partly worked", "L8 partly worked" or "worth one more run"; a quota, auth or CLI fault is neither a pass nor a result about L7/L8 (record the code and stop).
The marker stays used; any further run needs a fresh explicit approval. After a failure: no whitelist, no relaxing of the guard, no edit of the audit, no claim that the original job is repaired. Criterion 6 failing again = FAILED again, pre-stated.

## Follow-through (live-research-v0.5): leads checked against the tool receipts, enforced in the same CLI session

**Status: a CANDIDATE (written before the smoke; ONE private smoke has since been run on `4228a3f`: see "Smoke run on 4228a3f (n = 1)" below, which wins where the two differ). Everything in this section that sounds like a guarantee is a statement about code and tests, not about what a model does.**

### Why this exists (facts, from the immutable captures)

| run | prompt | what happened | duration |
|---|---|---|---|
| validation 1 | v0.3 | 1 WebSearch, **0** WebFetch, empty inventory, `completed` | 19.5 s |
| validation 2 | v0.4 | 1 WebSearch listing **9** links (one a PubMed record), then 2 WebFetch of **one** pubs.rsc.org record in two locale addresses (`/en/` and `/es/`), **both HTTP 403**, empty inventory, `completed`; the other 8 leads never requested | 21.3 s |

The guard accepted both runs by design: nothing was cited, so nothing was ungrounded. Two different prompts produced the same early stop, so a third wording was not the next step. The old xhigh runs are unchanged evidence: 14 of their 18 refused ids were printed in returned text and are recognised by the (kept) parser fix; 4 were the model's own unprinted assertions and still fail replay (1, 1 and 2 rows). Nothing is whitelisted or repaired.

### Design decision (made, not a menu)

1. **Required, LIVE-only lead ledger.** The model returns an envelope `{audit, lead_ledger}`. `audit` is the canonical `schemas/research_audit.json` object, byte-for-byte, **unmodified schema** (sha256 `0cef5ec381e653e4fbc55ec6f4eebe0204b7d534671bad3bdfa4f3fb8ba64c2b`, pinned in a test); the CLI is given `--json-schema` of the envelope (the canonical schema as `properties.audit`, its `$defs` moved unchanged to the envelope root; `adapter.wire_schema_obj`). Every other schema, audit, benchmark and S1-S8 pin is unchanged. `lead_ledger` rows are `{address, disposition, note}` with dispositions `opened`, `not_opened_secondary`, `not_opened_off_topic`.
2. **Verified against receipts, not believed.** `pipeline/research_leads.py` (pure, stdlib, no model, no network) derives from the ACTUAL tool requests/results, in call order: the **leads** (every address in the `Links: [...]` line of a WebSearch result; addresses that differ only by locale/tracking or carry the same PMID/PMC/DOI/NCT are ONE lead, so a PubMed record and its Europe PMC mirror are one lead), whether a WebFetch was really requested for each (and what came back), and these blocking problems: `lead_unaccounted`, `ledger_unknown_address`, `ledger_claims_open_without_request`, `identifier_lead_unopened` (only when the inventory is empty), `blocked_without_independent_attempt`, `empty_without_any_page_request`. "Independent attempt" = a later search with a query not used before (case/space-normalised), or a fetch of a different lead; an error counts as a try, the other locale of the same page does not. **It is not a fetch-count quota and not a free-text "not opened" heuristic**: no number of pages is demanded (one content fetch can satisfy it, forty failed fetches of one lead cannot), and no sentence of the audit or the ledger notes is read. A ledger that says `not_opened_*` for a page that WAS requested is only a recorded warning. Mirror/fallback evidence is classified (`content_via`: `listed_address` | `mirror_same_record` | `model_chosen_address`); a mirror is never reported as the publisher's page and `access` stays `snippet`.
3. **Same session, one process.** On every CLI `result` event the adapter recomputes the verdict from the raw stream on disk. Unsatisfied -> it writes ONE further user message into the **same stdin of the same process** (`--input-format stream-json`); satisfied -> it closes stdin (EOF ends the CLI). The loop ends by the receipts: `satisfied` (checked FIRST, so a valid result exactly at the wire's capacity still passes); `receipt_capacity` (still unsatisfied and what is unresolved needs one more tool call at >= 300 receipts, or one more ledger row at >= 400 rows, or the run is already past either: the wire's OWN sizes, `schemas/source_access_v3.json` `maxItems`, not an operational budget); `stalled` (a follow-up resolved NONE of the problems reported before it, however many tool calls or new links it added; a turn that added no tool call must also leave fewer problems than before, so a ledger-only turn cannot trade one problem for another without end). **Never by a counter of turns, seconds or tokens, a budget or a deadline.** A malformed ledger is not answered with a follow-up (`ledger_invalid`, the worker reports the schema error). The follow-up is fixed sentences plus a JSON block of ASCII addresses that this run's own tool results returned (each at most 500 characters, valid http(s) shape, closed by a delimiter that cannot occur inside the JSON); no page text, no title, no score, no number (tests pin all of it).
4. **Strict sources, corrected (R1).** The new wire (`SourceAccessV3`, `schemas/source_access_v3.json`) records what each call REQUESTED (a WebSearch: `request.query`; a WebFetch: `request.url` AND `request.prompt`, the question the model put to the Haiku summariser, captured whole: a prompt that is empty or over 4000 characters is refused as `invalid_request_metadata`, never shortened). Grounding takes only content-bearing results and, per event, first **removes the model's own request echoed back** (`Web search results for query: <your query>`, the fetched address and the prompt repeated) and then **excludes every identifier the model's own query / prompt could mean, from that same event**. That own-request read is deliberately LOOSE (`pipeline/claude_research_adapter.own_request_ids`, `lib/scan-research/source-access-v3.ts ownRequestIds`; used ONLY to exclude): every bare 5-9 digit run is a `pmid:` candidate whatever label is or is not next to it, `PMC` / `NCT` / DOI shapes are matched inside any surrounding text (also glued to a word), and a DOI is also taken without the sentence punctuation stuck to it (`...2034577?`), all in the same normalised form as the grounding ids. So an id the model typed itself can no longer ground itself, and neither can a summariser that PARAPHRASES or RELABELS the question ("is study 31234567 on this page?" -> "the page does not mention PMID 31234567"; query `vitamin d 31234567` -> snippet `PMID 31234567`). What a RETURNED text may ground is still read by the unchanged strict extractor (`extract_ids` / `idsIn`). The same id printed by a DIFFERENT, independent successful result (e.g. the search that listed it) still grounds it; error/wall/refusal results never do. This is a correction of the v0.4 limitation, not a loosening: the V2 wire (v0.2-v0.4) is frozen and unchanged. Strict unsupported-ID negatives still fail: the three original xhigh captures replay 1/1/2 refused rows on the frozen V2 rule; on the V3 rule the same captures refuse those rows PLUS one the V2 rule only accepted through the search tool's echo of the model's own query (run 3, `10.1056/NEJMoa2202106`), and the LOOSE prompt/query exclusion refuses nothing more than the echo strip did on any of them (`tests/test_grounding_replay.py`, run against the untouched, hash-pinned captures where present). Exact refused rows: V2 rule run 1 {`36853379`}, run 2 {`PMID:35939577`}, run 3 {`31454046`, `10.1039/C9FO03063H`}; V3 rule (strict or loose exclusion, identical) run 1 {`36853379`}, run 2 {`PMID:35939577`}, run 3 {`31454046`, `10.1039/C9FO03063H`, `10.1056/NEJMoa2202106`}; nothing was loosened to hide a refusal. **Not detected, and said so:** an identifier the model did NOT type that a summariser invents or misreads (nothing here reads the page); an id the model typed into a DIFFERENT call than the one that printed it (that is an independent result, which is allowed to ground it); and a typed number a summariser re-renders in another shape (spaced, thousand-separated, spelled out). The loose read over-excludes on purpose: a 5-9 digit number the model types into a query or prompt (a participant count, say) is excluded as a PMID candidate from THAT call only.
5. **Provenance.** A v0.5 result is posted as `{action:"complete", job_id, lease_token, audit, source_access_v3}`; v0.2-v0.4 stay `source_access_v2`; each wire refuses the other's prompt versions (a v0.5 audit cannot be posted on the weaker wire). The server recomputes bytes, hashes, counters, grounding AND the lead accounting from the posted receipts (`lib/scan-research/lead-accounting.ts` must stay identical to the Python module; one shared fixture, `tests/fixtures/lead-accounting-cases.json`, runs in both languages) and stores only the existing owner-safe summary shape plus a counters-only `source_access.follow_through` (turns, searches, fetches, leads with content / blocked / unattempted, ledger rows, start/finish timestamps); the ledger, queries, addresses and returned text are not stored. `provenance.source_access_version` is `SourceAccessV3` for v0.5 and the panel parser reads both; the SQL stores the same three top-level keys, so **no SQL structure changed** (migration 002 only widens the accepted job versions to v0.5, v0.4, v0.3, v0.2).
6. **Why not the deterministic-retrieval fallback.** It was the stated alternative only if same-session continuation could not be done safely. It can (below), so no new worker-side network client, scholarly API, SSRF surface or credential path was added. The prompt names Europe PMC's public search address as an *example* of an independent source the model may open with the SAME `WebFetch` tool; the model still receives only a Haiku-written summary, and nothing is fabricated as a CLI receipt.

### Real-CLI protocol check (no model, no provider)

CLI 2.1.287 (the version the adapter pins). `tests/fixtures/cli-stream-json-followthrough-probe.jsonl` (sha256 `19ab2dfdf013d6887cff3179e9b875ddf16009bf53159def6ff1726dc5cb4b83`) is a sanitised capture of the REAL binary, driven by `run_research` with exactly the adapter's command (plus the one new flag), against a LOCAL mock of the Messages API (scripted model turns, fake key, throwaway `HOME`, dead proxy; a wrapper only rewrote `init.apiKeySource` so the billing guard saw the subscription-shaped value). Observed: **one process, one session id, three user turns, three `result` events** (an `init` event is re-emitted per turn); the process stays alive after a `result` until the next stdin line or EOF; EOF exits 0; `--json-schema` is enforced *inside* a turn (the CLI rejected a bad disposition and an extra key and the scripted model corrected them in the same turn), so a malformed envelope normally never reaches the worker; `modelUsage` is cumulative across turns; the init `tools` list is `StructuredOutput, WebFetch, WebSearch`. **Not proved by this:** how a real model answers a follow-up, or the web tools (they were not exercised: no real network). Out of scope, recorded: the real captures' init lists home-profile plugins (`skill-creator`, `github`, `claude-md-management`) although `--safe-mode` is set and only three tools are available; this change does not alter that.

### Safety review of the protocol change

* Command: **exactly one added flag**, `--input-format stream-json` (a test compares the full argv against the verified one and bans `--max-turns`, `--max-budget-usd`, `--resume`, `--continue`, `--session-id`, `--settings`, `--mcp-config`, `--add-dir`, `--permission-prompt-tool`, `--replay-user-messages`, `--dangerously-skip-permissions`). Tools stay `WebSearch,WebFetch`, `--safe-mode`, `--strict-mcp-config`, `dontAsk`, `--no-session-persistence`, model `claude-sonnet-5-5`, `--effort medium`. No shared `.claude` settings. The child environment stays the same allowlist (no worker token, no key); nothing credential-shaped is put in a follow-up or in a page header.
* One model invocation: one `Popen`, one claim, no `attempt+1`, no second subprocess, no hidden re-run (tests count `Popen` model spawns and the fake CLI's invocation file; a mutant that spawns a second model process is killed). Delivery retries are network retries and never restart the model.
* Cancellation and lease: the cancel watcher, the heartbeat thread and the stop propagation are untouched and now also cover the follow-up turns (tests: lost lease during a follow-up kills the process and sends nothing; stop during a follow-up cancels and leaves the lease; the heartbeat keeps beating). A CLI that does not exit by itself after the final result is ended after `EXIT_GRACE_S` (60 s; only for a run that is ALREADY finished, it limits nothing about the research) and is not reported as a CLI failure. As before there is no runtime cap: a CLI that never answers a follow-up is held by the lease heartbeat, exactly like a hung single-turn CLI was.
* Untrusted data: page and search text are data. The follow-up carries only addresses, in a JSON block labelled untrusted data; an address with a quote, bracket or delimiter is either not a valid lead address at all (never listed) or is JSON-escaped inside the block (tests). An injection-looking ASCII address ("ignore-all-previous-instructions", a `cmd=curl ...|sh` query, an encoded `<<<LEAD DATA END>>>`) is still only a quoted string inside the fenced block, after the worker's own "this message is not from a web page" framing; a test sends one through a job and checks that only the one model process is ever executed and that the address never reaches a command line. The worker executes nothing from a page.
* New files in the runtime: `pipeline/research_leads.py`, `schemas/source_access_v3.json` (RUNTIME_FILES in `deploy/pc_research_supervisor.py` and `FILES` in `deploy/pc_research_worker_release.sh` now list 8 files; the supervisor test that stages and launches the real worker caught the omission).

### Two review fixes (after the first read-only review of this candidate)

1. **WebFetch prompt echo closed.** The `prompt` of a WebFetch (the model's question to the summariser) is now captured whole into `SourceAccessV3` (`request.prompt`; the schema requires `url` + `prompt` for a WebFetch and `query` alone for a WebSearch) and the identifiers the model typed into a call can no longer ground themselves through that same call, verbatim or paraphrased (`pipeline/claude_research_adapter.grounded_ids_v3` and `lib/scan-research/source-access-v3.ts groundedIdsV3`; eight hand-written parity cases under `grounding_cases` in `tests/fixtures/lead-accounting-cases.json`). Consequence: an id typed into a query and printed back by the SAME result is no longer grounded by it (the earlier V3 test that accepted that was changed); a different successful result that printed it still grounds it. `SourceAccessV2` (`schemas/source_access_v2.json`, sha256 `c510b052...`) is frozen and byte-identical; the CLI's `--json-schema` wire (audit + `$defs.leadLedger`) is unchanged, so `wire_schema_sha256` is unchanged.
2. **The continuation always ends.** Termination uses only what the receipts show and the wire's own sizes (see item 3 above): `satisfied`, `receipt_capacity`, `stalled`. A mock CLI that adds a tool call and a new link every turn without following any lead ends after ONE follow-up (`stalled`, one process, `research_followthrough_incomplete`, not retryable); one that reaches 300 receipts with a tool call still needed ends as `receipt_capacity`; a satisfied result exactly at 300 receipts still completes. The failure message and `followthrough.json` carry the finish reason. These are NOT new operational budgets; the only budget-like rules remain absent by design (no turn, duration, token or runtime cap).
3. **Runtime check.** `pc_research_worker.py check` now FAILS unless the venv's jsonschema is 4.x, and `deploy/pc_research_worker_release.sh install` asserts it in the venv it just built (system `python3` carries 3.2 and cannot run the receipt tests; the offline pipeline gates `python3 -m pipeline.invariants` / `pipeline.selftest` still need no dependency).

**Second read-only review of `0079da7` (NEEDS WORK on ONE point; fixed in the next local commit, nothing else).** Item 1 above was narrowed, not closed: the same-call exclusion read the model's own query / prompt with the normal LABEL-requiring extractor, so an UNLABELLED number the model typed ("Is study 31234567 on this page?", or the query "vitamin d 31234567") was not excluded and a summariser that adds the label itself ("the page does not mention PMID 31234567") grounded it. Now the own-request text is read LOOSELY (see R1, item 4 of the corrections list): `own_request_ids` (Python) and `ownRequestIds` (TypeScript), applied only to the model's own query / WebFetch prompt of the same event, only to EXCLUDE. Unchanged: `extract_ids` / `idsIn`, the verbatim echo strip, the V2 wire, `schemas/source_access_v3.json`, the prompts, the SQL, the continuation logic. Pinned by sixteen shared `grounding_cases` plus six `own_request_cases` in `tests/fixtures/lead-accounting-cases.json` (hand-written; refused: the prompt "Is study 31234567 on this page?" with "does not mention PMID 31234567", a number glued to a word, `NCT` / `PMC` glued to a word, a DOI followed by `?`, the query "vitamin d 31234567" with the snippet "PMID 31234567"; accepted: the same PMID printed by an earlier search whose query did not contain it, another id the same result prints, a year in the query) and by Python and vitest adversarials; a mutant that restores the strict read fails them in both languages. The three original captures replay exactly as stated in R1 above. Still a candidate: no model run, no smoke time exists, the Smoke record below stays UNFILLED.

### What `research_followthrough_incomplete` and a "completed" job mean now

* `completed` (v0.5): the audit validated against the canonical schema, every cited id was printed by a content-bearing result (request echo removed), every search lead is in the ledger, no ledger row claims a request that was not made, every blocked page got an independent attempt, and (if the inventory is empty) every identifier-bearing lead was requested. **It does not mean the research is complete, correct, or that a page was read in full** (WebFetch returns a Haiku summary), and it is still EXPERIMENTAL / UNGRADED, no clinical numeric approval, no score. A blend's D3+K2 component evidence stays CONTEXT ONLY (rule L4 unchanged).
* `failed` / `research_followthrough_incomplete`: terminal, one model run, evidence on the worker's private disk (`followthrough.json`, `continuation-N.txt`, the raw stream). The owner sees only the safe code. Honest "no accessible evidence" is a legitimate terminal outcome of an exhausted run and is NOT counted as a successful smoke.
* `followthrough.json` per job: `cli_invocations`, `user_turns`, `finish_reason` (`satisfied` | `stalled` | `receipt_capacity` | `ledger_invalid` | `cli_result_error` | `no_envelope` | `cancelled`), per-turn decision and problems, `timing` (`started_utc`, `ended_utc`, `elapsed_s` of the whole process, `turn_results_at_s`), the final accounting, and `effort` (`requested_via_argv`; **not observed**: the CLI stream reports no effort level).

### Tests (offline; no model)

`tests/test_research_followthrough.py` (35: pure module, the real-CLI probe replayed through the real adapter and worker, premature runs, a follow-up that leads to real work, locale alias, certify-an-open, one subprocess for a 3-turn job, isolation across the follow-up, CLI error in a follow-up, lost lease / stop / heartbeat during a follow-up, bare audit and bad ledger refused, a harness guard so an unscripted turn fails loudly instead of hanging), `tests/test_source_access_v3.py` (38), `tests/scan-research-lead-accounting.test.ts` (79), `tests/scan-research-v3.test.ts` (39) and route tests in `tests/scan-research.test.ts`; the real-SQL tests (`tests/research-jobs-sql-exec.test.ts`, `tests/scan-research-queue-parity.test.ts`) run the widened `complete` (v0.5, v0.4, v0.3, v0.2) on PGlite with the permission/compare-and-set/lease/stale-token scenarios and mutants, including "a v0.5 job can never finish". **Mutation proof:** 29 deliberate breakages of the real guard code (Python and TypeScript: locale handling, independent-attempt rule, each problem code, request-echo stripping, the server's recomputation, the wire's prompt identity, both receipt keys, no follow-up, no stall detection, ignored worker verdict, a second subprocess) are all killed by the focused tests (the harness restores every file byte-exact). Two early survivors were analysed: one was an equivalent mutant that exposed an untested rule (a fetch of a non-lead address is not an independent attempt; now a shared case), two were faults in the mutants themselves.

### Install order delta (v0.5 on top of "One attempt per job and medium effort: what changed, install order, drain")

The order is unchanged: old worker STOPPED (`stop --drain`, no deadline, never `--now`, never cancel or edit a row) -> reviewed migrations in ONE explicit transaction -> VERIFY and fingerprint -> publish `main` and the canonical docs, deployment READY -> exact runtime install (`deploy/pc_research_worker_release.sh build/install`, **8 runtime files now**) -> ONE reviewed supervisor. What changed: migration 002 is `docs/research-jobs-migration-002-prompt-v0.5.sql` (sha256 `44bec975597cfc94d24b099c691342b943159245130af1084b93089732420d0c`; VERIFY query `complete_accepts_v05`), `docs/research-jobs.sql` is sha256 `84ce6cb633ed4aa3ee3282e890db359604f8ff3dea52d923465856c5917d78be`, migration 001 is byte-identical (`9d147ecf30bd5ba4c47c33e50dd18fc11bbca10e5371354240eb919aff33fb41`); the website stamps NEW jobs v0.5 and routes a v0.5 result to the V3 check; the website must NOT be published before the runtime is ready to claim v0.5 jobs (an old worker would fail a v0.5 job with `unsupported_prompt_version` and one attempt makes that final). Rollback preflight (R2, read-only, before the old v0.2-only runtime starts): `select count(*) from public.bsproof_research_jobs where status in ('queued','running') and prompt_version <> 'live-research-v0.2';` must be 0; if not, let the NEW runtime drain them first; a `running` row after a drain is finished by the runtime that owns it and drained again, **never cancelled, requeued or force-failed**.

### Smoke plan and the time record (the plan; the record of the ONE run that followed is filled in below)

One private invocation, later, on a NEW explicit owner approval bound to the exact 40-hex head, after a read-only review and the gates, with the old worker drained, no duplicate process and no public or original job re-run. **Success = ALL of:** the job ends `completed`; the inventory is NOT empty; every inventory id is printed by a content-bearing result (the guard decides what the CODE accepts; the surface split -- body / link address / query echo -- is read by a PERSON, and an id grounded only by a query echo or an unopened link address is disclosed one by one and is not a success); the follow-through accounting is satisfied with at least one lead requested with content; the audit is plainly experimental/unvalidated with unknowns preserved; blend component evidence is CONTEXT only; no score, dose or regimen was invented. A `completed` empty audit, a `research_followthrough_incomplete`, and an honestly exhausted run are all **not** a successful smoke (record them as what they are; do not retry them). Record, from facts only: wall-clock of the whole CLI process (`followthrough.json` `timing.elapsed_s`, equal to `diagnostics.json` `run.elapsed_s`), per-turn result times (`turn_results_at_s`), user turns, searches/fetches/leads counts, the job's `created_at` -> `completed_at` from the owner `GET` (this includes queue wait; say so), and the server's `source_access.follow_through.started_at/finished_at`. Do not report a rate, a comparison with xhigh (409-468 s compared different amounts of research) or "medium is faster".

**Smoke record (facts from the run's own files; ONE run, n = 1, not an average, no product guarantee; effort `medium` was REQUESTED on the command line and is not observed):**

| field | value |
|---|---|
| head SHA / date (UTC) | `4228a3fccc26c60e70ca339d37426a71126b8753`; 2026-10-05; UTC start 21:04:10.589Z (CLI end 21:05:57.416Z, worker end 21:05:57.481Z, server-check end 21:05:58.353Z) |
| outcome | `completed`, `finish_reason` `satisfied`; the Python V3 guard and the TypeScript `checkLiveResearchResultV3` accepted the same bytes (`result.json` sha256 `a4a29161362e5e5600effe640f440a53eb1a11ccc0c66c6f9afb8b96f8746035`, 29,007 bytes) |
| process wall-clock (`timing.elapsed_s`) | research-only (the one CLI process) **100.309 s** (about 1 min 40 s); the whole worker `handle_job` **100.384 s**; through the server check **101.256 s** (all monotonic clock). The UTC stamps span about 6.5 s more; the cause was not established |
| user turns / searches / fetches / leads (content, blocked, unattempted) | 2 user turns (one worker follow-up) in one CLI process, one session id; 2 WebSearch + 13 WebFetch (one of them a Europe PMC query); 15 leads: 3 with content (two distinct narrative reviews), 6 blocked, 6 unattempted |
| job `created_at` -> `completed_at` (includes queue wait) | not applicable: an in-process fake queue, no job row and no queue wait |
| inventory size / ids printed by tools | 1 row (`PMID:32219282`, in the `CONTEXT ONLY` row; the whole-product row is empty); the PMID is printed in a model summary of a Europe PMC listing; its n and effect figures come from search snippets |

## Smoke run on 4228a3f (n = 1): what was run, what it showed, what it did not

**Status: ONE private smoke ran; the owner's read-only validation returned `VALIDATION: PASS` (not a release PASS). Nothing is released.** Research stays EXPERIMENTAL and UNGRADED.

**What was run** (order, all from the operator's files; the two owner reviews are read-only `claude-sonnet-5-5` at xhigh with Read/Grep/Glob, subscription login, no cap, no fallback): (1) the owner's full read-only review of the v0.5 delta `ca6c440 -> 4228a3f` (89 turns, 670 s): `OWNER_PASS`, `VALIDATION_RUN: APPROVED` for exactly ONE invocation bound to `4228a3f`, a fresh `0700` directory and a new `O_EXCL` marker, with binding conditions B1-B6; (2) the exact code gates on `4228a3f` (see "Fixed validation gates" below; vitest 74 files / 1320 tests, SQL/parity/V3/accounting/wire 7 files / 292 tests, Python worker/adapter/follow-through/V3/V2/replay/label 176, supervisor 54, `tsc`, `eslint` (0 errors, 6 pre-existing warnings), `pipeline.invariants`, `pipeline.selftest`, `next build`, `npm audit --omit=dev` 0, `git diff --check`; worktree clean before and after); (3) the old public worker was drained with `stop --drain` (no running row, nothing cut) at 21:03:41Z, and a fresh `--dry` showed every precondition true; (4) at 21:04:10Z ONE `run_validation.py --run` (marker created `O_EXCL`, one research CLI spawn recorded by pid): the candidate's REAL `scripts/pc_research_worker.handle_job` with an in-process FAKE queue client (no network, no database, no app user/scan/job row, synthetic job identity) and the real `claude -p --model claude-sonnet-5-5 --effort medium --input-format stream-json` with the v0.5 prompt on the ORIGINAL sanitized Vitamin D3 4000 IU + K2 target; (5) with no model: the server's TypeScript acceptance function on the byte-identical `result.json`, the Python V3 guard, the canonical `research_audit` schema and the ledger schema re-applied, a per-id surface table; (6) the owner's read-only validation review (64 turns, 655 s): `VALIDATION: PASS`. The old worker was restored to READY on the SAME reviewed runtime at 21:26:28Z (stopped 21:03:41Z-21:26:28Z; the queue had no queued or running row throughout).

**Facts of the run.** invocation 1 of 1, attempt 1; CLI 2.1.287, `apiKeySource` none; the init reports `claude-sonnet-5-5`, `modelUsage` lists Sonnet 5.5 and the Haiku 4.5 summariser only, no MCP server, no permission denial; the prompt sha256 is `24b1c392b933fdda1c06631387bf3101c2b06e798214bcad0cdfa5ffbc9ad80b`; the CLI stream carries no effort level, so `medium` is REQUESTED and not observed. Two user turns in ONE process and ONE session: the model's first return (37.4 s into the run) was not accepted by the tool receipts (`ledger_claims_open_without_request`, `blocked_without_independent_attempt`), the worker sent `continuation-1.txt` (fixed sentences plus an address block) into the same stdin, the second return (99.9 s) was accepted, the worker closed stdin after the final result and the CLI exited by itself with code 0 (no forced exit). Calls: 2 WebSearch and 13 WebFetch (one of them a Europe PMC query); 4 WebFetch returned a model summary, 9 an HTTP error (403 x4, 429 x2), a redirect notice (x2) or a cookie page; 15 leads were listed, 3 returned a summary (two distinct narrative reviews, so none of them is the study in the inventory). The audit has two outcomes: the whole-product row is empty and says nobody tested this exact product (`daily_dose` `unknown`, K2 form and amount `unknown`, nothing about servings or a per-kg dose invented), and ONE `CONTEXT ONLY: single ingredient, not this product.` row cites `PMID:32219282` (Kuang 2020, `sr_ma`, n 971, direction `benefit`, `access` `snippet`, `original_documents` 0) with figures that appear in the returned search snippets. Timing is in the Smoke record above.

**What it shows, and what it does not.** On the real CLI the stdin follow-up was accepted and the process ended cleanly; the envelope was enforced by the CLI itself; both guards accepted the same bytes. It does NOT show repeatability or a rate, that the follow-up caused the extra research (the nine further tool events followed it; causality is not established), that `medium` researches better or worse than `xhigh`, that a `completed` job always opened a page, or anything about efficacy. One product, one day, 9 of 13 fetches blocked. **Caveats the owner recorded:** the PMID comes from a model summary of a Europe PMC listing and the n and effect figures come from search snippets that do not name the paper; the snippets were paired with that record through a DOI in a link address (an inference, and the audit's own note does not say the snippet never named the paper); the dose range rests on a second inference; Haiku summaries and snippet figures are not findings; `opened` in the ledger means REQUESTED (six of the nine `opened` rows returned an HTTP error or a cookie page); the six `not_opened_secondary` dismissals are model judgements never verified; the audit's remark that `examine.com .../g983b0/` was "found by searching its title" is not supported (no title search occurred, and that page returned 429 twice); "small by the Cohen convention" is in no returned text (a labelled convention); the three leads with content are narrative reviews and their records, not the study in the inventory row.

**Open code gaps (the owner's W1 and W2), which the release depends on.** **W1:** the lead accounting binds hard only when the inventory is EMPTY (`research_leads.py:397,413`, `lead-accounting.ts:328,343`). A non-empty inventory needs no page request: a run could do one search, cite an id that only appears in a link address (the unchanged guard grounds it), dismiss every other lead as `not_opened_*` with no fetch and still end `completed`. In this draw the cheap exit was NOT taken (the id rests on a content-bearing fetch), but the first return was a near miss: it had no lead with content and five of nine leads dismissed unopened, and only two ledger problems stopped it. The owner's pre-written fix card for a next candidate: in both languages replace `inventory_empty and not fetches` with "no WebFetch returned content (any inventory)", plus shared fixtures (a code change means a NEW candidate, a NEW independent review, a NEW owner review and a NEW explicit approval). **W2:** a model-typed WebFetch URL can still ground its own id (`own_request_text` reads only `prompt` for a WebFetch); it is a pinned trade-off (excluding URL ids would stop an opened PubMed record from grounding its own PMID) and this run did not exercise it. The prompt wording that gives a cheap exit (L8 "or was recorded in `could_not_access`", "Fewer is fine, only after L8", L9 dispositions as model judgements) is byte-frozen. **Release condition (owner, verbatim in substance):** a smoke PASS does not close W1 and W2; before the migration the operator must hold the founder's explicit written acceptance of BOTH, otherwise the old worker stays READY and the release stops. As of this commit that acceptance has NOT been given, so nothing in this record was applied, pushed, deployed or installed.

**What the docs may and may not say.** May: one private invocation (invocation 1 of 1, attempt 1) of `4228a3f` ended `completed` with `finish_reason` `satisfied`, two user turns in one CLI process, real CLI 2.1.287, model `claude-sonnet-5-5`, effort `medium` requested and not observed, with the timings and counts above, accepted by the Python V3 guard and the TypeScript `checkLiveResearchResultV3` on the same bytes; not exercised: claim/lease/HTTP, the route, the `completeJob` RPC, SQL `complete`, deploy, supervisor, live queue, panel. May NOT say: fixed, validated, verified, proven, "works", approved; that `medium` is faster, cheaper or better, that effort was observed, or any rate, repeatability or comparison with `xhigh`; that the follow-through caused the result; that a link-only or echo-only id is evidence, or that snippet figures are findings or that n = 971 is printed beside the id; that leads were "opened or read" (they were requested); "3 searches" (2 WebSearch plus one Europe PMC fetch); that the original job is repaired; or anything about the live route, SQL, supervisor or panel. Never quote the sentence in `scripts/pc_research_worker.py:51` ("A \"completed\" job therefore never means \"one search and a shrug\""): W1 shows it is untrue, and changing it would change the validated worker bytes.

**Private evidence (not committed; `0400/0600`, outside the repository).** The run directory, `raw-stream.jsonl`, `continuation-1.txt`, `result.json`, `server-check.json`, `run-summary.json` (with the spawn table), `validation-analysis.md/.json`, the two owner results and the harness are under `/tmp/bsproof-v05-smoke/` (`validation-v05/`, `owner-run*/out/`; a sha256 list `validation-v05-SHA256SUMS`). The v0.3 and v0.4 validation runs and the three xhigh originals are byte-unchanged (re-hashed after the run). The v0.3, v0.4 and this model-run approvals are USED UP: nobody re-runs the original job, a public job or this smoke on the same approval.

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
`queued` job with `attempts >= 1` exists, is idempotent, and has its own mutant suite. Migration 002 (`bsproof_research_complete` accepts the v0.4, v0.3 and
v0.2 job versions) is executed the same way: exactly one function body changes (owner, ACL, comment, `search_path`, security definer unchanged; its body equals the one in
`docs/research-jobs.sql` byte for byte), 001 then 002 equals 002 then 001 equals a fresh provisioning, a v0.4 job and queued v0.3 and v0.2 jobs complete while v0.1 is refused, no row changes, and its guard and mutants are caught
(including the mutants that accept only some of the three versions).
`tests/scan-research-queue-parity.test.ts` runs one scripted history through the
in-memory queue the route tests use and through the real SQL and requires identical
answers. Limits: PGlite is one connection, so concurrent `for update skip locked`
claims cannot be raced, and it is PostgreSQL 17.5 rather than the project's 17.6.
Python: `python3 -m unittest tests.test_source_access_v2 tests.test_pc_research_worker tests.test_grounding_replay`
(needs `jsonschema`; a missing module fails, it does not skip). `tests.test_grounding_replay` replays verbatim excerpts of the three original Vitamin D raw
streams through the real guard (old extraction patched back in reproduces the three recorded failures exactly; the fixed one grounds exactly the printed ids and refuses the
four assertions; receipt missing / failed / for another paper / invented id cannot ground a row) and, where the private captures exist, replays the untouched originals
(hash-pinned, opened read-only; a different file fails, a missing directory skips only that class). It also replays the failed validation run (`OneSearchEmptyAudit`): the guard accepts the all-empty audit by design and
the test-only analysis `tests/helpers/validation_usability.py` marks it `usable: false` and non-pass. `tests.test_pc_research_worker` pins the prompt lineage on frozen fixtures (v0.2 -> v0.3 -> v0.4, each step an enumerated edit) and the L8 wording. `tests/fixtures/id-extraction-cases.json` is run by Python
(`tests.test_source_access_v2`) and TypeScript (`tests/scan-research-id-parity.test.ts`) so the worker's and the server's id recognition cannot drift. No test depends on the
machine clock, calls a model or touches the network.

An installed runtime is a COPY (`deploy/pc_research_worker_release.sh build`): changes
to the worker, adapter, prompt or schemas reach the mainPC only through a new release
that the owner installs.

## Residual limits

The stream's returned text is transient evidence only; grounding uses identifier
string matches and does not independently verify scientific claims. Research is
experimental/unvalidated and does not change score, clinical approval, or user
risk classification. The only model call made on the 2026-10-06 candidate was the one private v0.3 validation run, which failed; the v0.4 prompt has had no model call. There has been no migration or runtime deployment of it.
A query echo or an unopened link address can ground an id (see "What the fix does and does not do"), and the guard does not check that an id belongs to the paper a row describes.
Review, provisioning and clinical validation remain separate human gates. An id the tool printed grounds a row; that proves the paper was
retrieved, not that the audit's numbers or conclusions are right.

## Fixed validation gates (offline, no model)

- `npx vitest run tests/scan-research-lead-accounting.test.ts tests/scan-research-v3.test.ts` (v0.5 follow-through, server side)
- `npx vitest run tests/scan-research.test.ts tests/scan-research-v2.test.ts tests/scan-research-target-sql.test.ts tests/research-audit-schema.test.ts tests/research-jobs-sql-exec.test.ts tests/scan-research-queue-parity.test.ts tests/scan-research-id-parity.test.ts tests/scan-research-owner-smoke.test.ts tests/scan-research-wire.test.ts tests/scan-research-client.test.ts tests/scan-research-panel.test.tsx`
- `.venv/bin/python -m unittest tests.test_pc_research_supervisor` (54 tests: fake and REAL worker under the supervisor; needs
  jsonschema>=4 for the real-worker class; no model, no network beyond loopback, no root)
- `.venv/bin/python -m unittest tests.test_pc_research_worker tests.test_research_followthrough tests.test_source_access_v2 tests.test_source_access_v3 tests.test_grounding_replay tests.test_label_elemental_dose`
  (v0.5; `tests.test_grounding_replay` replays the three original xhigh captures when `BS_PROOF_REPLAY_CAPTURES` points at a read-only copy)
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
  (the file that was applied to production); `sha256sum docs/research-jobs.sql docs/research-jobs-migration-001-one-attempt.sql docs/research-jobs-migration-002-prompt-v0.5.sql`
  must equal `84ce6cb633ed4aa3ee3282e890db359604f8ff3dea52d923465856c5917d78be`, `9d147ecf30bd5ba4c47c33e50dd18fc11bbca10e5371354240eb919aff33fb41` and `44bec975597cfc94d24b099c691342b943159245130af1084b93089732420d0c` (the candidate, NOT applied; 001 is byte-identical to the v0.3 candidate's);
  `sha256sum tests/fixtures/research_audit_live_v0.3.md` must stay `3ef4ecfb373d163393aa7b3d90e2492947a5f64817665716b5b43ad1e8f4ed5e` and `tests/fixtures/research_audit_live_v0.2.md` `f0d8a409b380bb0b617411ed63560c8d3391b2095192b70e6521fe4df22a9ec0`

These tests use fake streams and fake HTTP queue clients only. They do not prove
model behavior, account state, provisioning, or clinical validity.

## Handoff

**v0.5 (2026-10-06, newest -- read the "Follow-through (live-research-v0.5)" section first).** A local, self-contained commit on `medium-one-attempt-research-f7664b2` holds the structural follow-through (lead ledger checked against receipts, enforced in the same single CLI process, V3 wire, widened SQL carrier, 8-file runtime). It was never run on a model. Next, in order: independent review of the commit; the owner's read-only review and the gates; a NEW explicit owner approval bound to the exact head for ONE successful-smoke attempt (plan and the unfilled time record in that section); only after a PASS the owner-run publication in the documented order. Production is unchanged (3 attempts, xhigh, v0.2, old worker READY). Do not re-run v0.3, v0.4, the original job or any public job to test.

Scope (2026-10-06, durable): the user amended the task from cap-only to root-cause; what that authorises and what it does not, the review disposition and
the rollout hazards are in "Scope amendment (durable) and rollout hazards". One private Vitamin D `medium` validation invocation needs the owner's explicit
approval after review and gates; nothing here grants it.

State (2026-10-06, UTC) — **READ THIS FIRST. The objective is NOT "cap the retries"; it is "make one research invocation produce a usable audit, and
stop paying for the same failure three times".** A candidate on a local branch (NOT on `main`, NOT pushed) holds: id-recognition change (worker + server, shared
fixture; replay-verified), prompt `live-research-v0.4` (v0.3 + rule L8 "open before you conclude" + three sentences limited to "only after L8"), medium effort (requested), one attempt per job,
migrations 001 and 002. Nothing is applied, installed or deployed. **Two private validation runs on two DISTINCT candidates both FAILED: complete but empty** ("Validation run 1" = v0.3, "Validation run 2" = v0.4); neither candidate is shown to work and neither is releasable. Root cause of the original failures (replayed from the three immutable captures): of 33 cited ids, 14 were retrieved and printed in a form
the extraction did not recognise (parser; changed), 4 were asserted by the model without any returned result printing them (model process; the guard must
refuse them; rules L7 and L8 are the attempted remedy and are UNPROVEN). A release that ships only the cap/effort/parser would still lose jobs or return placeholders; do not release those alone.
Next: the founder's answers (does MEDIUM stay; is a complete-but-empty audit acceptable under one attempt) and a fresh worker's v0.5 per "Validation run 2" -> independent review -> the owner's read-only review -> gates -> a NEW explicit owner approval for ONE validation run bound to the new head (criterion 6 failing again = FAILED again) ->
only after a PASS, owner-run, in THIS order (a wrong order loses jobs; see the table in "One attempt per job and medium effort"): `stop --drain` and leave the worker stopped -> read-only queue check (no `running`,
no `queued` with `attempts >= 1`) -> migrations 001 and 002 in ONE transaction, both VERIFY queries before the push -> push `main` and confirm the Vercel deploy -> build + install the runtime -> `start` -> `status`.
The state below (2026-10-05) is the PRODUCTION state until then.

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