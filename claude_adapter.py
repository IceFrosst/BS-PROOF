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


def _claude_bin() -> str:
    """
    Path to the Claude CLI, resolved rather than assumed.

    MEASURED 2026-08-11: a run died with "claude CLI not found. npm install -g
    @anthropic-ai/claude-code" while the CLI was installed, executable and
    working -- `~/.local/bin` simply was not on PATH in that shell, because the
    profile adds it only for interactive sessions. The install advice sent the
    reader to reinstall a binary they already had, which is the worst kind of
    error message: confidently wrong about the cause.

    So: PATH first (respects a deliberate override), then the standard user
    install dir. `SP_CLAUDE_BIN` overrides both for an unusual install.
    """
    import shutil
    override = os.environ.get("SP_CLAUDE_BIN")
    if override:
        return override
    found = shutil.which("claude")
    if found:
        return found
    fallback = Path.home() / ".local" / "bin" / "claude"
    return str(fallback) if fallback.exists() else "claude"

# Bump when you edit ANY prompt (including _shared.md). This is in the cache key.
# Forget to bump it and you will silently serve stale extractions forever.
# v1.19 (2026-08-12): S7 dose coverage. Measured on the v1.18 run: 76 of 148
# studies extracted NO dose, and 51% of those were fixable -- 25 dose per kg of
# body weight (no schema field existed, so S7 nulled them) and 12 where the dose
# sentence was truncated out of the text S7 received. New S7 fields
# dose_per_kg_mg + mean_body_mass_kg (the paper's own stated mean mass only,
# never an assumed weight); assemble.study_dose multiplies them
# deterministically, only when both are the paper's numbers. workers._payload
# now ships regex-harvested `dose_snippets` from the FULL text so truncation
# cannot drop the dosing paragraph. Also in this batch of fixes, scoring-side:
# dose_match became study-vs-product (SCORING_MODEL v9) and dose.product_match
# now reports the real product-vs-band tier instead of a dose_basis string.
# v1.18 (2026-08-12): `effect_favours` is about DIRECTION ONLY -- significance is
# irrelevant to it. MEASURED on the first clean v1.17 run: 44 claims reported a
# LARGE magnitude and answered `neither`, which is 17% of all mapped claims and the
# single biggest blocker after "no number at all". Every one was discarded, because
# a large effect that favours neither arm is a contradiction rather than a reading.
# The cause was the v1.17 wording -- "neither: no meaningful difference either way"
# reads like "no SIGNIFICANT difference", so the model answered it for any
# non-significant result no matter how big the effect. `direction` already carries
# significance. A result that missed p<0.05 still points somewhere, and that is the
# whole premise of moving off vote counting. `neither` is now reserved for a
# magnitude genuinely near zero, and `null` for "cannot tell".
# v1.17 (2026-08-11): S5 must report the BETWEEN-ARM CONTRAST, and a bare
# magnitude on a null is directionless. Written hours after v1.16 because a design
# analysis measured two things that made v1.16 insufficient:
#   1. The stored effect_size is an ABSOLUTE MAGNITUDE, not a signed contrast --
#      24 of 24 standardised null_effect values were positive, where a real
#      treatment-minus-control convention puts ~half below zero (P ~ 1e-7). Papers
#      print |d| beside "no significant difference" and S5 copied it. Reading that
#      at face value turns every sized null into a benefit of that magnitude.
#   2. 28 of 67 percent-family claims stored ONE ARM'S own change while the span
#      showed both ("CR +13.8%, PLA -3.5%" stored as 13.8, true contrast 17.3pp),
#      and 4 unit strings embedded the comparator's own value.
# So the prompt now demands the between-arm difference, forbids storing an arm
# mean, and says outright that `effect_favours: null` is the correct answer when a
# null's direction is not recoverable. `pipeline.assemble._effect_s` refuses the
# number unless the ARM IS NAMED, which makes SCORING_MODEL v8 score every
# pre-contract corpus identically to v7 instead of biasing it upward.
# v1.16 (2026-08-11): S5 states `effect_favours` (ingredient | control | neither |
# null) -- WHICH ARM the reported effect_size favours. New schema field.
# Required because the founder chose effect-size-weighted s_value ("do i"), so the
# SIGN of a reported effect now decides the sign of a study's contribution. A
# design analysis found effect_size does NOT follow one sign convention in this
# literature: some papers report a raw measurement difference (a faster sprint
# TIME is a negative number and a good result), others report it pre-oriented
# toward the treatment. Inferring which is a coin flip, and a wrong sign does not
# weaken a score -- it inverts it, undetectably. So the model states the arm.
# Untestable on creatine: all 85 sized+mapped claims there are on higher_better
# outcomes, where raw and oriented signs coincide. It will first matter on
# magnesium (sleep_onset, anxiety) -- see pipeline.assemble._effect_s.
# v1.15 (2026-08-11): S5 must extract effect_size / CI / p_value on EVERY claim,
# including nulls. Measured: of 139 null_effect claims on the four main
# performance outcomes, only 27 carried any number. The numeric fields were
# described only as inputs to `magnitude`, and magnitude is benefit-only, so a
# null read as "no numbers needed" and the point estimate was discarded. That
# interval is the most valuable thing on a null claim -- it is the ONLY way to
# tell an underpowered null ("CI -3.1 to +3.5", answers nothing) from a well-run
# one ("CI -0.3 to +0.5", rules a real effect out), and invariant 7 already
# treats those as opposites. Unblocks the founder decision on vote counting
# (SPEC 13): both candidate fixes need effect-size coverage on nulls, which was
# 19%. Extraction fidelity only -- no scoring change rides on this bump.
# v1.14 (2026-08-11): three fixes from the 22-agent extraction audit
# (docs/history/2026-08-11-extraction-accuracy-audit.md). Targets were chosen by
# SCORE INFLUENCE -- the top 16 contributors by scoring.contributions -- and every
# claimed error survived an adversarial refutation pass. 4 of 16 confirmed:
#   S5: direction must be a BETWEEN-ARM contrast. A four-arm trial reported a
#   significant TIME effect with no group effect and concluded "no additional
#   benefits from creatine"; its creatine-only arm tracked placebo, and it was
#   extracted as a benefit worth +5.06 points. A within-group pre/post sentence no
#   longer establishes direction, and >2-arm trials must name the arm read.
#   S7: `unspecified` means "the paper never says" and nothing else. An
#   abbreviation defined once ("creatine monohydrate (CrM)") IS a stated form --
#   missing that cost the largest single contributor (-15.7) its form credit. And a
#   named form absent from the vocabulary (PEG-creatine) is a DIFFERENT form, not
#   an unstated one; those are opposite messages. `unspecified` now needs its own
#   evidence span.
#   S6B: nearest-neighbour mapping is never the answer -- refuse instead. "Leg
#   extension repetitions-to-failure at 80% 1RM" was filed under exercise_endurance
#   ("sustained submaximal or AEROBIC performance"), so a local muscular-endurance
#   null voted against aerobic endurance. vocab/outcome.json gains
#   `muscular_endurance` (v1 -> v2) and exercise_endurance excludes those phrases,
#   so the deterministic layer refuses the mis-map rather than the model's judgement.
# v1.13 (2026-08-11): two fixes from the muscle_power audit (12 verifiers;
# ~5 of 12 voting nulls wrong). S5 gains per-claim `contrast` -- a 4-arm trial
# with a genuine placebo can still emit a claim comparing creatine+bicarb TO
# creatine, which is evidence about bicarb, and the study-level comparator
# cannot see it. vs_ingredient_arm claims are excluded symmetrically; unclear
# keeps. S6B gains post-fatigue examples -- "RSA after a fatiguing protocol"
# went to muscle_power despite the v1.12 recovery rule.
# v1.12 (2026-08-10): three fixes from the null audit (docs/REVIEW_PENDING.md #4;
# 5 of the 7 muscle_strength nulls that survived every gate were wrong).
#   S3 gains `ingredient_isolated` -- a trial whose every ingredient arm
#   co-administers another active tests a COMBINATION, and 21/143 studies were
#   this shape with a genuine placebo, so the all_arms refusal could not catch
#   them. Third invariant-7 refusal, symmetric, "no"-only, unknown keeps.
#   S6B/S6 gain a construct rule -- "recovery of X after induced damage/fatigue"
#   maps to exercise_recovery, NOT to X. Two audited nulls were damage-recovery
#   kinetics filed as evidence creatine does not build strength, while one of
#   those trials' actual endurance BENEFIT (+11% TTF, p=.017) was credited
#   nowhere.
#   best_text now appends the Limitations section -- the underpowered statement
#   invariant 7 depends on lives there ("only 33 ... decreased our statistical
#   power", PMC12280466, the literal CLAUDE.md example) and METHODS++RESULTS
#   never contained it. Appended to the SHARED blob, not routed per-agent, so
#   the 2026-08-09 cache-sharing measurement stands.
# v1.11 (2026-08-10): S5 may not answer magnitude=`unstated` when it also filled in
# `effect_size`. MEASURED on the 150-study creatine corpus: 359 of 487 benefit
# claims came back `unstated`, and 114 of those carried a number in the same
# object. `scoring.Study.s_value` maps `unstated` and `trivial` to the SAME +0.3
# while any null keeps its full -0.7, so declining to size a benefit scores it as a
# benefit known to be tiny, and it takes 2.33 sized benefits to cancel one null.
# Replaying the dumped extractions with those benefits sized from the numbers
# already present moved muscle_strength from -4 to +7 (d -0.125 -> +0.249) -- the
# largest single lever measured, larger than either scope refusal in
# docs/REVIEW_PENDING.md #4. The prompt now carries explicit thresholds (d>=0.5 or
# >=5% relative = meaningful; d<0.2 or <2% = trivial) so the judgement is not
# re-invented per call, and `unstated` is reserved for genuinely no numeric basis.
# v1.10 (2026-08-10): S3 reports `comparator` and `self_declared_underpowered`.
# Measured on the 80-study creatine corpus: of the 23 null verdicts driving
# muscle_strength and muscle_power negative, 3 came from trials where EVERY arm
# received creatine (timing, schedule, or creatine+X vs creatine) and 6 from
# trials the authors themselves called pilots or reported as under-recruited
# against their own power calculation. Neither is evidence that creatine does
# not work, and both were entering the score at the full -0.7.
# v1.9 (2026-08-10): S5 gains a granularity rule -- ONE claim per distinct
# endpoint construct. It had none, so the same finding measured across a
# sex x timepoint x body-region grid came back as 20 claims, and (before the
# build_ecus fix) each one voted separately in the evidence mass.
# v1.8 (2026-08-09): S6B added -- batched outcome mapping, one call per study
# instead of one per claim. Same rules, same vocabulary, same bar for null.
# v1.7 (2026-08-08): S3 reports population_axes.health_status. The first four
# axes could not express "this trial was in patients", so a Huntington's trial
# matched a general-adult product exactly.
# v1.6 (2026-08-08): S2 reports results_table + per-study design. SR-table trials
# now enter evidence mass, so S2's output moves scores and not just confidence.
# v1.5 (2026-08-07): S3 prompt shortened, SR label resolve, review_methods.
PROMPT_VERSION = "v1.19"

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
# Change these after you A/B on the 35 anchors, not before. SPEC.md section 15.
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
    # SAMPLE IS 7 STUDIES and the 35 calibration anchors have still never been
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
    # A stays UNSET, and that is a measurement, not an oversight. S8 isolated,
    # 7 studies: output was 16,068 (default) / 19,393 (low) / 19,000 (default).
    # Tier A output does not respond to effort at all -- the spread is noise, and
    # 'low' was the highest of the three. Setting it would buy nothing and cost a
    # cache partition (see the one-time 81k cache_write when B switched levels).
    "A": os.environ.get("SP_EFFORT_A") or None,
    # B is 'low'. MEASURED 2026-08-10, S5 isolated, 3 reps per level, same 7 RCTs:
    #
    #   default   null-share 80/76/71%   out_tok mean 16,619   $0.271
    #   low       null-share 68/66/68%   out_tok mean  4,372   $0.089
    #
    # -73% output tokens, -67% cost on the agent with the largest output in the
    # pipeline. Whole-pipeline arms: $0.922 -> $0.460, exactly half.
    #
    # THE QUALITY CHECK THAT MATTERED. Claim-level null share IS consistently
    # ~8pt lower at low effort, with no overlap between the two sets of three
    # reps -- and that is the score-INFLATING direction, so it was worth
    # chasing. It turned out not to be mislabelling: on 15 endpoints both levels
    # extracted, they agreed on direction 15/15 with ZERO null->benefit flips.
    # The difference is WHICH endpoints get picked, which varies run to run at
    # both levels.
    #
    # And after the one-study-one-vote collapse (assemble._one_study_one_vote)
    # it does not reach the score at all: every scored (study, outcome) unit
    # resolves to the same direction at both levels, because the collapse keeps
    # the most conservative claim. Doing that fix first is what made this safe.
    #
    # Sample is 7 studies. SP_EFFORT_B= (empty) reverts.
    "B": os.environ.get("SP_EFFORT_B", "low") or None,
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
    """Thread-safe, audit-friendly model usage for one pipeline process.

    ``total_cost_usd`` in the Claude CLI envelope is an API-equivalent price.
    The extraction path uses a Claude subscription, so the marginal metered
    spend for these calls is zero.  Keeping both concepts in this object makes
    it much harder for a report or dashboard to accidentally merge them.
    """

    calls: int = 0
    cache_hits: int = 0
    cost_usd: float = 0.0
    failures: int = 0
    terminal_failures: int = 0
    retries: int = 0
    by_agent: dict = field(default_factory=dict)
    tokens: dict = field(default_factory=lambda: {"input": 0, "cache_write": 0,
                                                  "cache_read": 0, "output": 0})
    latencies: list[float] = field(default_factory=list)
    peak_concurrency: int = 0
    _in_flight: int = 0
    _activity_started: float | None = None
    _activity_finished: float | None = None
    _records: list[dict] = field(default_factory=list, repr=False)
    _usage_lock: threading.Lock = field(default_factory=threading.Lock,
                                        repr=False, compare=False)

    @staticmethod
    def _new_agent_row(model=None, tier=None, effort=None) -> dict:
        return {
            "calls": 0, "cost": 0.0, "hits": 0, "fail": 0,
            "terminal_failures": 0, "retries": 0,
            "model": model, "tier": tier, "effort": effort,
            "input": 0, "cache_write": 0, "cache_read": 0, "output": 0,
            "latencies": [],
        }

    def _agent_row(self, agent, model=None, tier=None, effort=None) -> dict:
        row = self.by_agent.setdefault(
            agent, self._new_agent_row(model=model, tier=tier, effort=effort))
        if model:
            row["model"] = model
        if tier:
            row["tier"] = tier
        if effort:
            row["effort"] = effort
        return row

    def add_cache_hit(self, agent, *, model=None, tier=None, effort=None) -> None:
        now = time.perf_counter()
        with self._usage_lock:
            if self._activity_started is None:
                self._activity_started = now
            self._activity_finished = now
            self.cache_hits += 1
            row = self._agent_row(agent, model, tier, effort)
            row["hits"] += 1
            self._records.append({
                "agent": agent, "tier": tier, "provider": "anthropic",
                "model": model, "reasoning_effort": effort,
                "prompt_version": PROMPT_VERSION, "cached": True,
                "outcome": "cache_hit", "latency_s": None,
                "api_equivalent_cost": 0.0, "tokens": None,
            })

    def begin_attempt(self, agent, *, model=None, tier=None, effort=None,
                      retry=False) -> float:
        now = time.perf_counter()
        with self._usage_lock:
            if self._activity_started is None:
                self._activity_started = now
            self.calls += 1
            self._in_flight += 1
            self.peak_concurrency = max(self.peak_concurrency, self._in_flight)
            row = self._agent_row(agent, model, tier, effort)
            row["calls"] += 1
            if retry:
                self.retries += 1
                row["retries"] += 1
        return now

    def finish_attempt(self, agent, started: float, *, cost=None, failed=False,
                       tokens=None, model=None, tier=None, effort=None,
                       outcome=None) -> None:
        now = time.perf_counter()
        latency = max(0.0, now - started)
        clean_tokens = {
            key: int((tokens or {}).get(key) or 0)
            for key in ("input", "cache_write", "cache_read", "output")
        } if tokens else None
        cost_amount = float(cost or 0.0)
        with self._usage_lock:
            self._in_flight = max(0, self._in_flight - 1)
            self._activity_finished = now
            self.cost_usd += cost_amount
            self.latencies.append(latency)
            row = self._agent_row(agent, model, tier, effort)
            row["cost"] += cost_amount
            row["latencies"].append(latency)
            if clean_tokens is not None:
                for key, value in clean_tokens.items():
                    self.tokens[key] += value
                    row[key] += value
            if failed:
                self.failures += 1
                row["fail"] += 1
            self._records.append({
                "agent": agent, "tier": tier, "provider": "anthropic",
                "model": model, "reasoning_effort": effort,
                "prompt_version": PROMPT_VERSION, "cached": False,
                "outcome": outcome or ("failed" if failed else "success"),
                "latency_s": round(latency, 4),
                "api_equivalent_cost": (
                    round(cost_amount, 8) if cost is not None else None),
                "tokens": {
                    "fresh_input": clean_tokens["input"],
                    "cache_write": clean_tokens["cache_write"],
                    "cache_read": clean_tokens["cache_read"],
                    "output": clean_tokens["output"],
                } if clean_tokens is not None else None,
            })

    def record_terminal_failure(self, agent, *, model=None, tier=None,
                                effort=None) -> None:
        with self._usage_lock:
            self.terminal_failures += 1
            self._agent_row(agent, model, tier, effort)["terminal_failures"] += 1

    def add(self, agent, cost, cached=False, failed=False, tokens=None, model=None,
            tier=None, effort=None, latency_s=None, retry=False):
        """Backward-compatible helper retained for local callers and tests."""
        if cached:
            self.add_cache_hit(agent, model=model, tier=tier, effort=effort)
            return
        started = self.begin_attempt(agent, model=model, tier=tier,
                                     effort=effort, retry=retry)
        if latency_s is not None:
            started = time.perf_counter() - max(0.0, float(latency_s))
        self.finish_attempt(agent, started, cost=cost, failed=failed,
                            tokens=tokens, model=model, tier=tier, effort=effort)
        if failed:
            self.record_terminal_failure(agent, model=model, tier=tier,
                                         effort=effort)

    @staticmethod
    def _percentile_95(values: list[float]) -> float | None:
        if not values:
            return None
        ordered = sorted(values)
        return ordered[int(0.95 * (len(ordered) - 1))]

    @staticmethod
    def _aggregate(rows: list[dict], key: str) -> list[dict]:
        aggregates: dict[str, dict] = {}
        for row in rows:
            name = row.get(key)
            if not name:
                continue
            bucket = aggregates.setdefault(name, {
                key: name, "calls": 0, "cache_hits": 0, "retries": 0,
                "failures": 0, "terminal_failures": 0,
                "api_equivalent_cost": 0.0,
                "tokens": {"fresh_input": 0, "cache_write": 0,
                           "cache_read": 0, "output": 0},
                "cost_complete": True, "tokens_complete": True,
                "latencies": [],
            })
            bucket["calls"] += row["calls"]
            bucket["cache_hits"] += row["hits"]
            bucket["retries"] += row["retries"]
            bucket["failures"] += row["fail"]
            bucket["terminal_failures"] += row["terminal_failures"]
            row_cost = row.get("api_equivalent_cost")
            if row_cost is None:
                bucket["cost_complete"] = False
            else:
                bucket["api_equivalent_cost"] += row_cost
            row_tokens = row.get("tokens")
            if not isinstance(row_tokens, dict) or any(
                    row_tokens.get(token_key) is None for token_key in
                    ("fresh_input", "cache_write", "cache_read", "output")):
                bucket["tokens_complete"] = False
            else:
                for token_key in ("fresh_input", "cache_write", "cache_read", "output"):
                    bucket["tokens"][token_key] += row_tokens[token_key]
            bucket["latencies"].extend(row.get("latencies_s") or [])
        output = []
        for bucket in aggregates.values():
            latencies = bucket.pop("latencies")
            cost_complete = bucket.pop("cost_complete")
            tokens_complete = bucket.pop("tokens_complete")
            bucket["api_equivalent_cost"] = (
                round(bucket["api_equivalent_cost"], 8) if cost_complete else None)
            if tokens_complete:
                bucket["tokens"]["total"] = sum(bucket["tokens"].values())
            else:
                bucket["tokens"] = {
                    "fresh_input": None, "cache_write": None,
                    "cache_read": None, "output": None, "total": None,
                }
            bucket["average_latency_s"] = (
                round(sum(latencies) / len(latencies), 4) if latencies else None)
            p95 = Usage._percentile_95(latencies)
            bucket["p95_latency_s"] = round(p95, 4) if p95 is not None else None
            output.append(bucket)
        return sorted(output, key=lambda item: str(item.get(key)))

    def report(self):
        snapshot = self.as_dict()
        t = snapshot["tokens"]
        token_text = (
            f"in={t['input']} cache_w={t['cache_write']} "
            f"cache_r={t['cache_read']} out={t['output']}"
            if all(t.get(k) is not None for k in
                   ("input", "cache_write", "cache_read", "output"))
            else "tokens=unavailable")
        cost_text = (
            f"${snapshot['api_equivalent_usd']:.3f}"
            if snapshot.get("api_equivalent_usd") is not None else "unavailable")
        # "API-equivalent", not "spent": a subscription bills nothing per call.
        lines = [f"calls={snapshot['calls']} cache_hits={snapshot['cache_hits']} "
                 f"retries={snapshot['retries']} failures={snapshot['failures']} "
                 f"{token_text} API-equivalent={cost_text} "
                 "(subscription spend $0)"]
        for k, v in sorted(snapshot["by_agent"].items()):
            agent_tokens = v.get("tokens") or {}
            agent_token_text = (
                f"in={agent_tokens['fresh_input']} "
                f"cache_w={agent_tokens['cache_write']} "
                f"cache_r={agent_tokens['cache_read']} "
                f"out={agent_tokens['output']}"
                if agent_tokens.get("total") is not None
                else "tokens=unavailable")
            agent_cost = (
                f"${v['api_equivalent_cost']:.3f}"
                if v.get("api_equivalent_cost") is not None else "unavailable")
            lines.append(f"  {k}: model={v.get('model') or '-'} calls={v['calls']} "
                         f"hits={v['hits']} fail={v['fail']} "
                         f"{agent_token_text} {agent_cost}")
        return "\n".join(lines)

    def as_dict(self) -> dict:
        """Structured form for run_context, so reports render the same numbers."""
        with self._usage_lock:
            live_records = [r for r in self._records if not r.get("cached")]
            missing_tokens = sum(r.get("tokens") is None for r in live_records)
            missing_cost = sum(
                r.get("api_equivalent_cost") is None for r in live_records)
            missing_tokens_by_agent: dict[str, int] = {}
            missing_cost_by_agent: dict[str, int] = {}
            for record in live_records:
                agent_name = str(record.get("agent") or "unknown")
                if record.get("tokens") is None:
                    missing_tokens_by_agent[agent_name] = (
                        missing_tokens_by_agent.get(agent_name, 0) + 1)
                if record.get("api_equivalent_cost") is None:
                    missing_cost_by_agent[agent_name] = (
                        missing_cost_by_agent.get(agent_name, 0) + 1)
            rows = []
            legacy_by_agent = {}
            for agent, value in sorted(self.by_agent.items()):
                row = {k: v for k, v in value.items() if k != "latencies"}
                latencies = list(value.get("latencies") or [])
                row["agent"] = agent
                row["average_latency_s"] = (
                    round(sum(latencies) / len(latencies), 4) if latencies else None)
                p95 = self._percentile_95(latencies)
                row["p95_latency_s"] = round(p95, 4) if p95 is not None else None
                row["latencies_s"] = [round(value, 4) for value in latencies]
                row["api_equivalent_cost"] = (
                    None if missing_cost_by_agent.get(agent)
                    else round(row["cost"], 8))
                row["cache_hits"] = row["hits"]
                row["failures"] = row["fail"]
                row["reasoning_effort"] = row.get("effort")
                row["prompt_version"] = PROMPT_VERSION
                row["provider"] = "anthropic"
                if missing_tokens_by_agent.get(agent):
                    row["tokens"] = {
                        "fresh_input": None, "cache_write": None,
                        "cache_read": None, "output": None, "total": None,
                    }
                else:
                    row["tokens"] = {
                        "fresh_input": row["input"],
                        "cache_write": row["cache_write"],
                        "cache_read": row["cache_read"],
                        "output": row["output"],
                    }
                    row["tokens"]["total"] = sum(row["tokens"].values())
                rows.append(row)
                legacy_by_agent[agent] = {
                    key: value for key, value in row.items()
                    if key != "agent"
                }

            if missing_tokens:
                token_snapshot = {
                    "input": None, "fresh_input": None, "cache_write": None,
                    "cache_read": None, "output": None, "total": None,
                }
            else:
                token_snapshot = dict(self.tokens)
                token_snapshot["fresh_input"] = token_snapshot["input"]
                token_snapshot["total"] = sum(self.tokens.values())
            latencies = list(self.latencies)
            activity_wall = None
            if self._activity_started is not None and self._activity_finished is not None:
                activity_wall = max(0.0, self._activity_finished - self._activity_started)
            cost = None if missing_cost else round(self.cost_usd, 8)
            telemetry_status = (
                "complete" if not missing_tokens and not missing_cost else "partial")
            telemetry_explanation = None
            if telemetry_status == "partial":
                telemetry_explanation = (
                    f"CLI usage metadata was missing for {missing_tokens} token "
                    f"record(s) and {missing_cost} cost record(s); affected totals "
                    "are unavailable rather than fabricated zeros.")
            payload = {
                "version": "UsageV1",
                "telemetry_status": telemetry_status,
                "telemetry_explanation": telemetry_explanation,
                "currency": "USD",
                "metered_run_spend": 0.0,
                "metered_spend_basis": (
                    "Claude subscription; no marginal per-call metered charge"),
                "api_equivalent_cost": cost,
                "live_calls": self.calls,
                "cache_hits": self.cache_hits,
                "retries": self.retries,
                "failures": self.failures,
                "terminal_failures": self.terminal_failures,
                "usage_records_missing_tokens": missing_tokens,
                "usage_records_missing_cost": missing_cost,
                "tokens": token_snapshot,
                "latency": {
                    "wall_time_s": round(activity_wall, 4)
                    if activity_wall is not None else None,
                    "average_s": round(sum(latencies) / len(latencies), 4)
                    if latencies else None,
                    "p95_s": round(self._percentile_95(latencies), 4)
                    if latencies else None,
                    "peak_concurrency": self.peak_concurrency,
                    "basis": "model activity window, excluding retrieval and scoring",
                },
                "by_agent_rows": rows,
                "by_tier": self._aggregate(rows, "tier"),
                "by_model": self._aggregate(rows, "model"),
                "raw_structured_usage": {
                    "source": "Claude CLI JSON envelope",
                    "records": [dict(record) for record in self._records],
                    "redactions": ["prompts", "cache_keys", "authentication"],
                },
                # Compatibility keys used by the existing Markdown report.
                "calls": self.calls,
                "api_equivalent_usd": (
                    None if missing_cost else round(self.cost_usd, 4)),
                "subscription_spend_usd": 0.0,
                "by_agent": legacy_by_agent,
            }
        return payload


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
    u = env.get("usage")
    if not isinstance(u, dict) or not u:
        return {}
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
        USAGE.add_cache_hit(agent, model=model, tier=tier, effort=effort)
        return json.loads(row[0]), {
            "cached": True, "provider": "anthropic", "model": model,
            "tier": tier, "effort": effort, "prompt_version": PROMPT_VERSION,
        }

    cmd = [
        _claude_bin(), "-p", "--safe-mode",
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
        with _slots:
            started = USAGE.begin_attempt(
                agent, model=model, tier=tier, effort=effort, retry=attempt > 0)
            attempt_error = None
            try:
                proc = subprocess.run(cmd, input=body, capture_output=True,
                                      text=True, timeout=timeout)
            except subprocess.TimeoutExpired:
                USAGE.finish_attempt(
                    agent, started, failed=True, model=model, tier=tier,
                    effort=effort, outcome="timeout")
                proc = None
                attempt_error = "timeout"
            except OSError as exc:
                USAGE.finish_attempt(
                    agent, started, failed=True, model=model, tier=tier,
                    effort=effort, outcome="cli_unavailable")
                proc = None
                attempt_error = f"could not start Claude CLI: {exc}"

        if proc is None:
            if attempt_error != "timeout":
                last_err = attempt_error
                break
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
            USAGE.finish_attempt(
                agent, started, cost=_envelope_cost(proc.stdout), failed=True,
                tokens=_envelope_tokens(proc.stdout), model=model, tier=tier,
                effort=effort, outcome="cli_error")
            if _is_fatal(detail):
                break            # auth/config failure -- retrying cannot fix it
            time.sleep(2 ** attempt); continue

        result, cost = _extract_payload(proc.stdout)
        toks = _envelope_tokens(proc.stdout)
        if result is None:
            last_err = "schema violation / unparseable envelope"
            USAGE.finish_attempt(
                agent, started, cost=_envelope_cost(proc.stdout), failed=True,
                tokens=toks,
                model=model, tier=tier, effort=effort,
                outcome="schema_violation")
            time.sleep(2 ** attempt); continue

        USAGE.finish_attempt(
            agent, started, cost=_envelope_cost(proc.stdout), tokens=toks,
            model=model, tier=tier,
            effort=effort, outcome="success")
        with _lock:
            _CONN.execute("INSERT OR REPLACE INTO c VALUES (?,?,?)",
                          (k, json.dumps(result), cost))
            _CONN.commit()
        return result, {
            "cached": False, "provider": "anthropic", "model": model,
            "tier": tier, "cost": cost, "effort": effort,
            "prompt_version": PROMPT_VERSION,
            "latency_s": round(max(0.0, time.perf_counter() - started), 4),
            "tokens": {
                "fresh_input": toks.get("input", 0),
                "cache_write": toks.get("cache_write", 0),
                "cache_read": toks.get("cache_read", 0),
                "output": toks.get("output", 0),
            },
        }

    USAGE.record_terminal_failure(
        agent, model=model, tier=tier, effort=effort)
    return None, {
        "error": last_err, "provider": "anthropic", "model": model,
        "tier": tier, "effort": effort, "prompt_version": PROMPT_VERSION,
        "flagged": True,
    }


def _envelope_cost(raw: str) -> float | None:
    """Return a recorded CLI cost, or ``None`` when the envelope omitted it."""
    try:
        env = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return None
    value = env.get("total_cost_usd")
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def preflight() -> bool:
    """Fail loudly and early rather than 500 confusing errors deep in a run."""
    try:
        p = subprocess.run([_claude_bin(), "--version"], capture_output=True,
                           text=True, timeout=30)
    except FileNotFoundError:
        print(f"claude CLI not runnable at {_claude_bin()!r}.\n"
              f"  If the binary exists, this is a PATH problem, not a missing\n"
              f"  install -- ~/.local/bin is absent from non-interactive shells.\n"
              f"  Fix: export PATH=\"$HOME/.local/bin:$PATH\"  (or set SP_CLAUDE_BIN)")
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
        a = subprocess.run([_claude_bin(), "auth", "status"], capture_output=True,
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
