#!/usr/bin/env python3
"""
BS-PROOF mainPC research worker: an OUTBOUND-ONLY consumer of the research queue.

It claims one research job at a time from the website over HTTPS, runs ONE live
Claude-subscription web research audit for it (pipeline/claude_research_adapter.py,
the only model boundary), validates the audit, and reports the result. It opens no
listening socket, needs no inbound route to the PC, and holds no browser or
provider credential. The only secret it holds is the research-worker bearer token.

Not part of the scoring pipeline: nothing here computes a score. The audit's
classified findings are validated and forwarded; the deterministic code on the
website computes everything the user sees.

WIRE CONTRACT (one endpoint, POST JSON, `Authorization: Bearer <token>`):

    POST {API_BASE}/api/scan/research/worker/

    {"action": "claim"}
        -> {"job": null}
        -> {"job": {"id", "lease_token", "target", "prompt_version"}}
    {"action": "heartbeat", "job_id", "lease_token"}
    {"action": "complete", "job_id", "lease_token", "audit", "source_access_v2"}
    {"action": "fail", "job_id", "lease_token", "code", "message", "retryable"}

Complete requests are capped at 768 KiB and carry transient SourceAccessV2 receipts;
the server stores only its owner-safe summary. Failure diagnostics stay on private
worker disk and never travel in the fail request.

  Status handling (worker side): 2xx = accepted; 404/409/410, or a JSON body whose
  `error`/`code` is lease_lost|lease_expired|stale_lease|lease_mismatch = the lease
  is not ours (stale worker): the worker stops, cancels the run and sends nothing
  further for that job; 401/403 = bad token (logged, retried with backoff; the job
  is never touched); other 4xx = rejected (logged, not retried); 5xx / network =
  transient (claims back off; completion/failure delivery is retried until it lands,
  the lease is lost, or the worker is told to stop; the result is first written to
  disk in the job's run directory).

Leases: a heartbeat thread renews the lease every HEARTBEAT seconds from the claim
until the result is delivered, including while the CLI runs and while delivery is
retried. There is no runtime cap, no turn/token cap, no retry count and no
concurrency here: one job at a time, and a run ends only when the CLI ends or the
lease is lost. A lost lease kills the CLI and discards nothing already on disk.

Failures are reported, not repaired: quota/rate limit, authentication, CLI crash,
missing structured output, schema-invalid audit, contract violations (see
`contract_problems`) all become a `fail` with a code, the evidence and a retryable
HINT. No number is guessed, defaulted or patched into an audit.

Run:
    python3 scripts/pc_research_worker.py check            # local-only health check
    python3 scripts/pc_research_worker.py run              # poll forever (the service)
    python3 scripts/pc_research_worker.py run --once       # claim at most one job
"""
from __future__ import annotations

import argparse
import copy
import datetime
import errno
import json
import os
import random
import re
import signal
import stat
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from pipeline import claude_research_adapter as adapter  # noqa: E402

WORKER_VERSION = "pc-research-worker-v0.1"
ENDPOINT_PATH = "/api/scan/research/worker/"
SUPPORTED_PROMPT_VERSIONS = (adapter.LIVE_PROMPT_VERSION,)

ENV_PREFIX = "BS_PROOF_RESEARCH_"
DEFAULT_ENV_FILE = Path.home() / ".config" / "bsproof-research-worker" / "worker.env"
DEFAULT_DATA_DIR = Path.home() / ".local" / "share" / "bsproof-research-worker" / "data"

LEASE_LOST_CODES = ("lease_lost", "lease_expired", "stale_lease", "lease_mismatch")
EXIT_CONFIG = 78
EXIT_LOCKED = 75


def log(msg: str, **kv) -> None:
    ts = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    extra = "".join(f" {k}={adapter.sanitize(v, 300)}" for k, v in kv.items())
    print(f"{ts} {adapter.sanitize(msg, 600)}{extra}", file=sys.stderr, flush=True)


# --------------------------------------------------------------------------- #
# configuration


class ConfigError(Exception):
    pass


def load_env_file(path: Path) -> dict[str, str]:
    """
    KEY=VALUE lines. Refused unless a regular file, owned by this user and with no
    group/other permission bits (0600): the file holds the bearer token.
    """
    path = Path(path)
    st = path.stat()
    if not stat.S_ISREG(st.st_mode):
        raise ConfigError(f"{path} is not a regular file")
    if st.st_uid != os.geteuid():
        raise ConfigError(f"{path} is not owned by the current user")
    if st.st_mode & 0o077:
        raise ConfigError(f"{path} mode is {stat.S_IMODE(st.st_mode):04o}; it holds a token, run: chmod 600 {path}")
    out: dict[str, str] = {}
    for n, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            raise ConfigError(f"{path}:{n}: expected KEY=VALUE")
        k, v = line.split("=", 1)
        k, v = k.strip(), v.strip()
        if len(v) >= 2 and v[0] == v[-1] and v[0] in "\"'":
            v = v[1:-1]
        out[k] = v
    return out


