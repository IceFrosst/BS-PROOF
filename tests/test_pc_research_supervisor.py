"""Focused tests for the TEMPORARY main-PC research-worker supervisor (deploy/pc_research_supervisor.py).

No model, no network beyond a loopback fake API, no Claude subscription, no systemd, no root. Every process
here is a throw-away child of the test with its own temporary HOME. Two kinds of workers are supervised:

  * a FAKE worker (a small script that mimics the real one's lock, status file, signals and exit codes) for the
    process-control properties: detached session, scrubbed environment, exponential back-off, no restart storm on
    stderr EOF, whole-tree termination including a CLI that lives in its own session, SIGKILL escalation,
    drain / refuse-while-running, duplicate prevention, private modes, masked logs;
  * the REAL, unchanged worker (scripts/pc_research_worker.py + the adapter) against the repo's own loopback
    fake API and fake CLI, for the end-to-end claims: the worker gets its token from its own 0600 file (never
    argv/env), the CLI child inherits no credential, a stop cuts the CLI and posts nothing, a bad claim path
    is "not ready" and is not a restart storm.
    (needs jsonschema>=4 like the worker tests: run with the repo .venv; a missing module FAILS, never skips.)

    python3 -m unittest tests.test_pc_research_supervisor -v

No test depends on the machine clock for its verdict: waits are hang guards on observable state; the back-off
assertions compare the supervisor's own restart gaps to bounds with generous slack.
"""
from __future__ import annotations

import ast
import base64
import contextlib
import hashlib
import io
import importlib
import json
import os
import pwd
import signal
import stat
import subprocess
import sys
import tempfile
import textwrap
import time
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEPLOY = ROOT / "deploy"
SUP_FILE = DEPLOY / "pc_research_supervisor.py"
UNIT_FILE = DEPLOY / "bsproof-research-worker.service.example"
sys.path.insert(0, str(DEPLOY))
import pc_research_supervisor as sv  # noqa: E402

COMMIT = "0123456789abcdef0123456789abcdef01234567"
REL_NAME = "bsproof-research-worker-" + COMMIT[:12]
TOKEN = "tok-0123456789abcdefghijklmnopqrstuvwxyz-SECRET"
USER = pwd.getpwuid(os.geteuid()).pw_name
LINUX = sys.platform.startswith("linux")

# Fake credentials, assembled at run time so no key- or token-shaped literal sits in the source for a scanner to flag.
FAKE_JWT = ".".join(base64.urlsafe_b64encode(x).decode().rstrip("=") for x in
                    (b'{"alg":"HS256"}', b'{"sub":"fixture-not-a-person"}', b"fixture-signature-bytes"))
assert FAKE_JWT.startswith("eyJ")
POLLUTION = {
    "ANTHROPIC_API_KEY": "sk-ant" "-api03-leak-aaaaaaaaaaaaaaaa", "ANTHROPIC_AUTH_TOKEN": "auth-leak-bbbbbbbbbb",
    "CLAUDE_CODE_OAUTH_TOKEN": "oauth-leak-cccccccccc", "ANTHROPIC_BASE_URL": "https://billing.example/",
    "CLAUDE_CODE_USE_BEDROCK": "1", "CLAUDE_CODE_USE_VERTEX": "1", "CLOUD_ML_REGION": "x",
    "OPENAI_API_KEY": "sk-openai-leak", "DEEPSEEK_API_KEY": "deepseek-leak",
    "GOOGLE_APPLICATION_CREDENTIALS": "/tmp/google-leak.json", "SUPABASE_SERVICE_ROLE_KEY": "service-role-leak",
    "SUPABASE_ACCESS_TOKEN": "sbp-leak", "VERCEL_TOKEN": "vercel-leak", "GH_TOKEN": "gh-leak",
    "SSH_AUTH_SOCK": "/tmp/ssh-leak", "XDG_RUNTIME_DIR": "/run/user/1000-leak",
    "DBUS_SESSION_BUS_ADDRESS": "unix:path=/leak", "BS_PROOF_RESEARCH_WORKER_TOKEN": TOKEN,
    "HTTPS_PROXY": "http://user:pw@127.0.0.1:8080",
}

FAKE_WORKER = r'''
import datetime, fcntl, json, os, pathlib, signal, subprocess, sys, time
if len(sys.argv) > 1 and sys.argv[1] == "check":
    print("ok   fake check")
    sys.exit(0)
home = pathlib.Path(os.environ["HOME"])
ctl = json.loads((home / "fake-worker.json").read_text())
runs = home / "fake-runs"
runs.mkdir(exist_ok=True)
idx = len(list(runs.glob("*.json")))
raw = open("/proc/self/environ", "rb").read().split(b"\0")
env = dict(x.decode().split("=", 1) for x in raw if b"=" in x)
st = {k.strip(): v.strip() for k, _, v in (l.partition(":") for l in open("/proc/self/status").read().splitlines())}
(runs / f"{idx}.json").write_text(json.dumps({
    "pid": os.getpid(), "argv": sys.argv, "cwd": os.getcwd(), "sid": os.getsid(0), "env": env,
    "mono": time.monotonic(), "nnp": st.get("NoNewPrivs"), "umask": st.get("Umask")}))
mode = ctl["modes"][min(idx, len(ctl["modes"]) - 1)]
data = home / ".local/share/bsproof-research-worker/data"
stop = False


def ts():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def take_lock():
    fd = os.open(data / "worker.lock", os.O_CREAT | os.O_RDWR, 0o600)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        sys.exit(75)
    return fd


def status(state, **kw):
    (data / "status.json").write_text(json.dumps(
        {"state": state, "pid": os.getpid(), "updated_utc": datetime.datetime.now(datetime.timezone.utc).isoformat(), **kw}))


def sleeper():
    p = subprocess.Popen(["/bin/sleep", "600"], start_new_session=True)
    (home / f"sleeper-{idx}.pid").write_text(str(p.pid))


def on_term(*_):
    global stop
    stop = True


signal.signal(signal.SIGTERM, signal.SIG_IGN if ctl.get("term") == "ignore" else on_term)
if mode == "crash":
    print("Traceback (most recent call last):", file=sys.stderr)
    print('  File "x.py", line 1, in <module>', file=sys.stderr)
    print("ValueError: boom 0123456789abcdef0123456789abcdef", file=sys.stderr)
    sys.exit(1)
if mode == "exit78":
    print(ts() + " configuration error: nope", file=sys.stderr)
    sys.exit(78)
if mode == "crash_with_child":
    sleeper()
    sys.exit(1)
fd = take_lock()
if mode == "with_child":
    sleeper()
if mode == "close_stderr":
    os.close(2)
if mode == "leak":
    tok = [l.split("=", 1)[1] for l in (home / ".config/bsproof-research-worker/worker.env").read_text().splitlines()
           if l.startswith("BS_PROOF_RESEARCH_WORKER_TOKEN=")][0]
    print(ts() + " claim not accepted kind=auth status=401 detail=Bearer " + tok, file=sys.stderr, flush=True)
    print("Authorization: Bearer " + tok, file=sys.stderr, flush=True)
    print("RuntimeError: token=" + tok, file=sys.stderr, flush=True)
    print(ts() + " job claimed; research starting job=123e4567-e89b-12d3-a456-426614174000 owner=someone@example.com",
          file=sys.stderr, flush=True)
    print("MODEL TEXT: creatine monohydrate improves strength " * 3, file=sys.stderr, flush=True)
    print("x" * 9000, file=sys.stderr, flush=True)
elif mode != "close_stderr":
    print(ts() + " fake-worker starting", file=sys.stderr, flush=True)
while not stop:
    if mode == "job" and not (home / "finish").exists():
        status("running", job_id="j1")
    else:
        status("polling")
    for _ in range(30 if mode == "slowpoll" else 1):     # slowpoll: one poll write every 3 s
        if stop:
            break
        time.sleep(0.1)
sys.exit(0)
'''


