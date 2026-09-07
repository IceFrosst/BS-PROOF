"""
Structural invariant checks over the source tree. NO MODEL MAY ENTER THIS FILE.

Enforces two CLAUDE.md invariants that were prose-only, or enforced badly, until
2026-08-10:

    invariant 1   only adapter files may talk to a model
    (offline)     the deterministic layer imports with no third-party dependency
    (wiring)      every agent in AGENTS has a schema and a prompt on disk

Invariant 1 used to be a CI grep:

    if grep -rn "claude_adapter" pipeline/ sources/; then exit 1; fi

That gate was RED on every push from commit 30b768f onward -- the commit that
added a legitimate `import claude_adapter as _ca` to pipeline/selftest.py to pin
effort-in-the-cache-key. A text search cannot tell "scoring.py calls a model"
from "the test suite reads a constant", so the only way to get CI green was to
delete the check or ignore it. Both workflows were ignored instead: measured
2026-08-10, `selftest` had failed 14 of its last 14 runs and `dashboard` 11 of 11.

Two properties the grep did not have:

  * An AST read cannot be defeated by formatting. `import claude_adapter as _ca`,
    a line-wrapped `from claude_adapter import (\n    _key,\n)`, or an import
    nested inside a function are all the same node type to ast.walk. The old
    grep also had a sibling in that workflow -- a `re.findall` over the AGENTS
    dict -- which broke if anyone reformatted the dict. Both are gone.
  * Exceptions are DATA WITH A REASON, and a stale exception is itself a
    failure. An allowlist nobody prunes is how an invariant quietly stops
    existing.

ast.walk, not `tree.body`: every real import of a model module in this repo is
inside a function (pipeline/selftest.py:1262, run_pipeline.py:275). A
module-level-only scan would be weaker than the grep it replaces.

Note the irony, deliberately: this file must name the adapter modules as string
literals in order to look for them, which is precisely why a text search could
never work here -- it cannot distinguish the checker from a violation.

    python -m pipeline.invariants
"""
from __future__ import annotations

import ast
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# The model boundaries from the CLAUDE.md table. Nothing else may reach a model,
# and these are the only files allowed to import a CLI.
#
# `label_adapter` joined 2026-08-21: it reads a supplement LABEL from an uploaded
# image for the product-lookup flow. It is a boundary like the other three and is
# listed here for the same reason -- so that pipeline/ and sources/ importing it
# fails this check. pipeline/product_score.py is the deterministic half of that
# feature and must never import it; the orchestration happens in
# scripts/analyze_label.py, which is the injection layer by design (see
# CHECKED_DIRS below).
MODEL_MODULES = ("claude_adapter", "pilot_adapter", "grok_adapter",
                 "label_adapter")

# The deterministic layer. NOT scripts/, run_pipeline.py or workers.py -- those
# are the injection layer by design (`call=` is passed down from there), so
# checking them would be all allowlist and no signal.
CHECKED_DIRS = ("pipeline", "sources")

# (posix relpath, module) -> why this one is legitimate.
#
# An entry with an empty reason fails. An entry whose import no longer exists
# fails. Both rules exist because the failure mode of an allowlist is not that
# it blocks too much, it is that it silently stops guarding anything.
IMPORT_EXCEPTIONS: dict[tuple[str, str], str] = {
    ("pipeline/selftest.py", "claude_adapter"):
        "test-only: reads _key() and TIER_EFFORT to assert effort is in the cache "
        "key. Never calls the adapter, so no model can enter a test run.",
}

# Where AGENTS lives. Read as TEXT, never imported: importing it from inside
# pipeline/ is the exact thing invariant 1 forbids, and this module would then
# have to allowlist itself.
ADAPTER_FOR_WIRING = "claude_adapter.py"


# --------------------------------------------------------------------------- #
# invariant 1


def _called_name(node: ast.Call) -> str | None:
    """`__import__(...)` -> '__import__'; `importlib.import_module(...)` -> 'import_module'."""
    f = node.func
    if isinstance(f, ast.Name):
        return f.id
    if isinstance(f, ast.Attribute):
        return f.attr
    return None


