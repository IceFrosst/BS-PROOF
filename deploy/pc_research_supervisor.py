#!/usr/bin/env python3
"""
TEMPORARY main-PC background supervisor for the BS-PROOF research worker (until the VPS).

What this is
    A small, stdlib-only launcher + supervisor that keeps the ALREADY INSTALLED, ALREADY REVIEWED
    worker runtime (~/.local/share/bsproof-research-worker/releases/<release>) running as an ordinary
    detached process of the user `icefrost`, so it survives a closed terminal or a dropped Pi session.
    It is a stop-gap because `systemctl --user` is unusable on this host (the user manager's private
    socket is orphaned) and `sudo` is not available to agents. It is NOT a systemd unit, NOT a managed
    service and NOT boot-persistent: after a PC / WSL / Windows restart NOTHING starts by itself, and
    `status` says so. Persistent host startup stays UNAVAILABLE until the VPS (or an owner-installed
    unit) exists.

What it does NOT do (deliberately)
    * It never talks to a model and never runs `claude`: the worker + `pipeline/claude_research_adapter.py`
      remain the ONLY business model boundary. A guard refuses to spawn any program called claude*.
    * It adds no research cap of any kind (no turn / token / budget / deadline / fallback flag). Its only
      timing is the RESTART cadence of a worker that exited unexpectedly, and the stop timeout.
    * It never extracts, stores, logs or exports the worker token. It parses `worker.env` as DATA (no shell,
      no eval, no `source`), keeps only three non-secret allowlisted names (the pinned CLI path, the data dir,
      the API origin) and skips every other line without examining its value. The worker reads its own token
      from that 0600 file; it is never in anyone's argv or environment.
    * It opens no socket, needs no root, installs nothing, writes only under
      ~/.local/share/bsproof-research-worker/supervisor (0700, files 0600).

The exact command is NOT invented here: it is parsed, as data, from the owner-reviewed user-unit
template (`deploy/bsproof-research-worker.service.example`) and refused if anything in it is not on a
short allowlist (see `build_plan`). The supervisor implements the same semantics the unit asked of
systemd (WorkingDirectory, a scrubbed Environment, UnsetEnvironment, NoNewPrivileges, UMask=0077,
KillMode=control-group, TimeoutStopSec, Restart=on-failure) and adds exponential back-off to the
unit's flat RestartSec so a config/auth fault cannot cause a restart storm.

Commands (python3 pc_research_supervisor.py <command> ...)
    describe --expect-commit SHA [--unit FILE]   print the exact resolved command; starts nothing
    check    --expect-commit SHA [--unit FILE]   describe + preflight + the worker's own `check` (no model, no claim)
    start    --expect-commit SHA --expect-unit-sha256 HEX [--wait-ready N]   launch the detached supervisor (idempotent)
    status   [--json]                                           read-only; exit 0 only when READY
    stop     [--drain | --now]                                  graceful (see below)
    serve    ...                                                internal: the detached loop `start` launches

Stop semantics: SIGTERM never finishes a job (the worker leaves the lease to expire, 300 s). Under the
one-attempt policy (2026-10-06) the queue does NOT re-offer it: the job ends as failed (`lease_expired`),
so cutting a running job loses it. So `stop` REFUSES while a job is running unless `--now`;
`stop --drain` waits (no deadline) until the worker is idle and then stops.
"""
from __future__ import annotations

import argparse
import ctypes
import datetime
import errno
import fcntl
import hashlib
import json
import os
import pwd
import random
import re
import select
import shlex
import signal
import stat
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path

VERSION = "pc-research-supervisor-v0.1"

REQUIRED_USER = "icefrost"
SETPRIV = "/usr/bin/setpriv"           # util-linux; provides --no-new-privs and --pdeathsig (reviewed OS tool)
SETSID = "/usr/bin/setsid"             # util-linux; `setsid -f` forks and returns at once: the launcher is never its parent

EXIT_OK = 0
EXIT_NOT_READY = 1
EXIT_USAGE = 2
EXIT_TIMEOUT = 3
EXIT_JOB_RUNNING = 4
EXIT_INTERNAL = 70
EXIT_LOCKED = 75                        # same code the worker uses for "another worker holds the lock"
EXIT_CONFIG = 78                        # same code the worker uses for configuration errors

ROOT_REL = Path(".local/share/bsproof-research-worker")
RUNTIME_FILES = ("scripts/pc_research_worker.py", "scripts/pc_research_worker.requirements.txt",
                 "pipeline/claude_research_adapter.py", "prompts/research_audit_live.md",
                 "schemas/research_audit.json", "schemas/source_access_v2.json")

# --- the reviewed unit template: the ONLY directives this supervisor understands ------------------------
UNIT_ALLOWED = {
    "Unit": {"Description", "Wants", "After"},
    "Service": {"Type", "WorkingDirectory", "EnvironmentFile", "Environment", "UnsetEnvironment", "ExecStart",
                "Restart", "RestartSec", "KillMode", "TimeoutStopSec", "NoNewPrivileges", "UMask"},
    "Install": {"WantedBy"},
}
UNIT_ENV_ALLOWED = ("PATH", "BS_PROOF_CLAUDE_BIN", "PYTHONUNBUFFERED", "PYTHONDONTWRITEBYTECODE")
UNIT_MUST_UNSET = ("ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "CLAUDE_CODE_OAUTH_TOKEN", "ANTHROPIC_BASE_URL")
# The ONLY names the worker process may ever see. Everything else (API / billing / auth / cloud-flag /
# OpenAI / DeepSeek / Google-credential / Supabase / Vercel / GitHub / SSH / DBUS / XDG_RUNTIME_DIR ...) is
# absent by construction: the environment is built from an empty dict, never filtered from ours.
WORKER_ENV_NAMES = frozenset(("HOME", "USER", "LOGNAME") + UNIT_ENV_ALLOWED)
# The ONLY names read from worker.env (never the token).
ENV_FILE_NAMES = ("BS_PROOF_CLAUDE_BIN", "BS_PROOF_RESEARCH_DATA_DIR", "BS_PROOF_RESEARCH_API_BASE")

_VALUE_OK = re.compile(r"^[A-Za-z0-9_./:@+=,-]*$")


class PlanError(Exception):
    """The reviewed configuration, the runtime or the host is not what this supervisor will run."""


@dataclass
class Tuning:
    """Restart cadence and loop timing. Operational values, NOT limits on research."""
    tick: float = 1.0                  # loop wake-up (signals also wake it at once)
    restart_cap: float = 600.0         # ceiling of the exponential restart back-off
    stable_after: float = 300.0        # a worker that lived this long resets the back-off
    blocked_floor: float = 120.0       # minimum wait after "lock held" / "config error" (78, 75)
    ready_window: float = 120.0        # status.json older than this while "polling" is not fresh
    state_every: float = 5.0
    sweep_grace: float = 10.0          # SIGTERM -> SIGKILL grace for leftover descendants
    log_max_bytes: int = 1 << 20
    log_keep: int = 3


# --------------------------------------------------------------------------- #
# masking: what may reach a log


_RE_BEARER = re.compile(r"(?i)\bbearer\s+\S+")
_RE_JWT = re.compile(r"eyJ[A-Za-z0-9_\-]{8,}(?:\.[A-Za-z0-9_\-]{3,})*")
_RE_SKANT = re.compile(r"sk-ant-[A-Za-z0-9_\-]{4,}")
_RE_EMAIL = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}")
_RE_UUID = re.compile(r"\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b")
_RE_RUNDIR = re.compile(r"(\d{8}T\d{6}Z)-[0-9a-f]{32}")
_RE_OPAQUE = re.compile(r"[A-Za-z0-9_\-]{32,}")
_RE_RELEASE = re.compile(r"bsproof-research-worker-[0-9a-f]{12}")      # a release NAME is an identifier, not a secret
_RE_CTRL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
_RE_WORKER_LINE = re.compile(r"^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ ")
_RE_EXC = re.compile(r"^([A-Za-z_][A-Za-z0-9_.]*(?:Error|Exception|Exit|Interrupt))\b")
MAX_LINE = 500


