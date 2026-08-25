"""
Generate the teammate-facing Excalidraw diagram of a demo run.

    python3 scripts/write_demo_diagram.py

Writes `pipeline_v2_demo.excalidraw` at the repo root. `pipeline_v1.excalidraw`
is the older technical drawing and is left alone.

WHY A GENERATOR AND NOT A HAND-DRAWN FILE: the diagram quotes constants
(weights, s_i values, k, the transfer tiers). Hand-editing a 150 kB JSON blob
after a scoring change is how a diagram silently starts lying about the code, so
the numbers below are IMPORTED from pipeline.scoring rather than typed in.
Anything typed in is prose, and prose is checked by reading it.
"""
from __future__ import annotations

import json
import pathlib
import random
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))

from pipeline.scoring import (  # noqa: E402
    DESIGN_W, FORM_FACTOR, FUNDING_FACTOR, GATE_MIN_HUMAN_WD, H_PENALTY, K,
    LAMBDA, OA_FACTOR, ROB_FACTOR, S_VALUE, SCORING_MODEL,
)

OUT = pathlib.Path(__file__).resolve().parent.parent / "pipeline_v2_demo.excalidraw"

# Excalidraw palette. The colour IS the legend, so keep these three meanings
# stable: green = deterministic code, violet = a model call, blue = outside data.
GREEN = ("#2f9e44", "#ebfbee")
VIOLET = ("#6741d9", "#f3f0ff")
BLUE = ("#1971c2", "#e7f5ff")
RED = ("#e03131", "#fff5f5")
YELLOW = ("#f08c00", "#fff9db")
GREY = ("#495057", "#f8f9fa")

HAND, MONO = 5, 3           # fontFamily ids: Excalifont, Cascadia
_elements: list[dict] = []
_rng = random.Random(20260807)


def _base(kind: str, x: float, y: float, w: float, h: float,
          stroke: str, bg: str, *, dashed: bool = False) -> dict:
    return {
        "id": _id(), "type": kind, "x": x, "y": y, "width": w, "height": h,
        "angle": 0, "strokeColor": stroke, "backgroundColor": bg,
        "fillStyle": "solid", "strokeWidth": 2,
        "strokeStyle": "dashed" if dashed else "solid",
        "roughness": 1, "opacity": 100, "groupIds": [], "frameId": None,
        "roundness": {"type": 3} if kind in ("rectangle", "diamond") else None,
        "seed": _rng.randint(1, 2 ** 31), "version": 1,
        "versionNonce": _rng.randint(1, 2 ** 31), "isDeleted": False,
        "boundElements": [], "updated": 1785777351988, "link": None,
        "locked": False, "index": "",
    }


def _id() -> str:
    alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_"
    return "".join(_rng.choice(alphabet) for _ in range(21))


def _text_metrics(text: str, size: int, family: int) -> tuple[float, float]:
    # Advance width per character. Cascadia is a true monospace at ~0.6em;
    # Excalifont averages nearer 0.55em. Only affects the initial bounding box:
    # Excalidraw re-measures with the real font on load.
    per = 0.60 if family == MONO else 0.55
    lines = text.split("\n")
    return max(len(ln) for ln in lines) * size * per, len(lines) * size * 1.25


def box(x, y, w, h, text, colour=GREEN, *, size=16, family=HAND,
        kind="rectangle", dashed=False, align="center") -> dict:
    """A shape with text bound inside it."""
    container = _base(kind, x, y, w, h, colour[0], colour[1], dashed=dashed)
    tw, th = _text_metrics(text, size, family)
    tw = min(tw, w - 16)
    label = _base("text", 0, 0, tw, th, colour[0], "transparent")
    label["roundness"] = None
    label.update({
        "text": text, "originalText": text, "fontSize": size,
        "fontFamily": family, "textAlign": align, "verticalAlign": "middle",
        "containerId": container["id"], "autoResize": False, "lineHeight": 1.25,
    })
    label["x"] = x + (w - tw) / 2 if align == "center" else x + 8
    label["y"] = y + (h - th) / 2
    container["boundElements"] = [{"type": "text", "id": label["id"]}]
    _elements.extend([container, label])
    return container