def model_imports(src: str, path: str = "<string>") -> list[tuple[str, int, str]]:
    """
    Every model-module import in `src`, as (module, lineno, kind).

    Takes source rather than a path so the selftest can hand it a fabricated
    violation. A repo scanner that returns [] because its scanner broke passes
    forever; the only defence is a synthetic negative test.

    Raises SyntaxError, which callers report rather than crash on.
    """
    found: list[tuple[str, int, str]] = []
    for node in ast.walk(ast.parse(src, filename=path)):
        if isinstance(node, ast.Import):
            for alias in node.names:
                root = alias.name.split(".")[0]
                if root in MODEL_MODULES:
                    found.append((root, node.lineno, "import"))
        elif isinstance(node, ast.ImportFrom):
            # node.module is None for `from . import x`; level>0 is relative and
            # can never name a top-level adapter.
            if node.module and node.level == 0:
                root = node.module.split(".")[0]
                if root in MODEL_MODULES:
                    found.append((root, node.lineno, "from-import"))
        elif isinstance(node, ast.Call):
            # Dynamic evasion, only for a CONSTANT argument. A computed module
            # name is not caught -- stated here rather than pretended away.
            if _called_name(node) in ("__import__", "import_module") and node.args:
                arg = node.args[0]
                if isinstance(arg, ast.Constant) and isinstance(arg.value, str):
                    root = arg.value.split(".")[0]
                    if root in MODEL_MODULES:
                        found.append((root, node.lineno, "dynamic import"))
    return found


def _iter_sources(root: Path):
    for d in CHECKED_DIRS:
        for p in sorted((root / d).rglob("*.py")):
            if "__pycache__" in p.parts:
                continue
            yield p.relative_to(root).as_posix(), p.read_text(encoding="utf-8")


def import_problems(root: Path | None = None) -> list[str]:
    """Unallowlisted model imports in the deterministic layer. Empty means clean."""
    root = Path(root) if root else ROOT
    out: list[str] = []
    for rel, src in _iter_sources(root):
        try:
            hits = model_imports(src, rel)
        except SyntaxError as e:
            out.append(f"{rel}: does not parse ({e.msg}, line {e.lineno})")
            continue
        for mod, lineno, kind in hits:
            if IMPORT_EXCEPTIONS.get((rel, mod)):
                continue
            out.append(
                f"{rel}:{lineno}: {kind} of `{mod}` -- invariant 1: the "
                f"deterministic layer must not reach a model boundary. If this "
                f"is legitimate, add ('{rel}', '{mod}') to IMPORT_EXCEPTIONS "
                f"with a reason."
            )
    return out


def exception_problems(root: Path | None = None) -> list[str]:
    """Reasonless or stale allowlist entries. Kept separate so a synthetic tree
    can be scanned for violations without every exception reading as stale."""
    root = Path(root) if root else ROOT
    live: set[tuple[str, str]] = set()
    for rel, src in _iter_sources(root):
        try:
            hits = model_imports(src, rel)
        except SyntaxError:
            continue
        live.update((rel, mod) for mod, _, _ in hits)

    out: list[str] = []
    for key, reason in IMPORT_EXCEPTIONS.items():
        if not (reason or "").strip():
            out.append(f"IMPORT_EXCEPTIONS{key}: allowlisted with no reason -- "
                       f"an unexplained exception is an undocumented hole in "
                       f"invariant 1")
        elif key not in live:
            out.append(f"IMPORT_EXCEPTIONS{key}: stale -- that import no longer "
                       f"exists, so the entry now guards nothing while looking "
                       f"like it guards something. Delete it.")
    return out


# --------------------------------------------------------------------------- #
# the suite must run on a bare interpreter


# Anything importable without installing something. `sys.stdlib_module_names` is
# used rather than a hand-list so this check never needs maintaining.
LOCAL_MODULES = ("pipeline", "sources", "vocab") + MODEL_MODULES + ("workers",)


