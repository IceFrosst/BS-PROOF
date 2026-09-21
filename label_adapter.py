"""
MODEL BOUNDARY 4: read a supplement LABEL from an image. Claude subscription.

Separate from `claude_adapter` on purpose. That file extracts facts from PAPERS
for the S1-S8 fleet; this one reads a photo of a product a user just uploaded.
Different input, different failure modes, different cache domain, and -- the
reason it cannot live inside claude_adapter -- a different purity contract:

DEPARTURE FROM INVARIANT 2, STATED OUT LOUD. The S1-S8 subagents are pure
functions with NO TOOLS. This call cannot be. The Claude CLI has no flag that
passes an image inline (`--file` downloads a remote resource by file_id; there
is no `--image`), so the only route to a vision read is to allow the **Read**
tool and point it at a path -- Read renders images. Verified 2026-08-21 against
CLI 2.1.237: `-p --safe-mode --allowed-tools Read` on a 700x900 PNG label
returned the correct ingredient, form, dose and brand in 14 s on tier A.

So the call is one-shot in intent but multi-turn in mechanism, and it is
narrowed everywhere else instead:

  * exactly ONE tool is allowed, `Read`, and nothing else -- no Bash, no Write,
    no network, no MCP
  * `--add-dir` is the image's own directory and nothing above it
  * `--safe-mode` still disables CLAUDE.md, skills, plugins, hooks, MCP and
    custom agents, so no ambient project memory reaches the call
  * `--max-turns 3` bounds it: read, answer, stop. A read that needs more turns
    is a prompt bug, per invariant 2's own reasoning -- do not raise the limit
  * the prompt is the whole system prompt (`--system-prompt`, not
    `--append-`), which claude_adapter measured at 38x fewer input tokens than
    the default coding-assistant scaffolding

WHY ITS OWN VERSION CONSTANT. `LABEL_PROMPT_VERSION` is deliberately NOT the
shared `claude_adapter.PROMPT_VERSION`. Bumping the shared one invalidates every
cached S1-S8 extraction -- ~1000 cached calls on the current creatine corpus,
which is hours of re-extraction -- and a reworded label prompt has nothing to do
with how a paper was read. Two prompts with unrelated blast radii must not share
a cache key. Invariant 3 still applies WITHIN this domain: edit prompts/label.md
and bump this.

The model NEVER converts a salt mass to its active moiety. It reports the
printed compound mass; `pipeline.vocab.elemental_dose_range_mg` does the molar
arithmetic deterministically, the same path a trial's dose takes in
`pipeline.assemble.study_dose`. Asking a model to do arithmetic it can get
quietly wrong, on the number the dose axis is built from, would be the whole
project's own criticism of itself.
"""
from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PROMPT = ROOT / "prompts" / "label.md"
SCHEMA = ROOT / "schemas" / "label.json"

# Bump when prompts/label.md or schemas/label.json changes. Scoped to the label
# read only -- see the module docstring on why this is not PROMPT_VERSION.
LABEL_PROMPT_VERSION = "label-v1.2"   # v1.2 (2026-09-21): typed JSON template;
                                      # v1.1 added whole-panel fields. Mirrored
                                      # in lib/analyze/vision.ts.

# Tier A. Label reading is OCR plus a vocabulary mapping -- the same shape as S1
# and S8, which are tier A for the same reason. Measured 2026-08-21: haiku read
# a synthetic label correctly (creatine / creatine_monohydrate / 4400 mg) in
# 14 s. If a real photo set shows it dropping forms, raise this to tier B and
# record the measurement rather than guessing.
LABEL_MODEL = os.environ.get("SP_LABEL_MODEL", "claude-haiku-4-5-20251001")

# Wall-clock ceiling for one read.
#
# MEASURED 2026-08-21 on the synthetic 700x900 label, tier A, two turns
# (Read, then answer):
#
#   bare canary, ~200-char prompt      14 s
#   this adapter, full ~7 KB prompt    32 s
#
# The prompt roughly doubled it, so the vocabulary block is not free -- it is
# ~60% of the prompt and grows with every ingredient added to vocab/form.json.
# 60 s is the ceiling, not the expectation: the lookup and scoring that follow a
# read are pure arithmetic on already-loaded artifacts (sub-millisecond), so the
# read IS the latency of the upload flow. If the vocabulary grows enough to push
# a typical read past ~40 s, trim the alias lines in _vocab_block before raising
# this -- a timeout that never fires stops being a bound.
TIMEOUT_S = int(os.environ.get("SP_LABEL_TIMEOUT", "60"))

