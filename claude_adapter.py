"""
The ONE place in this codebase that talks to a model.

Everything else is deterministic. If you find yourself importing this module
into dedup.py or scoring.py, stop -- those have right answers and must not
have a model in the loop.

Runs subagents as PURE FUNCTIONS via Claude Code headless mode, on the
CLAUDE SUBSCRIPTION. No paid model API, no key to provision:

    claude -p --safe-mode --output-format json --json-schema <schema> \
           --system-prompt <prompt> --tools "" --model <id> --max-turns 1

Why --safe-mode: it makes the invocation hermetic while leaving auth alone.
It disables CLAUDE.md, skills, plugins, hooks, MCP servers, custom agents,
output styles and keybindings; the help text is explicit that "auth, model
selection, built-in tools, and permissions work normally". A subagent must
produce the same output on your laptop, on a teammate's machine, and in CI.
Ambient state leaking into an extraction is exactly the kind of
irreproducibility this architecture exists to prevent.

Why --tools "" and --system-prompt (not --append-): a pure function needs no
tools and no coding-assistant scaffolding, and both cost input tokens on every
call. See the measurement at the cmd construction below.

Why --max-turns 1: these are pure functions. No tools, no loop. If a subagent
is taking multiple turns, something is wrong with the prompt, not the budget.

CLI FLAGS DRIFT. This was written against Claude Code 2.1.226 (Aug 2026).
Run `claude --help` and fix THIS FILE if invocation breaks. That is the entire
point of putting it in one place.

RESOLVED 2026-08-06: --json-schema and --system-prompt both take RAW CONTENT,
not file paths. `claude --help` documents --json-schema with an inline JSON
example, and --system-prompt has a separate --system-prompt-file sibling. The
code below is correct; do not "fix" it to temp files.

MEASURED 2026-08-09, CLI 2.1.226 -- why this file no longer uses --bare.
--bare is hermetic but reads ONLY a paid API key (never OAuth, never the
keychain), which made it unrunnable here. pilot_adapter recorded on 2026-08-06
that NO flag then disabled CLAUDE.md discovery -- only an empty cwd -- and that
plugins and auto-memory still loaded regardless. --safe-mode closes both.
Re-run of that exact canary experiment, from a directory whose CLAUDE.md said
"end every response with CANARY7788":

    claude -p                 -> LEAKED   ("OK\\n\\nCANARY7788")
    claude -p --safe-mode     -> CLEAN    ("OK")

and a full production-shaped call (schema + pinned model + one turn) from that
same poisoned directory, with no API key in the environment, returned
schema-valid JSON with a correct evidence span.

RESIDUAL DIFFERENCE FROM --bare, stated rather than hidden: --safe-mode still
permits LSP, background prefetches, attribution and keychain reads (the last is
how it authenticates). None of them enter the model's input, so none can change
an extraction. One ancillary claude-haiku-4-5 call also appears in modelUsage
per invocation; it does not produce the structured output, which comes from the
pinned tier model.

THE REAL CEILING IS THROUGHPUT, NOT AUTH. A subscription is rate-limited by
time: measured 2026-08-06, a 10-study batch burned 43 calls against the session
limit. The 38x token reduction below buys a lot of room, but MAX_CONCURRENCY
and the _FATAL usage-limit strings still matter. A limit hit is fatal, not
retryable.
"""

from __future__ import annotations
import subprocess, json, hashlib, os, time, sqlite3, threading
from pathlib import Path
from dataclasses import dataclass, field

ROOT = Path(__file__).parent
SCHEMAS = ROOT / "schemas"
PROMPTS = ROOT / "prompts"
# SP_LLM_CACHE points this at a scratch file so an A/B arm can be measured COLD.
# Without it every arm after the first reads the shared agents from cache and
# reports near-zero tokens, which makes the arms incomparable.
CACHE_DB = Path(os.environ.get("SP_LLM_CACHE") or (ROOT / "out" / "llm_cache.sqlite"))
SHARED_PROMPT = PROMPTS / "_shared.md"