def module_level_third_party(src: str, path: str = "<string>") -> list[tuple[str, int]]:
    """
    Third-party imports at MODULE level, as (module, lineno).

    `tree.body`, not ast.walk -- the opposite of the invariant-1 scan, and
    deliberately so. An import inside a function is exactly the fix here, while
    for a model boundary it is exactly the evasion.
    """
    import sys
    out: list[tuple[str, int]] = []
    for node in ast.parse(src, filename=path).body:
        mods: list[str] = []
        if isinstance(node, ast.Import):
            mods = [a.name.split(".")[0] for a in node.names]
        elif isinstance(node, ast.ImportFrom) and node.module and node.level == 0:
            mods = [node.module.split(".")[0]]
        for m in mods:
            if m not in sys.stdlib_module_names and m not in LOCAL_MODULES:
                out.append((m, node.lineno))
    return out


def dependency_problems(root: Path | None = None) -> list[str]:
    """
    `pipeline.selftest` advertises itself as zero-model and zero-network, so it
    must import on an interpreter with nothing installed.

    It did not, until 2026-08-10. sources/http.py imported httpx at module level
    while only calling it inside get_json, so `python3 -m pipeline.selftest` --
    the command CLAUDE.md handed to every agent -- exited 1 at EUROPE PMC
    NORMALISATION on any machine without the venv active. An agent following the
    documentation got a traceback and debugged a regression that did not exist.
    The 2026-08-05 audit noticed the python/python3 mismatch and it survived five
    more days because nothing enforced it.
    """
    root = Path(root) if root else ROOT
    out: list[str] = []
    for rel, src in _iter_sources(root):
        try:
            hits = module_level_third_party(src, rel)
        except SyntaxError:
            continue  # already reported by import_problems
        for mod, lineno in hits:
            out.append(
                f"{rel}:{lineno}: module-level import of third-party `{mod}` -- "
                f"the deterministic layer must import on a bare interpreter. Move "
                f"it inside the function that uses it (see sources/http.py)."
            )
    return out


# --------------------------------------------------------------------------- #
# agent wiring (replaces the regex in .github/workflows/selftest.yml)


def literal_module_assign(src: str, name: str, path: str = "<string>"):
    """
    Value of a module-level `NAME = <literal>` assignment, via literal_eval.

    AST here rather than an import, specifically because the module being read is
    an adapter and importing one from pipeline/ is the boundary this file exists
    to police. Reformat-proof in a way the old `re.findall(r'"(S\\d)":\\s*\\(...')`
    was not.
    """
    for node in ast.parse(src, filename=path).body:
        if isinstance(node, ast.Assign):
            for t in node.targets:
                if isinstance(t, ast.Name) and t.id == name:
                    return ast.literal_eval(node.value)
    return None


def agent_wiring_problems(root: Path | None = None) -> list[str]:
    """Every agent in AGENTS has an existing schema and prompt, and a known tier."""
    root = Path(root) if root else ROOT
    src_path = root / ADAPTER_FOR_WIRING
    if not src_path.exists():
        return [f"{ADAPTER_FOR_WIRING}: missing -- cannot check agent wiring"]

    try:
        agents = literal_module_assign(src_path.read_text(encoding="utf-8"),
                                       "AGENTS", ADAPTER_FOR_WIRING)
    except (SyntaxError, ValueError) as e:
        return [f"{ADAPTER_FOR_WIRING}: AGENTS is not a readable literal ({e})"]
    if not agents:
        return [f"{ADAPTER_FOR_WIRING}: no module-level AGENTS assignment found"]

    out: list[str] = []
    for sid, spec in sorted(agents.items()):
        if not (isinstance(spec, (tuple, list)) and len(spec) == 3):
            out.append(f"AGENTS[{sid}]: expected (tier, schema, prompt), got {spec!r}")
            continue
        tier, schema, prompt = spec
        if tier not in ("A", "B", "C"):
            out.append(f"AGENTS[{sid}]: unknown tier {tier!r} (expected A, B or C)")
        for sub, fname in (("schemas", schema), ("prompts", prompt)):
            if not (root / sub / fname).exists():
                out.append(f"AGENTS[{sid}]: {sub}/{fname} does not exist")

    # _shared.md is prepended to every agent prompt; a missing one degrades every
    # extraction silently rather than failing, so it is checked here not there.
    if not (root / "prompts" / "_shared.md").exists():
        out.append("prompts/_shared.md does not exist -- every agent prompt "
                   "would silently lose its shared rules")
    return out