def panel(x, y, w, title, body, colour=GREY, size=14) -> float:
    """A monospace reference card. Returns the y of its bottom edge."""
    text = title + "\n" + "-" * max(len(ln) for ln in title.split("\n")) + "\n" + body
    _, th = _text_metrics(text, size, MONO)
    h = th + 28
    rect = _base("rectangle", x, y, w, h, colour[0], colour[1], dashed=True)
    tw, _ = _text_metrics(text, size, MONO)
    label = _base("text", x + 14, y + 14, tw, th, colour[0], "transparent")
    label["roundness"] = None
    label.update({
        "text": text, "originalText": text, "fontSize": size,
        "fontFamily": MONO, "textAlign": "left", "verticalAlign": "top",
        "containerId": None, "autoResize": True, "lineHeight": 1.25,
    })
    _elements.extend([rect, label])
    return y + h


def arrow(x1, y1, x2, y2, colour="#495057", *, dashed=False, label=None):
    a = _base("arrow", x1, y1, abs(x2 - x1), abs(y2 - y1), colour,
              "transparent", dashed=dashed)
    a["roundness"] = {"type": 2}
    a.update({"points": [[0, 0], [x2 - x1, y2 - y1]], "startBinding": None,
              "endBinding": None, "lastCommittedPoint": None,
              "startArrowhead": None, "endArrowhead": "arrow", "elbowed": False})
    _elements.append(a)
    if label:
        tw, th = _text_metrics(label, 14, HAND)
        t = _base("text", (x1 + x2) / 2 + 8, (y1 + y2) / 2 - th / 2, tw, th,
                  colour, "transparent")
        t["roundness"] = None
        t.update({"text": label, "originalText": label, "fontSize": 14,
                  "fontFamily": HAND, "textAlign": "left", "verticalAlign": "top",
                  "containerId": None, "autoResize": True, "lineHeight": 1.25})
        _elements.append(t)


# --------------------------------------------------------------- the drawing

L, W = 300, 900                     # main column left edge / width
MID = L + W / 2
row = {}                            # name -> (y, h), so arrows read clearly

box(L, -230, W, 100,
    f"BS-PROOF  ·  HOW ONE DEMO RUN WORKS\nscoring model: {SCORING_MODEL}   ·   2026-08-25",
    BLUE, size=26)

panel(1500, -230, 560, "READING THIS DIAGRAM", f"""
GREEN   deterministic code. same input -> same output.
VIOLET  a model call. one shot, no tools, no memory.
BLUE    data coming in from outside, or going out.
RED     a decision / a refusal.

Every box below runs on YOUR machine in one command.
Nothing in the green path can be talked into a
different answer. The model calls extract FACTS;
every number is computed afterwards, in code.""".strip("\n"), BLUE)

# ---- 1 command
y = -80
box(L, y, W, 90,
    "python3 run_pipeline.py magnesium --form magnesium_glycinate \\\n"
    "        --grok --per-outcome --dose 400 --limit 120",
    GREY, size=15, family=MONO)
arrow(MID, y + 90, MID, y + 130)

# ---- 2 input
y = 60
box(L, y, W, 80,
    "1 · INPUT     ingredient  ·  YOUR form  ·  YOUR dose (mg elemental)", BLUE)
arrow(MID, y + 80, MID, y + 120)

y = 180
box(L, y, W, 90,
    "2 · RESOLVE    canonical ingredient  ·  form enum + salt family\n"
    "30-outcome vocabulary  ·  4 population variants")
arrow(MID, y + 90, MID, y + 130)

# ---- 3 retrieval
y = 310
box(L, y, W, 100,
    "3 · RETRIEVE   ONE QUERY PER OUTCOME, each with its own quota\n"
    "a single ranked query starves outcomes: 62 magnesium sleep RCTs\n"
    "exist, and one generic query surfaced sleep_quality n=1")
srcs = ["Europe PMC\nmetadata + OA full text", "PubMed E-utils\nMeSH + pubtype",
        "ClinicalTrials.gov\nregistry + results", "OpenAlex / Unpaywall\ngreen-OA resolver"]
sw, gap = 300, 40
sx0 = MID - (len(srcs) * sw + (len(srcs) - 1) * gap) / 2
for i, s in enumerate(srcs):
    sx = sx0 + i * (sw + gap)
    box(sx, y + 150, sw, 90, s, BLUE, size=15)
    arrow(sx + sw / 2, y + 140, sx + sw / 2, y + 150, "#adb5bd", dashed=True)
    arrow(sx + sw / 2, y + 240, sx + sw / 2, y + 280, "#adb5bd", dashed=True)
arrow(MID, y + 100, MID, y + 140)

# ---- 4 classify
y = 590
box(L, y, W, 90,
    "4 · CLASSIFY DESIGN   PubMed tags first (deterministic, ~85-90%)\n"
    "S1 fires ONLY when the tags are ambiguous")
