"""
grok_adapter — pure-function S1–S8 extraction via Grok Build CLI.

Same role as claude_adapter's --bare path:

    grok -p <prompt> --output-format json --max-turns 1
         --no-memory --no-subagents --no-plan
         --cwd <empty> -m <model>

On the founder machine (WSL):

    curl -fsSL https://x.ai/cli/install.sh | bash
    grok login
    python3 grok_adapter.py smoke
    python3 run_pipeline.py creatine --form creatine_monohydrate --grok

Auth: `grok login` (subscription) or XAI_API_KEY. Test SEPARATELY from Claude.
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

MAX_CONCURRENCY = int(os.environ.get("SP_GROK_CONCURRENCY", "4"))
CALL_TIMEOUT_S = int(os.environ.get("SP_GROK_TIMEOUT_S", "300"))
_slots = threading.Semaphore(MAX_CONCURRENCY)
_lock = threading.Lock()


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

    # Direct JSON
    obj = try_parse(text)
    if obj is None:
        return None

    # Grok CLI envelope: {"text": "...", "sessionId": ...}
    if "text" in obj and isinstance(obj["text"], str):
        inner = try_parse(obj["text"])
        if inner is not None:
            return inner
        # Strip markdown fences inside text
        t = obj["text"]
        if "```" in t:
            t = t.replace("```json", "```")
            parts = t.split("```")
            for p in parts:
                inner = try_parse(p)
                if inner is not None:
                    return inner
        return None

    # Already looks like extraction payload
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
    """
    Try progressively simpler flag sets. CLI versions differ; first success wins.
    """
    cwd = Path(tempfile.mkdtemp(prefix="bsproof-grok-"))
    full_prompt = system.rstrip() + "\n\n---\n\n" + user

    variants: list[list[str]] = [
        # Preferred: pure + override system + no agent features
        [
            grok_bin, "--no-auto-update", "-p", full_prompt,
            "--output-format", "json", "--max-turns", "1",
            "--no-memory", "--no-subagents", "--no-plan",
            "-m", model, "--cwd", str(cwd),
            "--system-prompt-override", system,
        ],
        # Without system-prompt-override (may not exist on older CLI)
        [
            grok_bin, "--no-auto-update", "-p", full_prompt,
            "--output-format", "json", "--max-turns", "1",
            "--no-memory", "--no-subagents", "--no-plan",
            "-m", model, "--cwd", str(cwd),
        ],
        # Minimal headless
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
                    proc = subprocess.run(
                        cmd, capture_output=True, text=True, timeout=timeout,
                        env={**os.environ},
                    )
            except subprocess.TimeoutExpired:
                last_code, last_out, last_err = 124, "", f"timeout after {timeout}s"
                continue
            last_code, last_out, last_err = proc.returncode, proc.stdout or "", proc.stderr or ""
            if proc.returncode == 0 and (proc.stdout or "").strip():
                return proc.returncode, proc.stdout or "", proc.stderr or "", cmd
            # Unknown flag → try next variant
            blob = (last_out + last_err).lower()
            if "unknown" in blob or "unrecognized" in blob or "unexpected argument" in blob:
                continue
            if proc.returncode != 0:
                # Auth failures: no point in more flag variants
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
    schema = (SCHEMAS / schema_f).read_text()
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
        meta["cached"] = True
        return json.loads(row[0]), meta

    grok_bin = _which_grok()
    if not grok_bin:
        meta["error"] = "grok CLI not on PATH — install from https://x.ai/cli/install.sh"
        meta["flagged"] = True
        return None, meta

    user = _build_user_prompt(schema, body)
    code, stdout, stderr, cmd = _run_variants(grok_bin, system, user, model, timeout)
    meta["cmd_tail"] = " ".join(cmd[-8:]) if cmd else ""

    if code != 0:
        detail = (stdout or stderr or "")[:400]
        low = detail.lower()
        if any(x in low for x in ("not logged", "login", "unauthor")):
            meta["error"] = (
                f"auth failed. Run `grok login` or export XAI_API_KEY. ({detail[:180]})"
            )
        elif code == 124:
            meta["error"] = detail or f"timeout after {timeout}s"
        else:
            meta["error"] = f"exit {code}: {detail[:300]}"
        meta["flagged"] = True
        return None, meta

    result = _extract_json_from_text(stdout)
    if result is None:
        meta["error"] = f"unparseable JSON: {stdout[:240]}"
        meta["flagged"] = True
        return None, meta

    with _lock:
        _CONN.execute("INSERT OR REPLACE INTO c VALUES (?,?)", (k, json.dumps(result)))
        _CONN.commit()
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
        print("  curl -fsSL https://x.ai/cli/install.sh | bash")
        print("  echo 'export PATH=\"$HOME/.grok/bin:$PATH\"' >> ~/.bashrc && source ~/.bashrc")
        return False
    print(f"  CLI: {grok_bin}")

    try:
        v = subprocess.run([grok_bin, "version"], capture_output=True, text=True, timeout=30)
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
        print("BLOCKED: missing prompt/schema files:")
        for m in missing:
            print(" ", m)
        return False
    print("  8 subagents wired (shared prompts/schemas with Claude)")
    print("=" * 60)
    return True


def smoke_s8() -> int:
    if not preflight():
        return 1
    print("\nSmoke S8 (funding)...")
    t0 = time.time()
    result, meta = call("S8", {
        "text": (
            "Funded by NutraCorp Inc. Dr. Smith reports consulting fees from NutraCorp."
        )
    })
    print(f"elapsed={time.time() - t0:.1f}s")
    if meta.get("error"):
        print("FAIL:", meta["error"])
        if meta.get("cmd_tail"):
            print("cmd_tail:", meta["cmd_tail"])
        return 1
    print("OK result:", json.dumps(result, indent=2)[:600])
    return 0


if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == "smoke":
        sys.exit(smoke_s8())
    sys.exit(0 if preflight() else 1)
