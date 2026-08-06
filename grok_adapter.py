"""
grok_adapter — pure-function S1–S8 extraction via **Grok Build CLI**.

This is the Grok equivalent of Claude production `--bare`:

    grok -p "..." --output-format json --max-turns 1 \\
         --no-memory --no-subagents --no-plan \\
         --system-prompt-override "..." -m <model>

Run on the founder's machine (WSL/Linux/macOS) after:

    curl -fsSL https://x.ai/cli/install.sh | bash
    grok login          # SuperGrok / X Premium+ subscription
    # OR: export XAI_API_KEY=xai-...   # console.x.ai for CI/headless

Founder rule: Claude and Grok backends are tested **separately**. Never silent-merge.

Auth priority: XAI_API_KEY if set, else CLI session from `grok login`.
"""
from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
import tempfile
import threading
from pathlib import Path
from typing import Any

from claude_adapter import AGENTS, PROMPT_VERSION, SCHEMAS, _system_prompt

ROOT = Path(__file__).parent
PROVIDER = "grok"
PROVENANCE = "grok-cli-pure-function"

# Prefer stable, pin via env before serious runs.
TIER_MODEL = {
    "A": os.environ.get("SP_GROK_MODEL_A", "grok-4.5"),
    "B": os.environ.get("SP_GROK_MODEL_B", "grok-4.5"),
    "C": os.environ.get("SP_GROK_MODEL_C", "grok-4.5"),
}

MAX_CONCURRENCY = int(os.environ.get("SP_GROK_CONCURRENCY", "4"))
CALL_TIMEOUT_S = int(os.environ.get("SP_GROK_TIMEOUT_S", "300"))
_slots = threading.Semaphore(MAX_CONCURRENCY)


def _which_grok() -> str | None:
    return shutil.which("grok")


def _key(agent: str, model: str, payload: str) -> str:
    h = hashlib.sha256()
    for part in (PROVIDER, agent, PROMPT_VERSION, model, payload):
        h.update(part.encode())
        h.update(b"\0")
    return h.hexdigest()


def _empty_cwd() -> Path:
    """Scratch dir so AGENTS.md / project rules do not leak into extraction."""
    return Path(tempfile.mkdtemp(prefix="bsproof-grok-"))


def _extract_json_from_text(text: str) -> dict | None:
    text = (text or "").strip()
    if not text:
        return None
    try:
        obj = json.loads(text)
        if isinstance(obj, dict):
            # CLI json envelope often {"text": "..."}
            if "text" in obj and isinstance(obj["text"], str):
                inner = obj["text"].strip()
                if inner.startswith("{"):
                    try:
                        parsed = json.loads(inner)
                        if isinstance(parsed, dict):
                            return parsed
                    except json.JSONDecodeError:
                        pass
                # fenced
                if "```" in inner:
                    start = inner.find("{")
                    end = inner.rfind("}")
                    if start >= 0 and end > start:
                        try:
                            parsed = json.loads(inner[start : end + 1])
                            if isinstance(parsed, dict):
                                return parsed
                        except json.JSONDecodeError:
                            pass
            if any(k in obj for k in ("claims", "form_vocab_id", "funding_class",
                                      "outcome_vocab_id", "n_randomised",
                                      "design_rank", "included_studies")):
                return obj
            if "text" not in obj and "sessionId" not in obj:
                return obj
    except json.JSONDecodeError:
        pass
    start, end = text.find("{"), text.rfind("}")
    if start >= 0 and end > start:
        try:
            obj = json.loads(text[start : end + 1])
            return obj if isinstance(obj, dict) else None
        except json.JSONDecodeError:
            return None
    return None


def _build_prompt(system: str, schema: str, body: str) -> str:
    return (
        f"{system.rstrip()}\n\n---\n\n"
        "You are a pure extraction function. "
        "Return ONLY one JSON object matching SCHEMA. "
        "No markdown fences, no commentary, no tools.\n\n"
        f"SCHEMA:\n{schema}\n\n"
        f"INPUT:\n{body}\n"
    )