def mask(text, limit: int = MAX_LINE) -> str:
    """Tokens, JWTs, bearer values, e-mails, UUIDs (user/job/lease ids) and any long opaque string removed."""
    s = _RE_CTRL.sub(" ", "" if text is None else str(text))
    s = _RE_BEARER.sub("Bearer [token]", s)
    s = _RE_JWT.sub("[token]", s)
    s = _RE_SKANT.sub("[token]", s)
    s = _RE_EMAIL.sub("[email]", s)
    s = _RE_UUID.sub(lambda m: "[id:" + hashlib.sha256(m.group(0).lower().encode()).hexdigest()[:4] + "]", s)
    s = _RE_RUNDIR.sub(r"\1-[run]", s)
    s = _RE_OPAQUE.sub(lambda m: m.group(0) if _RE_RELEASE.fullmatch(m.group(0)) else "[token]", s)
    s = " ".join(s.split())
    return s[:limit]


class MaskedLog:
    """Append-only, size-rotated, mode-0600 event log. Never raises: a full disk must not become a crash loop."""

    def __init__(self, directory: Path, name: str, max_bytes: int, keep: int):
        self.path = Path(directory) / name
        self.max_bytes, self.keep = max_bytes, keep
        self.dropped = 0

    def _open(self):
        fd = os.open(self.path, os.O_WRONLY | os.O_APPEND | os.O_CREAT | os.O_CLOEXEC | os.O_NOFOLLOW, 0o600)
        os.fchmod(fd, 0o600)
        return fd

    def _rotate(self):
        for i in range(self.keep, 0, -1):
            src = self.path if i == 1 else Path(f"{self.path}.{i - 1}")
            if src.exists():
                os.replace(src, Path(f"{self.path}.{i}"))

    def write(self, line: str) -> None:
        try:
            if self.path.exists() and self.path.stat().st_size >= self.max_bytes:
                self._rotate()
            fd = self._open()
            try:
                os.write(fd, (line + "\n").encode("utf-8", "replace"))
            finally:
                os.close(fd)
        except OSError:
            self.dropped += 1

    def event(self, msg: str, **kv) -> None:
        ts = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        extra = "".join(f" {k}={mask(v, 120)}" for k, v in kv.items())
        self.write(f"{ts} supervisor: {mask(msg)}{extra}")


# --------------------------------------------------------------------------- #
# /proc helpers. Nothing here ever reads another process's argv or environment.


def proc_stat(pid: int):
    try:
        data = Path(f"/proc/{pid}/stat").read_text()
    except OSError:
        return None
    rest = data.rpartition(")")[2].split()
    try:
        return {"state": rest[0], "ppid": int(rest[1]), "pgrp": int(rest[2]), "session": int(rest[3]),
                "start": int(rest[19])}
    except (IndexError, ValueError):
        return None


def proc_rss_kb(pid: int):
    try:
        for ln in Path(f"/proc/{pid}/status").read_text().splitlines():
            if ln.startswith("VmRSS:"):
                return int(ln.split()[1])
    except (OSError, ValueError, IndexError):
        pass
    return None


def no_new_privs() -> bool:
    try:
        for ln in Path("/proc/self/status").read_text().splitlines():
            if ln.startswith("NoNewPrivs:"):
                return ln.split()[1] == "1"
    except OSError:
        pass
    return False


def boot_id() -> str:
    try:
        return Path("/proc/sys/kernel/random/boot_id").read_text().strip()
    except OSError:
        return "unknown"


def alive(pid: int, start: int | None = None) -> bool:
    st = proc_stat(pid)
    if st is None or st["state"] in ("Z", "X"):
        return False
    return start is None or st["start"] == start


def lock_holders(path: Path):
    """pids holding an flock on `path`, from /proc/locks (read-only: it never takes the lock). None = unknown."""
    try:
        st = os.stat(path)
    except FileNotFoundError:
        return set()
    except OSError:
        return None
    try:
        lines = Path("/proc/locks").read_text().splitlines()
    except OSError:
        return None
    want = (os.major(st.st_dev), os.minor(st.st_dev), st.st_ino)
    out = set()
    for ln in lines:
        t = ln.split()
        if "->" in t or "FLOCK" not in t:
            continue
        i = t.index("FLOCK")
        try:
            maj, mnr, ino = t[i + 4].split(":")
            if (int(maj, 16), int(mnr, 16), int(ino)) == want:
                out.add(int(t[i + 3]))
        except (IndexError, ValueError):
            continue
    return out


def all_pids():
    for e in os.scandir("/proc"):
        if e.name.isdigit():
            yield int(e.name)


def descendants(root_pid: int):
    """[(pid, starttime)] of every live process whose ppid chain reaches `root_pid` (orphans re-parent to a subreaper)."""
    kids: dict[int, list] = {}
    for pid in all_pids():
        st = proc_stat(pid)
        if st is not None:
            kids.setdefault(st["ppid"], []).append((pid, st["start"], st["state"]))
    out, todo = [], [root_pid]
    while todo:
        for pid, start, state in kids.get(todo.pop(), []):
            if state not in ("Z", "X"):
                out.append((pid, start))
            todo.append(pid)
    return out


def signal_if_same(pid: int, start: int, sig: int) -> None:
    if alive(pid, start):          # starttime guards against pid reuse
        try:
            os.kill(pid, sig)
        except (ProcessLookupError, PermissionError):
            pass


def prctl(option: int, arg: int = 0) -> int:
    libc = ctypes.CDLL(None, use_errno=True)
    return libc.prctl(option, ctypes.c_ulong(arg), 0, 0, 0)


PR_SET_CHILD_SUBREAPER = 36


def utc_now() -> str:
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


# --------------------------------------------------------------------------- #
# the reviewed unit template, parsed as data


def _expand(value: str, home: Path) -> str:
    out, i = [], 0
    while i < len(value):
        c = value[i]
        if c != "%":
            out.append(c)
            i += 1
            continue
        n = value[i + 1:i + 2]
        if n == "h":
            out.append(str(home))
        elif n == "%":
            out.append("%")
        else:
            raise PlanError(f"unit uses the unsupported specifier %{n}")
        i += 2
    return "".join(out)


def parse_unit(text: str, home: Path) -> dict:
    sections: dict[str, list] = {}
    cur = None
    for n, raw in enumerate(text.splitlines(), 1):
        ln = raw.strip()
        if not ln or ln[0] in "#;":
            continue
        if ln.startswith("[") and ln.endswith("]"):
            cur = ln[1:-1]
            if cur not in UNIT_ALLOWED:
                raise PlanError(f"unit line {n}: section [{cur}] is not part of the reviewed template")
            sections.setdefault(cur, [])
            continue
        if cur is None or "=" not in ln or ln.endswith("\\"):
            raise PlanError(f"unit line {n}: not a plain Key=Value directive")
        k, v = ln.split("=", 1)
        k = k.strip()
        if k not in UNIT_ALLOWED[cur]:
            raise PlanError(f"unit line {n}: directive {k} is not part of the reviewed template")
        sections[cur].append((k, _expand(v.strip(), home)))
    return sections