@dataclass
class Config:
    api_base: str
    token: str
    data_dir: Path
    poll_seconds: float = 20.0
    heartbeat_seconds: float = 30.0
    http_timeout_seconds: float = 60.0
    backoff_max_seconds: float = 300.0
    quota_cooldown_seconds: float = 900.0
    retry_base_seconds: float = 2.0
    allow_insecure_localhost: bool = False

    @property
    def endpoint(self) -> str:
        return self.api_base.rstrip("/") + ENDPOINT_PATH


def _num(env, key, default):
    raw = env.get(ENV_PREFIX + key)
    if raw in (None, ""):
        return default
    try:
        v = float(raw)
    except ValueError as e:
        raise ConfigError(f"{ENV_PREFIX}{key} must be a number") from e
    if not v > 0:
        raise ConfigError(f"{ENV_PREFIX}{key} must be > 0")
    return v


def build_config(environ=None, env_file: Path | None = None) -> Config:
    """Process environment wins; an env file only fills what is unset."""
    env = dict(os.environ if environ is None else environ)
    if env_file is not None:
        for k, v in load_env_file(env_file).items():
            env.setdefault(k, v)
    token = env.get(ENV_PREFIX + "WORKER_TOKEN", "")
    if not token:
        raise ConfigError("BS_PROOF_RESEARCH_WORKER_TOKEN is not set")
    base = env.get(ENV_PREFIX + "API_BASE", "")
    if not base:
        raise ConfigError("BS_PROOF_RESEARCH_API_BASE is not set (an https origin, e.g. https://example.com)")
    insecure = env.get(ENV_PREFIX + "ALLOW_INSECURE_LOCALHOST") == "1"
    u = urllib.parse.urlsplit(base)
    if u.username or u.password or u.query or u.fragment or u.path not in ("", "/"):
        raise ConfigError("BS_PROOF_RESEARCH_API_BASE must be an origin only (scheme://host[:port])")
    if u.scheme == "https" and u.hostname:
        pass
    elif u.scheme == "http" and insecure and u.hostname in ("127.0.0.1", "localhost", "::1"):
        pass
    else:
        raise ConfigError("BS_PROOF_RESEARCH_API_BASE must be https (plain http only to localhost with "
                          "BS_PROOF_RESEARCH_ALLOW_INSECURE_LOCALHOST=1, for tests)")
    data_dir = Path(env.get(ENV_PREFIX + "DATA_DIR") or DEFAULT_DATA_DIR)
    if not data_dir.is_absolute():
        # Neither systemd's EnvironmentFile nor this loader expands `~` or `%h`: a relative value would silently
        # create a directory of that literal name under whatever the working directory is.
        raise ConfigError(f"{ENV_PREFIX}DATA_DIR must be an absolute path (no ~ or %h expansion is done)")
    return Config(
        api_base=f"{u.scheme}://{u.netloc}", token=token,
        data_dir=data_dir,
        poll_seconds=_num(env, "POLL_SECONDS", 20.0),
        heartbeat_seconds=_num(env, "HEARTBEAT_SECONDS", 30.0),
        http_timeout_seconds=_num(env, "HTTP_TIMEOUT_SECONDS", 60.0),
        backoff_max_seconds=_num(env, "BACKOFF_MAX_SECONDS", 300.0),
        quota_cooldown_seconds=_num(env, "QUOTA_COOLDOWN_SECONDS", 900.0),
        retry_base_seconds=_num(env, "RETRY_BASE_SECONDS", 2.0),
        allow_insecure_localhost=insecure)


# --------------------------------------------------------------------------- #
# HTTP


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    """A redirect would re-send the bearer token elsewhere (and turn POST into GET)."""

    def redirect_request(self, *a, **k):
        return None


@dataclass
class ApiResult:
    kind: str            # ok | lease_lost | rejected | auth | transient
    status: int | None = None
    body: dict | None = None
    detail: str = ""


class ApiClient:
    def __init__(self, cfg: Config):
        self.cfg = cfg
        self._opener = urllib.request.build_opener(_NoRedirect)

    def post(self, payload: dict) -> ApiResult:
        data = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        req = urllib.request.Request(
            self.cfg.endpoint, data=data, method="POST",
            headers={"Authorization": f"Bearer {self.cfg.token}", "Content-Type": "application/json",
                     "Accept": "application/json", "User-Agent": f"bsproof-{WORKER_VERSION}"})
        try:
            with self._opener.open(req, timeout=self.cfg.http_timeout_seconds) as resp:
                status, raw = resp.status, resp.read()
        except urllib.error.HTTPError as e:
            status = e.code
            try:
                raw = e.read()
            except Exception:
                raw = b""
            finally:
                e.close()
        except (urllib.error.URLError, OSError, TimeoutError, ValueError) as e:
            return ApiResult("transient", None, None, adapter.sanitize(f"{type(e).__name__}: {e}", 300))
        body = None
        if raw:
            try:
                parsed = json.loads(raw)
                body = parsed if isinstance(parsed, dict) else None
            except ValueError:
                body = None
        return classify_response(status, body, raw)