def call(agent: str, payload: dict, *, timeout: int | None = None) -> tuple[dict | None, dict]:
    """
    One pure-function subagent via `grok -p`.

    Mirrors claude_adapter.call contract: (result|None, meta).
    """
    if agent not in AGENTS:
        raise KeyError(f"unknown subagent {agent}")

    timeout = CALL_TIMEOUT_S if timeout is None else timeout
    tier, schema_f, prompt_f = AGENTS[agent]
    model = TIER_MODEL[tier]
    schema = (SCHEMAS / schema_f).read_text()
    system = _system_prompt(prompt_f)
    body = json.dumps(payload, ensure_ascii=False, sort_keys=True)

    meta: dict[str, Any] = {
        "provider": PROVIDER,
        "model": model,
        "prompt_version": PROMPT_VERSION,
        "provenance": PROVENANCE,
        "agent": agent,
        "cache_key": _key(agent, model, body),
    }

    grok_bin = _which_grok()
    if not grok_bin:
        meta["error"] = (
            "grok CLI not found. Install: curl -fsSL https://x.ai/cli/install.sh | bash"
        )
        meta["flagged"] = True
        return None, meta

    prompt = _build_prompt(system, schema, body)
    cwd = _empty_cwd()

    # Pure-function flags: one turn, no agent features, JSON out.
    # --tools with empty allowlist is best-effort; CLI versions differ.
    cmd = [
        grok_bin,
        "--no-auto-update",
        "-p", prompt,
        "--output-format", "json",
        "--max-turns", "1",
        "--no-memory",
        "--no-subagents",
        "--no-plan",
        "-m", model,
        "--cwd", str(cwd),
    ]
    # Prefer overriding system prompt when supported (Claude-compatible alias exists).
    cmd.extend(["--system-prompt-override", system])

    try:
        with _slots:
            proc = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=timeout,
                env={**os.environ},
            )
    except subprocess.TimeoutExpired:
        meta["error"] = f"timeout after {timeout}s"
        meta["flagged"] = True
        return None, meta
    except FileNotFoundError:
        meta["error"] = "grok binary disappeared from PATH"
        meta["flagged"] = True
        return None, meta

    raw_out = (proc.stdout or "") + ("\n" + proc.stderr if proc.stderr else "")
    if proc.returncode != 0:
        detail = (proc.stdout or proc.stderr or "")[:400]
        low = detail.lower()
        if "not logged" in low or "login" in low or "unauthor" in low:
            meta["error"] = (
                f"auth failure (exit {proc.returncode}). "
                "Run `grok login` or export XAI_API_KEY. "
                f"Detail: {detail[:200]}"
            )
        else:
            meta["error"] = f"exit {proc.returncode}: {detail[:300]}"
        meta["flagged"] = True
        return None, meta

    result = _extract_json_from_text(proc.stdout or "")
    if result is None:
        meta["error"] = f"unparseable JSON: {(proc.stdout or '')[:240]}"
        meta["flagged"] = True
        return None, meta

    return result, meta


def preflight() -> bool:
    print("GROK adapter — pure-function path via Grok Build CLI")
    print(f"  PROMPT_VERSION={PROMPT_VERSION} (shared with Claude adapters)")
    print(f"  provenance={PROVENANCE}")
    print(f"  concurrency={MAX_CONCURRENCY}  timeout={CALL_TIMEOUT_S}s")
    for t in ("A", "B", "C"):
        print(f"  tier {t}: {TIER_MODEL[t]}")

    grok_bin = _which_grok()
    if not grok_bin:
        print("BLOCKED: `grok` not on PATH.")
        print("  Install (WSL/Linux/macOS):")
        print("    curl -fsSL https://x.ai/cli/install.sh | bash")
        print("  Then: grok login   # or export XAI_API_KEY=...")
        return False
    print(f"  CLI: {grok_bin}")

    try:
        v = subprocess.run(
            [grok_bin, "version"], capture_output=True, text=True, timeout=30
        )
        print(f"  version: {(v.stdout or v.stderr or '').strip()[:80]}")
    except Exception as e:
        print(f"  warning: could not run grok version: {e}")

    if os.environ.get("XAI_API_KEY"):
        print("  auth: XAI_API_KEY is set (API key takes precedence over browser login)")
    else:
        print("  auth: no XAI_API_KEY — relying on `grok login` session (subscription)")
        print("  If headless fails with login errors, run: grok login")

    print("  Never merge Grok + Claude extractions into one score silently.")
    return True


def smoke_s8() -> int:
    """Tiny live check: funding classifier on a fixed sentence."""
    if not preflight():
        return 1
    payload = {
        "text": (
            "Funded by NutraCorp Inc. Dr. Smith reports consulting fees from NutraCorp."
        )
    }
    result, meta = call("S8", payload)
    print("smoke S8 meta:", {k: meta[k] for k in ("model", "provider", "error") if k in meta or True})
    if meta.get("error"):
        print("FAIL:", meta["error"])
        return 1
    print("result:", json.dumps(result, indent=2)[:500])
    return 0 if result else 1


if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == "smoke":
        sys.exit(smoke_s8())
    sys.exit(0 if preflight() else 1)
