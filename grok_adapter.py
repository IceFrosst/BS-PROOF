"""
grok_adapter — pure-function S1–S8 extraction via Grok Build CLI.

Windows: subprocess uses encoding=utf-8 (not cp1252).
Speed: SP_GROK_CONCURRENCY (default 16). After a run, speed_report() says
whether you can bump limits higher.
"""
from __future__ import annotations

import hashlib
import json
import os
import shutil
import sqlite3
import subprocess
import tempfile
import threading
import time
from pathlib import Path
from typing import Any

from claude_adapter import AGENTS, PROMPT_VERSION, SCHEMAS, _system_prompt

ROOT = Path(__file__).parent
PROVIDER = "grok"
PROVENANCE = "grok-cli-pure-function"
CACHE_DB = ROOT / "out" / "grok_llm_cache.sqlite"

TIER_MODEL = {
    "A": os.environ.get("SP_GROK_MODEL_A", "grok-4.5"),
    "B": os.environ.get("SP_GROK_MODEL_B", "grok-4.5"),
    "C": os.environ.get("SP_GROK_MODEL_C", "grok-4.5"),
}

MAX_CONCURRENCY = int(os.environ.get("SP_GROK_CONCURRENCY", "16"))
CALL_TIMEOUT_S = int(os.environ.get("SP_GROK_TIMEOUT_S", "300"))
_slots = threading.Semaphore(MAX_CONCURRENCY)
_lock = threading.Lock()

# Live counters for speed advice
_stats = {
    "calls": 0,
    "ok": 0,
    "fail": 0,
    "cache": 0,
    "timeout": 0,
    "auth": 0,
    "latencies": [],  # seconds, successful live calls only
    "in_flight": 0,
    "peak_in_flight": 0,
}


def reset_stats() -> None:
    with _lock:
        _stats.update({
            "calls": 0, "ok": 0, "fail": 0, "cache": 0, "timeout": 0, "auth": 0,
            "latencies": [], "in_flight": 0, "peak_in_flight": 0,
        })


def speed_report() -> str:
    """Human advice: can we raise concurrency further?"""
    with _lock:
        s = dict(_stats)
        lats = list(_stats["latencies"])

    total_live = s["ok"] + s["fail"]
    fail_rate = (s["fail"] / total_live) if total_live else 0.0
    avg_lat = (sum(lats) / len(lats)) if lats else 0.0
    p95 = sorted(lats)[int(0.95 * (len(lats) - 1))] if len(lats) >= 5 else avg_lat

    lines = [
        "=" * 60,
        "GROK SPEED REPORT",
        f"  concurrent limit (SP_GROK_CONCURRENCY): {MAX_CONCURRENCY}",
        f"  peak in-flight observed:               {s['peak_in_flight']}",
        f"  live calls ok/fail/cache: {s['ok']}/{s['fail']}/{s['cache']}",
        f"  timeouts: {s['timeout']}  auth failures: {s['auth']}",
        f"  avg latency (ok): {avg_lat:.1f}s   p95: {p95:.1f}s",
        f"  fail rate: {fail_rate * 100:.1f}%",
    ]

    # Recommendation
    if total_live < 10:
        advice = "Too few calls to judge — run a full batch first."
    elif s["auth"] > 0:
        advice = "Auth problems — fix `grok login` / XAI_API_KEY before raising limits."
    elif fail_rate > 0.25 or s["timeout"] > total_live * 0.15:
        advice = (
            f"BACK OFF — high fail/timeout. Try lower, e.g.\n"
            f"  $env:SP_GROK_CONCURRENCY = \"{max(4, MAX_CONCURRENCY // 2)}\"\n"
            f"  $env:SP_GROK_STUDIES_IN_FLIGHT = \"{max(4, MAX_CONCURRENCY // 3)}\""
        )
    elif fail_rate < 0.05 and s["peak_in_flight"] >= MAX_CONCURRENCY * 0.8 and avg_lat < 90:
        nxt = min(80, MAX_CONCURRENCY + 8)
        advice = (
            f"HEADROOM — stable at {MAX_CONCURRENCY}. You can try higher:\n"
            f"  $env:SP_GROK_CONCURRENCY = \"{nxt}\"\n"
            f"  $env:SP_GROK_STUDIES_IN_FLIGHT = \"{min(40, nxt * 3 // 4)}\""
        )
    elif fail_rate < 0.10:
        advice = (
            f"OK at {MAX_CONCURRENCY}. Optional small bump (+4–8) if you want more speed."
        )
    else:
        advice = f"Hold at {MAX_CONCURRENCY} — mixed results; don't raise yet."

    lines.append(f"  RECOMMENDATION: {advice}")
    lines.append("=" * 60)
    return "\n".join(lines)