# --------------------------------------------------------------------------- #
# invariant 1, TypeScript side

# The one TS file allowed to call a model API. lib/analyze/llm.ts is the
# deployed app's transport for EVERY model call -- the label read
# (lib/analyze/vision.ts owns only the prompt and contract since 2026-09-07),
# the compatibility fill-in and the company profile -- provider-configurable via
# MODEL_API_URL / VISION_API_URL (founder moved it Anthropic -> DeepSeek -> free
# Gemini tier -> DeepSeek again, 2026-08-22 .. 2026-09-07). Everything else
# under lib/ and app/ is deterministic rendering or the injection layer, exactly
# like pipeline/ and sources/ on the Python side. A second call site would be a
# second model boundary added without the CLAUDE.md table changing -- the
# silent drift this file exists to catch.
#
# Text scan, not AST: TS has no stdlib parser here. The markers are the strings
# a model call cannot avoid -- the chat-completions endpoint path, a provider
# SDK import, or READING a key from the environment -- none of which can be
# line-wrapped past a substring check without also breaking the code that uses
# them. Deliberately `process.env.<KEY>` rather than the bare key names: the
# route's 503 message and the UI's empty state legitimately NAME the vars to
# tell the operator what to configure, and a first run of this check flagged
# exactly those strings. Naming a credential is documentation; reading it is a
# boundary.
TS_MODEL_MARKERS = ("chat/completions", "@anthropic-ai/sdk",
                    "process.env.VISION_API_KEY", "process.env.GEMINI_API_KEY",
                    "process.env.DEEPSEEK_API_KEY", "process.env.ANTHROPIC_API_KEY")
TS_MODEL_BOUNDARY = "lib/analyze/llm.ts"
TS_CHECKED_DIRS = ("lib", "app", "components")


def ts_boundary_problems(root: Path | None = None) -> list[str]:
    root = root or ROOT
    out: list[str] = []
    for d in TS_CHECKED_DIRS:
        base = root / d
        if not base.exists():
            continue
        for path in base.rglob("*.ts*"):
            if "node_modules" in path.parts or path.suffix not in (".ts", ".tsx"):
                continue
            rel = path.relative_to(root).as_posix()
            if rel == TS_MODEL_BOUNDARY:
                continue
            try:
                text = path.read_text(encoding="utf-8")
            except OSError:
                out.append(f"{rel}: unreadable while checking the TS model boundary")
                continue
            for marker in TS_MODEL_MARKERS:
                if marker in text:
                    out.append(
                        f"{rel}: contains {marker!r} but only {TS_MODEL_BOUNDARY} "
                        f"is a model boundary (CLAUDE.md invariant 1)")
    return out


# --------------------------------------------------------------------------- #


def problems(root: Path | None = None) -> list[str]:
    return (import_problems(root)
            + exception_problems(root)
            + dependency_problems(root)
            + agent_wiring_problems(root)
            + ts_boundary_problems(root))


def main() -> int:
    probs = problems()
    for p in probs:
        print("  PROBLEM:", p)
    if probs:
        print(f"\n{len(probs)} problem(s). The deterministic layer is not clean.")
        return 1
    n_exc = len(IMPORT_EXCEPTIONS)
    print(f"invariant 1: {', '.join(d + '/' for d in CHECKED_DIRS)} reach no model boundary "
          f"({n_exc} documented exception{'s' if n_exc != 1 else ''})")
    print("offline:     the deterministic layer imports with no third-party dependency")
    print("agent wiring: every AGENTS entry has a schema, a prompt and a tier")
    print(f"ts boundary: model-API markers appear only in {TS_MODEL_BOUNDARY}")
    return 0


if __name__ == "__main__":
    import sys
    sys.exit(main())