def classify_response(status: int, body: dict | None, raw: bytes = b"") -> ApiResult:
    code = ""
    if isinstance(body, dict):
        v = body.get("error") if body.get("error") is not None else body.get("code")
        code = v.get("code", "") if isinstance(v, dict) else str(v or "")
    detail = adapter.sanitize(code or raw[:200].decode("utf-8", "replace"), 200)
    if status in (404, 409, 410) or code in LEASE_LOST_CODES:
        return ApiResult("lease_lost", status, body, detail)
    if status in (401, 403):
        return ApiResult("auth", status, body, detail)
    if 200 <= status < 300:
        if isinstance(body, dict) and body.get("ok") is False:
            return ApiResult("rejected", status, body, detail)
        return ApiResult("ok", status, body, detail)
    if 300 <= status < 400:
        return ApiResult("rejected", status, body, "redirect not followed (the token is never re-sent elsewhere); fix API_BASE")
    if 400 <= status < 500:
        return ApiResult("rejected", status, body, detail)
    return ApiResult("transient", status, body, detail)


# --------------------------------------------------------------------------- #
# heartbeat: lease ownership


class Heartbeat:
    """Renews the lease from claim to delivery. Sets `lost` and cancels the run on a lost lease."""

    def __init__(self, client: ApiClient, job_id, lease_token: str, interval: float,
                 cancel: threading.Event, stop: threading.Event):
        self.client, self.job_id, self.lease_token = client, job_id, lease_token
        self.interval, self.cancel = interval, cancel
        self.lost = threading.Event()
        self._stop = threading.Event()
        self._global_stop = stop
        self.sent = 0
        self.failures = 0
        self._t = threading.Thread(target=self._loop, daemon=True, name="heartbeat")

    def start(self):
        self._t.start()
        return self

    def stop(self):
        self._stop.set()
        self._t.join(timeout=self.client.cfg.http_timeout_seconds + 5)

    def _loop(self):
        while not self._stop.wait(self.interval):
            if self._global_stop.is_set():
                return
            r = self.client.post({"action": "heartbeat", "job_id": self.job_id, "lease_token": self.lease_token})
            if r.kind == "ok":
                self.sent += 1
                self.failures = 0
            elif r.kind == "lease_lost":
                log("lease lost on heartbeat; cancelling run", status=r.status, detail=r.detail)
                self.lost.set()
                self.cancel.set()
                return
            else:
                self.failures += 1
                log("heartbeat not accepted", kind=r.kind, status=r.status, detail=r.detail)


# --------------------------------------------------------------------------- #
# audit validation (deterministic; never edits the audit)


def schema_errors(audit) -> list[str]:
    """Strict Draft 2020-12 validation against the canonical schemas/research_audit.json."""
    try:
        from jsonschema import Draft202012Validator
    except ImportError as e:  # a worker without jsonschema must not "validate" by skipping
        raise RuntimeError("jsonschema>=4 is required (pip install -r scripts/pc_research_worker.requirements.txt)") from e
    schema = adapter.load_canonical_schema(ROOT)
    Draft202012Validator.check_schema(schema)
    errs = sorted(Draft202012Validator(schema).iter_errors(audit), key=lambda e: list(map(str, e.absolute_path)))
    return [("/" + "/".join(map(str, e.absolute_path)) + ": " + adapter.sanitize(e.message, 240)) for e in errs]


def _norm(s) -> str:
    return " ".join(str(s or "").split()).lower()


JOB_TARGET_VERSION = "ResearchJobV1"  # lib/scan-research/contract.ts RESEARCH_JOB_VERSION


def _is_job_target(target: dict) -> bool:
    return target.get("version") == JOB_TARGET_VERSION


def _explicit_number(v) -> bool:
    """A number the scan itself recorded (the server's `num()`: finite, >= 0). Never a default."""
    return isinstance(v, (int, float)) and not isinstance(v, bool) and v == v and abs(v) != float("inf") and v >= 0


