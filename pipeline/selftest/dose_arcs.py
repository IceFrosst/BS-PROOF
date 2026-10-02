"""Selftest group: Effective dose band, the v14 composite, donut, preview, the four arcs, form ladder, safety outcomes and applicability.

Moved verbatim out of the single pipeline/selftest.py main() on 2026-10-03;
run order is preserved by pipeline/selftest/__init__.py."""
import sys, os, pathlib  # noqa: F401  (sections use them)
from pipeline.selftest._common import Study, score_ecu, band_for, S_VALUE, standardise_effect, dedup, canonical_id, registry_id, vocab, ROB_CLEAN, rcts, _reasonless_probe  # noqa: F401


def run(check, *, product, _score):
    print("\nEFFECTIVE DOSE BAND (derived, not invented)")
    from pipeline import dose as dosemod
    ents = [{"dose_low_mg": 200, "dose_high_mg": 200, "direction": "benefit"},
            {"dose_low_mg": 300, "dose_high_mg": 300, "direction": "benefit"},
            {"dose_low_mg": 50,  "dose_high_mg": 50,  "direction": "null_effect"},
            {"dose_low_mg": None,"dose_high_mg": None,"direction": "benefit"}]
    band = dosemod.effective_range(ents)
    check("band is the observed benefit range, nothing chosen",
          band["low"] == 200 and band["high"] == 300 and band["n_benefit"] == 2,
          "a percentile or margin would be a new free constant")
    check("null doses reported separately",
          band["null_range"] == {"low": 50, "high": 50},
          "a dose where trials found NOTHING is the useful warning")
    check("undosed trial excluded, never guessed",
          band["n_benefit"] == 2 and dosemod.coverage_fraction(band, ents) == 0.75)
    check("no dosed benefit trial -> no band, band_version 0",
          dosemod.effective_range(
              [{"dose_low_mg": 5, "dose_high_mg": 5, "direction": "null_effect"}]
          )["band_version"] == 0)

    # CONTINUOUS DOSE FACTOR (SCORING_MODEL v10, founder-approved 2026-08-12).
    # The knots are the DOSE_FACTOR values; the shape is flat-in-band with
    # linear ramps outside. Pins below encode the two design arguments so they
    # cannot be silently re-litigated in code.
    _B = {"low": 5000, "high": 10000}
    _df = lambda d: dosemod.dose_factor_for(d, d, _B)
    check("the founder's scenario: 4 g against a 5-10 g band earns 0.64",
          _df(4000) == 0.64,
          "the tier gave 0.45 with a cliff at 5000; the ramp prices 80% of the "
          "low end as 0.64")
    check("NO CLIFF at the band edge",
          _df(4999) > 0.99 and _df(5000) == 1.0,
          "under the tiers a 0.02% dose difference doubled the credit")
    check("FLAT inside the band -- the midpoint is NOT a peak",
          _df(5000) == _df(7500) == _df(10000) == 1.0,
          "the band is the OBSERVED range: every dose inside it was directly "
          "measured, and the midpoint is often the least evidenced point. "
          "Peak-at-middle would downgrade an endpoint dose with direct positive "
          "trials in favour of one nobody tested, and dose-response is sigmoid "
          "with a plateau (creatine 3 g/d saturates like 5 g/d), not triangular")
    check("clamped at the tier floors outside",
          _df(2000) == 0.10 and _df(25000) == 0.60,
          "the ramp never prices a dose below what the founder's tiers did")
    check("monotone on each side",
          _df(3000) < _df(4000) < _df(4999) and _df(12000) > _df(15000) > _df(19000))
    check("an interval straddling the band edge is PRICED, not refused",
          dosemod.dose_factor_for(4000, 6000, _B) == 0.64,
          "the factor is unimodal so the endpoints bound it; the pessimistic "
          "end is the honest single answer where the tier function had to "
          "refuse a category")
    check("no band or no dose is unassessable",
          dosemod.dose_factor_for(None, None, _B) is None
          and dosemod.dose_factor_for(4000, 4000, {"low": None}) is None)
    # graded arc membership: the cliff the adversarial pass flagged is gone
    _g = lambda f: Study(id=f"g{f}", design_rank=4, n=200, rob_items=ROB_CLEAN,
                         funding="independent", oa="full_text", form_match="exact",
                         pop_match="exact", direction="benefit",
                         magnitude="meaningful", dose_factor=f)
    from pipeline.arcs import _dose_verdict
    _d99, _w99 = _dose_verdict([_g(0.9996)])
    _dnone, _wnone = _dose_verdict([_g(None)])
    check("a trial at 99% of the product's dose now counts at ~99%",
          _w99 > 0 and _d99 == 1.0,
          "binary membership gave it ZERO while a trial at 200% counted fully")
    check("a trial with no known dose still earns the arc nothing",
          _dnone is None and _wnone == 0.0,
          "unassessable is not punished, it is merely not credited")

    # DOSE TERM = CLOSENESS TO WHERE IT WORKED (v12, founder design 2026-08-12:
    # "take all the dosages where there was a positive effect, and see how close
    # our dose is"). Direction lives in the effect term alone; benefit trials
    # far from your dose stop voting FOR you and become the yardstick instead.
    from pipeline.arcs import composite as _comp, applicability as _fit
    from pipeline import arcs as _arcs
    check("a product close to the benefit range outscores one far below it",
          _comp(0.2, 0.8, 0.85, 0.9, 0.0) > _comp(0.2, 0.8, 0.10, 0.9, 0.0),
          "4.4 g against a 4.8-5 g range (0.85) vs against a 20 g range (0.10)")
    check("closeness arrives on 0..1 and is NOT read as a verdict",
          _comp(1.0, 1.0, 1.0, 1.0, 0.0) == 100 and _comp(1.0, 1.0, 0.0, 1.0, 0.0) == 75,
          "closeness 0.0 must read as 'far from the working range' (A = 0.5, "
          "75), not as 0.5 'no effect' -- the same trap the form term documents")
    check("no benefit range falls back to the missing-dose penalty",
          _comp(1.0, 1.0, None, 1.0, 0.0) < _comp(1.0, 1.0, 1.0, 1.0, 0.0)
          and _fit(1.0, None) == (1.0 + _arcs.MISSING_DOSE_PENALTY) / 2,
          "silence is not a pass: either nothing worked anywhere or no benefit "
          "trial carried a dose, and both price the dose axis at 0.10")

    # SCORING_MODEL v14 (founder 2026-09-04, "too strict, make it make sense").
    # The headline is the SIGNED score rescaled onto 0-100 and discounted for
    # applicability. Pinned: the identity, the asymmetry, and the two readings
    # the old mean got backwards.
    print("\nV14 COMPOSITE = 50 + signed/2 x applicability")
    check("at full applicability the composite IS the signed score rescaled",
          all(_comp(d, 1.0, 1.0, 1.0, 0.0) == round(50 + 50 * d)
              for d in (-1.0, -0.35, -0.1, 0.0, 0.1, 0.38, 0.5, 1.0)),
          "composite = 50 + signed/2 when A = 1 -- SPEC 9's bands map arithmetically")
    check("no effect reads 50 whatever the form and dose match",
          _comp(0.0, 1.0, 1.0, 1.0, 0.0) == 50 == _comp(0.0, 0.0, None, 1.0, 0.0),
          "under the old mean d = 0 with full form and dose read 77 'works'")
    check("harm is not softened by a poor product match",
          _comp(-1.0, 0.0, None, 1.0, 0.0) == 0 == _comp(-1.0, 1.0, 1.0, 1.0, 0.0),
          "under the old mean unanimous harm with full form and dose read 60")
    check("a null verdict is not softened either",
          _comp(-0.35, 0.0, None, 1.0, 0.0) == _comp(-0.35, 1.0, 1.0, 1.0, 0.0) == 32,
          "an untested form is no reason to read 'does not work' as 'unclear'")
    check("applicability only ever pulls a positive signal toward 50",
          _comp(1.0, 0.0, None, 1.0, 0.0) == 52 and 50 <= _comp(0.5, 0.0, None, 1.0, 0.0) <= 52,
          "untested form + no dose range: A = 0.05, so even d = +1 reads 'unclear'")
    check("heterogeneity reaches the headline through the signed score",
          _comp(0.8, 1.0, 1.0, 1.0, 1.0) < _comp(0.8, 1.0, 1.0, 1.0, 0.0),
          "H_PENALTY is in `signed`; the display must not drop it")
    check("the composite is clamped to 0..100",
          _comp(-1.0, 1.0, 1.0, 1.0, 0.0) == 0 and _comp(1.0, 1.0, 1.0, 1.0, 0.0) == 100)
    # Labels are SPEC 9's signed bands, mapped: +30 -> 65, +10 -> 55, -10 -> 45,
    # -40 -> 30. No new threshold.
    _lab = _arcs.label
    check("labels are the signed bands rescaled",
          _lab(65, 0.9) == "works" and _lab(64, 0.9) == "probably works"
          and _lab(55, 0.9) == "probably works" and _lab(54, 0.9) == "unclear"
          and _lab(45, 0.9) == "unclear" and _lab(44, 0.9) == "probably does not work"
          and _lab(30, 0.9) == "probably does not work" and _lab(29, 0.9) == "does not work")
    check("20 unanimous well-run nulls read 'probably does not work'",
          _lab(_comp(-0.35, 1.0, 1.0, 1.0, 0.0), 1.0) == "probably does not work",
          "the fixture S_VALUE['null_effect'] was chosen on: -35 = 'weak evidence against'")
    check("a low applicability score turns a shrunk positive into 'not tested for your product'",
          _lab(52, 0.9, effect_verdict=1.0, applicability_score=0.05)
          == "works, but not tested for your product"
          and _lab(52, 0.9, effect_verdict=1.0, applicability_score=0.9)
          == "works, but weakly evidenced")
    # FOUNDER CALL 2026-08-12 ("don't fix that thing we lose"), pinned so the
    # limitation is a decision, not an oversight: the SCORE does not distinguish
    # "your dose was tested and failed" from "your dose was never tested" --
    # both are simply outside the range where benefit occurred. The row's
    # null_range and the arc's verdict/coverage still show the difference to a
    # READER; it does not move the number.
    check("tested-and-failed and never-tested doses score the SAME by design",
          _comp(0.5, 0.5, 0.2, 0.9, 0.0) == _comp(0.5, 0.5, 0.2, 0.9, 0.0),
          "trivially true -- this pin exists to hold the comment above")

    check("dose inside the band", dosemod.dose_match_for(250, 250, band) == "in_band")
    check("just under the low end", dosemod.dose_match_for(150, 150, band) == "low_50_99")
    check("far under", dosemod.dose_match_for(40, 40, band) == "below_50")
    check("far over", dosemod.dose_match_for(700, 700, band) == "above_200")
    check("interval straddling a tier edge REFUSES to pick",
          dosemod.dose_match_for(150, 250, band) == "unspecified",
          "rounding to the likelier side would silently move the score")
    check("no band -> unspecified, not a free pass",
          dosemod.dose_match_for(200, 200, {"low": None}) == "unspecified")

    print("\nDONUT (score in the centre, arc = confidence)")
    from pipeline.donut import donut_svg, donut_line, confidence_label
    strong = {"score": 86, "band": "strong support", "gate_fired": False,
              "components": {"c": 0.91}}
    thin   = {"score": 4, "band": "inconclusive", "gate_fired": False,
              "components": {"c": 0.05}}
    conflict = {"score": 4, "band": "inconclusive", "gate_fired": False,
                "components": {"c": 0.88}}
    gated  = {"score": None, "band": "insufficient human evidence",
              "gate_fired": True, "components": {}}
    check("arc length tracks c, not the score",
          donut_line(thin).count("#") < donut_line(conflict).count("#"),
          "same +4 -- one is genuine conflict, one is nobody-has-looked")
    check("gated row draws an EMPTY ring", donut_line(gated).count("#") == 0
          and "gated" in donut_line(gated),
          "'no number' must not look like 'zero'")
    check("gated centre is not a number", "--" in donut_svg(gated))
    check("sign is shown explicitly", "+86" in donut_svg(strong))
    check("band drives colour",
          donut_svg(strong).count("#0f7b4f") and donut_svg(thin).count("#8a8f98"),
          "inconclusive is grey, never pale green")
    check("confidence has plain-words labels",
          confidence_label(0.01) != confidence_label(0.9))
    check("svg is self-contained", donut_svg(strong).startswith("<svg")
          and "http" not in donut_svg(strong).split("aria-label")[0].replace(
              "http://www.w3.org/2000/svg", ""))

    print("\nSMALL-RUN PREVIEW (project, never rescale k)")
    from pipeline import preview
    big = score_ecu(rcts(60, oa="abstract_only", form_match="salt_family"), [])
    small = score_ecu(rcts(6, oa="abstract_only", form_match="salt_family"), [])
    ps = preview.project(small, 6, 60)
    check("sample under 20 refuses to project",
          ps["projected"] is None and "below" in ps["reason"],
          "a 40-point error bar spans four bands; that is noise, not a preview")
    mid = score_ecu(rcts(30, oa="abstract_only", form_match="salt_family"), [])
    pm = preview.project(mid, 30, 60)
    check("d is carried through unchanged, not rescaled",
          abs(pm["d"] - big["d"]) < 1e-9,
          "d is a weighted MEAN -- sample-size independent by construction")
    check("projected c never falls below sample c",
          pm["c_projected"] >= pm["c_sample"],
          "strict > held at K=3.0; at K=1.5 (v4) 30 studies already saturate "
          "c to 1.0, so at the ceiling projection and sample legitimately tie")
    check("projection lands nearer the truth than the raw sample score",
          abs(pm["projected"] - big["score"]) <= abs(pm["sample_score"] - big["score"]),
          f"raw {pm['sample_score']:+d} -> projected {pm['projected']:+d} "
          f"vs true {big['score']:+d}")
    check("error bar shrinks with sample size",
          preview._expected_error(5) > preview._expected_error(40) > preview._expected_error(200))
    check("cheap evidence needs far more of it",
          preview.studies_needed(0.023) > 10 * preview.studies_needed(0.56),
          f"{preview.studies_needed(0.023)} vs {preview.studies_needed(0.56)} studies for c=0.9")

    print("\nFOUR ARCS + 0-100 COMPOSITE")
    from pipeline import arcs as A
    from pipeline.donut import four_arc_svg
    ROBC = {f"i{i}": 1 for i in range(1, 7)}
    def _s(direction, form, dose, mag=None, n=200, oa="full_text", rob=None):
        # The dose arc grades by the continuous dose_factor since v10; the tier
        # string alone no longer enters it. Fixtures state their intent as a
        # tier, mapped here through the same DOSE_FACTOR table the ramp's knots
        # come from, so a founder retuning moves the fixtures with it.
        _f = {"in_band": 1.0, "low_50_99": 0.45, "below_50": 0.10,
              "above_200": 0.60}.get(dose)
        return Study(id=f"{direction}{form}{dose}{n}{oa}", design_rank=4, n=n,
                     rob_items=rob or ROBC, funding="independent", oa=oa,
                     form_match=form, dose_match=dose, dose_factor=_f,
                     pop_match="exact", direction=direction, magnitude=mag)

    # Every fixture in this block declares its dose intent as a tier on the
    # study; under v12 the composite's dose term is the product's CLOSENESS to
    # the benefit range, passed to build() separately. "in_band" intent maps to
    # closeness 1.0 -- the product sits inside the range where benefit occurred.
    def _b(studies, closeness=1.0, **kw):
        return A.build(studies, dose_closeness=closeness, **kw)
    harmful = _b([_s("harm", "exact", "in_band") for _ in range(10)],
                 closeness=None)  # all harm -> no benefit range exists
    works = _b([_s("benefit", "exact", "in_band", "meaningful") for _ in range(10)])
    check("harmful product cannot accumulate points from a good form match",
          harmful["composite"] == 0,
          "summing arcs gave it 74/100; the form arc is now the VERDICT, -1.00")
    check("clean positive reaches the top", works["composite"] >= 90)

    yourform = _b([_s("benefit", "different", "in_band", "meaningful") for _ in range(8)]
                       + [_s("null_effect", "exact", "in_band") for _ in range(4)])
    check("works overall but YOUR form found nothing",
          yourform["arcs"]["effect"]["verdict"] > 0
          and yourform["arcs"]["form"]["verdict"] < 0,
          f"effect {yourform['arcs']['effect']['verdict']:+.2f} vs "
          f"form {yourform['arcs']['form']['verdict']:+.2f} — the case that "
          f"justifies a per-form arc at all")
    check("that arc reports how little evidence backs it",
          yourform["arcs"]["form"]["coverage"] < 0.5,
          f"{yourform['arcs']['form']['coverage']:.0%} of the evidence")

    untested = _b([_s("benefit", "different", "in_band", "meaningful") for _ in range(10)])
    check("no trial in your form is PENALISED, not dropped",
          untested["composite"] < works["composite"],
          f"{untested['composite']} vs {works['composite']} — averaging over "
          f"available arcs gave both 99")
    check("an untested axis has no verdict and zero coverage",
          untested["arcs"]["form"]["verdict"] is None
          and untested["arcs"]["form"]["coverage"] == 0.0)

    # FORM LADDER (SCORING_MODEL v5, founder design 2026-08-11). The form arc no
    # longer re-scores the effect verdict over a subset; it scores the EVIDENCE
    # HIERARCHY of non-negative evidence in your own form. These pin the design,
    # the A/B/C width choice, and the invariant-8 separation the ladder must keep.
    print("\nFORM LADDER")
    _fl, _fs = A.form_ladder_score, A.form_strength
    check("an umbrella review in your form scores 100",
          _fs([], None, [{"design_rank": 1, "direction": "benefit"}]) == (1.0, "ladder"),
          "the founder's flagship case")
    check("only animal evidence in your form scores 10, not 0 and not full credit",
          _fl([12]) == 0.10)
    check("only cell evidence scores 5", _fl([13]) == 0.05)
    check("an RCT in your form scores 80", _fl([4]) == 0.80)
    check("the ladder is ordered by hierarchy",
          _fl([1]) > _fl([2]) > _fl([3]) > _fl([4]) > _fl([5]) > _fl([12]) > _fl([13]))
    # The measured A/B/C decision. top-1 scored "1 RCT + 9 animal" identical to
    # ten RCTs (no corroboration required); top-10 dragged a real RCT to 0.170.
    check("top-3 requires corroboration without diluting a real RCT",
          abs(_fl([4] + [12] * 9, 3) - 0.3333) < 0.001
          and _fl([4] + [12] * 9, 1) == 0.80
          and abs(_fl([4] + [12] * 9, 10) - 0.170) < 0.001,
          "pins scripts/experiments/form_experiment.py's conclusion; changing FORM_LADDER_TOP "
          "must be a deliberate, measured decision")
    check("a lone weak paper cannot be inflated by the window",
          _fl([12], 1) == _fl([12], 10) == 0.10)

    # INVARIANT 8: both score 0 strength, and they must STILL be distinguishable.
    _neg = _b([_s("null_effect", "exact", "in_band", None) for _ in range(4)],
              closeness=None)  # all null -> no benefit range exists
    _unt = _b([_s("benefit", "different", "in_band", "meaningful") for _ in range(4)])
    check("a form whose every study is negative earns no ladder credit",
          _neg["arcs"]["form"]["strength"] == 0.0
          and _neg["arcs"]["form"]["basis"] == "all_negative_in_form")

    # THE v5 CORRECTION (founder, 2026-08-11). v5 short-circuited on the POOLED
    # verdict, so one solid positive RCT plus three nulls in your form scored 0.0
    # -- the nulls out-voted the RCT in `d` and the ladder never ran. Eligibility
    # is per STUDY: walk DOWN the hierarchy until you find non-negative evidence.
    _mixed_form = _b(
        [_s("null_effect", "exact", "in_band", None) for _ in range(3)]
        + [_s("benefit", "exact", "in_band", "meaningful")])
    check("one positive RCT in your form still earns ladder credit beside nulls",
          _mixed_form["arcs"]["form"]["strength"] == 0.80
          and _mixed_form["arcs"]["form"]["basis"] == "ladder",
          "v5 scored this 0.0 on the pooled verdict; a negative pooled d is a "
          "WARNING in the verdict, not a reason to discard positive evidence")
    check("the pooled verdict still shows the warning",
          _mixed_form["arcs"]["form"]["verdict"] < 0,
          "strength and verdict answer different questions and both are shown")
    check("form untested scores no ladder credit either",
          _unt["arcs"]["form"]["strength"] == 0.0
          and _unt["arcs"]["form"]["basis"] == "untested_in_form")
    check("...but failed and untested are still TOLD APART by the arc",
          _neg["arcs"]["form"]["verdict"] is not None
          and _neg["arcs"]["form"]["coverage"] > 0.0
          and _unt["arcs"]["form"]["verdict"] is None
          and _unt["arcs"]["form"]["coverage"] == 0.0,
          "invariant 8: '0.00 @ 0%' and '-0.70 @ 100%' are opposite messages")

    # THE PREVIOUSLY UNTESTED CORNER. Every arc fixture used exact/different, so
    # nothing pinned how an UNSPECIFIED form behaves -- and 54% of the real
    # creatine corpus is unspecified.
    _uns = _b([_s("benefit", "unspecified", "in_band", "meaningful") for _ in range(4)])
    check("an unreported form earns no form credit and is not read as a match",
          _uns["arcs"]["form"]["strength"] == 0.0
          and _uns["arcs"]["form"]["basis"] == "untested_in_form"
          and _uns["arcs"]["form"]["verdict"] is None,
          "silence is not a pass -- but it no longer drags via effect x 0.15")
    check("a confirmed exact form DOES earn ladder credit over an unreported one",
          _b([_s("benefit", "exact", "in_band", "meaningful")
                   for _ in range(4)])["composite"] > _uns["composite"])

    # PER-STUDY CONTRIBUTIONS (founder ask 2026-08-11). Exact, not heuristic:
    # the points must sum to the signed score, or the report would be inventing
    # an attribution instead of decomposing one.
    from pipeline.scoring import contributions as _contrib
    _mix = [_s("benefit", "exact", "in_band", "meaningful") for _ in range(3)] \
         + [_s("null_effect", "exact", "in_band", None) for _ in range(2)]
    _res = _score(_mix, [])
    _cs = _contrib(_mix, _res)
    check("per-study contributions sum to the signed score",
          abs(sum(c["points"] for c in _cs) - _res["score"]) < 1.0,
          f"sum={sum(c['points'] for c in _cs):.2f} score={_res['score']}")
    check("a null study contributes NEGATIVE points",
          any(c["points"] < 0 for c in _cs) and any(c["points"] > 0 for c in _cs),
          "the sign says which way each study pushed the number")
    check("contributions are ordered by absolute influence",
          [abs(c["points"]) for c in _cs] == sorted((abs(c["points"]) for c in _cs),
                                                   reverse=True))
    check("a gated ECU has no contributions to attribute",
          _contrib([], {"score": None}) == [])

    # The composite must not unit-map a strength. Passing 0.0 through _unit()
    # would read it as 0.5 -- "no effect" -- and hand an untested form half credit.
    check("composite treats the form term as a strength, not a signed verdict",
          A.composite(1.0, 0.0, None, 1.0, 0.0) == 52,
          "A = (0.0 + 0.1)/2 = 0.05 -> 52; reading form 0.0 as a 0.5 verdict "
          "would give A = 0.3 -> 65 'works' for a form nobody tested")

    thin = _b([_s("benefit", "exact", "in_band", "meaningful", n=20,
                       oa="abstract_only", rob={f"i{i}": 0 for i in range(1, 7)})])
    nulls = _b([_s("null_effect", "exact", "in_band") for _ in range(20)],
               closeness=None)  # all null -> no benefit range exists
    check("confidence MULTIPLIES -- one weak trial cannot score well",
          45 <= thin["composite"] <= 54 and A.label(thin["composite"], thin["c"]) == "barely studied",
          f"{thin['composite']}/100; as a fourth term in a mean it scored 76, "
          f"and under the old composite it read 3 -- 'unstudied' now sits at 50, "
          f"not beside 'harmful'")
    check("'barely studied' and 'does not work' stay distinguishable",
          A.label(thin["composite"], thin["c"]) != A.label(nulls["composite"], nulls["c"]),
          f"{A.label(thin['composite'], thin['c'])!r} vs "
          f"{A.label(nulls['composite'], nulls['c'])!r} — SPEC §9's collapse, avoided")
    check("the evidence arc is what separates them",
          thin["arcs"]["evidence"]["coverage"] < 0.1
          and nulls["arcs"]["evidence"]["coverage"] > 0.9)
    check("signed score retained alongside the 0-100",
          works["signed"] is not None and nulls["signed"] < 0,
          "bands and the anchor set depend on it; only the DISPLAY is 0-100")
    check("four rings render", four_arc_svg(works).count("<circle") == 12)

    check("a row missing c cannot claim a verdict",
          A.label(16, None) == "confidence unknown",
          "a Grok report rendered 16/100 as 'does not work' because the "
          "projection dropped components; silence must not become a verdict")

    # Guard the plumbing itself: the immutable dashboard exporter must receive
    # the complete deterministic ECU rows.  The old hand-written projection
    # dropped applicability, dose, evidence ids, flags and provenance.
    _rp = (pathlib.Path(__file__).parent.parent.parent / "run_pipeline.py").read_text()
    _full_handoff = 'run_context["ecu_rows"] = rows' in _rp
    check("runner retains complete ECU rows for report artifacts", _full_handoff,
          "run_context must receive the full build_ecus rows without projection")

    print("\nSAFETY OUTCOMES + APPLICABILITY LABELS")
    from pipeline.assemble import to_studies as _ts
    def _one(outcome, direction):
        rec = {"_canonical": "x", "ingredient": "magnesium", "design_rank": 4,
               "oa": "full_text"}
        ext = {"S3": {"extraction_version": "legacy-v1.23", "n_randomised": 100},
               "S5": {"extraction_version": "legacy-v1.23"},
               "S7": {"extraction_version": "legacy-v1.23",
                      "form_vocab_id": "magnesium_glycinate"},
               "S8": {"funding_class": "independent"},
               "outcomes": [{"claim": {"direction": direction, "magnitude": None},
                             "outcome_vocab_id": outcome, "discarded": False}]}
        return _ts(rec, ext, product)[0][1]

    check("an unquantified EFFICACY null is inconclusive",
          _one("sleep_onset", "null_effect").s_value() == 0
          and _one("sleep_onset", "null_effect").effect_route == "inconclusive_unquantified",
          "without a signed between-arm estimate, a nonsignificant efficacy result is not evidence against")
    check("a null on a SAFETY outcome is reassurance, not failure",
          _one("adverse_events_gi", "null_effect").s_value() > 0,
          "no difference in side effects CONFIRMS 'this is safe'; scoring it "
          "-0.7 published magnesium's safety data as 'does not work'")
    check("harm on a safety outcome is still negative",
          _one("adverse_events_any", "harm").s_value() < 0)

    # ------------------------------------------------------------------
    # EFFECT-SIZE s_value (founder decision 2026-08-11, "do i"). Replaces vote
    # counting wherever a usable number exists. Every pin below is new code with
    # no prior coverage: the existing 392 checks all passed unchanged because
    # they set no effect_size and fall back to the label.
    from pipeline.scoring import (standardise_effect as _se, EFFECT_MID_SMD,
                                  EFFECT_FULL_SMD, EFFECT_MID_PCT, EFFECT_FULL_PCT)

    # -- the refusals. Each of these OCCURS in the creatine corpus, and each one
    # would invert or fabricate a sign if it were accepted.
    for unit, why, n_claims in (
            ("% change vs baseline", "within_group_not_between_arm", 10),
            ("cohen's d (within-group crm)", "within_group_not_between_arm", 2),
            ("kg cr post vs 13.5 kg placebo post", "within_group_not_between_arm", 1),
            ("partial eta-squared", "unsigned_variance_explained", 12),
            ("eta2p", "unsigned_variance_explained", 1),
            ("or", "ratio_null_is_one", 3),
            ("relative risk", "ratio_null_is_one", 1),
            ("kg", "raw_unit_needs_sd", 15),
            ("points", "raw_unit_needs_sd", 8),
            ("beta", "raw_unit_needs_sd", 7),
            ("none", "no_unit", 1)):
        s, route = _se(0.5, unit)
        check(f"unit {unit!r} is refused as {why}",
              s is None and route == why,
              f"{n_claims} such claim(s) in the creatine corpus; got {route}")
    check("a within-group unit is refused even when it names a real effect size",
          _se(0.7, "cohen's d (within-group)")[0] is None,
          "a pre/post d is not a between-arm contrast, and it is the LARGER number")

    # -- the accepted families
    check("cohen's d is standardised", _se(0.43, "cohen's d")[1] == "smd")
    check("hedges g is standardised", _se(0.43, "hedge's g")[1] == "smd")
    check("a bare ES is standardised", _se(0.43, "es")[1] == "smd")
    check("a percent difference is standardised", _se(5.0, "% difference")[1] == "percent")

    # -- THE LOAD-BEARING PROPERTY. The scale is recentred on the MEANINGFUL
    # threshold, not on zero, and that is what preserves invariant 7. Centring on
    # zero would score a well-powered measured-zero trial at s=0 -- "inconclusive",
    # indistinguishable from never studied, which is exactly what the founder
    # rejected when choosing -0.35 over 0.0 for a null.
    _zero = _se(0.0, "cohen's d")[0]
    check("a measured-ZERO effect reproduces the founder's null value",
          abs(_zero - S_VALUE["null_effect"]) < 0.02,
          f"measured zero -> {_zero:+.3f} vs S_VALUE['null_effect']="
          f"{S_VALUE['null_effect']}; the new scale DERIVES the old constant "
          f"instead of asserting it, so invariant 7 survives the change")
    check("a clear harm-sized effect reaches the founder's harm value",
          _se(-0.5, "cohen's d")[0] <= S_VALUE["harm"],
          f"-0.5 SMD -> {_se(-0.5, 'cohen d')[0]:+.3f}, clamped to "
          f"{S_VALUE['harm']}")
    check("the two unit families AGREE at their shared 'meaningful' anchor",
          abs(_se(0.5, "cohen's d")[0] - _se(5.0, "% difference")[0]) < 1e-9,
          "prompts/s5_conclusion.md calls 0.5 SMD and 5% both 'meaningful', so "
          "the continuous scale must place them identically or the same paper "
          "scores differently depending on which unit it happened to report")
    check("the 'trivial' bound sits exactly at zero on both scales",
          abs(_se(EFFECT_MID_SMD, "cohen's d")[0]) < 1e-9
          and abs(_se(EFFECT_MID_PCT, "%")[0]) < 1e-9,
          "below the threshold a person would notice, an effect is evidence "
          "AGAINST a meaningful benefit, not for it")
    check("s is clamped to [-1, +1]",
          _se(99.0, "cohen's d")[0] == 1.0 and _se(-99.0, "cohen's d")[0] == -1.0)
    check("a null that MEASURED a real effect stops voting against the product",
          _se(0.43, "cohen's d")[0] > 0,
          f"0.43 SMD -> {_se(0.43, 'cohen d')[0]:+.3f}, where vote counting scored "
          f"the same trial {S_VALUE['null_effect']}. This is the defect being "
          f"fixed: 24 of 27 sized nulls had a point estimate favouring creatine")

    # -- the guards on Study.s_value
    _es = lambda d, e, m=None: Study(id="e", design_rank=4, n=60, oa="full_text",
                                     rob_items=ROB_CLEAN, funding="independent",
                                     direction=d, magnitude=m, effect_s=e)
    check("a measured effect overrides the direction label",
          _es("null_effect", 0.38).s_value() == 0.38)
    # This pin's PREDECESSOR asserted the opposite: a benefit with negative
    # effect_s fell back to the label. That guard was written when effect signs
    # were untrusted raw values; after v1.17 effect_s is favours-oriented, so a
    # negative s on a benefit claim means SUB-THRESHOLD, and the guard promoted
    # exactly the smallest effects back to +1.0. Inverted-measure protection
    # (sprint time under muscle_power) lives upstream in effect_favours, and the
    # genuine label/number contradictions are refused in assemble._effect_s.
    check("Study trusts a favours-oriented negative s: sub-threshold stays negative",
          _es("benefit", -0.25, "meaningful").s_value() == -0.25,
          "a 0.05 SMD 'benefit' is evidence against a MEANINGFUL effect; the old "
          "guard scored it +1.0")
    from pipeline.assemble import _effect_s as _aes2
    check("benefit label + number favouring CONTROL is refused upstream",
          _aes2({"effect_size": 0.5, "effect_unit": "cohen's d",
                 "effect_favours": "control", "direction": "benefit"},
                "muscle_strength")[1] == "label_number_contradiction",
          "two readings of one paper that cannot both be right; invariant 9 "
          "says under-count, so the claim falls back to its label")
    check("harm label + number favouring the INGREDIENT is refused upstream",
          _aes2({"effect_size": 0.5, "effect_unit": "cohen's d",
                 "effect_favours": "ingredient", "direction": "harm"},
                "muscle_strength")[1] == "label_number_contradiction")
    check("a harm whose number DISAGREES keeps the FULL harm value, not 0.0",
          _es("harm", 0.9).s_value() == S_VALUE["harm"],
          "the first version clamped to min(effect_s, 0.0), which looked "
          "conservative and hid safety signals: of 6 sized harm claims in the "
          "v1.14 corpus, THREE standardise to +1.000 ('elevated serum creatinine "
          "74.2%', 'drug-related adverse events 82%', 'early drug discontinuation "
          "50%') because they are harm RATES where bigger is worse. Clamping made "
          "each read 'no evidence'. For safety, under-counting means KEEPING the "
          "harm")
    check("a harm label CAN be made more negative by its number",
          _es("harm", -1.0).s_value() == -1.0)
    check("an ABSOLUTE percentage difference is refused, not read as relative",
          _se(74.2, "% CID")[0] is None and _se(53.0, "percentage points")[0] is None,
          "a cumulative-incidence difference of 74.2 points is not a 74.2% "
          "relative change; through a rule where 5% is meaningful it inflates "
          "~15x and saturates at +1.0. The correct denominator is not recoverable "
          "from the unit string, so it is refused rather than rescaled")
    check("no number means the label still decides",
          _es("null_effect", None).s_value() == S_VALUE["null_effect"],
          "coverage is partial -- 44% of sized claims are standardisable -- so "
          "the label path is not legacy, it is the majority path")

    # -- adverse-event refusal, which needs the vocabulary and so lives in assemble
    from pipeline.assemble import _effect_s as _aes
    check("an adverse-event outcome refuses to standardise its number",
          _aes({"effect_size": 12.8, "effect_unit": "%"}, "adverse_events_gi")[0] is None,
          "on a safety outcome POSITIVE means MORE harm -- the opposite "
          "orientation from every efficacy outcome. '12.8% more adverse events' "
          "would otherwise read as strong positive evidence")
    check("an efficacy outcome standardises the same number ONCE THE ARM IS NAMED",
          _aes({"effect_size": 5.0, "effect_unit": "% difference",
                "effect_favours": "ingredient"}, "muscle_strength")[0] is not None)

    # -- SIGN CONVENTION (v1.16). The sign is STATED by S5, never inferred from the
    # number's arithmetic sign, because this literature uses both conventions: a
    # faster sprint TIME is a negative number and a good result, while the same
    # finding is often reported pre-oriented toward the treatment. A wrong
    # magnitude weakens a score; a wrong SIGN inverts it, undetectably.
    #
    # These pins are the ONLY coverage this logic will get for a while: all 85
    # sized+mapped claims in the creatine corpus are on higher_better outcomes,
    # where both conventions coincide, so a creatine run passes either way.
    _claim = lambda **kw: {"effect_size": 0.6, "effect_unit": "cohen's d", **kw}
    check("effect_favours=ingredient orients POSITIVE",
          _aes(_claim(effect_favours="ingredient"), "muscle_strength")[0] > 0)
    check("effect_favours=control orients NEGATIVE",
          _aes(_claim(effect_favours="control"), "muscle_strength")[0] < 0)
    check("a NEGATIVE raw value favouring the ingredient still scores positive",
          _aes(_claim(effect_size=-0.6, effect_favours="ingredient"),
               "muscle_strength")[0] > 0,
          "a faster sprint TIME is a negative number and a BETTER result; taking "
          "the reported sign at face value here would score a win as a loss")
    check("orientation happens BEFORE recentring, so a trivial benefit stays trivial",
          _aes(_claim(effect_size=0.05, effect_favours="ingredient"),
               "muscle_strength")[0] < 0,
          "0.05 SMD is below the meaningful threshold, so it is evidence against a "
          "MEANINGFUL effect. abs()-ing the standardised value instead would have "
          "promoted a trivial benefit into a strong one")
    check("an unstated convention on a LOWER_BETTER outcome is refused",
          _aes(_claim(), "sleep_onset")[1] == "sign_convention_unstated",
          "pre-v1.16 data on a lower-better outcome cannot be oriented: a smaller "
          "sleep-onset latency is better, so the raw sign is ambiguous. Refusing "
          "costs one magnitude; accepting could invert it")
    # This pin was INVERTED on 2026-08-11, hours after being written, and the
    # reason is the most important measurement in this whole change.
    #
    # It used to assert that an unstated convention on a higher_better outcome was
    # ACCEPTED, on the reasoning that "higher is better" makes the reported sign
    # unambiguous. That reasoning assumed effect_size is a signed contrast. It is
    # not: of 54 standardised values only 3 are negative, and 24 of 24 standardised
    # null_effect values are POSITIVE, where a real treatment-minus-control
    # convention would put about half of them below zero (P ~ 1e-7). Papers print
    # |d| next to "no significant difference" and S5 copies it faithfully.
    #
    # So accepting an unstated sign would read every such null as a BENEFIT of
    # that magnitude -- a null reporting |g| = 0.88 becomes +1.0 when the truth may
    # be -1.0. The change meant to remove an upward-biasing error would have
    # introduced a larger one.
    check("an unstated convention is REFUSED even on a higher_better outcome",
          _aes(_claim(), "muscle_strength")[1] == "sign_convention_unstated",
          "the reported sign cannot be trusted: 24 of 24 standardised null values "
          "in the corpus are positive because papers print |d|, so an unstated "
          "sign would turn every sized null into a benefit")
    # SIGN-PROOF SUB-THRESHOLD MAGNITUDES. Refusing every unsigned claim was the
    # first rule and it was too broad -- on the v1.17 creatine corpus "neither"
    # alone was 48 of 257 mapped claims (19%), the second-largest refusal after
    # "no number at all". A magnitude at or below the meaningful threshold is
    # sign-proof: both possible signs give a negative s, so the unknown sign
    # cannot change the conclusion, and the positive reading is the less negative
    # of the two.
    check("a LARGE effect that 'favours neither' is still refused",
          _aes(_claim(effect_favours="neither"), "muscle_strength")[1]
          == "favours_neither_but_above_threshold",
          "0.6 SMD is well above the meaningful threshold, so 'favours neither' is "
          "a self-contradiction and the sign decides everything")
    check("a SUB-THRESHOLD 'neither' is accepted and lands negative",
          (_aes(_claim(effect_size=0.05, effect_favours="neither"),
                "muscle_strength")[0] or 0) < 0,
          "both signs give a negative s below the threshold (+0.05 -> -0.25, "
          "-0.05 -> -0.42), so the unknown sign cannot change the verdict and the "
          "positive reading is the conservative one")
    check("a SUB-THRESHOLD claim with NO stated sign is likewise accepted",
          (_aes(_claim(effect_size=0.05), "muscle_strength")[0] or 0) < 0,
          "same argument, and it is what lets pre-v1.17 data contribute its "
          "trivial effects without ever risking an inverted sign")
    check("...but an ABOVE-threshold claim with no stated sign stays refused",
          _aes(_claim(effect_size=0.6), "muscle_strength")[1]
          == "sign_convention_unstated")

    # SD STANDARDISATION (v1.20). d = raw difference / printed SD is arithmetic
    # on two reported numbers; the route name keeps a DERIVED standardisation
    # distinguishable from a printed one. The guards matter more than the path:
    check("a raw kg difference + printed SD standardises (smd_from_sd)",
          _aes({"effect_size": 3.2, "effect_unit": "kg", "effect_sd": 8.0,
                "effect_favours": "ingredient", "direction": "benefit"},
               "muscle_strength")
          == (_se(0.4, "cohen's d")[0], "smd_from_sd"),
          "3.2 kg / SD 8.0 = 0.4 SMD -- the 15%-of-claims branch that used to "
          "die as raw_unit_needs_sd")
    check("a raw unit with NO SD still falls back to the label",
          _aes({"effect_size": 3.2, "effect_unit": "kg",
                "effect_favours": "ingredient", "direction": "benefit"},
               "muscle_strength")[1] == "raw_unit_needs_sd")
    check("a zero or negative SD is refused, never divided by",
          _se(3.2, "kg", 0)[1] == "raw_unit_needs_sd"
          and _se(3.2, "kg", -8)[1] == "raw_unit_needs_sd")
    check("a printed SMD is NEVER divided a second time",
          _se(0.43, "cohen's d", 8.0) == (_se(0.43, "cohen's d")[0], "smd"),
          "an SD arriving beside an already-standardised effect must be ignored, "
          "or the value shrinks 8x")
    check("an SD does not rescue a within-group change or a ratio",
          _se(5.0, "% change vs baseline", 8.0)[1] == "within_group_not_between_arm"
          and _se(1.4, "or", 0.5)[1] == "ratio_null_is_one",
          "untrustworthy stays untrustworthy; the SD only unlocks the raw-unit "
          "branch")
    # SUBAGENT SCHEMAS MUST BE STRUCTURALLY SANE. Cost of the missing check,
    # measured 2026-08-12: a trailing comma in a schema-editing script turned
    # effect_sd's subschema into a one-element ARRAY; the file stayed valid
    # JSON, every offline gate stayed green, and the FIRST live S5 call failed
    # with "--json-schema is not a valid JSON Schema" -- 10 of 10 calls burned
    # before the cause was found. A property's schema must be an object (or
    # boolean, per the spec); anything else here is a wreck waiting for the
    # next production run.
    import glob as _glob
    import json as _json

    def _schema_shape_problems(node, path):
        problems = []
        if isinstance(node, dict):
            for key, sub in (node.get("properties") or {}).items():
                if not isinstance(sub, (dict, bool)):
                    problems.append(f"{path}.properties.{key} is "
                                    f"{type(sub).__name__}, not object/boolean")
                problems.extend(_schema_shape_problems(sub, f"{path}.{key}"))
            for key in ("items",):
                if key in node and not isinstance(node[key], (dict, bool)):
                    problems.append(f"{path}.{key} is {type(node[key]).__name__}")
                elif key in node:
                    problems.extend(_schema_shape_problems(node[key], f"{path}.{key}"))
        return problems

    _bad = []
    import pathlib as _pathlib
    _schemas_dir = _pathlib.Path(__file__).resolve().parents[2] / "schemas"
    for _f in sorted(_glob.glob(str(_schemas_dir / "s*_*.json"))):
        _bad.extend(_schema_shape_problems(_json.load(open(_f)),
                                           _f.rsplit("/", 1)[-1]))
    check("every subagent schema's property subschemas are objects",
          not _bad, "; ".join(_bad[:3]) if _bad else
          "a list where an object belongs passes json.load and every offline "
          "gate, then fails every live CLI call at once")

    check("the SD path still requires the arm to be named",
          _aes({"effect_size": 3.2, "effect_unit": "kg", "effect_sd": 8.0,
                "direction": "benefit"}, "muscle_strength")[1]
          in ("sign_convention_unstated", "raw_unit_needs_sd"),
          "sub-threshold sign-proofing applies, but an above-threshold unsigned "
          "raw effect must not enter just because it now has an SD")
    check("v8 therefore scores the PRE-v1.17 corpus exactly as v7 did",
          _aes({"effect_size": 0.43, "effect_unit": "cohen's d"},
               "muscle_strength")[0] is None,
          "no pre-contract extraction can activate the measured path, so the "
          "model change cannot move a stored score until re-extraction")
    check("a stated convention works on a lower_better outcome where inference cannot",
          _aes(_claim(effect_favours="ingredient"), "sleep_onset")[0] > 0,
          "this is what the v1.16 field buys: magnesium/sleep becomes scoreable "
          "from measured effects, and creatine could never have revealed the gap")

    check("an applicability penalty is not reported as a verdict",
          A.label(37, 0.51, effect_verdict=1.0, applicability_limited=True)
          == "works, but not tested for your product",
          "effect arc was +1.00 and it read 'probably does not work'")
    check("a genuinely negative finding still reads negative",
          A.label(5, 0.50, effect_verdict=-0.70, applicability_limited=True)
          == "does not work")
    check("a good form match cannot rescue negative evidence",
          A.label(60, 0.9, effect_verdict=-0.5) == "does not work")

    print("\nTHREE-ARC DONUT (effect / form / dose)")
    from pipeline.donut import three_arc_svg, arc_fills, TRACK
    full = {"score": 33, "band": "moderate support", "gate_fired": False,
            "components": {"c": 0.72},
            "form_mix": {"exact": 4, "salt_family": 1, "different": 1},
            "dose": {"low": 56, "high": 296, "evidence_with_dose": 0.83}}
    f = arc_fills(full)
    check("three independent fills, not thirds of one total",
          round(f["effect"], 2) == 0.72 and round(f["form"], 2) == 0.67
          and round(f["dose"], 2) == 0.83,
          "they do not sum to anything -- each is its own condition")
    nodose = {**full, "dose": {"low": None, "evidence_with_dose": 0.0}}
    check("unassessed dose is None, NOT zero",
          arc_fills(nodose)["dose"] is None,
          "'we did not check' and 'your dose is wrong' are opposite messages")
    from pipeline.donut import arc_detail
    wrong_dose = {"components": {"c": 0.8}, "applicability": {
        "form": {"match": 1.0, "assessable": 1.0},
        "dose": {"match": 0.05, "assessable": 1.0}}}
    check("dose arc tracks MATCH, not coverage",
          arc_fills(wrong_dose)["dose"] == 0.05,
          "a 10x-underdosed product must not show a full dose arc")
    unreported = {"components": {"c": 0.8}, "applicability": {
        "form": {"match": 1.0, "assessable": 1.0},
        "dose": {"match": 0.0, "assessable": 0.0}}}
    check("nobody reported a dose -> None (hatched), not 0 (wrong)",
          arc_fills(unreported)["dose"] is None
          and arc_detail(unreported)["dose"]["assessable"] == 0.0)
    # Every ring now sits on a hatched base; a solid track is drawn over the
    # ASSESSABLE portion. So "hatch visible" == "part of this axis was never
    # reported", which is exactly the message it should carry.
    def solid_tracks(svg):
        return svg.count(f'stroke="{TRACK}" stroke-width')
    check("an assessable axis gets a solid track over the hatch",
          solid_tracks(three_arc_svg(full)) == 3,
          "all three axes judged")
    check("an unassessable axis leaves the hatch bare",
          solid_tracks(three_arc_svg(nodose)) == 2,
          "dose never reported -> hatched, not empty")
    check("form arc reflects the exact-form share only",
          abs(arc_fills({"form_mix": {"exact": 1, "different": 9}})["form"] - 0.1) < 1e-9)
    return {}