def _seconds(v: str) -> float:
    m = re.fullmatch(r"(\d+(?:\.\d+)?)s?", v.strip())
    if not m or float(m.group(1)) <= 0:
        raise PlanError(f"unsupported duration {v!r} (plain positive seconds only)")
    return float(m.group(1))


@dataclass(frozen=True)
class Plan:
    home: Path
    user: str
    root: Path
    unit_sha256: str
    argv: tuple                        # (python, script, "run") with the `current` symlink path, as reviewed
    workdir: Path
    env: dict                          # the unit's Environment= only
    unset: tuple
    env_file: Path
    restart_base: float
    stop_timeout: float
    expect_commit: str

    @property
    def supdir(self) -> Path:
        return self.root / "supervisor"


def build_plan(unit_raw: bytes, home: Path, user: str, expect_commit: str) -> Plan:
    if not re.fullmatch(r"[0-9a-f]{40}", expect_commit or ""):
        raise PlanError("--expect-commit must be a full 40-hex commit id")
    try:
        sec = parse_unit(unit_raw.decode("utf-8"), home)
    except UnicodeDecodeError:
        raise PlanError("unit file is not UTF-8 text")
    svc = sec.get("Service", [])
    root = home / ROOT_REL

    def one(key):
        vals = [v for k, v in svc if k == key]
        if len(vals) != 1:
            raise PlanError(f"unit must set {key} exactly once")
        return vals[0]

    for key, want in (("Type", "simple"), ("Restart", "on-failure"), ("KillMode", "control-group"),
                      ("NoNewPrivileges", "yes"), ("UMask", "0077")):
        if one(key) != want:
            raise PlanError(f"unit {key} must be {want} (the semantics this supervisor implements)")
    base, stop_timeout = _seconds(one("RestartSec")), _seconds(one("TimeoutStopSec"))
    env_file = Path(one("EnvironmentFile"))
    if env_file != home / ".config/bsproof-research-worker/worker.env":
        raise PlanError("EnvironmentFile must be the worker's own default worker.env (the worker reads it itself)")
    workdir = Path(one("WorkingDirectory"))
    if workdir != root / "current":
        raise PlanError("WorkingDirectory must be the installed runtime's `current`")
    env: dict[str, str] = {}
    for k, v in svc:
        if k != "Environment":
            continue
        for item in shlex.split(v):
            name, eq, val = item.partition("=")
            if not eq or name not in UNIT_ENV_ALLOWED or name in env or not _VALUE_OK.fullmatch(val):
                raise PlanError(f"Environment={item.split('=')[0]} is not on the reviewed allowlist")
            env[name] = val
    if set(env) != set(UNIT_ENV_ALLOWED):
        raise PlanError("unit must set exactly " + ", ".join(UNIT_ENV_ALLOWED))
    for p in env["PATH"].split(":"):
        if not p.startswith("/") or ".." in p.split("/"):
            raise PlanError("PATH must be absolute directories only")
    cbin = env["BS_PROOF_CLAUDE_BIN"]
    if not cbin.startswith("/") or ".." in cbin.split("/"):
        raise PlanError("BS_PROOF_CLAUDE_BIN must be an absolute path")
    unset = tuple(x for k, v in svc if k == "UnsetEnvironment" for x in v.split())
    if not set(UNIT_MUST_UNSET) <= set(unset) or set(unset) & set(env):
        raise PlanError("unit must unset " + ", ".join(UNIT_MUST_UNSET))
    argv = tuple(shlex.split(one("ExecStart")))
    want = (str(root / "current/venv/bin/python"), str(root / "current/scripts/pc_research_worker.py"), "run")
    if argv != want:
        raise PlanError("ExecStart must be exactly: <runtime>/current/venv/bin/python "
                        "<runtime>/current/scripts/pc_research_worker.py run")
    return Plan(home=home, user=user, root=root, unit_sha256=hashlib.sha256(unit_raw).hexdigest(),
                argv=argv, workdir=workdir, env=env, unset=unset, env_file=env_file, restart_base=base,
                stop_timeout=stop_timeout, expect_commit=expect_commit)


def worker_env(plan: Plan) -> dict:
    env = {"HOME": str(plan.home), "USER": plan.user, "LOGNAME": plan.user, **plan.env}
    assert set(env) <= WORKER_ENV_NAMES
    return env


def read_env_names(path: Path) -> dict:
    """worker.env as DATA. Refused unless a regular, owned, private (no group/other bits) file. Only the
    allowlisted non-secret names are returned; every other line (the token included) is skipped without
    its value being examined."""
    st = os.lstat(path)
    if not stat.S_ISREG(st.st_mode) or st.st_uid != os.geteuid() or st.st_mode & 0o077:
        raise PlanError(f"{path} must be a regular file owned by this user with mode 0600")
    out = {}
    for n, raw in enumerate(Path(path).read_text(encoding="utf-8").splitlines(), 1):
        ln = raw.strip()
        if not ln or ln.startswith("#"):
            continue
        if "=" not in ln:
            raise PlanError(f"{path}:{n}: expected KEY=VALUE")
        k, v = ln.split("=", 1)
        k = k.strip()
        if k in ENV_FILE_NAMES:
            v = v.strip()
            if len(v) >= 2 and v[0] == v[-1] and v[0] in "\"'":
                v = v[1:-1]
            out[k] = v
    return out


def private_dir(path: Path, create: bool) -> None:
    try:
        st = os.lstat(path)
    except FileNotFoundError:
        if not create:
            raise PlanError(f"{path} does not exist")
        os.mkdir(path, 0o700)
        return
    if not stat.S_ISDIR(st.st_mode) or st.st_uid != os.geteuid() or st.st_mode & 0o077:
        raise PlanError(f"{path} must be a real directory owned by this user with mode 0700")


@dataclass(frozen=True)
class Release:
    path: Path
    name: str
    commit: str
    python: Path
    script: Path


def verify_release(plan: Plan) -> Release:
    """The PINNED runtime: `current` must resolve to the release of the expected commit and every runtime
    file must match its recorded checksum. Re-run before every (re)start."""
    expected_name = "bsproof-research-worker-" + plan.expect_commit[:12]
    try:
        real = (plan.root / "current").resolve(strict=True)
    except OSError as e:
        raise PlanError(f"runtime `current` does not resolve: {e.strerror}")
    if real.parent != (plan.root / "releases").resolve() or real.name != expected_name:
        raise PlanError(f"`current` is {real.name}, expected {expected_name}; refusing a stale or unpromoted runtime")
    try:
        meta = json.loads((real / "RELEASE.json").read_text())
        sums = {}
        for ln in (real / "SHA256SUMS").read_text().splitlines():
            h, _, rel = ln.partition("  ")
            sums[rel.strip()] = h.strip()
    except (OSError, ValueError) as e:
        raise PlanError(f"runtime metadata unreadable: {type(e).__name__}")
    if meta.get("name") != expected_name or meta.get("commit") != plan.expect_commit:
        raise PlanError("RELEASE.json does not name the expected commit")
    if set(sums) != set(RUNTIME_FILES):
        raise PlanError("SHA256SUMS does not list exactly the six reviewed runtime files")
    dst = os.lstat(real)
    if dst.st_uid != os.geteuid() or dst.st_mode & 0o022:
        raise PlanError("release directory must be owned by this user and not group/world writable")
    for rel in RUNTIME_FILES:
        f = real / rel
        fst = os.lstat(f)
        if not stat.S_ISREG(fst.st_mode) or fst.st_uid != os.geteuid() or fst.st_mode & 0o022:
            raise PlanError(f"{rel} must be a regular file owned by this user, not group/world writable")
        if hashlib.sha256(f.read_bytes()).hexdigest() != sums[rel]:
            raise PlanError(f"{rel} differs from the release checksum")
    py = real / "venv/bin/python"
    if not os.access(py, os.X_OK):
        raise PlanError("runtime venv python is not executable")
    return Release(real, expected_name, plan.expect_commit, py, real / "scripts/pc_research_worker.py")