def sha(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


class Host:
    """A throw-away HOME with a fake installed runtime, the reviewed unit rewritten for it, and a driver script."""

    def __init__(self, tmp: Path, *, real_worker: bool = False, restart_sec="0.3", stop_sec="3", tuning=None,
                 env_extra="", break_loop: bool = False):
        self.tmp = tmp
        self.home = tmp / "home"
        self.root = self.home / ".local/share/bsproof-research-worker"
        self.supdir = self.root / "supervisor"
        self.data = self.root / "data"
        self.rel = self.root / "releases" / REL_NAME
        self.cfgdir = self.home / ".config/bsproof-research-worker"
        for d in (self.home, self.root, self.data, self.cfgdir):
            d.mkdir(parents=True, exist_ok=True)
            os.chmod(d, 0o700)
        (self.root / "releases").mkdir(exist_ok=True)
        os.chmod(self.root / "releases", 0o700)
        self.rel.mkdir(parents=True)
        os.chmod(self.rel, 0o755)
        for f in sv.RUNTIME_FILES:
            dst = self.rel / f
            dst.parent.mkdir(parents=True, exist_ok=True)
            if f == "scripts/pc_research_worker.py" and not real_worker:
                dst.write_text(FAKE_WORKER)
            elif real_worker:
                dst.write_bytes((ROOT / f).read_bytes())
            else:
                dst.write_text("# placeholder\n")
            os.chmod(dst, 0o644)
        sums = "".join(f"{sha(self.rel / f)}  {f}\n" for f in sv.RUNTIME_FILES)
        (self.rel / "SHA256SUMS").write_text(sums)
        (self.rel / "RELEASE.json").write_text(json.dumps({"name": REL_NAME, "commit": COMMIT, "built_utc": "x"}))
        (self.rel / "venv/bin").mkdir(parents=True)
        py = self.rel / "venv/bin/python"
        if real_worker:      # exec through the repo venv so jsonschema>=4 (its site-packages) is found
            py.write_text(f'#!/bin/sh\nexec "{sys.executable}" "$@"\n')
            os.chmod(py, 0o755)
        else:
            os.symlink(sys.executable, py)
        os.symlink(f"releases/{REL_NAME}", self.root / "current")
        (self.home / ".local/bin").mkdir(parents=True)
        self.claude = self.home / ".local/bin/claude"
        self.claude.write_text(f'#!/bin/sh\necho ran >> "{self.home}/claude-was-run"\n')
        os.chmod(self.claude, 0o755)
        self.env_file = self.cfgdir / "worker.env"
        self.write_env(env_extra)
        text = UNIT_FILE.read_text().replace("/home/icefrost", str(self.home))
        text = text.replace("RestartSec=30", f"RestartSec={restart_sec}").replace("TimeoutStopSec=60", f"TimeoutStopSec={stop_sec}")
        self.unit = tmp / "reviewed.service"
        self.unit.write_text(text)
        os.chmod(self.unit, 0o644)
        self.tuning = dict(tick=0.1, restart_cap=2.0, stable_after=300.0, blocked_floor=1.0, ready_window=30.0,
                           state_every=0.2, sweep_grace=2.0, log_max_bytes=1 << 20, log_keep=3)
        self.tuning.update(tuning or {})
        self.driver = tmp / "driver.py"
        self.driver.write_text(textwrap.dedent(f"""
            import sys
            sys.path.insert(0, {str(DEPLOY)!r})
            import pc_research_supervisor as sv
            from pathlib import Path
            if {break_loop!r}:
                def boom(self):      # only once the fake worker and its CLI stand-in are really up
                    if (Path({str(self.home)!r}) / "sleeper-0.pid").exists():
                        raise RuntimeError("injected bug in the supervisor loop")
                sv.Supervisor.poll_claims = boom
            sys.exit(sv.main(sys.argv[1:], home=Path({str(self.home)!r}), user={USER!r},
                             tuning=sv.Tuning(**{self.tuning!r})))
        """))
        os.chmod(self.driver, 0o700)
        self.ctl({"modes": ["idle"]})

    def write_env(self, extra=""):
        self.env_file.write_text(
            f"BS_PROOF_RESEARCH_WORKER_TOKEN={TOKEN}\n"
            "BS_PROOF_RESEARCH_API_BASE=https://example.invalid\n"
            f"BS_PROOF_CLAUDE_BIN={self.claude}\n"
            f"BS_PROOF_RESEARCH_DATA_DIR={self.data}\n"
            "SOMETHING_ELSE=$(touch " + str(self.home / "pwned") + ")\n"
            "export_not_allowed=`touch " + str(self.home / "pwned2") + "`\n" + extra)
        os.chmod(self.env_file, 0o600)

    def ctl(self, doc):
        (self.home / "fake-worker.json").write_text(json.dumps(doc))

    def run(self, *args, env=None, timeout=90, with_unit=True):
        cmd = [sys.executable, str(self.driver), *args]
        if with_unit and args[0] in ("describe", "check", "start", "serve"):
            cmd += ["--expect-commit", COMMIT, "--unit", str(self.unit)]
            if args[0] in ("start", "serve"):
                cmd += ["--expect-unit-sha256", sha(self.unit)]
        e = dict(os.environ)
        e.update(POLLUTION if env is None else env)
        return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, env=e, stdin=subprocess.DEVNULL)

    def state(self):
        try:
            return json.loads((self.supdir / "state.json").read_text())
        except (OSError, ValueError):
            return {}

    def runs(self):
        d = self.home / "fake-runs"
        return [json.loads(p.read_text()) for p in sorted(d.glob("*.json"), key=lambda p: int(p.stem))] if d.exists() else []

    def log(self):
        p = self.supdir / "supervisor.log"
        return p.read_text() if p.exists() else ""

    def kill_everything(self):
        st = self.state()
        for key in ("worker_pid", "supervisor_pid"):
            pid = st.get(key)
            if pid and sv.alive(int(pid)):
                try:
                    os.kill(int(pid), signal.SIGKILL)
                except OSError:
                    pass
        for p in self.home.glob("sleeper-*.pid"):
            try:
                os.kill(int(p.read_text()), signal.SIGKILL)
            except (OSError, ValueError):
                pass


def wait_for(pred, what, timeout=30.0):
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        v = pred()
        if v:
            return v
        time.sleep(0.05)
    raise AssertionError(f"hang guard: {what}")


def sleeper_pid(h: Host, idx: int = 0) -> int:
    """The fake worker writes this file non-atomically: wait for a complete value."""
    f = h.home / f"sleeper-{idx}.pid"
    return int(wait_for(lambda: (f.read_text().strip() if f.exists() else "") or None, "sleeper pid written"))