# Bump when you edit ANY prompt (including _shared.md). This is in the cache key.
# Forget to bump it and you will silently serve stale extractions forever.
# v1.8 (2026-08-09): S6B added -- batched outcome mapping, one call per study
# instead of one per claim. Same rules, same vocabulary, same bar for null.
# v1.7 (2026-08-08): S3 reports population_axes.health_status. The first four
# axes could not express "this trial was in patients", so a Huntington's trial
# matched a general-adult product exactly.
# v1.6 (2026-08-08): S2 reports results_table + per-study design. SR-table trials
# now enter evidence mass, so S2's output moves scores and not just confidence.
# v1.5 (2026-08-07): S3 prompt shortened, SR label resolve, review_methods.
PROMPT_VERSION = "v1.8"

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
    # Tier C moved opus-5 -> sonnet-5 on 2026-08-09, WITH effort=high below.
    # MEASURED, same 7 creatine RCTs, batched S6B, each arm cold:
    #
    #   B  opus-5   default   S6B $0.276  5 non-null mappings  0 conflicts  112s
    #   D  sonnet-5 high      S6B $0.176  5 non-null mappings  0 conflicts   81s
    #   E  sonnet-5 xhigh     S6B $0.206  4 non-null mappings  0 conflicts   88s
    #   F  opus-4-8 default   S6B $0.277  5 non-null mappings  0 conflicts   86s
    #
    # D is -36% on the agent that dominates cost, with the SAME five mappings
    # and no disagreement with opus on any non-null mapping. F buys nothing over
    # opus-5. E is the interesting one: MORE effort mapped LESS -- it nulled the
    # single ambiguous claim ("dACI association with leg/back strength"), which
    # is defensible under S6's own "prefer null when unsure" rule but is lost
    # evidence, and it cost 36% more output tokens to get there.
    #
    # SAMPLE IS 7 STUDIES and the 28 calibration anchors have still never been
    # run. SPEC 15 calls tiers "a prior, not a measurement"; this is a small
    # measurement, not the anchor eval. Revert with SP_MODEL_C=claude-opus-5.
    "C": os.environ.get("SP_MODEL_C", "claude-sonnet-5"),
}

# Tier -> reasoning effort, or None to omit the flag and take the CLI default.
#
# Unset by default ON PURPOSE. Effort is a quality lever, not a token lever:
# measured 2026-08-09 on an S8-shaped call, --effort low produced 745 output
# tokens and --effort high 672, both correct. It earns its place only where a
# CHEAPER MODEL would otherwise be unsafe -- raise effort to buy back the
# quality, and pocket the difference in model price.
#
# Valid levels: low, medium, high, xhigh, max. Verified working with
# `-p --safe-mode` returning schema-valid output.
TIER_EFFORT = {
    "A": os.environ.get("SP_EFFORT_A") or None,
    "B": os.environ.get("SP_EFFORT_B") or None,
    # C is 'high' and it is NOT optional: it is what pays for tier C running on
    # sonnet instead of opus. Dropping to sonnet at default effort is arm C of
    # the earlier per-claim test, which was the only arm to fail a study.
    "C": os.environ.get("SP_EFFORT_C", "high") or None,
}
VALID_EFFORT = ("low", "medium", "high", "xhigh", "max")

# Hard ceiling per subagent call, in USD. The CLI enforces it, so a runaway
# retry loop or a pathologically long full text cannot silently spend a fortune
# across a multi-ingredient run. Raise deliberately, never to make a call pass.
MAX_BUDGET_USD = float(os.environ.get("SP_MAX_BUDGET_USD", "0.50"))