def data_dir_of(plan: Plan, env_names: dict) -> Path:
    d = Path(env_names.get("BS_PROOF_RESEARCH_DATA_DIR") or (plan.root / "data"))
    if not d.is_absolute() or ".." in d.parts:
        raise PlanError("BS_PROOF_RESEARCH_DATA_DIR must be an absolute path")
    if plan.root not in d.parents or d == plan.supdir:
        raise PlanError("the data dir must live inside the 0700 runtime root (and not be the supervisor dir)")
    return d


def preflight(plan: Plan, require_idle_lock: bool = True):
    """-> (Release, env_names, data_dir). Raises PlanError(code, text) for the first problem."""
    if os.geteuid() == 0 or pwd.getpwuid(os.geteuid()).pw_name != plan.user:
        raise PlanError(f"must run as the linux user {plan.user}, never root")
    private_dir(plan.root, create=False)
    rel = verify_release(plan)
    names = read_env_names(plan.env_file)
    if names.get("BS_PROOF_CLAUDE_BIN", plan.env["BS_PROOF_CLAUDE_BIN"]) != plan.env["BS_PROOF_CLAUDE_BIN"]:
        raise PlanError("worker.env and the reviewed unit name different CLI paths")
    cb = plan.env["BS_PROOF_CLAUDE_BIN"]
    if not (os.path.isfile(cb) and os.access(cb, os.X_OK)):     # existence only; this program never runs it
        raise PlanError("the pinned CLI path is not an executable file")
    if "BS_PROOF_RESEARCH_API_BASE" not in names:
        raise PlanError("worker.env has no API base")
    data = data_dir_of(plan, names)
    if data.exists():
        private_dir(data, create=False)
    if not os.access(SETPRIV, os.X_OK):
        raise PlanError("setpriv (no-new-privileges) is unavailable; refusing to run without it")
    if require_idle_lock:
        holders = lock_holders(data / "worker.lock")
        if holders:
            raise LockedError(sorted(holders))
    return rel, names, data


class LockedError(PlanError):
    def __init__(self, pids):
        super().__init__("a worker already holds the data-dir lock (pid " + ",".join(map(str, pids)) + ")")
        self.pids = pids


# --------------------------------------------------------------------------- #
# the supervisor loop


class Backoff:
    def __init__(self, base: float, cap: float, stable: float, rng=None):
        self.base, self.cap, self.stable = base, cap, stable
        self.rng = rng or random.Random()
        self.n = 0

    def next_delay(self, ran_seconds: float) -> float:
        if ran_seconds >= self.stable:
            self.n = 0
        d = min(self.cap, self.base * (2 ** min(self.n, 30)))
        self.n += 1
        return min(self.cap, d * (0.8 + 0.4 * self.rng.random()))


def guard_argv(argv) -> None:
    if any(os.path.basename(str(a)).lower().startswith("claude") for a in argv[:6]):
        raise PlanError("refusing to spawn a model CLI: only the worker may reach the model boundary")