def target_daily_dose(target: dict):
    """None = the target gives no daily dose (unknown stays unknown); "" = present but not
    text (a number/object: not echo-checked); otherwise the dose text to echo verbatim.

    A real ResearchJobV1 target (lib/scan-research/target.ts) never carries daily-dose TEXT.
    It has a daily amount only when the scan recorded an explicit regimen: a numeric
    `servings_per_day` or `dose.daily_elemental_mg`. With neither, the daily dose is unknown
    and the audit must say exactly `unknown` -- no "one serving a day" default, no guessed
    multiplier (prompt L3). With one of them the audit states the arithmetic itself, which
    is not echo-checked here."""
    if _is_job_target(target):
        dose = target.get("dose") if isinstance(target.get("dose"), dict) else {}
        if _explicit_number(target.get("servings_per_day")) or _explicit_number(dose.get("daily_elemental_mg")):
            return ""
        return None
    for k in ("daily_dose", "dose"):
        if k in target:
            v = target[k]
            if v is None or (isinstance(v, str) and not v.strip()):
                return None
            return v if isinstance(v, str) else ""
    return None


def target_components(target: dict) -> list:
    for k in ("components", "ingredients"):
        v = target.get(k)
        if isinstance(v, list):
            return v
    return []


def is_blend(target: dict) -> bool:
    """More than one active. For a ResearchJobV1 target that is the scan's own statement
    (`is_multi_ingredient` true, several `actives`, or any `other_actives`); `null` / unknown is
    NOT a blend and is never defaulted to one."""
    if _is_job_target(target):
        acts, others = target.get("actives"), target.get("other_actives")
        return (target.get("is_multi_ingredient") is True
                or (isinstance(acts, list) and len(acts) > 1)
                or (isinstance(others, list) and len(others) > 0))
    return len(target_components(target)) > 1


CONTEXT_MARKER = "CONTEXT ONLY"


def contract_problems(audit: dict, target: dict, an, run_date: str) -> list[str]:
    """
    Deterministic checks the schema cannot express. Each failure is reported, never
    repaired. Returns human-readable problems; empty means all passed.
    """
    out = []
    meta = audit.get("meta", {}) if isinstance(audit.get("meta"), dict) else {}
    if meta.get("prompt") != adapter.LIVE_PROMPT_VERSION:
        out.append(f"meta.prompt={meta.get('prompt')!r}, expected {adapter.LIVE_PROMPT_VERSION!r}")
    if meta.get("model") != adapter.MODEL:
        out.append(f"meta.model={meta.get('model')!r}, expected {adapter.MODEL!r}")
    if not str(meta.get("run_at", "")).startswith(run_date):
        out.append(f"meta.run_at={meta.get('run_at')!r} does not start with the run date {run_date}")
    note = _norm(meta.get("note"))
    if "experimental" not in note or "unvalidated" not in note:
        out.append("meta.note must state the audit is experimental and unvalidated")

    init_model = an.init.get("model")
    if init_model != adapter.MODEL:
        out.append(f"CLI init model {init_model!r} is not the verified model {adapter.MODEL!r}")
    # WebFetch/WebSearch summaries are written by a Haiku model INSIDE the CLI, and on a fetch-heavy
    # run it can out-produce the primary model, so "largest output" is not the test. The verified
    # model must be present, and no other model may be present except that summariser.
    used = set(an.model_usage)
    foreign = sorted(m for m in used if m != adapter.MODEL and not m.startswith("claude-haiku"))
    if adapter.MODEL not in used:
        out.append(f"modelUsage does not show {adapter.MODEL!r} (saw {sorted(used)})")
    if foreign:
        out.append(f"modelUsage shows unverified model(s) {foreign}; the audit is labelled {adapter.MODEL!r}")
    if an.init.get("apiKeySource") != "none":
        out.append(f"apiKeySource={an.init.get('apiKeySource')!r}: not the subscription login")

    dose = target_daily_dose(target)
    got = _norm(audit.get("daily_dose"))
    if dose is None:
        if got.rstrip(".") != "unknown":
            out.append(f"target has no daily dose but audit.daily_dose={audit.get('daily_dose')!r} (must be 'unknown')")
    elif dose and _norm(dose) not in got:
        out.append("audit.daily_dose does not contain the target daily dose verbatim")

    rows = audit.get("outcomes") if isinstance(audit.get("outcomes"), list) else []
    ctx = [i for i, r in enumerate(rows) if isinstance(r, dict)
           and str(r.get("population", "")).upper().startswith(CONTEXT_MARKER)]
    if is_blend(target) and 0 in ctx:
        out.append("blend target: outcomes[0] is a CONTEXT ONLY row; the whole-formula row must come first")
    return out