box(L - 460, y, 400, 90,
    "SYNTHESES (SR / MA / umbrella)\nare DATA, not evidence  [S2]\n"
    f"included lists only · ×{1 + LAMBDA:.2f} ceiling", YELLOW, size=14)
arrow(L, y + 45, L - 60, y + 45, "#f08c00", label="rank 1-3")
arrow(MID, y + 90, MID, y + 130)

y = 720
box(L, y, W, 90,
    "5 · DEDUP    NCT  >  DOI  >  PMID  >  fingerprint\n"
    "one trial = ONE evidence unit, however many papers it produced")
arrow(MID, y + 90, MID, y + 130)

# ---- 6 full text
y = 850
box(L, y, W, 80, "6 · FULL-TEXT LADDER — three rungs, stop at the first hit")
rungs = ["1. Europe PMC\nJATS XML", "2. Europe PMC\nfree full-text URL",
         "3. OpenAlex / Unpaywall\nPDF + HTML extract"]
rw = (W - 2 * 20) / 3
for i, r in enumerate(rungs):
    box(L + i * (rw + 20), y + 110, rw, 80, r, BLUE, size=14)
box(L, y + 210, W, 70,
    "demo runs are FULL-TEXT ONLY. an abstract-only study lands near w=0.023\n"
    "and needs ~300 of its kind to reach c=0.9; a full-text study needs ~50.",
    YELLOW, size=14)
arrow(MID, y + 80, MID, y + 110)
arrow(MID, y + 190, MID, y + 210)
arrow(MID, y + 280, MID, y + 320)

# ---- 7 relevance gate
y = 1170
box(L, y, W, 90,
    "7 · RELEVANCE GATE    drops IV / procedural / wrong-ingredient papers\n"
    "BEFORE any model spend — a skipped study costs nothing", RED)
arrow(MID, y + 90, MID, y + 130)

# ---- 8 fan out
y = 1300
box(L, y, W, 80, "8 · FAN OUT    4 studies in flight × 5 agents each")
agents = [
    ("S3\nstudy facts", "B"), ("S4\nRoB 6-item", "B"), ("S5\nconclusions", "B"),
    ("S7\nform + dose", "B"), ("S8\nfunding", "A"),
]
aw = (W - 4 * 15) / 5
for i, (a, tier) in enumerate(agents):
    box(L + i * (aw + 15), y + 110, aw, 100, f"{a}\ntier {tier}", VIOLET, size=14)
box(L, y + 240, W, 90,
    "S6 · outcome text → fixed vocabulary   (tier C, the highest-risk agent)\n"
    "fires once PER CLAIM — ~5 of the ~10 model calls a study costs", VIOLET, size=15)
box(L - 460, y + 110, 400, 220,
    "EVERY AGENT IS A PURE FUNCTION\n\n"
    "one shot · no tools · no loop\nno memory · temperature 0\nJSON in → JSON out → exit\n\n"
    "if it needs a second turn,\nthe PROMPT is wrong.\n\n"
    "evidence span required on\nevery extracted field.", VIOLET, size=14)
arrow(MID, y + 80, MID, y + 110)
arrow(MID, y + 210, MID, y + 240)
arrow(MID, y + 330, MID, y + 370)

# ---- 9 weight
y = 1670
box(L, y, W, 90,
    "9 · w_study  =  design × RoB × size × funding × OA\n"
    "STUDY QUALITY ONLY. form, dose and population are NOT in here.", GREY)
arrow(MID, y + 90, MID, y + 130)

y = 1800
box(L, y, W, 80, "10 · MERGE by ECU key   (ingredient, form, dose_band, outcome, population)")
arrow(MID, y + 80, MID, y + 120)

y = 1920
box(L, y, W, 90,
    "11 · E = Σ w_study over UNIQUE primaries\n"
    f"E′ = E × (1 + {LAMBDA} × coverage × q_s)     ← the only thing syntheses do")
arrow(MID, y + 90, MID, y + 130)

# ---- 12 gate
y = 2050
box(MID - 200, y, 400, 130, "enough human\nevidence?", RED, kind="diamond")
box(MID + 300, y + 20, 460, 90,
    "SHOW “insufficient human evidence”\nand NO NUMBER", RED, size=15)
arrow(MID + 200, y + 65, MID + 300, y + 65, "#e03131", label="no")
arrow(MID, y + 130, MID, y + 180, label="yes")

# ---- 13 the three quantities
y = 2200
trio = [f"d = Σ(w·s) / Σw\n−1 … +1\nwhat it says",
        f"c = 1 − e^(−E′/k)\n0 … 1     k = {K:g}\nhow much we know",
        "H = weighted var(s)\ndisagreement"]