class Supervisor:
    def __init__(self, plan: Plan, tuning: Tuning, rng=None):
        self.plan, self.t = plan, tuning
        self.supdir = plan.supdir
        self.log = MaskedLog(self.supdir, "supervisor.log", tuning.log_max_bytes, tuning.log_keep)
        self.backoff = Backoff(plan.restart_base, tuning.restart_cap, tuning.stable_after, rng)
        self.stop_requested = False
        self.drain_requested = False
        self.worker: subprocess.Popen | None = None
        self.worker_start = None
        self.spawned_at = 0.0
        self.pipe_fd: int | None = None
        self.pipe_file = None              # the Popen stderr object that owns pipe_fd (closed through it, once)
        self.buf = b""
        self.skipping_long = False
        self.unstructured = 0
        self.last_exc = None
        self.next_start = 0.0
        self.restarts = 0
        self.last_exit = None
        self.polls = 0
        self.last_stamp = None
        self.state, self.reason = "starting", None
        self.release: Release | None = None
        self.data_dir: Path | None = None
        self.lock_fd = None
        self.started = utc_now()
        self.my_start = (proc_stat(os.getpid()) or {}).get("start")
        self.wake_r, self.wake_w = os.pipe()
        os.set_blocking(self.wake_r, False)
        os.set_blocking(self.wake_w, False)
        self._last_state_write = 0.0

    # -- signals -------------------------------------------------------------
    def install_signals(self):
        def _term(_s, _f):
            self.stop_requested = True

        def _drain(_s, _f):
            self.drain_requested = True

        signal.signal(signal.SIGTERM, _term)
        signal.signal(signal.SIGINT, _term)
        signal.signal(signal.SIGUSR1, _drain)
        signal.signal(signal.SIGHUP, signal.SIG_IGN)      # a hang-up of a vanished terminal is not a stop
        signal.set_wakeup_fd(self.wake_w, warn_on_full_buffer=False)

    # -- worker stderr -------------------------------------------------------
    def _flush_unstructured(self):
        if self.unstructured:
            self.log.event("worker stderr lines suppressed (not log lines)", lines=self.unstructured,
                           exception_type=self.last_exc or "-")
            self.unstructured, self.last_exc = 0, None

    def _line(self, raw: bytes):
        text = raw.decode("utf-8", "replace").rstrip("\r\n")
        if _RE_WORKER_LINE.match(text):
            self._flush_unstructured()
            self.log.write("worker: " + mask(text))
        elif text.strip():
            self.unstructured += 1
            m = _RE_EXC.match(text.strip())
            if m:
                self.last_exc = m.group(1)

    def _read_pipe(self):
        try:
            data = os.read(self.pipe_fd, 4096)
        except (BlockingIOError, InterruptedError):
            return
        except OSError:
            data = b""
        if not data:                                       # EOF is NOT an exit and NOT a reason to restart
            self.log.event("worker stderr closed; waiting for the process itself")
            self._close_pipe()
            return
        self.buf += data
        while b"\n" in self.buf:
            line, self.buf = self.buf.split(b"\n", 1)
            if self.skipping_long:
                self.skipping_long = False
            else:
                self._line(line)
        if len(self.buf) > 4096:                           # bounded memory: a newline-less stream cannot grow us
            self._line(self.buf[:4096])
            self.buf, self.skipping_long = b"", True

    def _close_pipe(self):
        if self.pipe_fd is not None:
            if self.buf and not self.skipping_long:
                self._line(self.buf)
            self.buf, self.skipping_long = b"", False
            try:
                self.pipe_file.close()
            except (OSError, AttributeError):
                pass
            self.pipe_fd, self.pipe_file = None, None
            self._flush_unstructured()

    def pump(self, timeout: float):
        rlist = [self.wake_r] + ([self.pipe_fd] if self.pipe_fd is not None else [])
        r, _, _ = select.select(rlist, [], [], max(0.0, timeout))
        if self.wake_r in r:
            try:
                os.read(self.wake_r, 512)
            except (BlockingIOError, InterruptedError):
                pass
        if self.pipe_fd is not None and self.pipe_fd in r:
            self._read_pipe()

    # -- worker lifecycle ----------------------------------------------------
    def _blocked(self, state: str, reason: str, floor: bool):
        delay = self.backoff.next_delay(0.0)
        if floor:
            delay = max(delay, min(self.t.blocked_floor, self.t.restart_cap))
        self.state, self.reason = state, reason
        self.next_start = time.monotonic() + delay
        self.log.event("not starting the worker", state=state, reason=reason, retry_in_s=int(delay))

    def try_spawn(self):
        try:
            self.release, _names, self.data_dir = preflight(self.plan)
        except LockedError as e:
            return self._blocked("blocked_worker_lock_held", str(e), True)
        except (PlanError, OSError) as e:
            return self._blocked("blocked_config", str(e), True)
        argv = [SETPRIV, "--no-new-privs", "--pdeathsig", "TERM", "--",
                str(self.release.python), str(self.release.script), "run"]
        guard_argv(argv)
        try:
            self.worker = subprocess.Popen(
                argv, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE,
                env=worker_env(self.plan), cwd=self.release.path, close_fds=True, start_new_session=True,
                umask=0o077)
        except OSError as e:
            return self._blocked("blocked_runtime", f"spawn failed: {type(e).__name__}", False)
        self.pipe_file = self.worker.stderr
        self.pipe_fd = self.pipe_file.fileno()
        os.set_blocking(self.pipe_fd, False)
        self.buf, self.skipping_long = b"", False
        self.spawned_at = time.monotonic()
        self.worker_start = (proc_stat(self.worker.pid) or {}).get("start")
        self.polls, self.last_stamp = 0, None
        self.state, self.reason = "running", None
        self.log.event("worker started", pid=self.worker.pid, release=self.release.name)

    def _worker_status(self):
        try:
            d = json.loads((self.data_dir / "status.json").read_text())
            return d if isinstance(d, dict) else None
        except (OSError, ValueError, TypeError):
            return None

    def poll_claims(self):
        """Counts distinct `polling` writes of THIS worker: each one after the first means a claim was answered."""
        if self.worker is None or self.data_dir is None:
            return
        ws = self._worker_status()
        if ws and ws.get("pid") == self.worker.pid and ws.get("state") == "polling":
            stamp = ws.get("updated_utc")
            if stamp != self.last_stamp:
                self.last_stamp = stamp
                self.polls += 1

    def worker_idle(self) -> bool:
        ws = self._worker_status()
        if ws and ws.get("pid") == self.worker.pid:
            return ws.get("state") != "running"
        return time.monotonic() - self.spawned_at > self.t.ready_window   # no status of ours for a long time

    def on_exit(self, rc: int):
        ran = time.monotonic() - self.spawned_at
        for _ in range(50):                                # drain what the dead worker left in the pipe
            if self.pipe_fd is None:
                break
            r, _, _ = select.select([self.pipe_fd], [], [], 0)
            if not r:
                break
            self._read_pipe()
        self._close_pipe()
        sig = -rc if rc < 0 else None
        self.worker = None
        self.restarts += 1
        self.sweep("worker exited")                        # a CLI the dead worker started has no lease holder
        delay = self.backoff.next_delay(ran)
        kind = {EXIT_CONFIG: "configuration error", EXIT_LOCKED: "another worker holds the lock"}.get(rc, "unexpected exit")
        if rc in (EXIT_CONFIG, EXIT_LOCKED):
            delay = max(delay, min(self.t.blocked_floor, self.t.restart_cap))
        self.last_exit = {"code": rc, "signal": sig, "ran_s": round(ran, 1), "utc": utc_now(), "kind": kind}
        self.state, self.reason = "backoff", kind
        self.next_start = time.monotonic() + delay
        self.log.event("worker exited", kind=kind, code=rc, signal=sig, ran_s=int(ran), restart_in_s=int(delay))

    def reap_zombies(self):
        wpid = self.worker.pid if self.worker else None
        for pid in all_pids():
            st = proc_stat(pid)
            if st and st["ppid"] == os.getpid() and st["state"] == "Z" and pid != wpid:
                try:
                    os.waitpid(pid, os.WNOHANG)
                except ChildProcessError:
                    pass

    def sweep(self, why: str):
        """SIGTERM then SIGKILL every leftover descendant (the CLI runs in its OWN session, so a group signal to
        the worker cannot reach it). Only processes whose parent chain ends here are touched."""
        victims = descendants(os.getpid())
        if self.worker is not None:
            victims = [(p, s) for p, s in victims if p != self.worker.pid]
        if not victims:
            return
        self.log.event("terminating leftover descendants", count=len(victims), why=why)
        for p, s in victims:
            signal_if_same(p, s, signal.SIGTERM)
        deadline = time.monotonic() + self.t.sweep_grace
        while time.monotonic() < deadline:
            self.reap_zombies()
            if not [v for v in descendants(os.getpid()) if self.worker is None or v[0] != self.worker.pid]:
                break
            time.sleep(0.05)
        for p, s in descendants(os.getpid()):
            if self.worker is None or p != self.worker.pid:
                signal_if_same(p, s, signal.SIGKILL)
        time.sleep(0.05)
        self.reap_zombies()

    def terminate_worker(self):
        w = self.worker
        if w is None:
            return
        self.state = "stopping"
        self.write_state(force=True)
        self.log.event("stopping the worker (SIGTERM; a running lease is left to expire)", pid=w.pid)
        self._signal_group(w, signal.SIGTERM)
        deadline = time.monotonic() + self.plan.stop_timeout
        while w.poll() is None and time.monotonic() < deadline:
            self.pump(0.2)
        if w.poll() is None:
            self.log.event("worker ignored SIGTERM; SIGKILL", waited_s=int(self.plan.stop_timeout))
            self._signal_group(w, signal.SIGKILL)
            try:
                w.wait(10)
            except subprocess.TimeoutExpired:
                pass
        for _ in range(50):
            if self.pipe_fd is None:
                break
            r, _, _ = select.select([self.pipe_fd], [], [], 0)
            if not r:
                break
            self._read_pipe()
        self._close_pipe()
        self.worker = None

    @staticmethod
    def _signal_group(w: subprocess.Popen, sig: int):
        try:
            os.killpg(w.pid, sig)            # the worker leads its own session/group; nothing else is in it
        except (ProcessLookupError, PermissionError):
            try:
                w.send_signal(sig)
            except (ProcessLookupError, OSError):
                pass

    # -- state ----------------------------------------------------------------
    def write_state(self, force: bool = False):
        now = time.monotonic()
        if not force and now - self._last_state_write < self.t.state_every:
            return
        self._last_state_write = now
        doc = {
            "version": VERSION, "supervisor_pid": os.getpid(), "supervisor_start_ticks": self.my_start,
            "boot_id": boot_id(), "started_utc": self.started, "updated_utc": utc_now(),
            "state": self.state, "reason": self.reason, "drain": self.drain_requested,
            "release": self.release.name if self.release else None, "commit": self.plan.expect_commit,
            "unit_sha256": self.plan.unit_sha256, "worker_pid": self.worker.pid if self.worker else None,
            "worker_start_ticks": self.worker_start if self.worker else None,
            "polls_since_start": self.polls if self.worker else 0, "restarts": self.restarts,
            "next_start_in_s": max(0, int(self.next_start - now)) if self.worker is None else None,
            "last_exit": self.last_exit, "no_new_privs": no_new_privs(),
            "data_dir": str(self.data_dir) if self.data_dir else None,
            "supervisor_rss_kb": proc_rss_kb(os.getpid()), "log_lines_dropped": self.log.dropped,
        }
        atomic_json(self.supdir / "state.json", doc)

    def run(self) -> int:
        self.install_signals()
        rc = EXIT_OK
        try:
            self.write_state(force=True)
            self.log.event("supervisor started", pid=os.getpid(), version=VERSION, commit=self.plan.expect_commit[:12],
                           unit_sha256=self.plan.unit_sha256[:12])
            tick = self.t.tick
            while not self.stop_requested:
                now = time.monotonic()
                if self.worker is None:
                    if self.drain_requested:
                        break
                    if now >= self.next_start:
                        self.try_spawn()
                    self.pump(min(tick, max(0.01, self.next_start - time.monotonic())) if self.worker is None else tick)
                else:
                    self.pump(tick)
                    code = self.worker.poll()
                    if code is not None:
                        self.on_exit(code)
                    else:
                        self.poll_claims()
                        if self.drain_requested and self.worker_idle():
                            break
                self.reap_zombies()
                self.write_state()
        except Exception as e:           # never leave a worker or a CLI behind because of a bug in this loop
            self.log.event("internal error; shutting down", error=type(e).__name__)
            rc = EXIT_INTERNAL
        finally:
            self.shutdown()
        return rc

    def shutdown(self):
        self.state = "stopping"
        self.terminate_worker()
        self.sweep("shutdown")
        self.state = "stopped"
        self.write_state(force=True)
        self.log.event("supervisor stopped", restarts=self.restarts)
        for name in ("supervisor.pid",):
            try:
                os.unlink(self.supdir / name)
            except OSError:
                pass