# Concurrency is a fetch-side property (Amdahl -- the bottleneck is retrieval,
# not tokens), but the model boundary needs its own ceiling so a wide fan-out
# cannot open 200 CLI subprocesses at once.
# 40, to sit just under grok_adapter's 43. MEASURED 2026-08-09, and the old
# default of 6 was costing an order of magnitude of wall-clock for no reason:
#
#   Grok  2026-08-07: concurrency 43, avg latency 113.6s/call, 10.8% fail
#   Claude          : concurrency  6, avg latency ~15s/call,   0% fail
#
# Claude calls are ~8x FASTER per call and the run was still slower, purely on
# width. 80 studies is ~35 min at Grok's settings and ~6 min at these.
#
# Safe to raise now for a reason that did not hold when 6 was chosen: since the
# --safe-mode switch a call carries 38x fewer input tokens, so the subscription's
# time-based ceiling is much further away. And a limit hit is in _FATAL -- it
# fails loudly on the first call, it does not silently return nulls that read as
# "this study reported nothing". Lower it if failures appear; do not raise it to
# make a slow run finish.
MAX_CONCURRENCY = int(os.environ.get("SP_MAX_CONCURRENCY", "40"))
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
    # Batched S6: same rules, whole study in one call. Opt in with SP_S6_BATCH=1.
    # S6 fires once per CLAIM, so the ~1 300-token fixed overhead (shared rules
    # + S6 rules + schema + vocabulary) is paid ~8.8x per study while the
    # variable part is one short string. See workers._map_outcomes.
    "S6B": ("C", "s6b_outcome_batch.json", "s6b_outcome_batch.md"),
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

    tokens: dict = field(default_factory=lambda: {"input": 0, "cache_write": 0,
                                                  "cache_read": 0, "output": 0})

    def add(self, agent, cost, cached=False, failed=False, tokens=None, model=None):
        a = self.by_agent.setdefault(agent, {
            "calls": 0, "cost": 0.0, "hits": 0, "fail": 0, "model": None,
            "input": 0, "cache_write": 0, "cache_read": 0, "output": 0})
        if model:
            a["model"] = model
        if cached:
            self.cache_hits += 1; a["hits"] += 1; return
        self.calls += 1; a["calls"] += 1
        self.cost_usd += cost; a["cost"] += cost
        for k, v in (tokens or {}).items():
            if k in self.tokens:
                self.tokens[k] += v; a[k] += v
        if failed:
            self.failures += 1; a["fail"] += 1

    def report(self):
        t = self.tokens
        # "API-equivalent", not "spent": a subscription bills nothing per call.
        lines = [f"calls={self.calls} cache_hits={self.cache_hits} "
                 f"failures={self.failures} "
                 f"tokens in={t['input']} cache_w={t['cache_write']} "
                 f"cache_r={t['cache_read']} out={t['output']} "
                 f"API-equivalent=${self.cost_usd:.3f} (subscription spend $0)"]
        for k, v in sorted(self.by_agent.items()):
            lines.append(f"  {k}: model={v.get('model') or '-'} calls={v['calls']} "
                         f"hits={v['hits']} fail={v['fail']} "
                         f"in={v['input']} cache_w={v['cache_write']} "
                         f"cache_r={v['cache_read']} out={v['output']} "
                         f"${v['cost']:.3f}")
        return "\n".join(lines)

    def as_dict(self) -> dict:
        """Structured form for run_context, so reports render the same numbers."""
        return {
            "calls": self.calls, "cache_hits": self.cache_hits,
            "failures": self.failures,
            "api_equivalent_usd": round(self.cost_usd, 4),
            "subscription_spend_usd": 0.0,
            "tokens": dict(self.tokens),
            "by_agent": {k: dict(v) for k, v in self.by_agent.items()},
        }


USAGE = Usage()
_lock = threading.Lock()


def _cache():
    CACHE_DB.parent.mkdir(parents=True, exist_ok=True)
    c = sqlite3.connect(CACHE_DB, check_same_thread=False)
    c.execute("CREATE TABLE IF NOT EXISTS c (k TEXT PRIMARY KEY, v TEXT, cost REAL)")
    return c


_CONN = _cache()


def _key(agent: str, model: str, payload: str, effort: str | None = None) -> str:
    # content + prompt_version + model + effort. All four matter.
    #
    # EFFORT IS IN THE KEY for the same reason the model id is: it changes what
    # comes back. Leave it out and an A/B arm at --effort xhigh silently reads
    # the previous arm's answers from cache and reports them as its own, which
    # is the PROMPT_VERSION failure mode (invariant 3) reached through a flag
    # instead of a prompt. Added 2026-08-09 with TIER_EFFORT.
    h = hashlib.sha256()
    h.update(agent.encode()); h.update(b"\0")
    h.update(PROMPT_VERSION.encode()); h.update(b"\0")
    h.update(model.encode()); h.update(b"\0")
    h.update((effort or "").encode()); h.update(b"\0")
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


