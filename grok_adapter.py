"""
grok_adapter — pure-function extraction via xAI Grok (SEPARATE from Claude).

Founder decision 2026-08-06: keep **both** setups and test them separately.

  Claude production : claude_adapter.py  (--bare + ANTHROPIC_API_KEY)
  Claude pilot      : pilot_adapter.py   (subscription; labelled pilot)
  Grok pure         : this file          (xAI API; bare-style; labelled grok)

Rules:
  - Same prompts/, schemas/, PROMPT_VERSION as Claude paths.
  - Input JSON → one JSON object out. No tools, no multi-turn memory.
  - NEVER merge Grok + Claude fields silently. Compare side by side;
    disagreement → discard or human review (fail toward under-count).
  - Do not import this into pipeline/scoring.py or dedup.py (invariant 1 family).
  - Outputs must carry provider=grok, model id, prompt_version, evidence spans.

Status: SCAFFOLD. Live HTTP calls are behind XAI_API_KEY. Until the client is
wired and anchor-evalled, call() returns None with a clear error — so a mistaken
wire-up cannot silently invent extractions.

Env:
  XAI_API_KEY     required for live calls
  SP_GROK_MODEL_A / B / C   optional overrides (defaults below)
"""
from __future__ import annotations

import hashlib
import json
import os
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

import claude_adapter
from claude_adapter import AGENTS, PROMPT_VERSION, SCHEMAS, _system_prompt

ROOT = Path(__file__).parent
PROVIDER = "grok"
PROVENANCE = "grok-pure-function-not-claude"

# Pin when you start real runs. Floating aliases break cache determinism.
TIER_MODEL = {
    "A": os.environ.get("SP_GROK_MODEL_A", "grok-3-mini"),
    "B": os.environ.get("SP_GROK_MODEL_B", "grok-3"),
    "C": os.environ.get("SP_GROK_MODEL_C", "grok-3"),
}

API_URL = os.environ.get(
    "SP_GROK_API_URL",
    "https://api.x.ai/v1/chat/completions",
)


def _key(agent: str, model: str, payload: str) -> str:
    h = hashlib.sha256()
    h.update(PROVIDER.encode()); h.update(b"\0")
    h.update(agent.encode()); h.update(b"\0")
    h.update(PROMPT_VERSION.encode()); h.update(b"\0")
    h.update(model.encode()); h.update(b"\0")
    h.update(payload.encode())
    return h.hexdigest()


def _extract_json(text: str) -> dict | None:
    text = (text or "").strip()
    if not text:
        return None
    try:
        obj = json.loads(text)
        return obj if isinstance(obj, dict) else None
    except json.JSONDecodeError:
        pass
    # Fallback: first {...} block
    start, end = text.find("{"), text.rfind("}")
    if start >= 0 and end > start:
        try:
            obj = json.loads(text[start : end + 1])
            return obj if isinstance(obj, dict) else None
        except json.JSONDecodeError:
            return None
    return None


def call(agent: str, payload: dict, *, timeout: int = 180) -> tuple[dict | None, dict]:
    """
    One pure-function subagent call on Grok.

    Returns (result | None, meta). meta always includes provider=grok so rows
    can never be mistaken for Claude production.
    """
    if agent not in AGENTS:
        raise KeyError(f"unknown subagent {agent}")

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

    api_key = os.environ.get("XAI_API_KEY")
    if not api_key:
        meta["error"] = "XAI_API_KEY not set — grok_adapter is scaffold-only until configured"
        meta["flagged"] = True
        return None, meta

    # Ask for JSON only; schema is attached as instruction (API may not support
    # the same --json-schema flag as Claude Code). Validate shape lightly here;
    # full jsonschema checks can be added when this path goes live.
    user = (
        "Return ONLY a JSON object matching this schema. No markdown fences.\n\n"
        f"SCHEMA:\n{schema}\n\n"
        f"INPUT:\n{body}\n"
    )

    req_body = json.dumps({
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "temperature": 0,
    }).encode("utf-8")

    req = urllib.request.Request(
        API_URL,
        data=req_body,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        meta["error"] = f"HTTP {e.code}: {e.read()[:300]!r}"
        meta["flagged"] = True
        return None, meta
    except Exception as e:
        meta["error"] = f"{type(e).__name__}: {e}"
        meta["flagged"] = True
        return None, meta

    try:
        content = raw["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError):
        meta["error"] = f"unexpected API envelope: {str(raw)[:200]}"
        meta["flagged"] = True
        return None, meta

    result = _extract_json(content)
    if result is None:
        meta["error"] = "unparseable JSON from model"
        meta["flagged"] = True
        return None, meta

    return result, meta


def preflight() -> bool:
    print("GROK adapter — pure-function path, SEPARATE from Claude.")
    print(f"PROMPT_VERSION={PROMPT_VERSION} (shared with claude_adapter)")
    print("models:")
    for t in ("A", "B", "C"):
        print(f"  {t}: {TIER_MODEL[t]}")
    if not os.environ.get("XAI_API_KEY"):
        print("BLOCKED: XAI_API_KEY not set. Scaffold loads; live calls will fail clear.")
        print("  Export XAI_API_KEY to enable. Test SEPARATELY from Claude runs.")
        print("  Never merge Grok + Claude extraction fields into one score silently.")
        return False
    print("XAI_API_KEY present. Still require anchor eval before trusting scores.")
    return True


if __name__ == "__main__":
    import sys
    sys.exit(0 if preflight() else 1)