def _which_grok() -> str | None:
    return shutil.which("grok")


def _cache_conn() -> sqlite3.Connection:
    CACHE_DB.parent.mkdir(parents=True, exist_ok=True)
    c = sqlite3.connect(CACHE_DB, check_same_thread=False)
    c.execute("CREATE TABLE IF NOT EXISTS c (k TEXT PRIMARY KEY, v TEXT)")
    return c


_CONN = _cache_conn()


def _key(agent: str, model: str, payload: str) -> str:
    h = hashlib.sha256()
    for part in (PROVIDER, agent, PROMPT_VERSION, model, payload):
        h.update(part.encode())
        h.update(b"\0")
    return h.hexdigest()


def _child_env() -> dict:
    env = {**os.environ}
    env["PYTHONIOENCODING"] = "utf-8"
    env["PYTHONUTF8"] = "1"
    env.setdefault("LANG", "C.UTF-8")
    return env


def _run_grok(cmd: list[str], timeout: int) -> subprocess.CompletedProcess:
    return subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=timeout,
        env=_child_env(),
    )


def _extract_json_from_text(text: str) -> dict | None:
    text = (text or "").strip()
    if not text:
        return None

    def try_parse(s: str) -> dict | None:
        s = s.strip()
        if not s:
            return None
        try:
            obj = json.loads(s)
        except json.JSONDecodeError:
            start, end = s.find("{"), s.rfind("}")
            if start < 0 or end <= start:
                return None
            try:
                obj = json.loads(s[start : end + 1])
            except json.JSONDecodeError:
                return None
        return obj if isinstance(obj, dict) else None

    obj = try_parse(text)
    if obj is None:
        return None

    if "text" in obj and isinstance(obj["text"], str):
        inner = try_parse(obj["text"])
        if inner is not None:
            return inner
        t = obj["text"]
        if "```" in t:
            t = t.replace("```json", "```")
            for p in t.split("```"):
                inner = try_parse(p)
                if inner is not None:
                    return inner
        return None

    return obj


def _build_user_prompt(schema: str, body: str) -> str:
    return (
        "Return ONLY one JSON object matching SCHEMA. "
        "No markdown fences, no commentary, no tool use.\n\n"
        f"SCHEMA:\n{schema}\n\n"
        f"INPUT:\n{body}\n"
    )


def _run_variants(grok_bin: str, system: str, user: str, model: str,
                  timeout: int) -> tuple[int, str, str, list[str]]:
    cwd = Path(tempfile.mkdtemp(prefix="bsproof-grok-"))
    full_prompt = system.rstrip() + "\n\n---\n\n" + user

    variants: list[list[str]] = [
        [
            grok_bin, "--no-auto-update", "-p", full_prompt,
            "--output-format", "json", "--max-turns", "1",
            "--no-memory", "--no-subagents", "--no-plan",
            "-m", model, "--cwd", str(cwd),
            "--system-prompt-override", system,
        ],
        [
            grok_bin, "--no-auto-update", "-p", full_prompt,
            "--output-format", "json", "--max-turns", "1",
            "--no-memory", "--no-subagents", "--no-plan",
            "-m", model, "--cwd", str(cwd),
        ],
        [
            grok_bin, "--no-auto-update", "-p", full_prompt,
            "--output-format", "json", "--max-turns", "1",
            "-m", model, "--cwd", str(cwd),
        ],
    ]

    last_code, last_out, last_err, used = 1, "", "", []
    try:
        for cmd in variants:
            used = cmd
            try:
                with _slots:
                    with _lock:
                        _stats["in_flight"] += 1
                        _stats["peak_in_flight"] = max(
                            _stats["peak_in_flight"], _stats["in_flight"]
                        )
                    try:
                        proc = _run_grok(cmd, timeout)
                    finally:
                        with _lock:
                            _stats["in_flight"] -= 1
            except subprocess.TimeoutExpired:
                last_code, last_out, last_err = 124, "", f"timeout after {timeout}s"
                continue
            last_code = proc.returncode
            last_out = proc.stdout or ""
            last_err = proc.stderr or ""
            if proc.returncode == 0 and last_out.strip():
                return proc.returncode, last_out, last_err, cmd
            blob = (last_out + last_err).lower()
            if "unknown" in blob or "unrecognized" in blob or "unexpected argument" in blob:
                continue
            if proc.returncode != 0:
                if any(x in blob for x in ("not logged", "login", "unauthor", "api key")):
                    break
                continue
    finally:
        shutil.rmtree(cwd, ignore_errors=True)

    return last_code, last_out, last_err, used