def grounding(audit: dict, an) -> dict:
    """Which cited inventory ids appeared in tool output. A string match, not verification."""
    seen, unseen, nonstd = [], [], []
    for i, row in enumerate(audit.get("outcomes", [])):
        inv = row.get("inventory") if isinstance(row, dict) else None
        for it in inv if isinstance(inv, list) else []:
            raw = it.get("id") if isinstance(it, dict) else None
            norm = adapter.normalise_audit_id(raw)
            entry = {"outcome_index": i, "id": adapter.sanitize(raw, 200), "normalised": norm,
                     "access": it.get("access") if isinstance(it, dict) else None}
            if norm is None:
                nonstd.append(entry)
            elif norm in an.retrieved_ids:
                seen.append(entry)
            else:
                unseen.append(entry)
    return {"seen_in_tool_output": seen, "not_seen_in_tool_output": unseen, "non_standard_ids": nonstd,
            "caveat": "A string match over WebSearch/WebFetch output. 'not seen' is not proof of invention "
                      "(aliases, PMC vs PMID, summaries that omit the id) and 'seen' is not proof the paper "
                      "supports the number."}


def blend_report(audit: dict, target: dict) -> dict:
    rows = audit.get("outcomes", [])
    ctx = [i for i, r in enumerate(rows) if isinstance(r, dict)
           and str(r.get("population", "")).upper().startswith(CONTEXT_MARKER)]
    blend = is_blend(target)
    return {"is_blend": blend,
            "whole_formula_headline_row_index": 0 if blend else None,
            "context_only_row_indices": ctx,
            "rule": "Rows listed as context-only are single-ingredient context, not this product, and must not "
                    "enter the whole-formula headline or any average."}


# --------------------------------------------------------------------------- #
# one job


@dataclass
class JobOutcome:
    kind: str                 # completed | failed | lease_lost | cancelled | skipped | undelivered
    code: str | None = None
    cooldown: float = 0.0


def _write_json(path: Path, obj) -> None:
    tmp = path.with_name(path.name + ".tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=1)
    os.chmod(tmp, 0o600)
    os.replace(tmp, path)


def backoff_delays(base: float, ceiling: float):
    d = base
    while True:
        yield min(d, ceiling) * (0.8 + 0.4 * random.random())
        d *= 2


def deliver(client: ApiClient, payload: dict, hb: Heartbeat, stop: threading.Event, cfg: Config) -> ApiResult:
    """Send complete/fail until it lands, the lease is lost, it is rejected, or we are told to stop."""
    delays = backoff_delays(cfg.retry_base_seconds, cfg.backoff_max_seconds)
    while True:
        if hb.lost.is_set():
            return ApiResult("lease_lost", None, None, "lease lost before delivery")
        r = client.post(payload)
        if r.kind != "transient":
            return r
        log("delivery transient failure; will retry", action=payload["action"], status=r.status, detail=r.detail)
        if stop.wait(next(delays)):
            return r


def _utf16_len(s: str) -> int:
    return len(s.encode("utf-16-le", "surrogatepass")) // 2


def fail_payload(job_id, lease_token, code, message, retryable) -> dict:
    # The API counts UTF-16 code units (JS string length); Python slices code points, so an
    # astral character (emoji) is 1 here but 2 there. Trim whole code points until it fits.
    m = adapter.sanitize(message, 300)
    while _utf16_len(m) > 300:
        m = m[:-1]
    return {"action": "fail", "job_id": job_id, "lease_token": lease_token,
            "code": code, "message": m, "retryable": bool(retryable)}


QUOTA_CODES = ("claude_quota_or_rate_limit",)

# What a CLI killed by a SHUTDOWN looks like when the run is classified: an abnormal exit (e.g. exit
# -15 from systemd's cgroup-wide SIGTERM, which reaches the CLI as well as this process), no
# result event, or no structured output. All three are retryable and none says anything about the
# audit, so while the worker is stopping they must not be posted as a `fail`: a posted retryable
# fail burns an attempt and, on the final attempt, finishes the job as `failed` for good.
SHUTDOWN_AMBIGUOUS_CODES = ("claude_cli_error", "claude_no_result_event", "claude_no_structured_output")


def utc_now() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc)


