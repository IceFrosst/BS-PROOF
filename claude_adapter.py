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

RESOLVED 2026-08-06: --json-schema and --append-system-prompt both take RAW
CONTENT, not file paths. `claude --help` documents --json-schema with an inline
JSON example, and --append-system-prompt has a separate --append-system-prompt-file
sibling. The code below is correct; do not "fix" it to temp files.

ROUND TRIP VERIFIED 2026-08-06 via pilot_adapter (subscription auth, non-bare).
S3/S4/S5/S6/S7/S8 all returned schema-valid output with evidence spans. THIS
file's --bare path is still unexercised because --bare requires
ANTHROPIC_API_KEY, which is not yet provisioned.
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
PROMPT_VERSION = "v1.2"  # bumped 2026-08-06: S3 now emits the four population axes

# Tier -> model. FULL IDs, NOT ALIASES.
#
# An alias like "sonnet" resolves to "the latest model" and the alias STRING is
# what _key() hashes. When the alias moves to a new model, cached extractions
# keep hashing to the same key -- so the cache serves output from a model that
# is no longer in use, while fresh calls come from a different model under the
# same key. That is the PROMPT_VERSION failure mode (invariant 3) with no
# version to bump, and it silently breaks "the same bottle scores the same
# tomorrow". Pinning is not an optimisation here; it is the invariant.
#
# Change these after you A/B on the 28 anchors, not before. SPEC.md section 15.
TIER_MODEL = {
    "A": os.environ.get("SP_MODEL_A", "claude-haiku-4-5-20251001"),
    "B": os.environ.get("SP_MODEL_B", "claude-sonnet-5"),
    "C": os.environ.get("SP_MODEL_C", "claude-opus-5"),
}

# Hard ceiling per subagent call, in USD. The CLI enforces it, so a runaway
# retry loop or a pathologically long full text cannot silently spend a fortune
# across a multi-ingredient run. Raise deliberately, never to make a call pass.
MAX_BUDGET_USD = float(os.environ.get("SP_MAX_BUDGET_USD", "0.50"))

# Concurrency is a fetch-side property (Amdahl -- the bottleneck is retrieval,
# not tokens), but the model boundary needs its own ceiling so a wide fan-out
# cannot open 200 CLI subprocesses at once.
MAX_CONCURRENCY = int(os.environ.get("SP_MAX_CONCURRENCY", "6"))
_slots = threading.Semaphore(MAX_CONCURRENCY)

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


def _envelope_error(raw: str) -> str:
    """The CLI's own error text, which it prints to stdout, not stderr."""
    try:
        env = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return (raw or "").strip()
    res = env.get("result")
    if isinstance(res, str) and res.strip():
        return res.strip()
    return str(env.get("api_error_status") or env.get("terminal_reason") or "").strip()


# Failures no amount of retrying will fix. Fail loudly on the first attempt
# rather than burning 3 backoffs per call across a whole extraction run.
_FATAL = ("not logged in", "please run /login", "invalid api key",
          "authentication_error", "credit balance", "max-budget",
          # Subscription throughput ceiling. Measured 2026-08-06: a 10-study
          # creatine batch burned 43 calls against it. Retrying cannot help --
          # the limit is time-based -- and every retry is a wasted minute.
          "session limit", "usage limit", "rate limit", "rate_limit")


def _is_fatal(detail: str) -> bool:
    d = (detail or "").lower()
    return any(f in d for f in _FATAL)


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
        "--max-budget-usd", str(MAX_BUDGET_USD),
    ]

    last_err, timeouts = None, 0
    for attempt in range(retries + 1):
        try:
            with _slots:
                proc = subprocess.run(cmd, input=body, capture_output=True,
                                      text=True, timeout=timeout)
        except subprocess.TimeoutExpired:
            timeouts += 1
            last_err = f"timeout after {timeout}s (attempt {attempt + 1})"
            # A MALFORMED api key makes the CLI hang rather than error, so
            # _is_fatal never sees a message and the call burns retries x
            # timeout -- 9 minutes per study at the defaults. Two hangs in a row
            # is a configuration problem, not a slow model.
            if timeouts >= 2:
                last_err += " -- hung twice; check ANTHROPIC_API_KEY is well-formed"
                break
            time.sleep(2 ** attempt); continue

        if proc.returncode != 0:
            # The CLI reports the actual reason ("Not logged in", auth errors,
            # budget) in the JSON envelope on STDOUT and leaves stderr empty.
            # Reading only stderr gives the operator "exit 1: " and nothing else.
            detail = _envelope_error(proc.stdout) or proc.stderr.strip()
            last_err = f"exit {proc.returncode}: {detail[:300]}"
            if _is_fatal(detail):
                break            # auth/config failure -- retrying cannot fix it
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

    # --bare reads ANTHROPIC_API_KEY or an apiKeyHelper and NOTHING else -- not
    # OAuth, not the keychain. `claude auth status` can say loggedIn:true with a
    # subscription and every subagent call will still fail "Not logged in".
    # Catch it here rather than 200 calls into a run.
    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("BLOCKED: ANTHROPIC_API_KEY is not set.")
        print("  --bare never reads OAuth or the keychain, so a Claude.ai")
        print("  subscription cannot authenticate subagent calls. Get a key at")
        print("  console.anthropic.com and export ANTHROPIC_API_KEY.")
        print("  Do NOT drop --bare to work around this -- see invariant 2.")
        return False

    missing = [f for _, (_, s, pr) in AGENTS.items()
               for f in ((SCHEMAS / s), (PROMPTS / pr)) if not f.exists()]
    if SHARED_PROMPT.exists() is False:
        print("warning: prompts/_shared.md missing — universal rules will not be injected")
    if missing:
        print("missing files:", *missing, sep="\n  "); return False
    print("8 subagents wired. models (PINNED, not aliases):")
    for tier in ("A", "B", "C"):
        print(f"  {tier}: {TIER_MODEL[tier]}")
    if any("-" not in m for m in TIER_MODEL.values()):
        print("  WARNING: a tier looks like an ALIAS. Aliases float to the latest")
        print("  model while the cache key does not change -- see TIER_MODEL.")
    print(f"PROMPT_VERSION={PROMPT_VERSION}  shared_rules={'yes' if SHARED_PROMPT.exists() else 'NO'}")
    print(f"budget/call=${MAX_BUDGET_USD}  max_concurrency={MAX_CONCURRENCY}")
    return True


if __name__ == "__main__":
    import sys
    sys.exit(0 if preflight() else 1)