def atomic_json(path: Path, doc: dict) -> None:
    tmp = Path(f"{path}.tmp.{os.getpid()}")
    try:
        fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC | os.O_CLOEXEC | os.O_NOFOLLOW, 0o600)
        with os.fdopen(fd, "w") as f:
            json.dump(doc, f, indent=1, sort_keys=True)
        os.replace(tmp, path)
    except OSError:
        try:
            os.unlink(tmp)
        except OSError:
            pass


def read_json(path: Path):
    try:
        d = json.loads(Path(path).read_text())
        return d if isinstance(d, dict) else None
    except (OSError, ValueError):
        return None


# --------------------------------------------------------------------------- #
# commands


def load_plan(a, home: Path, user: str) -> Plan:
    unit = Path(a.unit)
    st = os.lstat(unit)
    if not stat.S_ISREG(st.st_mode) or st.st_mode & 0o022:
        raise PlanError("the reviewed unit file must be a regular file that is not group/world writable")
    return build_plan(unit.read_bytes(), home, user, a.expect_commit)


def sup_identity(supdir: Path):
    """(pid, start) of a live supervisor, verified three ways (pid file, process start time, held lock), else None."""
    pf = supdir / "supervisor.pid"
    try:
        pid_s, start_s, bid = pf.read_text().split()
        pid, start = int(pid_s), int(start_s)
    except (OSError, ValueError):
        return None
    if bid != boot_id() or not alive(pid, start):
        return None
    holders = lock_holders(supdir / "supervisor.lock")
    if holders is not None and pid not in holders:
        return None
    return pid, start


def describe_lines(plan: Plan, a) -> list[str]:
    rel_note = "-"
    try:
        rel = verify_release(plan)
        rel_note = f"{rel.name} (RELEASE.json commit matches; all {len(RUNTIME_FILES)} files match their checksums)"
    except PlanError as e:
        rel_note = f"NOT VERIFIED: {e}"
    env = worker_env(plan)
    return [
        f"supervisor        {VERSION}",
        f"unit template     {a.unit}  sha256={plan.unit_sha256}",
        f"expected commit   {plan.expect_commit}",
        f"runtime           {rel_note}",
        "worker argv       " + " ".join([SETPRIV, "--no-new-privs", "--pdeathsig", "TERM", "--",
                                         "<resolved release>/venv/bin/python",
                                         "<resolved release>/scripts/pc_research_worker.py", "run"]),
        "worker cwd        <resolved release> (absolute)",
        "worker env (all)  " + ", ".join(f"{k}={v}" for k, v in sorted(env.items())),
        "worker env NOT   " + "everything else: no API/billing/auth/cloud/OpenAI/DeepSeek/Google/Supabase/Vercel var, "
        "no XDG_RUNTIME_DIR, no DBUS (unit also unsets " + ", ".join(plan.unset) + ")",
        "token             never extracted, stored, logged or exported by the supervisor; the worker reads it itself "
        "from the 0600 worker.env",
        "worker.env names  only " + ", ".join(ENV_FILE_NAMES) + " are looked at (parsed as data; nothing is executed)",
        f"restart policy    on unexpected exit only; back-off {plan.restart_base:g}s x2 .. cap, reset after a stable run",
        f"stop              SIGTERM to the worker group, {plan.stop_timeout:g}s, then SIGKILL; leftovers swept",
        "process           setsid session, NoNewPrivs=1 (setpriv), umask 0077, no listening socket, never root",
        f"state/log dir     {plan.supdir} (0700; files 0600)",
        "persistence       NONE across a PC/WSL/Windows restart (temporary; VPS pending)",
    ]


def cmd_describe(a, plan, tuning) -> int:
    print("\n".join(describe_lines(plan, a)))
    return EXIT_OK


def cmd_check(a, plan, tuning) -> int:
    print("\n".join(describe_lines(plan, a)))
    try:
        rel, _names, data = preflight(plan, require_idle_lock=False)
    except (PlanError, OSError) as e:
        print(f"FAIL preflight: {mask(e)}")
        return EXIT_CONFIG
    print(f"ok   preflight: runtime, worker.env (0600, parsed as data), CLI path, setpriv, data dir {data}")
    holders = lock_holders(data / "worker.lock")
    print(f"info worker lock holders: {sorted(holders) if holders else 'none'}")
    try:
        p = subprocess.run([SETPRIV, "--no-new-privs", "--", str(rel.python), str(rel.script), "check"],
                           stdin=subprocess.DEVNULL, capture_output=True, text=True, timeout=120,
                           env=worker_env(plan), cwd=rel.path, umask=0o077)
    except (OSError, subprocess.SubprocessError) as e:
        print(f"FAIL worker check did not run: {type(e).__name__}")
        return EXIT_CONFIG
    for ln in p.stdout.splitlines():
        print("worker " + mask(ln))
    return EXIT_OK if p.returncode == 0 else EXIT_CONFIG


