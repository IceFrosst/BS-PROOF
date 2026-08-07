"""
grok_adapter — pure-function S1–S8 via Grok Build CLI.
Default concurrency tuned ~10% lower for desktop stability.
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

# Tier -> model. Prices are per 1M tokens, input/output, under 200k context
# (xAI model table, 2026-08-07):
#
#   grok-4.5                    500k   $2.00 / $6.00   code, agents, general
#   grok-4.3                      1M   $1.25 / $2.50   long-context, cost-efficient
#   grok-4.20-*-reasoning         1M   $1.25 / $2.50   deep reasoning, fewer hallucinations
#   grok-4.20-*-non-reasoning     1M   $1.25 / $2.50   fast agentic, high throughput
#
# TIER A -> grok-4.3. S1 and S8 are the two genuinely simple agents: S1 reads
# PubMed tags (and fires on ~0.2% of papers), S8 reads a funding statement and
# picks one of four labels. Neither needs a reasoning model, and 4.3 is ~40%
# cheaper. S8 runs once per study, so this is real money at corpus scale.
#
# TIER B -> grok-4.5 stays. S3/S4/S5/S7 are extraction under adversarial
# conditions: S5 has to read past authors' spin, S7 carries the elemental-dose
# trap. Cheaper models here are a QUALITY bet, and SPEC section 15 is explicit
# that tiers are "a prior, not a measurement" -- A/B them on the 28 anchors
# before moving them, not before.
#
# TIER C -> grok-4.5 for now. S6 is the highest-risk subagent (a wrong outcome
# mapping is silent and unrecoverable), so it wants the LOWEST hallucination
# rate rather than the biggest model. A grok-4.20-*-reasoning variant is the
# better fit on paper AND cheaper, but the `*` is a placeholder -- run
# `grok models` for the exact id and set SP_GROK_MODEL_C. Guessing an id here
# would fail every S6 call, and S6 failing is how outcomes get silently lost.
#
# WHERE THE MONEY ACTUALLY IS: S6 is ~5 of the ~10 calls per study, because it
# fires once per extracted claim. Tier C is therefore the dominant cost, not
# tier A. Measured on a 120-study run at ~14k prompt / ~600 output:
#
#   all grok-4.5                     $9.48
#   A->4.3 (this commit)             $9.10    4% saved
#   A->4.3, C->4.20-*-reasoning      $7.21   24% saved  <- the real lever
#   everything on 4.3                $5.70   40% saved  (untested quality bet)
#
# The 24% option is also the BETTER model for S6 on paper (fewer
# hallucinations), so it is not a quality/cost trade -- it is both. It is not
# set here only because the `*` in the id is a placeholder.
#
# Context is irrelevant to the choice: our prompts are ~13-15k against a 500k
# floor. Both models keep us inside the cheaper <200k pricing band.
TIER_MODEL = {
    "A": os.environ.get("SP_GROK_MODEL_A", "grok-4.3"),
    "B": os.environ.get("SP_GROK_MODEL_B", "grok-4.5"),
    "C": os.environ.get("SP_GROK_MODEL_C", "grok-4.5"),
}

# ~10% under previous aggressive default for desktop stability
MAX_CONCURRENCY = int(os.environ.get("SP_GROK_CONCURRENCY", "43"))
CALL_TIMEOUT_S = int(os.environ.get("SP_GROK_TIMEOUT_S", "300"))
_slots = threading.Semaphore(MAX_CONCURRENCY)
_lock = threading.Lock()

_stats = {
    "calls": 0, "ok": 0, "fail": 0, "cache": 0, "timeout": 0, "auth": 0,
    "latencies": [], "in_flight": 0, "peak_in_flight": 0,
}


def reset_stats() -> None:
    with _lock:
        _stats.update({
            "calls": 0, "ok": 0, "fail": 0, "cache": 0, "timeout": 0, "auth": 0,
            "latencies": [], "in_flight": 0, "peak_in_flight": 0,
        })


def speed_report() -> str:
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
    if total_live < 10:
        advice = "Too few calls to judge."
    elif fail_rate > 0.25:
        advice = f"BACK OFF — set SP_GROK_CONCURRENCY={max(4, MAX_CONCURRENCY // 2)}"
    elif fail_rate < 0.05 and s["peak_in_flight"] >= MAX_CONCURRENCY * 0.8:
        advice = f"HEADROOM — optional set SP_GROK_CONCURRENCY={min(64, MAX_CONCURRENCY + 8)}"
    else:
        advice = f"OK at {MAX_CONCURRENCY}."
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
        h.update(part.encode()); h.update(b"\0")
    return h.hexdigest()


def _child_env() -> dict:
    env = {**os.environ}
    env["PYTHONIOENCODING"] = "utf-8"
    env["PYTHONUTF8"] = "1"
    return env


def _run_grok(cmd: list[str], timeout: int) -> subprocess.CompletedProcess:
    return subprocess.run(
        cmd, capture_output=True, text=True, encoding="utf-8", errors="replace",
        timeout=timeout, env=_child_env(),
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
                obj = json.loads(s[start:end + 1])
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
            for p in t.replace("```json", "```").split("```"):
                inner = try_parse(p)
                if inner is not None:
                    return inner
        return None
    return obj


def _build_user_prompt(schema: str, body: str) -> str:
    return (
        "Return ONLY one JSON object matching SCHEMA. "
        "No markdown fences, no commentary, no tool use.\n\n"
        f"SCHEMA:\n{schema}\n\nINPUT:\n{body}\n"
    )


def _run_variants(grok_bin: str, system: str, user: str, model: str,
                  timeout: int) -> tuple[int, str, str, list[str]]:
    cwd = Path(tempfile.mkdtemp(prefix="bsproof-grok-"))
    full_prompt = system.rstrip() + "\n\n---\n\n" + user
    # Written for debugging only -- it is NOT passed to the CLI. Keeping it
    # means a failed call can be reproduced by hand from the exact prompt sent.
    (cwd / "prompt.txt").write_text(full_prompt, encoding="utf-8")
    # Flags below are the DOCUMENTED headless interface (docs.x.ai/build/cli).
    # `-p "<prompt>"` is the only documented way to pass a prompt: there is no
    # --prompt-file and no `-p @file`. Both were invented here, so every call
    # fell through to the third variant, which truncated the prompt to 6000
    # characters. That single self-inflicted cap explains the entire S3 failure
    # pattern:
    #
    #   agent   system prompt   room left for schema + study text
    #   S8            3311                                   2689   0 failures
    #   S4            3678                                   2322   0 failures
    #   S7            3413                                   2587   1 failure
    #   S3            5015                                    985   12 failures
    #
    # At 985 characters S3's SCHEMA was being cut and no study text survived at
    # all, which is exactly what Grok reported back: "the schema and study input
    # look truncated". Nothing about S3 was special except its longer prompt.
    #
    # The real ceiling is the OS command line (~32k on Windows), and
    # workers.PROMPT_BUDGET_CHARS keeps us at 14k, well under it.
    _pure = [
        "--output-format", "json",
        "--max-turns", "1",
        "--no-memory", "--no-subagents", "--no-plan",
        "--disable-web-search",   # a pure function does not browse
        "-m", model,
        "--cwd", str(cwd),
    ]
    variants = [[grok_bin, "--no-auto-update", "-p", full_prompt, *_pure]]
    last_code, last_out, last_err, used = 1, "", "", []
    try:
        for cmd in variants:
            used = cmd
            try:
                with _slots:
                    with _lock:
                        _stats["in_flight"] += 1
                        _stats["peak_in_flight"] = max(_stats["peak_in_flight"], _stats["in_flight"])
                    try:
                        proc = _run_grok(cmd, timeout)
                    finally:
                        with _lock:
                            _stats["in_flight"] -= 1
            except subprocess.TimeoutExpired:
                last_code, last_out, last_err = 124, "", f"timeout after {timeout}s"
                continue
            except OSError as e:
                last_code, last_out, last_err = 206, "", f"OSError {e}"
                continue
            last_code, last_out, last_err = proc.returncode, proc.stdout or "", proc.stderr or ""
            if proc.returncode == 0 and last_out.strip():
                return proc.returncode, last_out, last_err, cmd
            blob = (last_out + last_err).lower()
            if any(x in blob for x in ("unknown", "unrecognized", "unexpected argument")):
                continue
            if proc.returncode != 0 and any(x in blob for x in ("not logged", "login", "unauthor")):
                break
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
        "provider": PROVIDER, "model": model, "prompt_version": PROMPT_VERSION,
        "provenance": PROVENANCE, "agent": agent, "cache_key": k,
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
        meta["error"] = "grok CLI not on PATH"; meta["flagged"] = True
        with _lock:
            _stats["fail"] += 1
        return None, meta
    t0 = time.time()
    code, stdout, stderr, cmd = _run_variants(
        grok_bin, system, _build_user_prompt(schema, body), model, timeout)
    elapsed = time.time() - t0
    meta["latency_s"] = round(elapsed, 2)
    with _lock:
        _stats["calls"] += 1
    if code != 0:
        detail = (stdout or stderr or "")[:300]
        meta["error"] = f"exit {code}: {detail}"; meta["flagged"] = True
        with _lock:
            _stats["fail"] += 1
            if code == 124:
                _stats["timeout"] += 1
        return None, meta
    result = _extract_json_from_text(stdout)
    if result is None:
        meta["error"] = f"unparseable JSON: {stdout[:240]}"; meta["flagged"] = True
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
    print(f"  concurrency={MAX_CONCURRENCY}  timeout={CALL_TIMEOUT_S}s")
    for t in ("A", "B", "C"):
        print(f"  tier {t}: {TIER_MODEL[t]}")
    grok_bin = _which_grok()
    if not grok_bin:
        print("BLOCKED: grok not on PATH"); return False
    print(f"  CLI: {grok_bin}")
    print("  8 subagents wired; documented headless flags only "
          "(-p inline, no --prompt-file)")
    print("=" * 60)
    return True


def smoke_s8() -> int:
    reset_stats()
    if not preflight():
        return 1
    result, meta = call("S8", {"text": "Funded by NutraCorp Inc."})
    if meta.get("error"):
        print("FAIL:", meta["error"]); return 1
    print("OK:", json.dumps(result)[:400])
    return 0


if __name__ == "__main__":
    import sys
    sys.exit(smoke_s8() if len(sys.argv) > 1 and sys.argv[1] == "smoke" else (0 if preflight() else 1))