def call(agent: str, payload: dict, *, timeout: int | None = None) -> tuple[dict | None, dict]:
    if agent not in AGENTS:
        raise KeyError(f"unknown subagent {agent}")

    timeout = CALL_TIMEOUT_S if timeout is None else timeout
    tier, schema_f, prompt_f = AGENTS[agent]
    model = TIER_MODEL[tier]
    schema = (SCHEMAS / schema_f).read_text(encoding="utf-8")
    system = _system_prompt(prompt_f)
    body = json.dumps(payload, ensure_ascii=False, sort_keys=True)
    k = _key(agent, model, body)

    meta: dict[str, Any] = {
        "provider": PROVIDER,
        "model": model,
        "prompt_version": PROMPT_VERSION,
        "provenance": PROVENANCE,
        "agent": agent,
        "cache_key": k,
    }

    with _lock:
        row = _CONN.execute("SELECT v FROM c WHERE k=?", (k,)).fetchone()
    if row:
        with _lock:
            _stats["cache"] += 1
        meta["cached"] = True
        return json.loads(row[0]), meta

    grok_bin = _which_grok()
    if not grok_bin:
        meta["error"] = "grok CLI not on PATH"
        meta["flagged"] = True
        with _lock:
            _stats["fail"] += 1
        return None, meta

    user = _build_user_prompt(schema, body)
    t0 = time.time()
    code, stdout, stderr, cmd = _run_variants(grok_bin, system, user, model, timeout)
    elapsed = time.time() - t0
    meta["cmd_tail"] = " ".join(cmd[-8:]) if cmd else ""
    meta["latency_s"] = round(elapsed, 2)

    with _lock:
        _stats["calls"] += 1

    if code != 0:
        detail = (stdout or stderr or "")[:400]
        low = detail.lower()
        if any(x in low for x in ("not logged", "login", "unauthor")):
            meta["error"] = f"auth failed. grok login or XAI_API_KEY. ({detail[:180]})"
            with _lock:
                _stats["auth"] += 1
                _stats["fail"] += 1
        elif code == 124:
            meta["error"] = detail or f"timeout after {timeout}s"
            with _lock:
                _stats["timeout"] += 1
                _stats["fail"] += 1
        else:
            meta["error"] = f"exit {code}: {detail[:300]}"
            with _lock:
                _stats["fail"] += 1
        meta["flagged"] = True
        return None, meta

    result = _extract_json_from_text(stdout)
    if result is None:
        meta["error"] = f"unparseable JSON: {stdout[:240]}"
        meta["flagged"] = True
        with _lock:
            _stats["fail"] += 1
        return None, meta

    with _lock:
        _CONN.execute("INSERT OR REPLACE INTO c VALUES (?,?)", (k, json.dumps(result)))
        _CONN.commit()
        _stats["ok"] += 1
        _stats["latencies"].append(elapsed)
    meta["cached"] = False
    return result, meta


def preflight() -> bool:
    print("=" * 60)
    print("GROK adapter — pure-function (Grok Build CLI)")
    print(f"  PROMPT_VERSION={PROMPT_VERSION}")
    print(f"  provenance={PROVENANCE}")
    print(f"  concurrency={MAX_CONCURRENCY}  timeout={CALL_TIMEOUT_S}s")
    for t in ("A", "B", "C"):
        print(f"  tier {t}: {TIER_MODEL[t]}")

    grok_bin = _which_grok()
    if not grok_bin:
        print("BLOCKED: `grok` not on PATH")
        return False
    print(f"  CLI: {grok_bin}")
    try:
        v = _run_grok([grok_bin, "version"], 30)
        print(f"  version: {(v.stdout or v.stderr or '').strip()[:100]}")
    except Exception as e:
        print(f"  warning: grok version failed: {e}")

    if os.environ.get("XAI_API_KEY"):
        print("  auth: XAI_API_KEY set")
    else:
        print("  auth: subscription session expected (`grok login`)")

    missing = [
        f for _, (_, s, pr) in AGENTS.items()
        for f in ((SCHEMAS / s), (ROOT / "prompts" / pr))
        if not f.exists()
    ]
    if missing:
        print("BLOCKED: missing files:", *missing, sep="\n  ")
        return False
    print("  8 subagents wired")
    print("=" * 60)
    return True


def smoke_s8() -> int:
    reset_stats()
    if not preflight():
        return 1
    print("\nSmoke S8 (funding)...")
    t0 = time.time()
    result, meta = call("S8", {
        "text": "Funded by NutraCorp Inc. Dr. Smith reports consulting fees from NutraCorp."
    })
    print(f"elapsed={time.time() - t0:.1f}s")
    if meta.get("error"):
        print("FAIL:", meta["error"])
        print(speed_report())
        return 1
    print("OK result:", json.dumps(result, indent=2)[:600])
    print(speed_report())
    return 0


if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == "smoke":
        sys.exit(smoke_s8())
    sys.exit(0 if preflight() else 1)