def status_doc(home: Path, tuning: Tuning) -> dict:
    """Everything `status` and `stop` need, from the supervisor's own state, /proc and the worker's status file.
    No unit file, no commit and no token are needed (a kill switch must work when the reviewed files are gone)."""
    root = home / ROOT_REL
    supdir = root / "supervisor"
    sup = sup_identity(supdir)
    st = read_json(supdir / "state.json") or {}
    d: dict = {"supervisor": {"running": sup is not None}, "worker": {}, "ready": False, "reasons": []}
    data = Path(st["data_dir"]) if st.get("data_dir") else root / "data"
    if not st.get("data_dir"):
        try:
            names = read_env_names(home / ".config/bsproof-research-worker/worker.env")
            if names.get("BS_PROOF_RESEARCH_DATA_DIR"):
                data = Path(names["BS_PROOF_RESEARCH_DATA_DIR"])
        except (PlanError, OSError):
            pass
    holders = lock_holders(data / "worker.lock")
    ws = read_json(data / "status.json") or {}
    d["worker"]["data_dir"] = str(data)
    d["worker"]["lock_holders"] = sorted(holders) if holders is not None else None
    d["worker"]["status_file"] = {k: ws.get(k) for k in ("state", "pid", "updated_utc") if k in ws}
    if isinstance(ws.get("pid"), int) and not alive(ws["pid"]):
        d["worker"]["status_file_stale"] = f"pid {ws['pid']} is not running; the file is a leftover, not a heartbeat"
    reasons = d["reasons"]
    if sup is None:
        if st.get("boot_id") and st["boot_id"] != boot_id():
            reasons.append("the PC / WSL restarted since the supervisor ran: nothing restarts by itself, run `start`")
        else:
            reasons.append("supervisor not running")
        if holders:
            reasons.append(f"a worker NOT owned by this supervisor holds the data-dir lock (pid {sorted(holders)})")
        return d
    d["supervisor"].update({"pid": sup[0], "state": st.get("state"), "started_utc": st.get("started_utc"),
                            "release": st.get("release"), "rss_kb": proc_rss_kb(sup[0]),
                            "restarts": st.get("restarts"), "last_exit": st.get("last_exit"),
                            "no_new_privs": st.get("no_new_privs"), "drain": st.get("drain")})
    wpid = st.get("worker_pid")
    if st.get("state") != "running" or not wpid or not alive(int(wpid), st.get("worker_start_ticks")):
        reasons.append(f"worker not running (supervisor state: {st.get('state')}"
                       + (f", {st.get('reason')}" if st.get("reason") else "") + ")")
        return d
    wpid = int(wpid)
    d["worker"].update({"pid": wpid, "rss_kb": proc_rss_kb(wpid),
                        "descendants": len([1 for p, _ in descendants(sup[0]) if p != wpid])})
    if holders is not None and wpid not in holders:
        reasons.append("the worker does not hold the data-dir lock")
    if ws.get("pid") != wpid:
        reasons.append("status.json is not this worker's yet")
    else:
        wstate = ws.get("state")
        age = None
        try:
            age = (datetime.datetime.now(datetime.timezone.utc)
                   - datetime.datetime.fromisoformat(ws["updated_utc"])).total_seconds()
        except (KeyError, ValueError, TypeError):
            pass
        d["worker"]["age_s"] = None if age is None else round(age)
        if wstate == "running":
            pass
        elif wstate == "polling":
            if age is None or age > tuning.ready_window:
                reasons.append(f"poll heartbeat is stale (age {age})")
            elif (st.get("polls_since_start") or 0) < 2:
                reasons.append("no claim has been answered yet (waiting for the first poll cycle)")
        else:
            reasons.append(f"worker state is {wstate} ({ws.get('reason') or '-'}): not claiming")
    d["worker"]["polls_since_start"] = st.get("polls_since_start")
    d["ready"] = not reasons
    return d


def cmd_status(a, home: Path, tuning) -> int:
    d = status_doc(home, tuning)
    d["persistence"] = "NONE across a PC/WSL/Windows restart (temporary supervisor; no unit, no autostart)"
    if a.json:
        print(json.dumps(d, indent=1, sort_keys=True))
    else:
        s, w = d["supervisor"], d["worker"]
        print(f"supervisor: {'running pid=' + str(s.get('pid')) + ' state=' + str(s.get('state')) if s['running'] else 'NOT running'}"
              + (f" rss={s.get('rss_kb')}kB restarts={s.get('restarts')}" if s["running"] else ""))
        if w.get("pid"):
            print(f"worker:     pid={w['pid']} rss={w.get('rss_kb')}kB descendants={w.get('descendants')} "
                  f"status={w.get('status_file', {}).get('state')} age={w.get('age_s')}s polls={w.get('polls_since_start')}")
        if w.get("status_file_stale"):
            print("note:       " + w["status_file_stale"])
        print(f"logs:       {home / ROOT_REL / 'supervisor' / 'supervisor.log'} (0600, masked)")
        print("persistence: " + d["persistence"])
        print("READY" if d["ready"] else "NOT READY: " + "; ".join(d["reasons"]))
    return EXIT_OK if d["ready"] else EXIT_NOT_READY


def cmd_start(a, plan, tuning) -> int:
    try:
        preflight(plan, require_idle_lock=sup_identity(plan.supdir) is None)
    except LockedError as e:
        print(f"refusing: {e}. Nothing was started; stop that worker first (it is not owned by this supervisor).")
        return EXIT_LOCKED
    except (PlanError, OSError) as e:
        print(f"refusing: {mask(e)}")
        return EXIT_CONFIG
    ident = sup_identity(plan.supdir)
    if ident:
        print(f"already running: supervisor pid={ident[0]} (idempotent; nothing started)")
        return cmd_status(argparse.Namespace(json=False), plan.home, tuning)
    private_dir(plan.supdir, create=True)
    me = os.path.abspath(sys.argv[0])
    mst = os.lstat(me)
    if not stat.S_ISREG(mst.st_mode) or mst.st_uid != os.geteuid() or mst.st_mode & 0o022:
        print("refusing: the supervisor file must be a regular file owned by this user, not group/world writable")
        return EXIT_CONFIG
    for stale in ("state.json", "supervisor.pid"):          # no live supervisor (checked above): leftovers only
        try:
            os.unlink(plan.supdir / stale)
        except FileNotFoundError:
            pass
    errfile = os.open(plan.supdir / "supervisor.stderr", os.O_WRONLY | os.O_CREAT | os.O_TRUNC | os.O_NOFOLLOW, 0o600)
    argv = [SETSID, "-f", SETPRIV, "--no-new-privs", "--", sys.executable, me, "serve", "--expect-commit",
            a.expect_commit, "--unit", os.path.abspath(a.unit), "--expect-unit-sha256", a.expect_unit_sha256]
    if getattr(a, "tuning_json", None):
        argv += ["--tuning-json", a.tuning_json]
    guard_argv(argv)
    env = {"PATH": "/usr/local/bin:/usr/bin:/bin", "HOME": str(plan.home), "USER": plan.user, "LOGNAME": plan.user}
    # `setsid -f` forks and exits at once, so the supervisor is orphaned to init immediately: no tool that kills
    # "the command's process tree" (a Pi tool timeout, a closed terminal) can reach it, even during --wait-ready.
    try:
        subprocess.run(argv, stdin=subprocess.DEVNULL, stdout=errfile, stderr=errfile, env=env, cwd="/",
                       close_fds=True, start_new_session=True, umask=0o077, timeout=15)
    except (OSError, subprocess.SubprocessError) as e:
        print(f"launch failed: {type(e).__name__}")
        return EXIT_CONFIG
    finally:
        os.close(errfile)
    launched = time.monotonic()
    while True:
        ident = sup_identity(plan.supdir)
        st = read_json(plan.supdir / "state.json")
        if ident and st and st.get("supervisor_pid") == ident[0]:
            break
        elapsed = time.monotonic() - launched
        try:
            err = mask((plan.supdir / "supervisor.stderr").read_text()[-400:])
        except OSError:
            err = ""
        if err and elapsed > 1.5:
            print(f"supervisor did not come up: {err}")
            return EXIT_LOCKED if "already holds the lock" in err else EXIT_CONFIG
        if elapsed > 30:
            print("supervisor did not report in 30 s")
            return EXIT_TIMEOUT
        time.sleep(0.1)
    print(f"started: detached supervisor pid={ident[0]} (own session, orphaned to init; survives the terminal / Pi session; "
          "NOT boot-persistent). Logs: " + str(plan.supdir / "supervisor.log"))
    wait = float(getattr(a, "wait_ready", 0) or 0)
    if wait > 0:
        end = time.monotonic() + wait
        while time.monotonic() < end:
            if status_doc(plan.home, tuning)["ready"]:
                break
            time.sleep(0.5)
        return cmd_status(argparse.Namespace(json=False), plan.home, tuning)
    return EXIT_OK