def handle_job(job: dict, client: ApiClient, cfg: Config, stop: threading.Event,
               environ=None, binary: str | None = None, clock=None) -> JobOutcome:
    """`clock` is a zero-argument callable returning an aware UTC datetime. It exists so tests can
    pin the run date; it is never set in production."""
    clock = clock or utc_now
    job_id, lease_token = job["id"], job["lease_token"]
    cancel = threading.Event()
    hb = Heartbeat(client, job_id, lease_token, cfg.heartbeat_seconds, cancel, stop).start()
    run_dir: Path | None = None
    job_done = threading.Event()

    def _propagate_stop():
        # SIGTERM/SIGINT must end the CLI too, not only the poll loop.
        while not job_done.is_set():
            if stop.wait(0.25):
                cancel.set()
                return

    threading.Thread(target=_propagate_stop, daemon=True, name="stop-propagation").start()
    try:
        if job["prompt_version"] not in SUPPORTED_PROMPT_VERSIONS:
            r = deliver(client, fail_payload(
                job_id, lease_token, "unsupported_prompt_version",
                f"this worker serves {list(SUPPORTED_PROMPT_VERSIONS)}, the job asks for {job['prompt_version']!r}",
                False), hb, stop, cfg)
            return JobOutcome("failed" if r.kind == "ok" else "undelivered", "unsupported_prompt_version")

        try:
            target = adapter.sanitize_target(job["target"])
        except adapter.ResearchAdapterError as e:
            r = deliver(client, fail_payload(job_id, lease_token, "invalid_target", str(e), False), hb, stop, cfg)
            return JobOutcome("failed" if r.kind == "ok" else "undelivered", "invalid_target")

        run_dir = adapter.new_run_dir(cfg.data_dir)
        _write_json(run_dir / "job.json", {
            "job_id": job_id, "prompt_version": job["prompt_version"], "target": target,
            "worker_version": WORKER_VERSION,
            "claimed_utc": clock().isoformat(),
            "note": "lease token deliberately not stored"})
        log("job claimed; research starting", job=job_id, run_dir=run_dir.name)
        now = clock()

        try:
            rr = adapter.run_research(target, run_dir, environ=environ, binary=binary, cancel=cancel, now=now,
                                      root=ROOT)
        except adapter.ResearchAdapterError as e:
            code = "claude_cli_not_found" if "BS_PROOF_CLAUDE_BIN must name an absolute executable file" in str(e) else "worker_internal_error"
            r = deliver(client, fail_payload(job_id, lease_token, code, str(e), True), hb, stop, cfg)
            return JobOutcome("failed" if r.kind == "ok" else "undelivered", code)

        if hb.lost.is_set():
            log("lease lost; result (if any) stays on disk, nothing sent", job=job_id, run_dir=run_dir.name)
            return JobOutcome("lease_lost")
        if stop.is_set() and rr.cancelled:
            log("worker stopping; run cancelled, lease left to expire", job=job_id)
            return JobOutcome("cancelled")

        an = adapter.analyze_stream(rr.raw_path)
        sa = adapter.source_access_report(an, rr)
        sa["worker_version"] = WORKER_VERSION
        sa["status"] = {"experimental": True, "validated": False, "human_verified": False,
                        "clinician_reviewed": False,
                        "note": "Model audit from live web tools. Not validated, not reviewed by a clinician."}
        _write_json(run_dir / "diagnostics.json", sa)

        def fail(code, message, retryable, cooldown=0.0):
            payload = fail_payload(job_id, lease_token, code, message, retryable)
            _write_json(run_dir / "fail.json", payload)
            r = deliver(client, payload, hb, stop, cfg)
            _write_json(run_dir / "delivery.json", {"action": "fail", "kind": r.kind, "status": r.status,
                                                    "detail": r.detail})
            log("job failed", job=job_id, code=code, delivered=r.kind)
            return JobOutcome("failed" if r.kind == "ok" else ("lease_lost" if r.kind == "lease_lost" else "undelivered"),
                              code, cooldown)

        f = adapter.classify_run_failure(rr, an)
        if f and stop.is_set() and f["code"] in SHUTDOWN_AMBIGUOUS_CODES:
            # The stop signal can reach the CLI before this process has propagated its own cancel
            # (systemd signals the whole cgroup), so `rr.cancelled` is not reliable here.
            log("worker stopping; the CLI run ended abnormally, not reported as a failure; lease left to expire",
                job=job_id, code=f["code"])
            return JobOutcome("cancelled")
        if f:
            return fail(f["code"], f["message"], f["retryable"],
                        cfg.quota_cooldown_seconds if f["code"] in QUOTA_CODES else 0.0)
        if not (an.searches or an.fetches):
            return fail("no_web_tools_used", "the run returned an audit without a single WebSearch or WebFetch "
                        "call: it is not source-grounded and is not accepted", True)

        audit = an.audit
        try:
            errs = schema_errors(audit)
        except RuntimeError as e:
            return fail("worker_internal_error", str(e), True)
        if errs:
            return fail("audit_schema_invalid", f"{len(errs)} schema error(s): " + " | ".join(errs[:40]), True)
        problems = contract_problems(audit, target, an, now.date().isoformat())
        if problems:
            return fail("audit_contract_violation", " | ".join(problems), True)

        sa["audit_grounding"] = grounding(audit, an)
        sa["blend"] = blend_report(audit, target)
        sa["audit_sha256"] = adapter.sha256_bytes(json.dumps(audit, sort_keys=True, ensure_ascii=False).encode("utf-8"))
        _write_json(run_dir / "diagnostics.json", sa)
        sa["checks_passed"] = ["json_schema_draft_2020_12_research_audit", "meta_prompt_and_model",
                               "only_verified_model_plus_haiku_web_summariser", "subscription_login_only",
                               "daily_dose_not_invented", "experimental_unvalidated_note",
                               "blend_headline_row_is_whole_formula", "web_tools_used"]
        try:
            source_access_v2 = adapter.source_access_v2(an, rr)
        except adapter.ResearchAdapterError as e:
            if str(e).startswith("source_report_too_large:"):
                return fail("source_report_too_large", str(e), False)
            return fail("worker_internal_error", str(e), True)
        payload = {"action": "complete", "job_id": job_id, "lease_token": lease_token,
                   "audit": copy.deepcopy(audit), "source_access_v2": source_access_v2}
        if len(json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")) > 768 * 1024:
            return fail("source_report_too_large", "validated research report exceeds the 768 KiB request limit", False)
        _write_json(run_dir / "result.json", payload)
        r = deliver(client, payload, hb, stop, cfg)
        _write_json(run_dir / "delivery.json", {"action": "complete", "kind": r.kind, "status": r.status,
                                                "detail": r.detail})
        if r.kind == "ok":
            log("job completed", job=job_id, run_dir=run_dir.name)
            return JobOutcome("completed")
        log("completion not accepted", job=job_id, kind=r.kind, status=r.status, detail=r.detail)
        return JobOutcome("lease_lost" if r.kind == "lease_lost" else "undelivered", r.kind)
    finally:
        job_done.set()
        hb.stop()
        if run_dir is not None:
            try:
                adapter.seal_run_dir(run_dir)
            except OSError:
                pass


# --------------------------------------------------------------------------- #
# claim loop


def parse_claim(body: dict | None):
    """-> ('idle', None) | ('job', job) | ('bad', reason, partial_job_or_None)"""
    if not isinstance(body, dict) or "job" not in body:
        return ("bad", "claim response has no `job` key", None)
    j = body["job"]
    if j is None:
        return ("idle", None)
    if not isinstance(j, dict):
        return ("bad", "`job` is neither null nor an object", None)
    jid, lt = j.get("id"), j.get("lease_token")
    ok_id = isinstance(jid, (str, int)) and not isinstance(jid, bool) and str(jid) != ""
    if not (ok_id and isinstance(lt, str) and lt):
        return ("bad", "job lacks a usable id or lease_token", None)
    if not isinstance(j.get("target"), dict) or not isinstance(j.get("prompt_version"), str):
        return ("bad", "job lacks an object `target` or a string `prompt_version`", j)
    return ("job", {"id": jid, "lease_token": lt, "target": j["target"], "prompt_version": j["prompt_version"]})


def write_status(cfg: Config, state: str, **extra) -> None:
    try:
        cfg.data_dir.mkdir(parents=True, exist_ok=True)
        _write_json(cfg.data_dir / "status.json", {
            "state": state, "worker_version": WORKER_VERSION, "pid": os.getpid(),
            "updated_utc": datetime.datetime.now(datetime.timezone.utc).isoformat(), **extra})
    except OSError:
        pass


def acquire_lock(data_dir: Path):
    """One worker per data dir. The server lease still decides ownership; this prevents local duplicates."""
    import fcntl
    data_dir.mkdir(parents=True, exist_ok=True)
    os.chmod(data_dir, 0o700)
    fd = os.open(data_dir / "worker.lock", os.O_CREAT | os.O_RDWR, 0o600)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError as e:
        os.close(fd)
        if e.errno in (errno.EAGAIN, errno.EACCES):
            return None
        raise
    return fd


def run_loop(cfg: Config, stop: threading.Event, once: bool = False, environ=None,
             binary: str | None = None, client: ApiClient | None = None, clock=None) -> int:
    client = client or ApiClient(cfg)
    delays = backoff_delays(cfg.poll_seconds, cfg.backoff_max_seconds)
    last: dict = {}
    while not stop.is_set():
        write_status(cfg, "polling", last_job=last)
        r = client.post({"action": "claim"})
        if r.kind != "ok":
            log("claim not accepted", kind=r.kind, status=r.status, detail=r.detail)
            write_status(cfg, "backoff", reason=r.kind, status=r.status, last_job=last)
            if once:
                return 1
            if stop.wait(next(delays)):
                break
            continue
        delays = backoff_delays(cfg.poll_seconds, cfg.backoff_max_seconds)
        parsed = parse_claim(r.body)
        if parsed[0] == "idle":
            if once:
                return 0
            if stop.wait(cfg.poll_seconds * (0.9 + 0.2 * random.random())):
                break
            continue
        if parsed[0] == "bad":
            log("malformed claim response", reason=parsed[1])
            write_status(cfg, "backoff", reason="malformed_claim", last_job=last)
            if once:
                return 1
            if stop.wait(next(delays)):
                break
            continue
        job = parsed[1]
        write_status(cfg, "running", job_id=str(job["id"]), last_job=last)
        out = handle_job(job, client, cfg, stop, environ=environ, binary=binary, clock=clock)
        last = {"job_id": str(job["id"]), "outcome": out.kind, "code": out.code,
                "finished_utc": datetime.datetime.now(datetime.timezone.utc).isoformat()}
        write_status(cfg, "polling", last_job=last)
        if once:
            return 0 if out.kind == "completed" else 1
        if out.cooldown:
            log("quota/rate-limit cooldown before the next claim", seconds=out.cooldown)
            write_status(cfg, "cooldown", seconds=out.cooldown, last_job=last)
            if stop.wait(out.cooldown):
                break
    write_status(cfg, "stopped")
    return 0


# --------------------------------------------------------------------------- #
# health check (local only: never claims a job, never calls a model)


def check(cfg_env_file: Path | None, environ=None) -> int:
    ok = True

    def line(good, msg):
        nonlocal ok
        ok = ok and good
        print(("ok   " if good else "FAIL ") + msg)

    try:
        cfg = build_config(environ, cfg_env_file)
        line(True, f"config: endpoint {cfg.endpoint} (https, token set)")
        line(True, f"timing: poll={cfg.poll_seconds}s heartbeat={cfg.heartbeat_seconds}s "
                   f"(configuration, not caps on a run)")
    except (ConfigError, OSError) as e:
        line(False, f"config: {e}")
        cfg = None
    if cfg_env_file is None and DEFAULT_ENV_FILE.exists():
        try:
            load_env_file(DEFAULT_ENV_FILE)
            line(True, f"env file {DEFAULT_ENV_FILE} is 0600 and owned by you")
        except (ConfigError, OSError) as e:
            line(False, f"env file: {e}")
    try:
        import jsonschema
        from jsonschema import Draft202012Validator  # noqa: F401
        import importlib.metadata as md
        line(True, f"jsonschema {md.version('jsonschema')} (Draft 2020-12)")
    except ImportError as e:
        line(False, f"jsonschema>=4 missing: {e}")
    try:
        adapter.load_prompt(ROOT)
        adapter.wire_schema_text(ROOT)
        line(True, f"prompt {adapter.LIVE_PROMPT_FILE} {adapter.LIVE_PROMPT_VERSION}; audit schema loads")
    except adapter.ResearchAdapterError as e:
        line(False, str(e))
    b = adapter.claude_bin(environ)
    v = adapter.cli_version(b, environ)
    line(bool(v), f"claude CLI {b}: {v or 'not runnable'}")
    if cfg is not None:
        try:
            fd = acquire_lock(cfg.data_dir)
            if fd is None:
                line(True, f"data dir {cfg.data_dir}: a worker is already running here (lock held)")
            else:
                os.close(fd)
                line(True, f"data dir {cfg.data_dir} writable, no worker running")
        except OSError as e:
            line(False, f"data dir {cfg.data_dir}: {e}")
        st = cfg.data_dir / "status.json"
        if st.exists():
            try:
                print("info " + json.dumps(json.loads(st.read_text())))
            except (OSError, ValueError):
                pass
    print("model: " + adapter.MODEL + " effort " + adapter.EFFORT + " tools " + ",".join(adapter.ALLOWED_TOOLS)
          + " (existing subscription login; no API key; no network listener)")
    return 0 if ok else EXIT_CONFIG


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("command", choices=("run", "check"))
    ap.add_argument("--env-file", type=Path, default=None,
                    help=f"KEY=VALUE file (must be mode 0600); default {DEFAULT_ENV_FILE} when it exists")
    ap.add_argument("--once", action="store_true", help="claim at most one job, then exit")
    a = ap.parse_args(argv)
    env_file = a.env_file or (DEFAULT_ENV_FILE if DEFAULT_ENV_FILE.exists() else None)
    if a.command == "check":
        return check(env_file)
    try:
        cfg = build_config(None, env_file)
    except (ConfigError, OSError) as e:
        log(f"configuration error: {e}")
        return EXIT_CONFIG
    fd = acquire_lock(cfg.data_dir)
    if fd is None:
        log("another worker already holds the data-dir lock; exiting", data_dir=str(cfg.data_dir))
        return EXIT_LOCKED
    stop = threading.Event()

    def _sig(signum, _frame):
        log("signal received; stopping", signal=signum)
        stop.set()

    signal.signal(signal.SIGTERM, _sig)
    signal.signal(signal.SIGINT, _sig)
    log(f"{WORKER_VERSION} starting", endpoint=cfg.endpoint, model=adapter.MODEL, prompt=adapter.LIVE_PROMPT_VERSION)
    return run_loop(cfg, stop, once=a.once)


if __name__ == "__main__":
    sys.exit(main())