MAX_IMAGE_BYTES = 12 * 1024 * 1024
ALLOWED_SUFFIXES = frozenset({".png", ".jpg", ".jpeg", ".webp", ".gif"})


class LabelReadError(RuntimeError):
    """The read could not be performed or produced nothing usable."""


def _claude_bin() -> str:
    """
    Same resolution order as claude_adapter._claude_bin, and duplicated rather
    than imported for one reason: importing claude_adapter here would pull the
    whole S1-S8 agent table, its usage ledger and its cache into a request-path
    module. `SP_CLAUDE_BIN` overrides both, so a machine with an unusual install
    configures one variable for both adapters.
    """
    override = os.environ.get("SP_CLAUDE_BIN")
    if override:
        return override
    found = shutil.which("claude")
    if found:
        return found
    fallback = Path.home() / ".local" / "bin" / "claude"
    return str(fallback) if fallback.exists() else "claude"


def _vocab_block() -> str:
    """
    The allowed ingredient and form ids, rendered for the prompt.

    Read from vocab/form.json at call time, so adding an ingredient to the
    vocabulary makes it readable off a label with no code change -- the same
    property vocab/README.md claims for the rest of the pipeline.
    """
    from pipeline import vocab
    data = json.loads((ROOT / "vocab" / "form.json").read_text(encoding="utf-8"))
    lines = []
    for ing, block in (data.get("ingredients") or {}).items():
        forms = block.get("forms") or []
        ids = [f.get("id") for f in forms if f.get("id")]
        aliases = sorted({a for f in forms for a in (f.get("aliases") or [])})
        lines.append(f"- `{ing}` forms: {', '.join(ids)}")
        if aliases:
            lines.append(f"    printed as: {', '.join(aliases[:12])}")
    del vocab
    return "\n".join(lines)


def _system_prompt() -> str:
    return PROMPT.read_text(encoding="utf-8").replace("{VOCAB}", _vocab_block())


def _extract_json(text: str) -> dict:
    """
    The object out of the CLI's stdout.

    Tolerates a markdown fence because the model emits one about half the time
    even when told not to (measured on the 2026-08-21 canary), and a refusal
    here would discard a correct read over punctuation. Does NOT tolerate
    anything else: no repair of truncated JSON, no regex field-scraping. A
    malformed read is an error, because a partially-parsed label is how a wrong
    dose reaches the score.
    """
    text = (text or "").strip()
    fence = re.search(r"```(?:json)?\s*(.+?)\s*```", text, re.S)
    if fence:
        text = fence.group(1).strip()
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end <= start:
        raise LabelReadError(f"no JSON object in model output: {text[:200]!r}")
    try:
        obj = json.loads(text[start:end + 1])
    except ValueError as exc:
        raise LabelReadError(f"unparseable JSON from model: {exc}") from exc
    if not isinstance(obj, dict):
        raise LabelReadError("model returned JSON that is not an object")
    return obj


#: Optional field -> value used when the model omits it OR sends null.
#
# MEASURED 2026-08-21: the first live read returned `"other_actives": null` on a
# single-ingredient label, which is a reasonable way to say "none" and which the
# schema's `type: array` rightly rejected. Normalising these BEFORE validation
# rather than after is the whole fix -- defaults applied afterwards never ran,
# because validation had already raised.
#
# Only fields absent from the schema's `required` list appear here. A required
# field is never defaulted: a missing `compound_dose_mg` must surface as a schema
# error, because "the model did not answer" and "no dose is printed on the label"
# are different facts and only one of them is safe to show a user as "dose not
# assessable".
_OPTIONAL_DEFAULTS = {
    "ingredient_label_text": None,
    "dose_unit_as_printed": None,
    "servings_per_day": None,
    "other_actives": [],
    "actives": [],
    "certifications": [],
    "manufacturer": None,
    "country_of_origin": None,
    "warnings_printed": [],
    "claims_printed": [],
    "brand": None,
    "product_name": None,
    "is_supplement_label": True,
    "unreadable_reason": None,
}


