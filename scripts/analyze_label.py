"""
One uploaded image -> one answer about that product. The label-upload entry point.

This is the INJECTION LAYER, like run_pipeline.py and workers.py: it is the only
file in this feature allowed to touch both a model boundary (label_adapter) and
the deterministic core (pipeline.product_score), because it is the thing wiring
them together. Neither half imports the other.

    label_adapter.read_label      image      -> printed compound dose  [MODEL]
    vocab.elemental_dose_range_mg compound   -> elemental mg           [exact]
    product_score.score_product   elemental  -> rows + arcs            [exact]
    europepmc.hit_count           miss       -> evidence census        [count]

WHAT THIS IS NOT. It does not run the pipeline. Scoring a new ingredient means
retrieval, full-text fetch and ~10 model calls per study across ~180 studies --
about 40 minutes and a thousand subscription calls, measured on the runs in
reports/runs/. That cannot happen while someone waits on an upload, so an
unscored product gets two honest things instead: a COUNT of what exists in the
literature, clearly not a score, and a queued request so the real run can be
done later. `--drain` lists what has accumulated.

THE ONE RULE. Every path that returns a number returns it with its four arcs and
its validity block, or it returns no number at all. There is no branch here that
emits a bare composite -- invariant 8, and the reason this project has a name.

The dose is converted, not copied. A label prints the COMPOUND mass ("Creatine
Monohydrate 4400 mg"); trial doses in the corpus are elemental/active-moiety
(pipeline.assemble.study_dose), so comparing the printed number directly would
compare two different quantities and be wrong by the salt's mass fraction --
12% for creatine monohydrate, 2.1x for magnesium chloride hexahydrate. The
conversion is `vocab.elemental_dose_range_mg`, the same function the trials go
through, and it REFUSES rather than guesses when the hydration state is
unstated.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from pipeline import product_score, vocab  # noqa: E402

QUEUE = ROOT / "out" / "analysis_queue.json"
QUEUE_SCHEMA = "AnalysisQueueV1"


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


# --------------------------------------------------------------------------- #
# the queue

def _load_queue() -> dict:
    try:
        data = json.loads(QUEUE.read_text(encoding="utf-8"))
        if isinstance(data, dict) and data.get("requests") is not None:
            return data
    except (OSError, ValueError):
        pass
    return {"schema_version": QUEUE_SCHEMA, "requests": []}


def enqueue(ingredient: str | None, form: str | None, *,
            label_text: str | None = None) -> dict:
    """
    Record that someone asked about a product we cannot score yet.

    LOCAL FILE, NOT A CLOUD WORKER. `out/` is gitignored and nothing drains this
    automatically -- there is no queue runner, and CLAUDE.md is explicit that a
    production extraction must run SOLO because it competes for the same
    subscription session limit (a 2026-08-10 run lost 364 of 906 calls to
    exactly that). An upload that silently started a 40-minute extraction could
    corrupt a run in progress, so the request is recorded and a human starts it:

        python3 scripts/analyze_label.py --drain

    Counting repeats is the point: `count` is how many people asked, which is
    the only demand signal available for choosing which ingredient to run next.
    """
    if not ingredient and not label_text:
        return {"queued": False, "reason": "nothing identifiable to queue"}
    data = _load_queue()
    key_ing = ingredient or f"?{label_text}"
    for req in data["requests"]:
        if req.get("ingredient") == key_ing and req.get("form") == form:
            req["count"] = int(req.get("count", 1)) + 1
            req["last_requested_at"] = _now()
            break
    else:
        data["requests"].append({
            "ingredient": key_ing,
            "form": form,
            "label_text": label_text,
            "in_vocab": bool(ingredient),
            "count": 1,
            "first_requested_at": _now(),
            "last_requested_at": _now(),
            "status": "pending",
        })
    QUEUE.parent.mkdir(parents=True, exist_ok=True)
    QUEUE.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    return {"queued": True, "queue_file": str(QUEUE.relative_to(ROOT)),
            "note": "recorded for a future run; nothing runs automatically"}


def drain() -> int:
    data = _load_queue()
    reqs = sorted(data["requests"], key=lambda r: -int(r.get("count", 1)))
    if not reqs:
        print("queue is empty")
        return 0
    print(f"{len(reqs)} queued request(s), most-asked first:\n")
    for r in reqs:
        form = r.get("form") or "form not stated"
        mark = "" if r.get("in_vocab") else "   [NOT IN VOCAB - needs a vocab/form.json entry first]"
        print(f"  {r.get('count'):>3}x  {r.get('ingredient')} / {form}"
              f"   since {r.get('first_requested_at')}{mark}")
    print("\nTo score one, run the pipeline SOLO (never alongside other model work):")
    print("  python3 run_pipeline.py <ingredient> --form <form> --limit 200 --supplement-scope --dose <mg elemental>")
    return 0


# --------------------------------------------------------------------------- #
# the census

def census(ingredient: str) -> dict:
    """
    How much literature EXISTS for an ingredient we have not scored.

    A count, explicitly labelled as one. It answers "is there anything to read"
    -- which is genuinely useful when the answer is "nothing was ever tested" --
    and it deliberately does not answer "does it work", because direction and
    quality come only from extraction. Fails soft: a census is a nice-to-have on
    a path that already has an honest answer ("not scored"), so an upstream
    outage must not turn that into an error.
    """
    try:
        from sources import europepmc
        rct = europepmc.hit_count(ingredient, syntheses=False,
                                  scope="supplement")
        syn = europepmc.hit_count(ingredient, syntheses=True,
                                  scope="supplement")
        return {
            "available": True,
            "rcts_indexed": rct,
            "syntheses_indexed": syn,
            "source": "Europe PMC",
            "scope": "supplement",
            "is_a_score": False,
            "means": ("How many trials EXIST. Not what they found -- direction "
                      "and quality require extraction, which has not been run "
                      "for this product."),
        }
    except Exception as exc:  # noqa: BLE001 - fail soft, see docstring
        return {"available": False, "reason": f"{type(exc).__name__}: {exc}",
                "is_a_score": False}


# --------------------------------------------------------------------------- #
# the answer

def analyze(image: Path, *, do_census: bool = True,
            do_queue: bool = True) -> dict:
    started = time.monotonic()
    import label_adapter  # imported here: model boundary, injection layer only

    out: dict = {"schema_version": "LabelAnalysisV1", "analyzed_at": _now()}
    try:
        label = label_adapter.read_label(image)
    except label_adapter.LabelReadError as exc:
        out["status"] = "label_unreadable"
        out["error"] = str(exc)
        out["timing_s"] = round(time.monotonic() - started, 2)
        return out
    out["label"] = label

    if not label.get("is_supplement_label", True):
        out["status"] = "not_a_supplement_label"
        out["timing_s"] = round(time.monotonic() - started, 2)
        return out

    ingredient = label.get("ingredient_vocab_id")
    form = label.get("form_vocab_id")
    printed = label.get("compound_dose_mg")

    if not ingredient:
        # Readable label, ingredient outside the vocabulary. Name it back rather
        # than failing: "we do not cover this yet" is a different message from
        # "we could not read your photo", and the user can tell them apart.
        out["status"] = "ingredient_not_supported"
        out["ingredient_label_text"] = label.get("ingredient_label_text")
        out["supported_ingredients"] = sorted(vocab.ingredients())
        if do_queue:
            out["queue"] = enqueue(None, None,
                                   label_text=label.get("ingredient_label_text"))
        out["timing_s"] = round(time.monotonic() - started, 2)
        return out

    # Compound -> elemental, deterministically. `form` may be None (label stated
    # no form); the conversion then refuses, which is the correct answer.
    elemental = vocab.elemental_dose_range_mg(ingredient, form, printed)
    out["product"] = {
        "ingredient": ingredient,
        "form": form,
        "compound_dose_mg": printed,
        "elemental_dose_mg": elemental,
        "is_multi_ingredient": bool(label.get("is_multi_ingredient")),
        "other_actives": label.get("other_actives") or [],
    }

    # Keep the score boundary on the compound axis. score_product performs the
    # conversion itself and refuses bounded intervals; passing the low endpoint
    # as elemental would silently turn an interval into a false exact dose.
    result = product_score.score_product(ingredient, form or "", printed,
                                         dose_basis="compound")
    out["result"] = result
    out["status"] = result.get("status")

    if result.get("status") != "scored":
        if do_census:
            out["census"] = census(ingredient)
        if do_queue:
            out["queue"] = enqueue(ingredient, form)

    # A blend is a different question, and the score does not know that. Say so
    # beside the number rather than adjusting it: invariant 7 refuses TRIALS
    # whose ingredient arm co-administers another active, and the mirror image
    # of that rule is that evidence about an isolated ingredient does not
    # transfer to a product that co-administers one.
    if label.get("is_multi_ingredient"):
        out["caveats"] = out.get("caveats", []) + [{
            "code": "multi_ingredient_product",
            "text": ("This product doses more than one active. The evidence "
                     "below is about " + ingredient + " on its own, which is "
                     "not the same question as this blend."),
            "other_actives": label.get("other_actives") or [],
        }]
    if elemental.get("basis") in ("compound_only", "unstated"):
        out["caveats"] = out.get("caveats", []) + [{
            "code": "dose_not_convertible",
            "text": ("The dose axis is unavailable: " + (
                "no per-serving mass for this ingredient is printed on the label."
                if elemental.get("basis") == "unstated" else
                "this form's hydration state is not stated, so its elemental "
                "dose cannot be computed without guessing.")),
        }]

    out["timing_s"] = round(time.monotonic() - started, 2)
    return out


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--image", type=Path, help="Label image (png/jpg/webp)")
    ap.add_argument("--drain", action="store_true",
                    help="List queued requests instead of analysing")
    ap.add_argument("--no-census", action="store_true")
    ap.add_argument("--no-queue", action="store_true")
    ap.add_argument("--pretty", action="store_true",
                    help="Human-readable instead of JSON")
    args = ap.parse_args(argv)

    if args.drain:
        return drain()
    if not args.image:
        ap.error("--image is required unless --drain")

    out = analyze(args.image, do_census=not args.no_census,
                  do_queue=not args.no_queue)
    if not args.pretty:
        print(json.dumps(out, indent=2))
        return 0 if out.get("status") in ("scored",) else 1

    print(f"status: {out.get('status')}   ({out.get('timing_s')}s)")
    lab = out.get("label") or {}
    if lab:
        print(f"label:  {lab.get('ingredient_label_text')} / "
              f"{lab.get('form_vocab_id')} / {lab.get('compound_dose_mg')} mg "
              f"compound  (confidence {lab.get('confidence')})")
    prod = out.get("product") or {}
    if prod:
        el = prod.get("elemental_dose_mg") or {}
        print(f"dose:   {el.get('low')}-{el.get('high')} mg elemental "
              f"({el.get('basis')})")
    res = out.get("result") or {}
    for row in res.get("rows") or []:
        a = row["arcs"]
        cl = a["dose"]["closeness"]
        print(f"  {row['outcome']:<20} {row['composite']:>3}/100  {row['verdict']}")
        print(f"     effect {a['effect']['verdict']:+.2f} @ {a['effect']['coverage']:.0%}"
              f" | form strength {a['form']['strength']}"
              f" | dose closeness {'n/a' if cl is None else round(cl, 2)}"
              f" | evidence {a['evidence']['coverage']:.0%}  n={row['n_primaries']}")
    val = res.get("validity") or {}
    if val:
        print(f"\nvalidity: {val.get('status')}  "
              f"public_claims_allowed={val.get('public_claims_allowed')}")
    for c in out.get("caveats") or []:
        print(f"caveat: {c['text']}")
    cen = out.get("census") or {}
    if cen.get("available"):
        print(f"census: {cen['rcts_indexed']} RCTs, {cen['syntheses_indexed']} "
              f"reviews indexed (a COUNT, not a score)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