def gone(pid) -> bool:
    return not sv.alive(int(pid))


def listening_sockets(pid):
    """Inodes of this process's sockets that are TCP-listening or UDP-bound (inbound-capable)."""
    mine = set()
    for fd in os.listdir(f"/proc/{pid}/fd"):
        try:
            t = os.readlink(f"/proc/{pid}/fd/{fd}")
        except OSError:
            continue
        if t.startswith("socket:["):
            mine.add(t[8:-1])
    bound = set()
    for name in ("tcp", "tcp6", "udp", "udp6"):
        for ln in Path(f"/proc/net/{name}").read_text().splitlines()[1:]:
            c = ln.split()
            if c[3] == "0A" or name.startswith("udp"):
                bound.add(c[9])
    return mine & bound


class HostCase(unittest.TestCase):
    def setUp(self):
        if not LINUX:
            self.skipTest("the supervisor is Linux-only (/proc, setpriv, prctl)")
        self.tmpdir = tempfile.TemporaryDirectory(prefix="supt-")
        self.addCleanup(self.tmpdir.cleanup)

    def host(self, **kw) -> Host:
        h = Host(Path(self.tmpdir.name), **kw)
        self.addCleanup(h.kill_everything)
        self.addCleanup(lambda: h.run("stop", "--now", "--wait", "20"))
        return h

    def start(self, h: Host, ready=True):
        r = h.run("start")
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        if ready:
            wait_for(lambda: h.run("status").returncode == 0, "READY", 40)
        return r


# --------------------------------------------------------------------------- #
# the reviewed template is the command; nothing else is accepted


class ReviewedUnit(unittest.TestCase):
    HOME = Path("/home/icefrost")

    def plan(self, text=None):
        raw = (text if text is not None else UNIT_FILE.read_text()).encode()
        return sv.build_plan(raw, self.HOME, "icefrost", COMMIT)

    def test_the_reviewed_user_unit_parses_to_exactly_the_proven_command(self):
        p = self.plan()
        root = "/home/icefrost/.local/share/bsproof-research-worker"
        self.assertEqual(p.argv, (f"{root}/current/venv/bin/python", f"{root}/current/scripts/pc_research_worker.py", "run"))
        self.assertEqual(p.workdir, Path(f"{root}/current"))
        self.assertEqual(p.env, {
            "PATH": "/home/icefrost/.local/bin:/home/icefrost/.nvm/versions/node/v22.23.2/bin:/usr/local/bin:/usr/bin:/bin",
            "BS_PROOF_CLAUDE_BIN": "/home/icefrost/.local/bin/claude", "PYTHONUNBUFFERED": "1",
            "PYTHONDONTWRITEBYTECODE": "1"})
        self.assertEqual((p.restart_base, p.stop_timeout), (30.0, 60.0))
        self.assertEqual(p.env_file, Path("/home/icefrost/.config/bsproof-research-worker/worker.env"))
        self.assertEqual(p.unit_sha256, sha(UNIT_FILE))
        self.assertTrue(set(sv.UNIT_MUST_UNSET) <= set(p.unset))

    def test_the_worker_environment_is_built_from_nothing(self):
        env = sv.worker_env(self.plan())
        self.assertEqual(set(env), set(sv.WORKER_ENV_NAMES))
        self.assertEqual(env["HOME"], "/home/icefrost")
        for bad in POLLUTION:
            self.assertNotIn(bad, env)

    def test_anything_beyond_the_reviewed_template_is_refused(self):
        base = UNIT_FILE.read_text()
        bad = {
            "extra ExecStartPre": base.replace("Restart=on-failure", "Restart=on-failure\nExecStartPre=/bin/true"),
            "run --once": base.replace("pc_research_worker.py run", "pc_research_worker.py run --once"),
            "other script": base.replace("scripts/pc_research_worker.py", "scripts/other.py"),
            "shell ExecStart": base.replace("pc_research_worker.py run", "pc_research_worker.py run; /bin/true"),
            "- prefix": base.replace("ExecStart=%h", "ExecStart=-%h"),
            "API key in Environment": base.replace("Environment=PYTHONUNBUFFERED=1",
                                                   "Environment=PYTHONUNBUFFERED=1\nEnvironment=ANTHROPIC_API_KEY=x"),
            "subst in value": base.replace("PYTHONUNBUFFERED=1", "PYTHONUNBUFFERED=$(id)"),
            "missing unset": base.replace("ANTHROPIC_BASE_URL", "SOMETHING_ELSE"),
            "unknown specifier": base.replace("WorkingDirectory=%h", "WorkingDirectory=%u"),
            "other envfile": base.replace("EnvironmentFile=%h/.config/bsproof-research-worker/worker.env",
                                          "EnvironmentFile=/etc/passwd"),
            "KillMode": base.replace("KillMode=control-group", "KillMode=mixed"),
            "UMask": base.replace("UMask=0077", "UMask=0022"),
            "NoNewPrivileges": base.replace("NoNewPrivileges=yes", "NoNewPrivileges=no"),
            "unknown section": base + "\n[Socket]\nListenStream=1234\n",
            "unknown directive": base.replace("[Install]", "ExecReload=/bin/true\n[Install]"),
            "relative PATH": base.replace("Environment=PATH=%h", "Environment=PATH=.:%h"),
        }
        for name, text in bad.items():
            with self.subTest(name), self.assertRaises(sv.PlanError):
                self.plan(text)

    def test_the_unit_file_must_be_the_reviewed_one_by_hash(self):
        with tempfile.TemporaryDirectory() as d:
            home = Path(d) / "home"                                    # nothing exists here: nothing could ever start
            unit = Path(d) / "u.service"
            unit.write_text(UNIT_FILE.read_text())
            os.chmod(unit, 0o644)

            def run(cmd, *extra):
                out, err = io.StringIO(), io.StringIO()
                with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
                    rc = sv.main([cmd, "--expect-commit", COMMIT, "--unit", str(unit), *extra], home=home, user="icefrost")
                return rc, out.getvalue() + err.getvalue()

            self.assertEqual(run("describe", "--expect-unit-sha256", sha(UNIT_FILE))[0], 0)
            rc, msg = run("describe", "--expect-unit-sha256", "0" * 64)
            self.assertEqual(rc, sv.EXIT_CONFIG)
            self.assertIn("not the reviewed one", msg)
            for cmd in ("start", "serve"):                              # no pin, no launch
                rc, msg = run(cmd)
                self.assertEqual(rc, sv.EXIT_CONFIG)
                self.assertIn("needs --expect-unit-sha256", msg)

    def test_the_expected_commit_must_be_a_full_hash(self):
        for c in ("", "9e9c0d30becd", "G" * 40, COMMIT.upper()):
            with self.subTest(c), self.assertRaises(sv.PlanError):
                sv.build_plan(UNIT_FILE.read_bytes(), self.HOME, "icefrost", c)


# --------------------------------------------------------------------------- #
# worker.env is DATA


