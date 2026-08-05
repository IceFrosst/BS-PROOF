"""
The ONE place in this codebase that talks to a model.

Everything else is deterministic. If you find yourself importing this module
into dedup.py or scoring.py, stop -- those have right answers and must not
have a model in the loop.

Runs subagents as PURE FUNCTIONS via Claude Code headless mode:

    claude -p --bare --output-format json --json-schema <schema> \
           --append-system-prompt <prompt> --model <alias> --max-turns 1

Why --bare: it makes the invocation hermetic. No CLAUDE.md discovery, no local
hooks, no MCP servers, no auto-memory. A subagent must produce the same output
on your laptop, on a teammate's machine, and in CI. Ambient state leaking into
an extraction is exactly the kind of irreproducibility this architecture exists
to prevent.

Why --max-turns 1: these are pure functions. No tools, no loop. If a subagent
is taking multiple turns, something is wrong with the prompt, not the budget.

CLI FLAGS DRIFT. This was written against Claude Code ~2.1.220 (Aug 2026).
Run `claude --help` and fix THIS FILE if invocation breaks. That is the entire
point of putting it in one place.

OPEN VERIFICATION (see REVIEW.md): confirm whether --json-schema and
--append-system-prompt expect file paths or raw content. Current code passes
raw content. Smoke-test before production extraction runs.
"""

from __future__ import annotations
import subprocess, json, hashlib, os, time, sqlite3, threading
from pathlib import Path
from dataclasses import dataclass, field

ROOT = Path(__file__).parent
SCHEMAS = ROOT / "schemas"
PROMPTS = ROOT / "prompts"
CACHE_DB = ROOT / "out" / "llm_cache.sqlite"
SHARED_PROMPT = PROMPTS / "_shared.md"

# Bump when you edit ANY prompt (including _shared.md). This is in the cache key.
# Forget to bump it and you will silently serve stale extractions forever.
PROMPT_VERSION = "v1.1"  # bumped 2026-08-05: _shared.md now prepended to every call

# Tier -> model alias. Change these after you A/B on the 28 anchors,
# not before. See SPEC.md section 15.
TIER_MODEL = {
    "A": os.environ.get("SP_MODEL_A", "haiku"),
    "B": os.environ.get("SP_MODEL_B", "sonnet"),
    "C": os.environ.get("SP_MODEL_C", "opus"),
}

# S-id -> (tier, schema file, prompt file)
# S7 raised to B: form + elemental-dose extraction is high-stakes (5x dose errors).
AGENTS = {
    "S1": ("A", "s1_design.json",     "s1_design.md"),
    "S2": ("B", "s2_synthesis.json",  "s2_synthesis.md"),
    "S3": ("B", "s3_study.json",      "s3_study.md"),
    "S4": ("B", "s4_rob.json",        "s4_rob.md"),
    "S5": ("B", "s5_conclusion.json", "s5_conclusion.md"),
    "S6": ("C", "s6_outcome.json",    "s6_outcome.md"),
    "S7": ("B", "s7_form.json",       "s7_form.md"),
    "S8": ("A", "s8_funding.json",    "s8_funding.md"),
}


@dataclass
class Usage:
    calls: int = 0
    cache_hits: int = 0
    cost_usd: float = 0.0
    failures: int = 0
    by_agent: dict = field(default_factory=dict)

    def add(self, agent, cost, cached=False, failed=False):
        a = self.by_agent.setdefault(agent, {"calls": 0, "cost": 0.0, "hits": 0, "fail": 0})
        if cached:
            self.cache_hits += 1; a["hits"] += 1; return
        self.calls += 1; a["calls"] += 1
        self.cost_usd += cost; a["cost"] += cost
        if failed:
            self.failures += 1; a["fail"] += 1

    def report(self):
        lines = [f"calls={self.calls} cache_hits={self.cache_hits} "
                 f"failures={self.failures} cost=EUR~{self.cost_usd:.3f}"]
        for k, v in sorted(self.by_agent.items()):
            lines.append(f"  {k}: calls={v['calls']} hits={v['hits']} "
                         f"fail={v['fail']} cost={v['cost']:.3f}")
        return "\n".join(lines)


USAGE = Usage()
_lock = threading.Lock()


def _cache():
    CACHE_DB.parent.mkdir(parents=True, exist_ok=True)
    c = sqlite3.connect(CACHE_DB, check_same_thread=False)
    c.execute("CREATE TABLE IF NOT EXISTS c (k TEXT PRIMARY KEY, v TEXT, cost REAL)")
    return c


_CONN = _cache()


def _key(agent: str, model: str, payload: str) -> str:
    # content + prompt_version + model. All three matter.
    h = hashlib.sha256()
    h.update(agent.encode()); h.update(b"\0")
    h.update(PROMPT_VERSION.encode()); h.update(b"\0")
    h.update(model.encode()); h.update(b"\0")
    h.update(payload.encode())
    return h.hexdigest()