def _envelope_tokens(raw: str) -> dict:
    """
    Token counts from the CLI envelope. Separate from _extract_payload so that
    function keeps its two-value contract (pilot_adapter unpacks it).

    WHY BOTH NUMBERS MATTER. On a subscription the per-call spend is zero, so
    `total_cost_usd` is not what this run cost -- it is what the SAME work would
    have cost metered through the API. That is the only honest way to state the
    price of this pipeline to someone deciding whether to run it, and it is why
    the run report carries "API-equivalent" rather than "spent".

    Cache-read tokens are counted apart from fresh input because they are the
    cheap ones; a run whose input is mostly cache_read is far cheaper per study
    than the raw input total suggests.
    """
    try:
        env = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return {}
    u = env.get("usage") or {}
    return {
        "input": int(u.get("input_tokens") or 0),
        "cache_write": int(u.get("cache_creation_input_tokens") or 0),
        "cache_read": int(u.get("cache_read_input_tokens") or 0),
        "output": int(u.get("output_tokens") or 0),
    }


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
    effort = TIER_EFFORT.get(tier)
    if effort and effort not in VALID_EFFORT:
        # Fail loudly. An unrecognised level is how grok-4.3 made S8 fail 0/80:
        # a bad flag value that the CLI rejects turns every call into a partial
        # failure that reads as "this study reported nothing".
        raise ValueError(f"SP_EFFORT_{tier}={effort!r} is not one of {VALID_EFFORT}")

    schema = (SCHEMAS / schema_f).read_text()
    system = _system_prompt(prompt_f)
    body = json.dumps(payload, ensure_ascii=False, sort_keys=True)

    k = _key(agent, model, body, effort)
    with _lock:
        row = _CONN.execute("SELECT v FROM c WHERE k=?", (k,)).fetchone()
    if row:
        USAGE.add(agent, 0.0, cached=True)
        return json.loads(row[0]), {"cached": True, "model": model,
                                    "effort": effort}

    cmd = [
        "claude", "-p", "--safe-mode",
        "--output-format", "json",
        "--json-schema", schema,
        # REPLACE the default system prompt, do not append to it. Measured
        # 2026-08-09 on CLI 2.1.226, identical S1 call, subscription auth:
        #   --append-system-prompt (default prompt + tool defs kept)  29 059 in
        #   --system-prompt + --tools ""                                  755 in
        # 38x. The default prompt is coding-assistant scaffolding a pure
        # extraction function has no use for, and on a subscription the ceiling
        # is throughput, so this is the difference between 40 studies and a
        # corpus. Both returned the same design + evidence span.
        "--system-prompt", system,
        "--tools", "",
        "--model", model,
        "--max-turns", "1",
        "--max-budget-usd", str(MAX_BUDGET_USD),
    ]
    if effort:
        cmd += ["--effort", effort]

    last_err, timeouts = None, 0
    for attempt in range(retries + 1):
        try:
            with _slots:
                proc = subprocess.run(cmd, input=body, capture_output=True,
                                      text=True, timeout=timeout)
        except subprocess.TimeoutExpired:
            timeouts += 1
            last_err = f"timeout after {timeout}s (attempt {attempt + 1})"
            # A broken auth state makes the CLI hang rather than error, so
            # _is_fatal never sees a message and the call burns retries x
            # timeout -- 9 minutes per study at the defaults. Two hangs in a row
            # is a configuration problem, not a slow model.
            if timeouts >= 2:
                last_err += " -- hung twice; run `claude auth status`"
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
        toks = _envelope_tokens(proc.stdout)
        if result is None:
            last_err = "schema violation / unparseable envelope"
            USAGE.add(agent, cost, failed=True, tokens=toks, model=model)
            time.sleep(2 ** attempt); continue

        USAGE.add(agent, cost, tokens=toks, model=model)
        with _lock:
            _CONN.execute("INSERT OR REPLACE INTO c VALUES (?,?,?)",
                          (k, json.dumps(result), cost))
            _CONN.commit()
        return result, {"cached": False, "model": model, "cost": cost,
                        "effort": effort}

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

    # Auth is the Claude subscription. --safe-mode reads it normally, so the
    # only question is whether this machine is logged in. `claude auth status`
    # answers it in one call -- cheaper than discovering it 200 calls into a
    # run, which is what the old key check existed to prevent.
    try:
        a = subprocess.run(["claude", "auth", "status"], capture_output=True,
                           text=True, timeout=30)
        signed_in = a.returncode == 0 and "not logged in" not in a.stdout.lower()
    except (FileNotFoundError, subprocess.TimeoutExpired):
        signed_in = False
    if not signed_in:
        print("BLOCKED: this machine is not signed in to Claude.")
        print("  Run `claude` once and complete /login, or `claude setup-token`")
        print("  for a long-lived token on a headless box or in CI.")
        print("  Do NOT drop --safe-mode to work around this -- see invariant 2.")
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