def _validate(obj: dict) -> dict:
    """Normalise the optional fields, then schema-check."""
    for key, default in _OPTIONAL_DEFAULTS.items():
        if obj.get(key) is None:
            obj[key] = default

    try:
        import jsonschema
    except ImportError:
        jsonschema = None
    if jsonschema is not None:
        schema = json.loads(SCHEMA.read_text(encoding="utf-8"))
        try:
            jsonschema.validate(obj, schema)
        except jsonschema.ValidationError as exc:
            raise LabelReadError(
                f"label read violates schemas/label.json: {exc.message}") from exc
    return obj


def _check_image(path: Path) -> Path:
    path = path.resolve()
    if not path.is_file():
        raise LabelReadError(f"no such image: {path}")
    if path.suffix.lower() not in ALLOWED_SUFFIXES:
        raise LabelReadError(
            f"unsupported image type {path.suffix!r}; "
            f"allowed: {', '.join(sorted(ALLOWED_SUFFIXES))}")
    size = path.stat().st_size
    if size == 0:
        raise LabelReadError("image is empty")
    if size > MAX_IMAGE_BYTES:
        raise LabelReadError(
            f"image is {size / 1e6:.1f} MB, over the {MAX_IMAGE_BYTES / 1e6:.0f} MB limit")
    return path


def read_label(image_path: str | Path) -> dict:
    """
    One image -> one validated label read. Raises LabelReadError on failure.

    Returns the schema object plus `_meta` (model, prompt version, elapsed).
    The caller converts `compound_dose_mg` to elemental; this function
    deliberately does not, so the arithmetic stays in one auditable place.
    """
    import time
    path = _check_image(Path(image_path))
    prompt = _system_prompt()

    cmd = [
        _claude_bin(), "-p", "--safe-mode",
        "--model", LABEL_MODEL,
        "--system-prompt", prompt,
        # Exactly one tool, and it is the only way to get pixels to the model.
        "--allowed-tools", "Read",
        # Scope the filesystem to the image's own directory, not the repo.
        "--add-dir", str(path.parent),
        "--max-turns", "3",
        (f"Read the image file {path.name} in {path.parent}. "
         f"Return only the JSON object."),
    ]
    started = time.monotonic()
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True,
                              timeout=TIMEOUT_S, cwd=str(path.parent))
    except FileNotFoundError as exc:
        raise LabelReadError(
            f"claude CLI not runnable at {_claude_bin()!r}. "
            f"Set SP_CLAUDE_BIN to the executable.") from exc
    except subprocess.TimeoutExpired as exc:
        raise LabelReadError(f"label read timed out after {TIMEOUT_S}s") from exc
    elapsed = round(time.monotonic() - started, 2)

    if proc.returncode != 0:
        # The CLI prints its own errors to stdout, not stderr (measured in
        # claude_adapter._cli_error), so both are worth showing.
        detail = (proc.stdout or proc.stderr or "").strip()[:300]
        raise LabelReadError(f"claude CLI exited {proc.returncode}: {detail}")

    obj = _validate(_extract_json(proc.stdout))
    obj["_meta"] = {
        "model": LABEL_MODEL,
        "prompt_version": LABEL_PROMPT_VERSION,
        "elapsed_s": elapsed,
        # Subscription call. Consistent with the rest of the pipeline: there is
        # no metered spend anywhere here and no key to provision.
        "marginal_cost_usd": 0.0,
    }
    return obj


def preflight() -> int:
    """`python3 label_adapter.py` -- is a label read possible on this machine?"""
    binary = _claude_bin()
    try:
        p = subprocess.run([binary, "--version"], capture_output=True,
                           text=True, timeout=30)
    except (OSError, subprocess.SubprocessError) as exc:
        print(f"FAIL claude CLI not runnable at {binary!r}: {exc}")
        print("     Fix: set SP_CLAUDE_BIN to the executable.")
        return 1
    if p.returncode != 0:
        print(f"FAIL {binary} --version exited {p.returncode}")
        return 1
    print(f"ok   claude CLI: {(p.stdout or '').strip()}")
    print(f"ok   binary: {binary}")
    print(f"ok   model: {LABEL_MODEL}  prompt: {LABEL_PROMPT_VERSION}")
    for f in (PROMPT, SCHEMA):
        if not f.is_file():
            print(f"FAIL missing {f.relative_to(ROOT)}")
            return 1
        print(f"ok   {f.relative_to(ROOT)}")
    try:
        n = len(_vocab_block().splitlines())
        print(f"ok   vocab block renders ({n} lines)")
    except (OSError, ValueError) as exc:
        print(f"FAIL vocab block: {exc}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(preflight())