def cmd_stop(a, home: Path, tuning) -> int:
    supdir = home / ROOT_REL / "supervisor"
    ident = sup_identity(supdir)
    if not ident:
        print("supervisor not running (nothing to stop)")
        return EXIT_OK
    pid = ident[0]
    d = status_doc(home, tuning)
    st = read_json(supdir / "state.json") or {}
    running_job = (d["worker"].get("status_file", {}).get("state") == "running" and st.get("state") == "running")
    if a.drain:
        os.kill(pid, signal.SIGUSR1)
        print("drain requested: the supervisor stops when the worker is idle (no deadline; run `stop --now` to cut a job)")
    else:
        if running_job and not a.now:
            print("a research job is RUNNING. `stop` would cut it: its lease expires within 300 s and, with one "
                  "attempt per job, the job then ends as failed (lease_expired); it is not re-offered. "
                  "Use `stop --drain` to let it finish, or `stop --now`.")
            return EXIT_JOB_RUNNING
        os.kill(pid, signal.SIGTERM)
        print("stop requested (SIGTERM)")
    end = time.monotonic() + (a.wait if a.wait is not None else (None if a.drain else 120.0))   # TimeoutStopSec 60 + sweep + margin
    while end is None or time.monotonic() < end:
        if not alive(pid, ident[1]):
            print("stopped: supervisor exited; worker lock holders left: "
                  + str(sorted(lock_holders(Path(d["worker"]["data_dir"]) / "worker.lock") or [])))
            return EXIT_OK
        time.sleep(0.2)
    print("still running after the wait")
    return EXIT_TIMEOUT


def cmd_serve(a, plan, tuning) -> int:
    if os.geteuid() == 0 or pwd.getpwuid(os.geteuid()).pw_name != plan.user:
        print("must run as the linux user " + plan.user, file=sys.stderr)
        return EXIT_CONFIG
    if not no_new_privs():
        print("NoNewPrivs is not set; launch through `start` (setpriv --no-new-privs)", file=sys.stderr)
        return EXIT_CONFIG
    os.umask(0o077)
    private_dir(plan.root, create=False)
    private_dir(plan.supdir, create=True)
    fd = os.open(plan.supdir / "supervisor.lock", os.O_CREAT | os.O_RDWR | os.O_CLOEXEC | os.O_NOFOLLOW, 0o600)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError as e:
        os.close(fd)
        if e.errno in (errno.EAGAIN, errno.EACCES):
            print("another supervisor already holds the lock; exiting", file=sys.stderr)
            return EXIT_LOCKED
        raise
    try:
        if prctl(PR_SET_CHILD_SUBREAPER, 1) != 0:
            print("cannot become a child subreaper; refusing (leftover CLI processes could not be cleaned up)", file=sys.stderr)
            return EXIT_CONFIG
        try:
            preflight(plan, require_idle_lock=False)
        except (PlanError, OSError) as e:
            print("refusing: " + mask(e), file=sys.stderr)
            return EXIT_CONFIG
        sup = Supervisor(plan, tuning)
        me = proc_stat(os.getpid())
        pid_doc = f"{os.getpid()} {me['start'] if me else 0} {boot_id()}\n"
        pf = plan.supdir / "supervisor.pid"
        tmp = Path(f"{pf}.tmp")
        tfd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC | os.O_CLOEXEC, 0o600)
        with os.fdopen(tfd, "w") as f:
            f.write(pid_doc)
        os.replace(tmp, pf)
        sup.lock_fd = fd
        return sup.run()
    finally:
        os.close(fd)


def main(argv=None, *, home: Path | None = None, user: str | None = None, tuning: Tuning | None = None) -> int:
    ap = argparse.ArgumentParser(prog="pc_research_supervisor.py", description=__doc__.split("\n\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)

    def common(name, **kw):
        p = sub.add_parser(name, **kw)
        p.add_argument("--expect-commit", default=None,
                       help="full 40-hex commit of the promoted runtime (status/stop default to the running one)")
        p.add_argument("--unit", default=None,
                       help="the owner-reviewed unit template, read as data (default: supervisor/reviewed-unit.service)")
        p.add_argument("--expect-unit-sha256", default=None,
                       help="sha256 of the reviewed unit file; REQUIRED by start and serve")
        p.add_argument("--tuning-json", default=None, help=argparse.SUPPRESS)
        return p

    common("describe")
    common("check")
    ps = common("start")
    ps.add_argument("--wait-ready", type=float, default=0)
    common("serve")
    pt = sub.add_parser("stop")                     # status and stop need no unit, commit or token: they are the
    mode = pt.add_mutually_exclusive_group()        # kill switch and must keep working when reviewed files are gone
    mode.add_argument("--drain", action="store_true")
    mode.add_argument("--now", action="store_true")
    pt.add_argument("--wait", type=float, default=None)
    sub.add_parser("status").add_argument("--json", action="store_true")
    a = ap.parse_args(argv)

    home = home or Path(pwd.getpwuid(os.geteuid()).pw_dir)
    user = user or REQUIRED_USER
    if a.cmd != "describe" and (os.geteuid() == 0 or pwd.getpwuid(os.geteuid()).pw_name != user):
        print(f"refusing: must run as the linux user {user}, never root", file=sys.stderr)
        return EXIT_CONFIG
    if tuning is None:
        try:
            tuning = Tuning(**json.loads(getattr(a, "tuning_json", None) or "{}"))
        except (ValueError, TypeError) as e:
            print(f"refusing: bad tuning ({type(e).__name__})", file=sys.stderr)
            return EXIT_CONFIG
    if a.cmd == "status":
        return cmd_status(a, home, tuning)
    if a.cmd == "stop":
        return cmd_stop(a, home, tuning)
    try:
        a.unit = a.unit or str(home / ROOT_REL / "supervisor" / "reviewed-unit.service")
        plan = load_plan(a, home, user)
        if a.expect_unit_sha256 is not None and a.expect_unit_sha256 != plan.unit_sha256:
            raise PlanError("the unit file is not the reviewed one (sha256 differs from --expect-unit-sha256)")
        if a.cmd in ("start", "serve") and not a.expect_unit_sha256:
            raise PlanError(f"{a.cmd} needs --expect-unit-sha256 (the sha256 of the unit file the owner reviewed)")
    except (PlanError, OSError, ValueError, TypeError) as e:
        print(f"refusing: {mask(e)}", file=sys.stderr)
        return EXIT_CONFIG
    return {"describe": cmd_describe, "check": cmd_check, "start": cmd_start, "serve": cmd_serve}[a.cmd](a, plan, tuning)


if __name__ == "__main__":
    sys.exit(main())