class EnvFileIsData(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.p = Path(self.tmp.name) / "worker.env"

    def write(self, text, mode=0o600):
        self.p.write_text(text)
        os.chmod(self.p, mode)

    def test_only_the_three_non_secret_names_are_returned_and_nothing_is_executed(self):
        marker = Path(self.tmp.name) / "pwned"
        self.write(f"BS_PROOF_RESEARCH_WORKER_TOKEN={TOKEN}\nBS_PROOF_CLAUDE_BIN=/x/claude\n"
                   f"BS_PROOF_RESEARCH_API_BASE='https://h'\nBS_PROOF_RESEARCH_DATA_DIR=/d\n"
                   f"OTHER=$(touch {marker})\nANOTHER=`touch {marker}`\nANTHROPIC_API_KEY=sk-ant-xxxxxxxx\n")
        got = sv.read_env_names(self.p)
        self.assertEqual(got, {"BS_PROOF_CLAUDE_BIN": "/x/claude", "BS_PROOF_RESEARCH_API_BASE": "https://h",
                               "BS_PROOF_RESEARCH_DATA_DIR": "/d"})
        self.assertFalse(marker.exists())
        self.assertNotIn(TOKEN, json.dumps(got))

    def test_refused_unless_a_private_regular_file(self):
        self.write("BS_PROOF_CLAUDE_BIN=/x\n", 0o644)
        with self.assertRaises(sv.PlanError):
            sv.read_env_names(self.p)
        self.write("BS_PROOF_CLAUDE_BIN=/x\n", 0o640)
        with self.assertRaises(sv.PlanError):
            sv.read_env_names(self.p)
        link = Path(self.tmp.name) / "link.env"
        self.write("BS_PROOF_CLAUDE_BIN=/x\n")
        os.symlink(self.p, link)
        with self.assertRaises(sv.PlanError):
            sv.read_env_names(link)

    def test_a_line_that_is_not_key_value_is_refused_like_the_worker_does(self):
        self.write("not a pair\n")
        with self.assertRaises(sv.PlanError):
            sv.read_env_names(self.p)


# --------------------------------------------------------------------------- #
# pure helpers


class Masking(unittest.TestCase):
    def test_secrets_ids_and_prose_are_masked(self):
        cases = [
            f"Bearer {TOKEN}", FAKE_JWT, "sk-ant" "-api03-abcdef123456",
            "owner a.b@example.com done", "job=123e4567-e89b-12d3-a456-426614174000", "k=" + "a" * 40,
        ]
        for c in cases:
            out = sv.mask(c)
            with self.subTest(c):
                self.assertNotIn(TOKEN, out)
                self.assertNotRegex(out, r"eyJ[A-Za-z0-9]|sk-ant|@example|123e4567|a{32}")
        self.assertIn("[id:", sv.mask("job=123e4567-e89b-12d3-a456-426614174000"))
        self.assertIn("20261004T222448Z-[run]", sv.mask("run_dir=20261004T222448Z-aa390365a3ec4838ae22b709b952702c"))
        self.assertIn("bsproof-research-worker-9e9c0d30becd", sv.mask("release bsproof-research-worker-9e9c0d30becd ok"))
        self.assertLessEqual(len(sv.mask("x " * 1000)), sv.MAX_LINE)
        self.assertNotIn("\x00", sv.mask("a\x00b\x1bc"))

    def test_log_is_private_rotated_bounded_and_never_raises(self):
        with tempfile.TemporaryDirectory() as d:
            os.chmod(d, 0o700)
            lg = sv.MaskedLog(Path(d), "t.log", max_bytes=200, keep=2)
            for i in range(60):
                lg.event("line", n=i)
            names = sorted(p.name for p in Path(d).iterdir())
            self.assertEqual(names, ["t.log", "t.log.1", "t.log.2"])
            for p in Path(d).iterdir():
                self.assertEqual(stat.S_IMODE(p.stat().st_mode), 0o600)
                self.assertLess(p.stat().st_size, 600)
            bad = sv.MaskedLog(Path(d) / "missing", "t.log", 200, 2)
            bad.event("x")
            self.assertEqual(bad.dropped, 1)


class BackoffSchedule(unittest.TestCase):
    class Half:
        def random(self):
            return 0.5      # jitter factor exactly 1.0

    def test_exponential_to_a_cap_and_reset_by_a_stable_run(self):
        b = sv.Backoff(30, 600, 300, self.Half())
        self.assertEqual([b.next_delay(1) for _ in range(7)], [30, 60, 120, 240, 480, 600, 600])
        self.assertEqual(b.next_delay(299), 600)
        self.assertEqual(b.next_delay(300), 30)      # lived long enough: the storm counter restarts
        self.assertEqual(b.next_delay(1), 60)

    def test_jitter_stays_inside_the_band(self):
        import random
        b = sv.Backoff(10, 10 ** 6, 1e9, random.Random(1))
        for n in range(8):
            d = b.next_delay(0)
            self.assertTrue(0.8 * 10 * 2 ** n - 1e-9 <= d <= 1.2 * 10 * 2 ** n + 1e-9, (n, d))


class ProcHelpers(unittest.TestCase):
    def test_descendants_find_a_grandchild_in_another_session_without_reading_argv(self):
        if not LINUX:
            self.skipTest("Linux only")
        p = subprocess.Popen([sys.executable, "-c",
                              "import subprocess,time;subprocess.Popen(['/bin/sleep','30'],start_new_session=True);time.sleep(30)"])
        self.addCleanup(lambda: (p.kill(), p.wait()))
        got = wait_for(lambda: [d for d in sv.descendants(os.getpid()) if d[0] != p.pid], "grandchild visible")
        self.assertEqual(len(got), 1)
        for pid, _ in got:
            self.addCleanup(lambda pid=pid: sv.signal_if_same(pid, sv.proc_stat(pid)["start"], signal.SIGKILL) if sv.alive(pid) else None)
        self.assertNotEqual(sv.proc_stat(got[0][0])["session"], sv.proc_stat(p.pid)["session"])

    def test_lock_holders_reads_proc_locks_without_taking_the_lock(self):
        import fcntl
        with tempfile.TemporaryDirectory() as d:
            f = Path(d) / "x.lock"
            self.assertEqual(sv.lock_holders(f), set())
            fd = os.open(f, os.O_CREAT | os.O_RDWR, 0o600)
            self.addCleanup(lambda: os.close(fd) if fd >= 0 else None)
            self.assertEqual(sv.lock_holders(f), set())
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            self.assertEqual(sv.lock_holders(f), {os.getpid()})
            fcntl.flock(fd, fcntl.LOCK_UN)
            self.assertEqual(sv.lock_holders(f), set())

    def test_the_model_cli_guard(self):
        sv.guard_argv(["/usr/bin/setpriv", "--", "/x/venv/bin/python", "/x/scripts/pc_research_worker.py", "run"])
        for bad in (["/home/u/.local/bin/claude", "-p"], ["setpriv", "--", "/x/Claude"], ["/x/claude-code"]):
            with self.subTest(bad), self.assertRaises(sv.PlanError):
                sv.guard_argv(bad)


class PipeOwnership(HostCase):
    def test_the_worker_stderr_pipe_is_closed_through_the_object_that_owns_it(self):
        h = self.host()
        plan = sv.build_plan(h.unit.read_bytes(), h.home, USER, COMMIT)
        sv.private_dir(plan.supdir, create=True)
        sup = sv.Supervisor(plan, sv.Tuning())
        self.addCleanup(lambda: [os.close(fd) for fd in (sup.wake_r, sup.wake_w)])
        p = subprocess.Popen(["/bin/sh", "-c", "echo hi >&2"], stderr=subprocess.PIPE, stdin=subprocess.DEVNULL)
        self.addCleanup(p.wait)
        sup.pipe_file, sup.pipe_fd = p.stderr, p.stderr.fileno()
        sup._close_pipe()
        self.assertTrue(p.stderr.closed)              # a raw os.close() would leave a stale object to close a reused fd later
        self.assertIsNone(sup.pipe_fd)


class SourceHygiene(unittest.TestCase):
    src = SUP_FILE.read_text()

    def test_no_eval_no_shell_no_network_no_model_no_private_proc_reads(self):
        tree = ast.parse(self.src)
        for n in ast.walk(tree):
            if isinstance(n, ast.Call):
                if isinstance(n.func, ast.Name):
                    self.assertNotIn(n.func.id, ("eval", "exec", "compile", "__import__"), ast.dump(n)[:80])
                if isinstance(n.func, ast.Attribute):
                    self.assertNotIn(n.func.attr, ("system", "popen", "execv", "execve", "execvp"), ast.dump(n)[:80])
                for kw in n.keywords:
                    if kw.arg == "shell":
                        self.fail("shell= is used")
            if isinstance(n, (ast.Import, ast.ImportFrom)):
                mods = [a.name for a in n.names] + ([n.module] if isinstance(n, ast.ImportFrom) and n.module else [])
                for m in mods:
                    root = m.split(".")[0]
                    self.assertNotIn(root, ("socket", "http", "urllib", "requests", "pipeline", "claude_research_adapter",
                                            "claude_adapter", "jsonschema"), m)
        for forbidden in ("cmdline", "/environ", "SUPABASE", "--max-turns", "--max-budget", "fallback-model",
                          "--deadline"):
            self.assertNotIn(forbidden, self.src, forbidden)

    def test_no_research_cap_flags_are_ever_built(self):
        self.assertNotRegex(self.src, r"max[-_]?(turns|budget|tokens)|--budget|--timeout|--deadline")

    def test_it_never_looks_up_the_token(self):
        self.assertNotIn("WORKER_TOKEN", self.src)


# --------------------------------------------------------------------------- #
# the process: detached, scrubbed, supervised


class Detached(HostCase):
    def test_start_leaves_a_detached_no_new_privs_private_supervisor_that_outlives_the_launcher(self):
        h = self.host()
        self.start(h)
        st = h.state()
        sup, wrk = st["supervisor_pid"], st["worker_pid"]
        mine = os.getsid(0)
        s_sup, s_wrk = sv.proc_stat(sup), sv.proc_stat(wrk)
        self.assertEqual(s_sup["session"], sup)                     # session leader, not ours
        self.assertNotEqual(s_sup["session"], mine)
        self.assertNotEqual(s_wrk["session"], s_sup["session"])     # worker has its own group to signal
        tty = int(Path(f"/proc/{sup}/stat").read_text().rpartition(")")[2].split()[4])
        self.assertEqual(tty, 0)                                    # no controlling terminal: a hang-up cannot reach it
        for pid in (sup, wrk):
            text = Path(f"/proc/{pid}/status").read_text()
            self.assertRegex(text, r"NoNewPrivs:\s+1")
            self.assertRegex(text, r"Umask:\s+0077")
            self.assertRegex(text, r"Uid:\s+%d\s" % os.geteuid())
        self.assertTrue(sv.alive(sup, st["supervisor_start_ticks"]))
        self.assertNotIn(sup, {p for p, _ in sv.descendants(os.getpid())})  # orphaned to init: not in anyone's process tree
        self.assertEqual(sv.lock_holders(h.supdir / "supervisor.lock"), {sup})
        self.assertEqual(sv.lock_holders(h.data / "worker.lock"), {wrk})
        self.assertEqual(listening_sockets(sup), set())             # no inbound port, ever
        self.assertEqual(listening_sockets(wrk), set())

    def test_the_supervisor_dir_and_every_file_in_it_are_private(self):
        h = self.host()
        self.start(h)
        self.assertEqual(stat.S_IMODE(h.supdir.stat().st_mode), 0o700)
        names = {p.name for p in h.supdir.iterdir()}
        self.assertTrue({"supervisor.lock", "supervisor.pid", "state.json", "supervisor.log", "supervisor.stderr"} <= names)
        for p in h.supdir.iterdir():
            self.assertEqual(stat.S_IMODE(p.stat().st_mode), 0o600, p.name)

    def test_start_is_idempotent_and_a_second_serve_cannot_run(self):
        h = self.host()
        self.start(h)
        pid = h.state()["supervisor_pid"]
        r = h.run("start")
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertIn("already running", r.stdout)
        self.assertEqual(h.state()["supervisor_pid"], pid)
        self.assertEqual(len(h.runs()), 1)
        second = subprocess.run(["/usr/bin/setpriv", "--no-new-privs", "--", sys.executable, str(h.driver), "serve",
                                 "--expect-commit", COMMIT, "--unit", str(h.unit), "--expect-unit-sha256", sha(h.unit)],
                                capture_output=True, text=True, timeout=30, stdin=subprocess.DEVNULL)
        self.assertEqual(second.returncode, sv.EXIT_LOCKED, second.stderr)
        self.assertEqual(len(h.runs()), 1)

    def test_serve_refuses_without_no_new_privs_and_the_wrong_user_and_is_never_root(self):
        h = self.host()
        r = subprocess.run([sys.executable, str(h.driver), "serve", "--expect-commit", COMMIT, "--unit", str(h.unit),
                            "--expect-unit-sha256", sha(h.unit)],
                           capture_output=True, text=True, timeout=30, stdin=subprocess.DEVNULL)
        self.assertEqual(r.returncode, sv.EXIT_CONFIG)
        self.assertIn("NoNewPrivs", r.stderr)
        self.assertEqual(h.runs(), [])
        with contextlib.redirect_stderr(io.StringIO()):
            rc = sv.main(["status"], home=h.home, user="nobody-else")
        self.assertEqual(rc, sv.EXIT_CONFIG)

    def test_a_worker_not_owned_by_the_supervisor_blocks_start_and_is_reported_by_pid_only(self):
        import fcntl
        h = self.host()
        fd = os.open(h.data / "worker.lock", os.O_CREAT | os.O_RDWR, 0o600)
        self.addCleanup(lambda: os.close(fd) if fd >= 0 else None)
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        r = h.run("start")
        self.assertEqual(r.returncode, sv.EXIT_LOCKED, r.stdout)
        self.assertIn(str(os.getpid()), r.stdout)
        self.assertEqual(h.runs(), [])
        s = h.run("status")
        self.assertEqual(s.returncode, 1)
        self.assertIn(f"NOT owned by this supervisor holds the data-dir lock (pid [{os.getpid()}])", s.stdout)
        os.close(fd)
        fd = -1
        self.start(h)


class Preflight(HostCase):
    def refused(self, h, text):
        r = h.run("start")
        self.assertEqual(r.returncode, sv.EXIT_CONFIG, r.stdout + r.stderr)
        self.assertIn(text, r.stdout)
        self.assertEqual(h.runs(), [])
        self.assertFalse((h.supdir / "supervisor.pid").exists())

    def test_check_runs_the_workers_own_check_under_the_same_scrub_and_starts_nothing(self):
        h = self.host()
        r = h.run("check")
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertIn("ok   preflight", r.stdout)
        self.assertIn("worker ok fake check", r.stdout)       # whitespace is collapsed by the mask
        self.assertEqual(h.runs(), [])
        self.assertFalse((h.supdir / "supervisor.pid").exists())

    def test_describe_prints_the_exact_command_and_starts_nothing(self):
        h = self.host()
        r = h.run("describe")
        self.assertEqual(r.returncode, 0, r.stderr)
        for want in ("setpriv --no-new-privs --pdeathsig TERM --", "venv/bin/python", "pc_research_worker.py run",
                     "sha256=" + sha(h.unit), COMMIT, "NONE across a PC/WSL/Windows restart"):
            self.assertIn(want, r.stdout)
        self.assertNotIn(TOKEN, r.stdout)
        self.assertEqual(h.runs(), [])

    def test_a_tampered_runtime_file_is_refused(self):
        h = self.host()
        (h.rel / "prompts/research_audit_live.md").write_text("tampered\n")
        self.refused(h, "differs from the release checksum")

    def test_a_runtime_of_another_commit_is_refused(self):
        h = self.host()
        h2 = [sys.executable, str(h.driver), "start", "--expect-commit", "f" * 40, "--unit", str(h.unit),
              "--expect-unit-sha256", sha(h.unit)]
        p = subprocess.run(h2, capture_output=True, text=True, timeout=30, stdin=subprocess.DEVNULL)
        self.assertEqual(p.returncode, sv.EXIT_CONFIG)
        self.assertIn("expected bsproof-research-worker-ffffffffffff", p.stdout)
        self.assertEqual(h.runs(), [])

    def test_a_group_writable_runtime_or_an_unsafe_env_file_or_data_dir_is_refused(self):
        h = self.host()
        os.chmod(h.rel, 0o775)
        self.refused(h, "not group/world writable")
        os.chmod(h.rel, 0o755)
        os.chmod(h.env_file, 0o644)
        self.refused(h, "mode 0600")
        os.chmod(h.env_file, 0o600)
        os.chmod(h.data, 0o755)
        self.refused(h, "mode 0700")
        os.chmod(h.data, 0o700)

    def test_a_missing_cli_or_missing_api_base_or_wrong_cli_path_is_refused(self):
        h = self.host()
        h.write_env()
        text = h.env_file.read_text().replace(str(h.claude), "/elsewhere/claude")
        h.env_file.write_text(text)
        self.refused(h, "different CLI paths")
        h.write_env()
        h.claude.unlink()
        self.refused(h, "pinned CLI path")

    def test_the_data_dir_must_stay_inside_the_private_runtime_root(self):
        h = self.host()
        text = h.env_file.read_text().replace(str(h.data), "/tmp/elsewhere")
        h.env_file.write_text(text)
        self.refused(h, "inside the 0700 runtime root")


class Scrub(HostCase):
    def test_the_worker_sees_only_the_allowlisted_names_and_no_credential(self):
        h = self.host()
        self.start(h)
        rec = h.runs()[0]
        self.assertEqual(set(rec["env"]), set(sv.WORKER_ENV_NAMES))
        blob = json.dumps(rec)
        for k, v in POLLUTION.items():
            self.assertNotIn(k, rec["env"])
            if len(v) > 3:
                self.assertNotIn(v, blob)
        self.assertNotIn(TOKEN, blob)                              # not in the env and not in argv
        self.assertEqual(rec["env"]["HOME"], str(h.home))
        self.assertTrue(rec["env"]["PATH"].startswith(str(h.home / ".local/bin")))
        rel = h.rel.resolve()
        self.assertEqual(rec["argv"], [str(rel / "scripts/pc_research_worker.py"), "run"])
        self.assertEqual(Path(rec["cwd"]), rel)
        self.assertEqual((rec["nnp"], rec["umask"]), ("1", "0077"))
        sup = h.state()["supervisor_pid"]
        for pid in (sup, h.state()["worker_pid"]):                  # nobody's argv/env carries the token either
            self.assertNotIn(TOKEN.encode(), Path(f"/proc/{pid}/cmdline").read_bytes())
        self.assertNotIn(TOKEN.encode(), Path(f"/proc/{h.state()['worker_pid']}/environ").read_bytes())

    def test_neither_the_pinned_cli_nor_any_model_program_is_ever_run_by_the_supervisor(self):
        h = self.host()
        self.start(h)
        h.run("stop", "--now", "--wait", "20")
        self.assertFalse((h.home / "claude-was-run").exists())
        self.assertFalse((h.home / "pwned").exists())
        self.assertFalse((h.home / "pwned2").exists())

    def test_the_runtime_is_the_pinned_release_not_whatever_current_points_to_later(self):
        h = self.host(tuning={"restart_cap": 1.0})
        h.ctl({"modes": ["idle"]})
        self.start(h)
        wpid = h.state()["worker_pid"]
        other = h.root / "releases" / "bsproof-research-worker-ffffffffffff"
        other.mkdir()
        os.chmod(other, 0o755)
        tmp = h.root / "current.new"
        os.symlink(f"releases/{other.name}", tmp)
        os.replace(tmp, h.root / "current")                         # a rollback / stale runtime appears
        os.kill(wpid, signal.SIGKILL)
        st = wait_for(lambda: h.state().get("state") == "blocked_config" and h.state(), "blocked on the changed runtime")
        self.assertIn("expected", st["reason"])
        time.sleep(1.5)
        self.assertEqual(len(h.runs()), 1)                          # it never started the other release


class Supervision(HostCase):
    def test_unexpected_exit_restarts_with_growing_back_off_and_then_stays_up(self):
        h = self.host(restart_sec="0.3")
        h.ctl({"modes": ["crash", "crash", "crash", "idle"]})
        self.start(h)
        wait_for(lambda: len(h.runs()) == 4, "four spawns", 40)
        wait_for(lambda: h.run("status").returncode == 0, "READY after the crashes", 30)
        t = [r["mono"] for r in h.runs()]
        gaps = [b - a for a, b in zip(t, t[1:])]
        for i, g in enumerate(gaps):
            base = 0.3 * 2 ** i
            self.assertGreaterEqual(g, 0.8 * base - 0.05, (i, gaps))
            self.assertLessEqual(g, min(2.0, 1.2 * base) + 2.5, (i, gaps))
        self.assertGreater(gaps[2], gaps[0])
        time.sleep(1.0)
        self.assertEqual(len(h.runs()), 4)                          # healthy worker: no further restarts
        self.assertEqual(h.state()["restarts"], 3)

    def test_config_and_lock_exits_wait_at_least_the_floor(self):
        h = self.host(restart_sec="0.1", tuning={"blocked_floor": 1.0, "restart_cap": 2.0})
        h.ctl({"modes": ["exit78", "idle"]})
        self.start(h, ready=False)
        wait_for(lambda: len(h.runs()) == 2, "second spawn", 30)
        t = [r["mono"] for r in h.runs()]
        self.assertGreaterEqual(t[1] - t[0], 0.95)
        self.assertEqual(h.state()["last_exit"]["code"], 78)

    def test_stderr_eof_is_not_an_exit_does_not_restart_and_does_not_spin(self):
        h = self.host()
        h.ctl({"modes": ["close_stderr"]})
        self.start(h)
        sup = h.state()["supervisor_pid"]

        def cpu():
            f = Path(f"/proc/{sup}/stat").read_text().rpartition(")")[2].split()
            return (int(f[11]) + int(f[12])) / os.sysconf("SC_CLK_TCK")

        c0 = cpu()
        time.sleep(2.0)
        self.assertLess(cpu() - c0, 0.6)                           # a busy loop on the closed pipe would burn ~2 s
        self.assertEqual(len(h.runs()), 1)
        self.assertIn("stderr closed", h.log())
        self.assertEqual(h.run("status").returncode, 0)

    def test_stop_ends_the_whole_tree_including_a_cli_in_its_own_session_and_never_restarts(self):
        h = self.host()
        h.ctl({"modes": ["with_child"]})
        self.start(h)
        sleeper = sleeper_pid(h)
        st = h.state()
        self.assertTrue(sv.alive(sleeper))
        self.assertNotEqual(sv.proc_stat(sleeper)["session"], sv.proc_stat(st["worker_pid"])["session"])
        r = h.run("stop", "--now", "--wait", "30")
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        wait_for(lambda: gone(sleeper) and gone(st["worker_pid"]) and gone(st["supervisor_pid"]), "whole tree gone")
        self.assertFalse((h.supdir / "supervisor.pid").exists())
        self.assertEqual(sv.lock_holders(h.supdir / "supervisor.lock"), set())
        self.assertEqual(sv.lock_holders(h.data / "worker.lock"), set())
        time.sleep(0.8)
        self.assertEqual(len(h.runs()), 1)
        self.assertEqual(h.state()["state"], "stopped")
        self.assertEqual(h.run("status").returncode, 1)

    def test_a_worker_that_ignores_sigterm_is_killed_after_the_unit_timeout(self):
        h = self.host(stop_sec="1")
        h.ctl({"modes": ["idle"], "term": "ignore"})
        self.start(h)
        wpid = h.state()["worker_pid"]
        t0 = time.monotonic()
        r = h.run("stop", "--now", "--wait", "30")
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertLess(time.monotonic() - t0, 4.5)               # TimeoutStopSec=1 then SIGKILL, not the sweep's 2 s grace on top
        wait_for(lambda: gone(wpid), "worker killed")
        self.assertIn("ignored SIGTERM; SIGKILL", h.log())
        self.assertEqual(len(h.runs()), 1)

    def test_a_crashed_worker_s_orphaned_cli_is_swept_at_once(self):
        h = self.host(restart_sec="0.3")
        h.ctl({"modes": ["crash_with_child", "idle"]})
        self.start(h, ready=False)
        sleeper = sleeper_pid(h)
        wait_for(lambda: gone(sleeper), "orphan CLI swept")
        self.assertIn("terminating leftover descendants", h.log())

    def test_sigkill_of_the_supervisor_takes_the_worker_with_it(self):
        h = self.host()
        self.start(h)
        st = h.state()
        os.kill(st["supervisor_pid"], signal.SIGKILL)
        wait_for(lambda: gone(st["worker_pid"]), "worker dies with its supervisor (PDEATHSIG)")
        self.assertEqual(h.run("status").returncode, 1)

    def test_a_bug_in_the_loop_never_leaves_a_worker_or_a_cli_behind(self):
        h = self.host(break_loop=True)
        h.ctl({"modes": ["with_child"]})
        h.run("start")
        sleeper = sleeper_pid(h)
        st = wait_for(lambda: h.state().get("state") == "stopped" and h.state(), "supervisor shut down on its own")
        wpid = h.runs()[0]["pid"]
        wait_for(lambda: gone(sleeper) and gone(wpid), "worker tree gone")
        self.assertIn("internal error; shutting down", h.log())
        self.assertIn("RuntimeError", h.log())
        wait_for(lambda: gone(st["supervisor_pid"]), "supervisor process exits after its final state write")
        self.assertEqual(len(h.runs()), 1)

    def test_hup_does_not_stop_it(self):
        h = self.host()
        self.start(h)
        os.kill(h.state()["supervisor_pid"], signal.SIGHUP)
        time.sleep(0.8)
        self.assertEqual(h.run("status").returncode, 0)


class Readiness(HostCase):
    def test_ready_needs_an_answered_claim_cycle_not_just_a_status_file(self):
        h = self.host()
        h.ctl({"modes": ["slowpoll"]})
        self.start(h, ready=False)
        out = wait_for(lambda: (lambda r: r.stdout if "no claim has been answered" in r.stdout else None)(h.run("status")),
                       "first poll written, no cycle yet", 20)
        self.assertIn("NOT READY", out)
        wait_for(lambda: h.run("status").returncode == 0, "READY after the second poll write", 30)
        self.assertGreaterEqual(h.state()["polls_since_start"], 2)


class StopSemantics(HostCase):
    def test_stop_refuses_while_a_job_runs_then_drain_waits_for_idle_and_now_cuts(self):
        h = self.host()
        h.ctl({"modes": ["job"]})
        self.start(h, ready=False)
        sup = h.state()["supervisor_pid"]
        wait_for(lambda: h.run("status").stdout.find("status=running") >= 0, "job running visible")
        r = h.run("stop")
        self.assertEqual(r.returncode, sv.EXIT_JOB_RUNNING, r.stdout)
        self.assertIn("RUNNING", r.stdout)
        self.assertTrue(sv.alive(sup))
        d = h.run("stop", "--drain", "--wait", "1")
        self.assertEqual(d.returncode, sv.EXIT_TIMEOUT)               # still draining: the job has not finished
        self.assertTrue(sv.alive(sup))
        wait_for(lambda: h.state().get("drain") is True, "drain recorded")
        (h.home / "finish").write_text("1")                           # the job completes
        wait_for(lambda: gone(sup), "supervisor stops itself once idle", 30)
        self.assertEqual(len(h.runs()), 1)

    def test_stop_now_cuts_a_running_job(self):
        h = self.host()
        h.ctl({"modes": ["job"]})
        self.start(h, ready=False)
        wait_for(lambda: h.run("status").stdout.find("status=running") >= 0, "job running visible")
        r = h.run("stop", "--now", "--wait", "30")
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertFalse(sv.alive(h.state()["supervisor_pid"]))

    def test_status_and_stop_still_work_when_the_reviewed_files_are_gone(self):
        h = self.host()
        self.start(h)
        st = h.state()
        os.unlink(h.unit)                                             # the kill switch must not depend on them
        os.unlink(h.env_file)
        s = h.run("status")
        self.assertIn("pid=" + str(st["supervisor_pid"]), s.stdout)
        r = h.run("stop", "--now", "--wait", "30")
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        wait_for(lambda: gone(st["supervisor_pid"]) and gone(st["worker_pid"]), "stopped without the unit or env file")

    def test_a_leftover_status_file_is_never_a_heartbeat(self):
        h = self.host()
        (h.data / "status.json").write_text(json.dumps(
            {"state": "polling", "pid": 99999999, "updated_utc": "2026-10-04T22:31:56.395857+00:00"}))
        s = h.run("status")
        self.assertEqual(s.returncode, 1)
        self.assertIn("supervisor not running", s.stdout)
        j = json.loads(h.run("status", "--json").stdout)
        self.assertIn("not running", j["worker"]["status_file_stale"])
        self.assertFalse(j["ready"])

    def test_status_says_there_is_no_boot_persistence_and_notices_a_restart(self):
        h = self.host()
        self.start(h)
        out = h.run("status").stdout
        self.assertIn("NONE across a PC/WSL/Windows restart", out)
        h.run("stop", "--now", "--wait", "20")
        st = h.state()
        st["boot_id"] = "a-previous-boot"
        (h.supdir / "state.json").write_text(json.dumps(st))
        self.assertIn("restarted since", h.run("status").stdout)


class Logs(HostCase):
    def test_worker_output_reaches_the_log_only_as_masked_generic_lines(self):
        h = self.host()
        h.ctl({"modes": ["leak"]})
        self.start(h, ready=False)
        wait_for(lambda: "suppressed" in h.log(), "leak lines processed")
        h.run("stop", "--now", "--wait", "20")
        blob = "".join(p.read_text() for p in h.supdir.iterdir() if p.suffix == "" or ".log" in p.name or p.suffix == ".json")
        for needle in (TOKEN, "someone@example.com", "123e4567-e89b-12d3-a456-426614174000", "creatine monohydrate",
                       "MODEL TEXT", "Authorization", "Traceback"):
            self.assertNotIn(needle, blob, needle)
        self.assertIn("worker:", h.log())
        self.assertIn("RuntimeError", h.log())                        # exception TYPE only
        self.assertLess(max(len(l) for l in h.log().splitlines()), 700)
        for p in h.supdir.rglob("*"):
            self.assertNotIn(TOKEN.encode(), p.read_bytes() if p.is_file() else b"")

    def test_a_crash_traceback_is_summarised_not_copied(self):
        h = self.host(restart_sec="0.3")
        h.ctl({"modes": ["crash", "idle"]})
        self.start(h)
        wait_for(lambda: "ValueError" in h.log(), "crash summarised", 20)
        self.assertNotIn("Traceback", h.log())
        self.assertNotIn("0123456789abcdef0123456789abcdef", h.log())


# --------------------------------------------------------------------------- #
# the REAL worker, unchanged, under the supervisor


class RealWorker(HostCase):
    @classmethod
    def setUpClass(cls):
        # Required, never skipped (the worker refuses to validate without jsonschema>=4).
        importlib.import_module("jsonschema")
        sys.path.insert(0, str(ROOT))
        sys.path.insert(0, str(ROOT / "scripts"))
        cls.wt = importlib.import_module("tests.test_pc_research_worker")

    def real_host(self, api, **kw):
        h = self.host(real_worker=True, **kw)
        h.write_env("BS_PROOF_RESEARCH_ALLOW_INSECURE_LOCALHOST=1\nBS_PROOF_RESEARCH_POLL_SECONDS=0.2\n"
                    "BS_PROOF_RESEARCH_HEARTBEAT_SECONDS=0.3\n")
        text = h.env_file.read_text().replace("https://example.invalid", api.base)
        h.env_file.write_text(text)
        return h

    def install_fake_cli(self, h, events):
        scen = h.home / "scenario.json"
        rec = h.home / "cli-record.json"
        scen.write_text(json.dumps({"events": events, "record": str(rec), "hb_flag": str(h.home / "hb.flag")}))
        h.claude.write_text(self.wt.FAKE_CLI.format(py=sys.executable, sc=str(scen)))
        os.chmod(h.claude, 0o755)
        return rec

    def test_idle_queue_is_ready_after_claims_with_no_model_and_the_token_comes_from_the_file_only(self):
        api = self.wt.Api()
        self.addCleanup(api.close)
        h = self.real_host(api)
        rec = self.install_fake_cli(h, self.wt.web_events())
        self.start(h)
        j = json.loads(h.run("status", "--json").stdout)
        self.assertTrue(j["ready"], j)
        self.assertGreaterEqual(j["worker"]["polls_since_start"], 2)
        self.assertGreaterEqual(len(api.of("claim")), 1)
        self.assertEqual({r["auth"] for r in api.requests}, {f"Bearer {TOKEN}"})
        self.assertFalse(rec.exists())                                # no CLI run, no model: only claims
        self.assertEqual(api.of("complete") + api.of("fail"), [])
        pid = h.state()["worker_pid"]
        self.assertNotIn(TOKEN.encode(), Path(f"/proc/{pid}/environ").read_bytes())
        self.assertNotIn(TOKEN.encode(), Path(f"/proc/{pid}/cmdline").read_bytes())

    def test_a_claimed_job_runs_in_a_scrubbed_cli_and_stop_cuts_it_and_posts_nothing(self):
        api = self.wt.Api()
        self.addCleanup(api.close)
        api.claims = [self.wt.job()]
        h = self.real_host(api)
        rec = self.install_fake_cli(h, self.wt.web_events() + ["HANG"])
        self.start(h, ready=False)
        ready = Path(str(rec) + ".ready")
        wait_for(ready.exists, "CLI mid-run", 60)
        r = json.loads(rec.read_text())
        allowed = set(self.wt.ad.CHILD_ENV_ALLOW)
        self.assertTrue(set(r["env"]) <= allowed | {"LC_CTYPE", "LC_ALL", "LANG"}, sorted(set(r["env"]) - allowed))
        for k in POLLUTION:
            self.assertNotIn(k, r["env"])
        self.assertTrue(sv.alive(r["pid"]))
        wait_for(lambda: h.run("status").stdout.find("status=running") >= 0, "worker reports a running job")
        blocked = h.run("stop")
        self.assertEqual(blocked.returncode, sv.EXIT_JOB_RUNNING, blocked.stdout)
        self.assertTrue(sv.alive(r["pid"]))
        st = h.state()
        stopped = h.run("stop", "--now", "--wait", "60")
        self.assertEqual(stopped.returncode, 0, stopped.stdout + stopped.stderr)
        wait_for(lambda: gone(r["pid"]) and gone(st["worker_pid"]) and gone(st["supervisor_pid"]), "everything gone")
        self.assertEqual(api.of("complete") + api.of("fail"), [])     # a shutdown never finishes a job
        self.assertEqual(sv.lock_holders(h.data / "worker.lock"), set())
        self.assertEqual(len(api.of("claim")), 1)                     # and nothing re-claimed after the stop

    def test_a_rejected_claim_path_is_not_ready_and_is_not_a_restart_storm(self):
        api = self.wt.Api()
        self.addCleanup(api.close)
        api.redirect = True                                           # the worker refuses redirects: claims are not accepted
        h = self.real_host(api)
        self.install_fake_cli(h, self.wt.web_events())
        self.start(h, ready=False)
        pid = wait_for(lambda: h.state().get("worker_pid"), "worker spawned")
        wait_for(lambda: "backoff" in h.run("status").stdout, "status shows the worker is backing off", 30)
        s = h.run("status")
        self.assertEqual(s.returncode, 1)
        self.assertIn("NOT READY", s.stdout)
        time.sleep(1.0)
        self.assertEqual(h.state()["worker_pid"], pid)               # the worker lives; the supervisor did not churn it
        self.assertEqual(h.state()["restarts"], 0)


if __name__ == "__main__":
    unittest.main()