def _system_prompt(prompt_f: str) -> str:
    """Universal rules first, then the agent-specific prompt."""
    shared = SHARED_PROMPT.read_text() if SHARED_PROMPT.exists() else ""
    specific = (PROMPTS / prompt_f).read_text()
    if shared:
        return shared.rstrip() + "\n\n---\n\n" + specific
    return specific


def _extract_payload(raw: str):
    """
    Claude Code's JSON envelope shape has moved around between versions.
    Try the documented locations in order rather than assuming one.
    """
    try:
        env = json.loads(raw)
    except json.JSONDecodeError:
        return None, 0.0

    cost = float(env.get("total_cost_usd") or 0.0)

    # 1. top-level structured_output (used with --json-schema)
    if isinstance(env.get("structured_output"), dict):
        return env["structured_output"], cost

    # 2. result as dict with content blocks
    res = env.get("result")
    if isinstance(res, dict):
        blocks = res.get("content") or []
        for b in blocks:
            if b.get("type") == "text":
                try:
                    return json.loads(b["text"]), cost
                except json.JSONDecodeError:
                    pass

    # 3. result as a bare JSON string
    if isinstance(res, str):
        try:
            return json.loads(res), cost
        except json.JSONDecodeError:
            pass

    return None, cost


def call(agent: str, payload: dict, timeout: int = 180, retries: int = 2):
    """
    Run one subagent. Returns (result_dict | None, meta).

    Contract, per SPEC.md section 16:
      - schema violation -> retry x2 -> None + flag. NEVER repair by inference.
      - None from S6 means DISCARD the extraction, not 'try something else'.
    """
    if agent not in AGENTS:
        raise KeyError(f"unknown subagent {agent}")
    tier, schema_f, prompt_f = AGENTS[agent]
    model = TIER_MODEL[tier]

    schema = (SCHEMAS / schema_f).read_text()
    system = _system_prompt(prompt_f)
    body = json.dumps(payload, ensure_ascii=False, sort_keys=True)

    k = _key(agent, model, body)
    with _lock:
        row = _CONN.execute("SELECT v FROM c WHERE k=?", (k,)).fetchone()
    if row:
        USAGE.add(agent, 0.0, cached=True)
        return json.loads(row[0]), {"cached": True, "model": model}

    cmd = [
        "claude", "-p", "--bare",
        "--output-format", "json",
        "--json-schema", schema,
        "--append-system-prompt", system,
        "--model", model,
        "--max-turns", "1",
    ]

    last_err = None
    for attempt in range(retries + 1):
        try:
            proc = subprocess.run(cmd, input=body, capture_output=True,
                                  text=True, timeout=timeout)
        except subprocess.TimeoutExpired:
            last_err = "timeout"; time.sleep(2 ** attempt); continue

        if proc.returncode != 0:
            last_err = f"exit {proc.returncode}: {proc.stderr[:300]}"
            time.sleep(2 ** attempt); continue

        result, cost = _extract_payload(proc.stdout)
        if result is None:
            last_err = "schema violation / unparseable envelope"
            USAGE.add(agent, cost, failed=True)
            time.sleep(2 ** attempt); continue

        USAGE.add(agent, cost)
        with _lock:
            _CONN.execute("INSERT OR REPLACE INTO c VALUES (?,?,?)",
                          (k, json.dumps(result), cost))
            _CONN.commit()
        return result, {"cached": False, "model": model, "cost": cost}

    USAGE.add(agent, 0.0, failed=True)
    return None, {"error": last_err, "model": model, "flagged": True}


def preflight() -> bool:
    """Fail loudly and early rather than 500 confusing errors deep in a run."""
    try:
        p = subprocess.run(["claude", "--version"], capture_output=True,
                           text=True, timeout=30)
    except FileNotFoundError:
        print("claude CLI not found. npm install -g @anthropic-ai/claude-code")
        return False
    except subprocess.TimeoutExpired:
        print("claude --version timed out")
        return False
    if p.returncode != 0:
        print("claude CLI present but not working:", p.stderr[:200]); return False
    print("claude CLI:", p.stdout.strip())

    missing = [f for _, (_, s, pr) in AGENTS.items()
               for f in ((SCHEMAS / s), (PROMPTS / pr)) if not f.exists()]
    if SHARED_PROMPT.exists() is False:
        print("warning: prompts/_shared.md missing — universal rules will not be injected")
    if missing:
        print("missing files:", *missing, sep="\n  "); return False
    print(f"8 subagents wired. models: A={TIER_MODEL['A']} "
          f"B={TIER_MODEL['B']} C={TIER_MODEL['C']}")
    print(f"PROMPT_VERSION={PROMPT_VERSION}  shared_rules={'yes' if SHARED_PROMPT.exists() else 'NO'}")
    return True


if __name__ == "__main__":
    import sys
    sys.exit(0 if preflight() else 1)