tw3 = (W - 2 * 20) / 3
for i, t in enumerate(trio):
    box(L + i * (tw3 + 20), y, tw3, 100, t, GREY, size=15)
arrow(MID, y + 100, MID, y + 140)

# ---- 14 the four arcs
y = 2410
box(L, 2340, W, 50, "12 · THE FOUR ARCS — each carries a VERDICT and its COVERAGE", GREEN)
arcs = [
    ("EFFECT", "does the ingredient\nwork at all?", "d over ALL evidence\ncoverage 1.0"),
    ("FORM", "does YOUR\npreparation work?", "d over exact-form trials\ncoverage = weight share"),
    ("DOSE", "does it work at\nYOUR dose?", "d over in-band trials\ncoverage = weight share"),
    ("EVIDENCE", "how much do we\nactually know?", "no direction — pure\nquantity. fill = c"),
]
aw4 = (W - 3 * 15) / 4
for i, (name, q, how) in enumerate(arcs):
    box(L + i * (aw4 + 15), y, aw4, 140, f"{name}\n\n{q}\n\n{how}", GREEN, size=13)
arrow(MID, y + 140, MID, y + 180)

# ---- 15 composite
y = 2600
box(L, y, W, 110,
    "13 · DISPLAYED SCORE  0–100  =  100 × c × mean(effect, form, dose)\n"
    f"internal signed −100…+100 = 100 × d × c × (1 − {H_PENALTY}H)\n"
    "confidence MULTIPLIES: if we barely know anything, nothing else matters", GREEN, size=15)
arrow(MID, y + 110, MID, y + 150)

y = 2760
box(L, y, W, 100,
    "14 · REPORT →  reports/runs/  +  INDEX.md  +  latest.md\n"
    "stamped with scoring_model and the provider that extracted it\n"
    "one row per outcome, sorted by evidence mass", BLUE, size=15)

# --------------------------------------------------------------- side panels

px, pw = 1500, 560
py = 40

py = panel(px, py, pw, "THE ONE THING TO TELL PEOPLE", """
Two products differing ONLY in form or dose share
the centre number. That is deliberate -- the weight
is study quality, so the difference is carried by
the ARCS, not by the number.

    0.00 @ 0%    nobody tested your form
   -0.70 @ 100%  your form WAS tested, and failed

Opposite messages. They must never render the same,
and a score published without its arcs is a false
claim: no ranked table, no lone "glycinate = 52".""".strip("\n"), RED) + 30

_w = "\n".join(
    f"  {k:<22}{v:>6.2f}" for k, v in
    [("RoB low", ROB_FACTOR["low"]), ("RoB some concerns", ROB_FACTOR["some_concerns"]),
     ("RoB high", ROB_FACTOR["high"]), ("independent funding", FUNDING_FACTOR["independent"]),
     ("brand funded", FUNDING_FACTOR["brand_funded"]),
     ("full text", OA_FACTOR["full_text"]), ("SR table only", OA_FACTOR["sr_table"]),
     ("abstract only", OA_FACTOR["abstract_only"])])
py = panel(px, py, pw, "WEIGHT = QUALITY ONLY  (w_study)", f"""
  design: RCT {DESIGN_W[4]:.2f}   non-rand CT {DESIGN_W[5]:.2f}   cohort {DESIGN_W[6]:.2f}
{_w}
  size:  min(1, log10(n) / 2)

FORM and DOSE factors still exist ({FORM_FACTOR['exact']:.2f} exact /
{FORM_FACTOR['salt_family']:.2f} salt family / {FORM_FACTOR['different']:.2f} different) but they
feed the ARCS now, not the weight.""".strip("\n"), GREY) + 30

py = panel(px, py, pw, "WHAT ONE STUDY CONTRIBUTES  (s_i)", f"""
  meaningful benefit   {S_VALUE['benefit_meaningful']:+.1f}
  trivial benefit      {S_VALUE['benefit_trivial']:+.1f}
  quantified null      {S_VALUE['null_effect']:+.2f}  measured/equivalence
  unquantified NS       0.0   inconclusive
  harm                 {S_VALUE['harm']:+.1f}

A measured zero or successful equivalence result is
evidence AGAINST; a p>0.05 label without a usable
signed estimate or precision basis is retained as
inconclusive, not converted into a fixed negative.

Exception: a valid controlled ADVERSE-EVENT null is
reassurance, and is scored as such.""".strip("\n"), GREY) + 30

py = panel(px, py, pw, "WHY 0-100 DOESN'T LIE", """
  1 weak trial, positive     ->   3   evidence arc EMPTY
  20 solid null trials       ->  15   evidence arc FULL

Both are low numbers. The evidence arc is what tells
"useless" apart from "unstudied" -- the number alone
never could, which is the whole reason the ring is
not decoration.

  50 = no effect either way, NOT "half good".""".strip("\n"), GREEN) + 30

qx, qw = 2120, 620
qy = 40

qy = panel(qx, qy, qw, "THREE EXTRACTION BACKENDS", """
  claude_adapter   subscription + safe   production
  pilot_adapter    subscription          superseded
  grok_adapter     grok CLI, signed in   after anchor eval

Same prompts, same schemas, same PROMPT_VERSION.
Separate stores, separate report labels.

NEVER blend field-level output from two providers
into one Study. On disagreement the default is
discard or human review -- never average, never
take the higher score.""".strip("\n"), VIOLET) + 30

qy = panel(qx, qy, qw, "GROK MODEL TIERS", """
  A   S1, S8              grok-4.3    simple classification
  B   S2,S3,S4,S5,S7      grok-4.5    adversarial extraction
  C   S6                  grok-4.5    fewest hallucinations

S6 is ~5 of the ~10 calls per study, so tier C is the
dominant cost -- not tier A.

  120-study run:  all 4.5              $9.48
                  A -> 4.3             $9.10   4%
                  + C -> 4.20-reason   $7.21  24%   <- the lever

Tier B moves only after an A/B on the 28 anchors.
SPEC 15: tiers are a prior, not a measurement.""".strip("\n"), VIOLET) + 30

qy = panel(qx, qy, qw, "MEASURED, NOT ASSUMED", f"""
Coverage, full corpus n=20155 (100%):
  methods-level facts        77.5%   target >= 80%

Marginal gain over OpenAlex, all measured head-to-head:
  Unpaywall                  +0.0pp
  Semantic Scholar           +0.0pp  (strict subset)
  CORE (keyless)             +0.0pp  (20/40 answered)
They aggregate the same repositories. STOP ADDING ONES.

SR-table inheritance: the three defects that made it
return zero are fixed; the uplift is still UNMEASURED
and is the only rung left.

Dose band is DERIVED from the trials: the observed
min-max among BENEFIT trials. Null-effect doses are
reported next to it, because "your product is dosed
where trials found nothing" is the most useful thing
this axis can say.

Sufficiency gate: sum of design weight >= {GATE_MIN_HUMAN_WD}, else
no number at all.""".strip("\n"), GREEN) + 30

qy = panel(qx, qy, qw, "KNOWN LIMITS  -  SAY THESE OUT LOUD", """
1  Retrieval specificity is the gating problem.
   ("magnesium") AND RCT is ~25% IV / procedural.
   The ingredient must be constrained to the
   INTERVENTION, not to the document.

2  k, the transfer factors, the RoB thresholds and
   the OA penalty are GUESSES awaiting Tier-3
   calibration. Changing one needs a PR + SPEC 13.

3  Anchor eval has not run. 34/34 in-scope anchors
   have vocabulary; running them needs extraction.
   Trust no constant until it has.

4  Production extraction runs on the Claude
   subscription. The ceiling is throughput, not
   access: the limit is time-based, so a batch
   that hits it must wait, not retry.

5  Every Grok extraction before commit eb3491d ran
   on a truncated prompt. Treat those tables as
   suspect, including the magnesium ones.""".strip("\n"), YELLOW) + 30

qy = panel(qx, qy, qw, "RUN IT YOURSELF", """
  python3 -m pipeline.selftest

  python3 run_pipeline.py creatine \\
      --form creatine_monohydrate --wiring

  python3 run_pipeline.py magnesium \\
      --form magnesium_glycinate --grok \\
      --per-outcome --dose 400 --limit 120

--wiring   no model at all: proves the plumbing
--per-outcome  one query per outcome (see box 3)
--dose     YOUR elemental mg. without it the dose
           arc says "not assessable" and MEANS it.""".strip("\n"), BLUE) + 30

# --------------------------------------------------------------- write

for i, e in enumerate(_elements):
    e["index"] = f"b{i:04d}"

OUT.write_text(json.dumps({
    "type": "excalidraw", "version": 2, "source": "https://excalidraw.com",
    "elements": _elements,
    "appState": {"gridSize": 20, "gridStep": 5, "gridModeEnabled": False,
                 "viewBackgroundColor": "#ffffff"},
    "files": {},
}, indent=1))
print(f"wrote {OUT}  ({len(_elements)} elements, {OUT.stat().st_size // 1024} kB)")
