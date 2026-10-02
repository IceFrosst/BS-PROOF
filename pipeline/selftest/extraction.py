"""Selftest group: Storage, per-agent section routing, cache keys, one study = one vote, batched S6, prompt fitting, per-outcome dose bands, search terms, store concurrency.

Moved verbatim out of the single pipeline/selftest.py main() on 2026-10-03;
run order is preserved by pipeline/selftest/__init__.py."""
import sys, os, pathlib  # noqa: F401  (sections use them)
from pipeline.selftest._common import Study, score_ecu, band_for, S_VALUE, standardise_effect, dedup, canonical_id, registry_id, vocab, ROB_CLEAN, rcts, _reasonless_probe  # noqa: F401


def run(check):
    print("\nSTORAGE (SQLite on a Postgres-shaped schema)")
    import tempfile
    from pipeline.storage import Store, now_iso
    with Store(os.path.join(tempfile.mkdtemp(), "t.sqlite")) as st_db:
        st_db.upsert_studies([
            {"_canonical": "registry:nct01234567", "pmid": "1", "is_synthesis": False,
             "design_rank": 4, "oa": "full_text", "source": "europepmc",
             "_merged_from": ["a", "b", "c"]},
            {"_canonical": "doi:109abc", "is_synthesis": True, "design_rank": 2,
             "oa": "abstract_only", "source": "europepmc"},
            {"_canonical": "pmid:99", "is_synthesis": False, "design_rank": None,
             "oa": "abstract_only", "source": "europepmc"}])
        c = st_db.counts()
        check("studies persisted", c["studies"] == 3 and c["syntheses"] == 1)
        check("unclassified queryable as the S1 budget",
              [r["canonical_id"] for r in st_db.unclassified()] == ["pmid:99"])

        try:
            st_db.upsert_studies([{"pmid": "7"}])
            ok = False
        except ValueError:
            ok = True
        check("refuses records that skipped dedup", ok,
              "no _canonical -> one trial would land four times")

        key = vocab.ecu_key("magnesium", "magnesium_glycinate", None,
                            "sleep_onset", "general_adult")
        pv = vocab.population_variants()[0]
        row = {"ecu_key": key, "ingredient": "magnesium",
               "form_vocab_id": "magnesium_glycinate", "dose_band": None,
               "band_version": 0, "outcome_vocab_id": "sleep_onset",
               "population": {"id": pv["id"], **{a: pv[a] for a in vocab.AXES}},
               "score": 71, "band": "strong support", "gate_fired": False,
               "components": {"d": 0.9, "c": 0.85, "H": 0.1, "E": 4.2,
                              "E_prime": 4.8, "coverage": 0.6},
               "evidence": {"n_primaries": 5, "n_syntheses": 2, "study_ids": []},
               "flags": ["brand_funded"],
               "provenance": {"prompt_version": "v1.1",
                              "vocab_versions": vocab.versions(),
                              "computed_at": now_iso()}}
        st_db.upsert_ecu(row, evidence=[
            {"canonical_id": "registry:nct01234567", "role": "primary",
             "w_study": 0.8, "s_value": 1.0, "transfer_factor": 1.0}])
        check("ECU round-trips", st_db.ecu(key)["score"] == 71)
        check("audit trail links study to ECU",
              st_db.evidence_for(key)[0]["canonical_id"] == "registry:nct01234567",
              "every published number must be reconstructible")
        check("band_version bump invalidates cached ECUs",
              st_db.stale_bands(1) == [key],
              "SPEC section 5 complexity flag, made queryable")
        st_db.upsert_ecu({**row, "score": 42})
        check("re-scoring updates in place, no duplicate row",
              st_db.counts()["ecus"] == 1 and st_db.ecu(key)["score"] == 42)

    # Each agent gets the section it needs. S8 was handed METHODS ++ RESULTS,
    # which cannot state who paid: 0/7 real texts contained a funding word.
    print("\nPER-AGENT SECTION ROUTING")
    from bsproof import workers as _w2
    from sources import fulltext as _ft
    _secs = {"methods": "METHODS n=40 randomised",
             "results": "RESULTS strength rose, p=0.01",
             "discussion": "DISCUSSION consistent with prior work",
             "funding": "FUNDING supplied by AlzChem GmbH"}
    check("S8 gets the funding section, not the methods",
          _w2._agent_text("S8", "COMBINED", _secs) == _secs["funding"])
    check("S3/S4/S5/S7 keep the SHARED text, so the prompt cache keeps sharing",
          all(_w2._agent_text(a, "COMBINED", _secs) == "COMBINED"
              for a in ("S3", "S4", "S5", "S7")),
          "routing all five was -10% tokens but +27% cost: writes replaced reads")
    check("a missing section falls back to the combined text, never empty",
          _w2._agent_text("S8", "COMBINED", {"methods": "m"}) == "COMBINED",
          "an empty payload reads as a paper that reports nothing (invariant 7)")
    check("no sections at all falls back too",
          _w2._agent_text("S8", "COMBINED", None) == "COMBINED")
    check("only S8 is routed",
          set(_w2.AGENT_SECTIONS) == {"S8"}, str(set(_w2.AGENT_SECTIONS)))

    _jats = ("<article><body>"
             "<sec><title>Methods</title><p>n=40</p></sec>"
             "<sec><title>Results</title><p>p=0.01</p></sec>"
             "</body><back>"
             "<funding-group><funding-statement>Grant NIH-123"
             "</funding-statement></funding-group>"
             "<ack><title>Acknowledgments</title><p>Creapure by AlzChem</p></ack>"
             "</back></article>")
    _s = _ft.sections(_jats)
    check("JATS <funding-group> becomes a funding section",
          "NIH-123" in (_s.get("funding") or ""),
          "funding is usually NOT in a <sec>, which is why S8 was blind")
    check("JATS <ack> is folded into funding too",
          "AlzChem" in (_s.get("funding") or ""))
    check("methods and results still parse unchanged",
          "n=40" in _s.get("methods", "") and "p=0.01" in _s.get("results", ""))

    # Effort changes what comes back, so it must change the cache key. Without
    # this an A/B arm at a different effort silently reads the previous arm's
    # answers and reports them as its own.
    print("\nEFFORT IN THE CACHE KEY")
    from bsproof import claude_adapter as _ca
    _k = lambda eff: _ca._key("S6", "claude-sonnet-5", '{"a":1}', eff)
    check("two effort levels give two cache keys", _k("high") != _k("xhigh"))
    check("no effort is its own key, not an alias of one",
          _k(None) != _k("high") and _k(None) == _k(""))
    check("same effort is stable", _k("high") == _k("high"))
    check("model still separates keys at equal effort",
          _ca._key("S6", "claude-opus-5", '{"a":1}', "high") != _k("high"))
    check("every declared effort level is one the CLI accepts",
          all(e in _ca.VALID_EFFORT for e in _ca.TIER_EFFORT.values() if e),
          f"TIER_EFFORT={_ca.TIER_EFFORT}")

    # ONE STUDY = ONE VOTE. Until 2026-08-10 build_ecus appended one Study per
    # CLAIM, so a trial S5 sliced into 20 rows voted 20 times: E, c, H and the
    # human-evidence gate were all set by the model's choice of granularity.
    print("\nONE STUDY = ONE VOTE")
    from pipeline.assemble import build_ecus as _b2, _one_study_one_vote
    _pr = {"ingredient": "creatine", "form_vocab_id": "creatine_monohydrate",
           "population": {"id": "general_adult",
                          **{a: vocab.population_variants()[0][a] for a in vocab.AXES}}}

    def _ext(canonical, claims):
        return {"record": {"_canonical": canonical, "ingredient": "creatine",
                           "design_rank": 4, "oa": "full_text"},
                "extraction": {"S3": {"extraction_version": "legacy-v1.23",
                                      "n_randomised": 40},
                               "S5": {"extraction_version": "legacy-v1.23"},
                               "S7": {"extraction_version": "legacy-v1.23",
                                      "form_vocab_id": "creatine_monohydrate"},
                               "outcomes": [
                                   {"outcome_vocab_id": "muscle_strength",
                                    "claim": {"direction": d, "magnitude": m}}
                                   for d, m in claims]}}

    one = _b2([_ext("doi:10.1/a", [("benefit", "meaningful")])],
              _pr, ignore_population=True)
    # Same finding, sliced into 6 (the sex x timepoint x region grid pattern).
    six = _b2([_ext("doi:10.1/a", [("benefit", "meaningful")] * 6)],
              _pr, ignore_population=True)
    check("one trial sliced 6 ways scores the same as sliced once",
          one and six and one[0]["score"] == six[0]["score"],
          f"{one[0]['score'] if one else None} vs {six[0]['score'] if six else None}")
    check("evidence mass E is unchanged by the split",
          one[0]["components"]["E"] == six[0]["components"]["E"],
          f"E {one[0]['components']['E']} vs {six[0]['components']['E']}")
    check("n_primaries reports trials, not claims",
          six[0]["evidence"]["n_primaries"] == 1,
          str(six[0]["evidence"]["n_primaries"]))
    check("study_ids lists each trial once",
          six[0]["evidence"]["study_ids"] == ["doi:10.1/a"],
          str(six[0]["evidence"]["study_ids"]))
    check("a study is never heterogeneous with itself",
          six[0]["components"]["H"] == 0,
          f"H={six[0]['components']['H']}")

    # Invariant 7: a null is evidence AGAINST, and collapsing must never let a
    # benefit simply overwrite one. A 1-1 tie with no primary is not a win for
    # either -- it reads as `unclear`, s = 0.0. Verified 2026-08-10 against
    # PMC6534934, where the old conservative tiebreak filed a significant
    # +17.9% between-group power benefit as evidence against creatine.
    mixed = _b2([_ext("doi:10.1/a", [("benefit", "meaningful"), ("null_effect", None)])],
                _pr, ignore_population=True)
    only_null = _b2([_ext("doi:10.1/a", [("null_effect", None)])],
                    _pr, ignore_population=True)
    only_ben = _b2([_ext("doi:10.1/a", [("benefit", "meaningful")])],
                   _pr, ignore_population=True)
    check("a benefit/null tie is neither side's win",
          mixed[0]["components"]["d"] == 0.0
          and mixed[0]["score"] == only_null[0]["score"] == 0,
          f"null={only_null[0]['score']} tie={mixed[0]['score']} benefit={only_ben[0]['score']}")
    check("a benefit/null tie adds no evidence in either direction",
          mixed[0]["components"]["d"] == 0.0,
          f"d={mixed[0]['components']['d']}")

    # ...AND STILL NOT WHEN THE SURVIVING CLAIM CARRIES A NUMBER. The pin above
    # passed either way, because its fixture sets no effect_size -- so it stopped
    # testing the property the moment s_value started preferring a measured
    # effect over the label. `_collapse` must clear effect_s alongside direction,
    # or a tie silently picks a side.
    def _ext_sized(canonical, claims):
        return {"record": {"_canonical": canonical, "ingredient": "creatine",
                           "design_rank": 4, "oa": "full_text"},
                "extraction": {"S3": {"extraction_version": "legacy-v1.23",
                                      "n_randomised": 40},
                               "S5": {"extraction_version": "legacy-v1.23"},
                               "S7": {"extraction_version": "legacy-v1.23",
                                      "form_vocab_id": "creatine_monohydrate"},
                               "outcomes": [
                                   {"outcome_vocab_id": "muscle_strength",
                                    "claim": {"direction": d, "magnitude": m,
                                              "effect_size": 0.75,
                                              "effect_unit": "cohen's d",
                                              "effect_favours": "ingredient"}}
                                   for d, m in claims]}}
    _tie_sized = _b2([_ext_sized("doi:10.1/t",
                                 [("benefit", "meaningful"), ("null_effect", None)])],
                     _pr, ignore_population=True)
    check("a SIZED benefit/null tie still adds no evidence in either direction",
          _tie_sized[0]["components"]["d"] == 0.0,
          f"d={_tie_sized[0]['components']['d']} -- if this is non-zero, the tie "
          f"rule is being overridden by a number it was supposed to set aside")

    # ELIGIBILITY (2026-08-10). A trial with no ingredient-free arm, or one its
    # own authors call a pilot, cannot vote on whether the ingredient works.
    def _flagged(canonical, direction, **s3):
        e = _ext(canonical, [(direction, "meaningful" if direction == "benefit" else None)])
        e["extraction"]["S3"].update(s3)
        return e
    _base = _b2([_flagged("doi:10.1/e1", "null_effect"),
                 _flagged("doi:10.1/e2", "null_effect")], _pr, ignore_population=True)
    _st = {}
    _gated = _b2([_flagged("doi:10.1/e1", "null_effect"),
                  _flagged("doi:10.1/e2", "null_effect",
                           comparator="all_arms_get_ingredient")],
                 _pr, ignore_population=True, stats=_st)
    check("a trial where every arm gets the ingredient does not vote",
          _gated[0]["evidence"]["n_primaries"] == 1
          and _base[0]["evidence"]["n_primaries"] == 2
          and _st["ineligible_by_reason"] == {"no_ingredient_free_arm": 1},
          f"n={_gated[0]['evidence']['n_primaries']} stats={_st}")

    _st2 = {}
    _pilot = _b2([_flagged("doi:10.1/e1", "null_effect"),
                  _flagged("doi:10.1/e2", "null_effect",
                           self_declared_underpowered=True)],
                 _pr, ignore_population=True, stats=_st2)
    check("a self-declared pilot's null does not vote",
          _pilot[0]["evidence"]["n_primaries"] == 1
          and _st2["ineligible_by_reason"] == {"self_declared_underpowered": 1})

    # ...and SYMMETRICALLY: a pilot's BENEFIT is dropped too. Keeping pilot
    # benefits while dropping pilot nulls is the one-way handling of uncertainty
    # this gate exists to remove.
    _st3 = {}
    _pb = _b2([_flagged("doi:10.1/e1", "benefit"),
               _flagged("doi:10.1/e2", "benefit", self_declared_underpowered=True)],
              _pr, ignore_population=True, stats=_st3)
    check("a self-declared pilot's BENEFIT is dropped too",
          _pb[0]["evidence"]["n_primaries"] == 1 and _st3["ineligible_total"] == 1,
          "the gate must not be a one-way ratchet")

    # THIRD REFUSAL (2026-08-10, decision delegated by the founder): a trial
    # whose every ingredient arm co-administers another active tests a
    # COMBINATION. 21/143 audited studies were this shape with a genuine
    # placebo, so the all_arms refusal correctly never fired on them.
    _st4 = {}
    _combo = _b2([_flagged("doi:10.1/e1", "null_effect"),
                  _flagged("doi:10.1/e2", "null_effect", ingredient_isolated="no")],
                 _pr, ignore_population=True, stats=_st4)
    check("a combination-only trial does not vote",
          _combo[0]["evidence"]["n_primaries"] == 1
          and _st4["ineligible_by_reason"] == {"no_isolated_ingredient_arm": 1},
          f"stats={_st4}")
    _st5 = {}
    _combo_b = _b2([_flagged("doi:10.1/e1", "benefit"),
                    _flagged("doi:10.1/e2", "benefit", ingredient_isolated="no")],
                   _pr, ignore_population=True, stats=_st5)
    check("a combination's BENEFIT is dropped too (symmetric)",
          _combo_b[0]["evidence"]["n_primaries"] == 1 and _st5["ineligible_total"] == 1,
          "creatine+HMB improving strength is not evidence about creatine alone")
    import json as _json, pathlib as _pl
    _s3schema = _json.load(open(_pl.Path(__file__).parent.parent.parent / "schemas" / "s3_study.json"))
    _iso = (_s3schema.get("properties") or {}).get("ingredient_isolated") or {}
    check("ingredient_isolated is in the S3 schema with 'no' in its enum",
          "no" in (_iso.get("enum") or []),
          "rename the enum and _ineligible silently never fires -- the "
          "schema-drift trap invariant 7 already fell into once")

    # A silent or hesitant extractor must never cost us a study.
    for _val in ({}, {"comparator": None}, {"comparator": "unknown"},
                 {"self_declared_underpowered": None}, {"self_declared_underpowered": False},
                 {"ingredient_isolated": None}, {"ingredient_isolated": "unknown"},
                 {"ingredient_isolated": "yes"}):
        _keep = _b2([_flagged("doi:10.1/e1", "null_effect"),
                     _flagged("doi:10.1/e2", "null_effect", **_val)],
                    _pr, ignore_population=True)
        check(f"eligibility defaults to KEEP for {_val or 'a missing field'}",
              _keep[0]["evidence"]["n_primaries"] == 2,
              f"n={_keep[0]['evidence']['n_primaries']}")

    # Two DIFFERENT trials must still both count -- the fix must not over-collapse.
    two = _b2([_ext("doi:10.1/a", [("benefit", "meaningful")]),
               _ext("doi:10.1/b", [("benefit", "meaningful")])],
              _pr, ignore_population=True)
    check("two distinct trials still contribute two votes",
          two[0]["evidence"]["n_primaries"] == 2
          and two[0]["components"]["E"] > one[0]["components"]["E"],
          f"n={two[0]['evidence']['n_primaries']} E={two[0]['components']['E']}")

    # The gate was defeatable by granularity: DESIGN_W[6]=0.30 is below
    # GATE_MIN_HUMAN_WD=0.5 alone, but two copies of the same study summed to
    # 0.60 and passed "not enough human evidence".
    def _weak(canonical, n_claims):
        e = _ext(canonical, [("benefit", "meaningful")] * n_claims)
        e["record"]["design_rank"] = 6
        return e
    weak1 = _b2([_weak("doi:10.1/w", 1)], _pr, ignore_population=True)
    weak2 = _b2([_weak("doi:10.1/w", 2)], _pr, ignore_population=True)
    check("the human-evidence gate cannot be passed by splitting one study",
          weak1[0]["gate_fired"] and weak2[0]["gate_fired"],
          f"1 claim gate={weak1[0]['gate_fired']}, 2 claims gate={weak2[0]['gate_fired']}")

    _s = lambda i, d: Study(id=i, design_rank=4, n=40, direction=d,
                            magnitude="meaningful" if d == "benefit" else None)
    # No primary declared -> MAJORITY wins; a benefit/null tie reads `unclear`.
    _kept, _n = _one_study_one_vote([
        (_s("a", "benefit"), {"outcome_id": "o"}),
        (_s("a", "null_effect"), {"outcome_id": "o"}),
        (_s("b", "benefit"), {"outcome_id": "o"}),
    ])
    check("no primary + 1-1 tie reads as unclear, not as a null",
          [s.id for s, _ in _kept] == ["a", "b"]
          and _kept[0][0].direction == "unclear" and _n == 1,
          f"{[(s.id, s.direction) for s, _ in _kept]} collapsed={_n}")

    # ...but a harm signal is never averaged away by a tie.
    _keptH, _ = _one_study_one_vote([
        (_s("a", "harm"), {"outcome_id": "o"}),
        (_s("a", "benefit"), {"outcome_id": "o"}),
    ])
    check("harm wins any tie it is in", _keptH[0][0].direction == "harm",
          "a safety signal must not be averaged away")
    _keptH2, _ = _one_study_one_vote([
        (_s("a", "harm"), {"outcome_id": "o"}),
        (_s("a", "null_effect"), {"outcome_id": "o"}),
    ])
    check("harm beats a tied null too", _keptH2[0][0].direction == "harm")

    # THE FIX: the trial's own primary endpoint outranks a secondary null.
    _kept2, _ = _one_study_one_vote([
        (_s("a", "null_effect"), {"outcome_id": "o", "is_primary": False}),
        (_s("a", "benefit"), {"outcome_id": "o", "is_primary": True}),
    ])
    check("a PRIMARY benefit is not overruled by a secondary null",
          _kept2[0][0].direction == "benefit",
          "measured: 28 of 87 trials had their primary benefit filed as null/harm")

    # ...but a primary NULL still wins over a secondary benefit. Invariant 7.
    _kept3, _ = _one_study_one_vote([
        (_s("a", "benefit"), {"outcome_id": "o", "is_primary": False}),
        (_s("a", "null_effect"), {"outcome_id": "o", "is_primary": True}),
    ])
    check("a PRIMARY null is not overruled by a secondary benefit",
          _kept3[0][0].direction == "null_effect",
          "the fix must not become 'any benefit wins'")

    # Majority: 3 nulls vs 1 benefit, no primary -> null. Resists cherry-picking.
    _kept4, _ = _one_study_one_vote([
        (_s("a", "benefit"), {"outcome_id": "o"}),
        (_s("a", "null_effect"), {"outcome_id": "o"}),
        (_s("a", "null_effect"), {"outcome_id": "o"}),
        (_s("a", "null_effect"), {"outcome_id": "o"}),
    ])
    check("one positive among many nulls does not win without a primary",
          _kept4[0][0].direction == "null_effect",
          "multiple-comparisons guard")

    # Batched S6 matches results back BY INDEX. If it ever matched by position,
    # a reordered or short array would shift every mapping onto the wrong claim
    # -- silently filing evidence about one outcome under another, which is the
    # exact failure S6's prompt calls unrecoverable.
    print("\nBATCHED S6 INDEX MATCHING")
    from bsproof import workers as _wk
    _claims = [{"outcome_raw": "hand grip strength"},
               {"outcome_raw": "leg press 1-RM"},
               {"outcome_raw": "serum creatinine"}]
    _rec = {"_canonical": "doi:10.1/b", "ingredient": "creatine", "title": "t",
            "abstract": "oral creatine supplementation 3 g/day", "design_rank": 4}

    def _fake_call(shuffled, drop=()):
        def _c(agent, payload):
            if agent == "S5":
                return {"claims": _claims}, {}
            if agent == "S6B":
                m = [{"index": 0, "outcome_vocab_id": "muscle_strength",
                      "confidence": 0.9, "rationale": "grip"},
                     {"index": 1, "outcome_vocab_id": "muscle_strength",
                      "confidence": 0.9, "rationale": "1rm"},
                     {"index": 2, "outcome_vocab_id": None,
                      "confidence": 0.2, "rationale": "biomarker"}]
                m = [x for x in m if x["index"] not in drop]
                return {"mappings": list(reversed(m)) if shuffled else m}, {}
            return {}, {}
        return _c

    _saved = _wk.S6_BATCH
    _wk.S6_BATCH = True
    try:
        out = _wk.extract_study(_rec, "x" * 500, call=_fake_call(shuffled=True))
        got = [(o["claim"]["outcome_raw"], o["outcome_vocab_id"])
               for o in out["outcomes"]]
        check("a REORDERED batch response still lands on the right claim",
              got == [("hand grip strength", "muscle_strength"),
                      ("leg press 1-RM", "muscle_strength"),
                      ("serum creatinine", None)],
              str(got))
        out2 = _wk.extract_study(_rec, "x" * 500, call=_fake_call(False, drop=(1,)))
        got2 = [(o["claim"]["outcome_raw"], o["outcome_vocab_id"])
                for o in out2["outcomes"]]
        check("a MISSING index is discarded, never shifted onto its neighbour",
              got2 == [("hand grip strength", "muscle_strength"),
                       ("leg press 1-RM", None),
                       ("serum creatinine", None)],
              str(got2))
        check("every claim still yields exactly one outcome row",
              len(out["outcomes"]) == len(_claims))
    finally:
        _wk.S6_BATCH = _saved

    # The single defect that zeroed every score: a head-only text trim deleted
    # the Results section, so S5 truthfully reported no claims.
    print("\nPROMPT TEXT FITTING")
    from bsproof import workers as _w
    # The workers module carries its own offline contract checks (shadow
    # wiring, S7 envelope walls, table shipping). They had ZERO callers, so
    # "the selftest passes" said nothing about them -- reviewed 2026-08-25,
    # the S7 envelope check was failing while every gate printed green.
    _w._self_check_v13_shadow_wiring()
    check("workers' embedded contract checks actually ran", True,
          "zero-caller self-checks rot silently; this line keeps them wired")
    _body = ("METHODS " + "m" * 30000 + " RESULTS the group improved, p = 0.001 "
             + "CONCLUSION creatine increased strength.")
    _fitted = _w._fit_text("S5", _body, 2000)
    check("long text is trimmed at all", len(_fitted) < len(_body))
    check("the RESULTS tail survives the trim",
          "p = 0.001" in _fitted and "CONCLUSION" in _fitted,
          "head-only trimming cost S5 every claim it should have made")
    check("the METHODS head also survives",
          _fitted.startswith("METHODS"),
          "S3 reads n / population / design from the head")
    check("the elision is explicit, not a silent cut",
          _w.ELISION.strip() in _fitted,
          "a model must not read a truncation as a finished sentence")
    check("short text is passed through untouched",
          _w._fit_text("S5", "short study text", 2000) == "short study text")
    _retry_seen = []
    def _prompt_retry_call(agent, payload):
        if agent == "S3":
            _retry_seen.append(payload["text"])
            if len(_retry_seen) == 1:
                return None, {"error": "exit 1: Prompt is too long"}
            return {}, {"cached": False}
        return {}, {"cached": False}
    _retry_out = _w.extract_study(
        {"title": "Creatine supplementation trial", "ingredient": "creatine"},
        _body, call=_prompt_retry_call, max_workers=1)
    check("an exact prompt-too-long refusal retries once with bounded text",
          len(_retry_seen) == 2
          and len(_retry_seen[1]) == _w.PROMPT_TOO_LONG_RETRY_CHARS
          and _retry_out["_meta"]["S3"].get("prompt_too_long_retry") is True,
          f"attempt lengths={[len(x) for x in _retry_seen]}")
    check("the retry meta pins both audit lengths the ledger cites",
          _retry_out["_meta"]["S3"].get("retry_text_chars")
          == _w.PROMPT_TOO_LONG_RETRY_CHARS
          and _retry_out["_meta"]["S3"].get("original_text_chars")
          > _w.PROMPT_TOO_LONG_RETRY_CHARS)
    check("the first attempt's literal error survives a successful retry",
          _retry_out["_meta"]["S3"].get("first_attempt_error")
          == "exit 1: Prompt is too long",
          "the audit trail must keep WHY the retry fired, not only that it did")
    _other_err_seen = []
    def _other_error_call(agent, payload):
        if agent == "S3":
            _other_err_seen.append(payload["text"])
            return None, {"error": "exit 1: something else"}
        return {}, {"cached": False}
    _w.extract_study(
        {"title": "Creatine supplementation trial", "ingredient": "creatine"},
        _body, call=_other_error_call, max_workers=1)
    check("a NON-matching error never triggers the transport retry",
          len(_other_err_seen) == 1,
          "the retry is fail-closed by exact match; loosening it must be deliberate")
    _short_seen = []
    def _short_text_call(agent, payload):
        if agent == "S3":
            _short_seen.append(payload["text"])
            return None, {"error": "exit 1: Prompt is too long"}
        return {}, {"cached": False}
    _short_body = ("METHODS m RESULTS p = 0.001 CONCLUSION ok. "
                   * 3).ljust(_w.MIN_TEXT_CHARS + 1, "x")
    assert len(_short_body) <= _w.PROMPT_TOO_LONG_RETRY_CHARS
    _w.extract_study(
        {"title": "Creatine supplementation trial", "ingredient": "creatine"},
        _short_body, call=_short_text_call, max_workers=1)
    check("text already at or under the retry budget is never re-fit",
          len(_short_seen) == 1,
          "an identical or longer retry would be a pointless second call")
    _fail_twice_seen = []
    def _fail_twice_call(agent, payload):
        if agent == "S3":
            _fail_twice_seen.append(payload["text"])
            return None, {"error": "exit 1: Prompt is too long"}
        return {}, {"cached": False}
    _fail_out = _w.extract_study(
        {"title": "Creatine supplementation trial", "ingredient": "creatine"},
        _body, call=_fail_twice_call, max_workers=1)
    check("a retry that ALSO fails keeps the error and the flag together",
          len(_fail_twice_seen) == 2
          and _fail_out["_meta"]["S3"].get("prompt_too_long_retry") is True
          and _fail_out["_meta"]["S3"].get("error")
          == "exit 1: Prompt is too long"
          and any(f["agent"] == "S3" for f in _fail_out.get("_failed", [])),
          "exactly one retry, then the study is honestly partial -- never a loop")
    check("the transport retry keeps both methods and results",
          _retry_seen[1].startswith("METHODS")
          and "CONCLUSION" in _retry_seen[1]
          and _w.ELISION.strip() in _retry_seen[1],
          "a failed transport call may shrink input, never silently take one side")

    # build_ecus read `outcome_id` inside the argument list of the generator that
    # BINDS it. Crashed outright when nothing mapped; silently reused the last
    # outcome's dose band for every study when something did.
    print("\nDOSE BAND IS PER OUTCOME")
    from pipeline.assemble import build_ecus as _build, to_studies as _to_studies
    _prod = {"ingredient": "creatine", "form_vocab_id": "creatine_monohydrate",
             "dose_low_mg": 3000, "dose_high_mg": 3000,
             "population": {"id": "general_adult",
                            **{a: vocab.population_variants()[0][a] for a in vocab.AXES}}}

    def _extraction(outcome_id, direction, dose_mg):
        return {"record": {"_canonical": f"doi:10.1/{outcome_id}{dose_mg}",
                           "ingredient": "creatine", "design_rank": 4,
                           "oa": "full_text"},
                "extraction": {
                    "S3": {"extraction_version": "legacy-v1.23", "n_randomised": 40},
                    "S5": {"extraction_version": "legacy-v1.23"},
                    "S7": {"extraction_version": "legacy-v1.23",
                           "form_vocab_id": "creatine_monohydrate",
                           "elemental_dose_mg": dose_mg},
                    "outcomes": [{"outcome_vocab_id": outcome_id,
                                  "claim": {"direction": direction,
                                            "magnitude": "moderate"}}]}}

    # The exact shape that crashed: no outcome ever mapped, so the loop variable
    # was never bound at all.
    no_outcomes = [{"record": {"_canonical": "doi:10.1/none", "ingredient": "creatine",
                               "design_rank": 4, "oa": "full_text"},
                    "extraction": {"S3": {"extraction_version": "legacy-v1.23",
                                              "n_randomised": 40},
                                   "S5": {"extraction_version": "legacy-v1.23"},
                                   "S7": {"extraction_version": "legacy-v1.23"},
                                   "outcomes": []}}]
    try:
        _build(no_outcomes, _prod, ignore_population=True)
        crashed = False
    except UnboundLocalError:
        crashed = True
    check("a corpus where nothing mapped does not crash the scorer", not crashed,
          "UnboundLocalError: local variable 'outcome_id' referenced before assignment")

    # DOSE_MATCH IS STUDY-vs-PRODUCT (2026-08-12). It used to be product-vs-
    # derived-band, which is one value per outcome stamped onto every study --
    # so the dose arc was degenerate: a clone of the effect arc when the product
    # was in band, and EMPTY ("not tested") when it was not. Measured on the
    # v1.18 run: a 4.4 g product against a 4.8-5.0 g lean-mass band rendered
    # "not tested" instead of "your dose is BELOW where trials found benefit".
    # These pins guard the same hazards the old ones did, restated per study.
    mixed = [_extraction("muscle_strength", "benefit", 3000),
             _extraction("muscle_strength", "benefit", 3000),
             _extraction("cognitive_function", "benefit", 20000)]
    per_study_match = {}
    for item in mixed:
        for oid, st, _d, _p in _to_studies(
                item["record"], item["extraction"], _prod, None,
                ignore_population=True,
                dose_bands={"muscle_strength": {"low": 3000, "high": 3000},
                            "cognitive_function": {"low": 20000, "high": 20000}}):
            per_study_match[(oid, item["extraction"]["S7"]["elemental_dose_mg"])] = st.dose_match
    check("a study dosed AT the product's dose is in the dose arc",
          per_study_match.get(("muscle_strength", 3000)) == "in_band",
          f"{per_study_match} — product is dosed 3000mg")
    check("a loading-dose trial is NOT evidence at a maintenance product's dose",
          per_study_match.get(("cognitive_function", 20000)) == "above_200",
          "20 g against a 3 g product is above_200; the old product-vs-band rule "
          "put loading trials in the arc whenever the DERIVED band was loading-"
          "sized, which is how muscle_power's arc came to describe 20 g protocols "
          "while the product held 4.4 g")
    # PER-KG DOSING (v1.19). 25 of 76 dose-less extractions were "0.3 g/kg/day"
    # shapes. The multiplication is deterministic and happens only when BOTH
    # numbers are the paper's own.
    from pipeline.assemble import study_dose as _sd
    _pk = _sd("creatine", {"dose_per_kg_mg": 300, "mean_body_mass_kg": 80})
    check("a per-kg dose with a STATED mean mass becomes a daily total",
          _pk["dose_low_mg"] == 24000 and _pk["dose_basis"] == "per_kg_x_stated_mass",
          f"{_pk} -- 300 mg/kg x 80 kg, arithmetic on reported numbers")
    check("a per-kg dose with NO stated mass stays doseless",
          _sd("creatine", {"dose_per_kg_mg": 300})["dose_low_mg"] is None,
          "invariant 5: assuming a typical body weight would be inventing a "
          "number, and a dose off by the guess corrupts the band it feeds")
    check("null elemental dose still falls through per-kg branch",
          _sd("creatine", {"dose_basis": "elemental_stated",
                             "dose_per_kg_mg": 300,
                             "mean_body_mass_kg": 80})["dose_low_mg"] == 24000,
          "a missing elemental field must not refuse an already-elemental per-kg report")
    check("a stated elemental dose beats the per-kg path",
          _sd("creatine", {"elemental_dose_mg": 5000, "dose_per_kg_mg": 300,
                           "mean_body_mass_kg": 80})["dose_low_mg"] == 5000)
    _compound = _sd("creatine", {"form_vocab_id": "creatine_monohydrate",
                                  "dose_basis": "compound_only",
                                  "elemental_dose_mg": 5000,
                                  "compound_dose_mg": 5000})
    check("compound_only monohydrate converts copied elemental field",
          _compound["dose_basis"] == "converted" and 4390 <= _compound["dose_low_mg"] <= 4400,
          f"5000 mg powder -> {_compound}")
    _pk_compound = _sd("creatine", {"form_vocab_id": "creatine_monohydrate",
                                     "dose_basis": "compound_only",
                                     "dose_per_kg_mg": 300,
                                     "mean_body_mass_kg": 80})
    check("compound per-kg dose converts after multiplication",
          _pk_compound["dose_basis"] == "converted" and 21000 <= _pk_compound["dose_low_mg"] <= 22000,
          f"24000 mg powder -> {_pk_compound}")
    check("contradictory dose fields refuse",
          _sd("creatine", {"form_vocab_id": "creatine_monohydrate",
                            "dose_basis": "elemental_stated",
                            "elemental_dose_mg": 5000,
                            "compound_dose_mg": 1000})["dose_low_mg"] is None)
    from bsproof.workers import _dose_snippets as _ds
    _txt = ("Participants ingested 20 g/day of creatine for 5 days, then "
            "5 g/day maintenance. " + "filler sentence. " * 400 +
            "The control group received 0.3 g/kg/day of placebo.")
    _sn = _ds(_txt)
    check("dose snippets survive where truncation would cut them",
          any("20 g/day" in x for x in _sn) and any("0.3 g/kg" in x for x in _sn),
          "12 of 76 dose-less extractions had the dose in the full text but not "
          "in the slice S7 received; the harvest is regex, zero judgement")
    check("dose snippets are capped and deduplicated",
          len(_ds("5 g/day. " * 100)) <= 5 and len(_ds("")) == 0)

    check("a study with NO extracted dose is unassessable, never in_band",
          _to_studies(
              [{"record": {"_canonical": "doi:10.1/nodose", "ingredient": "creatine",
                           "design_rank": 4, "oa": "full_text"},
                "extraction": {"S3": {"extraction_version": "legacy-v1.23",
                                      "n_randomised": 40},
                               "S5": {"extraction_version": "legacy-v1.23"},
                               "S7": {"extraction_version": "legacy-v1.23"},
                               "outcomes": [{"outcome_vocab_id": "muscle_strength",
                                             "claim": {"direction": "benefit",
                                                       "magnitude": "meaningful"}}]}}][0]["record"],
              {"S3": {"extraction_version": "legacy-v1.23", "n_randomised": 40},
               "S5": {"extraction_version": "legacy-v1.23"},
               "S7": {"extraction_version": "legacy-v1.23"},
               "outcomes": [{"outcome_vocab_id": "muscle_strength",
                             "claim": {"direction": "benefit",
                                       "magnitude": "meaningful"}}]},
              _prod, None, ignore_population=True, dose_bands={})[0][1].dose_match
          == "unspecified",
          "in_band here read +1.00 @ 100% exactly where nothing was known -- the "
          "2026-08-09 lesson, unchanged; only WHOSE dose is unknown changed")

    # A vocab ID is not a search term. 7 of 19 ingredients carry an underscore
    # and were silently unretrievable until 2026-08-09; the symptom was
    # "0 trials found", which reads as "this ingredient has no evidence".
    print("\nINGREDIENT -> SEARCH TERM")
    from sources import europepmc as _ep
    check("underscore becomes a space", _ep.search_term("vitamin_d") == "vitamin d")
    check("multi-underscore ids work", _ep.search_term("ginkgo_biloba") == "ginkgo biloba")
    check("single-word ids are unchanged",
          _ep.search_term("creatine") == "creatine",
          "why creatine/magnesium runs never exposed this")
    # The gate holds a vocab id too, and dropped 175/175 vitamin D RCTs as
    # "noise" -- a message that reads like the gate working.
    from pipeline.relevance import relevance_check as _rc
    _vd = {"title": "Effect of vitamin D supplementation on muscle strength: an RCT",
           "abstract": "Participants received oral vitamin D3 4000 IU daily."}
    check("relevance gate matches a snake_case id against real prose",
          _rc(_vd, "vitamin_d")[0], "dropped 175/175 vitamin D RCTs before this")
    check("relevance gate still rejects the wrong ingredient",
          not _rc({"title": "Zinc and immunity", "abstract": "oral zinc"},
                  "vitamin_d")[0],
          "the fix must not make the gate permissive")

    check("no underscore survives into a query",
          "vitamin_d" not in _ep._query("vitamin_d", syntheses=False, scope="intervention")
          and 'TITLE:"vitamin d"' in _ep._query("vitamin_d", syntheses=False,
                                                scope="intervention"),
          'TITLE:"vitamin_d" matched ~nothing; PUB_TYPE is a field name, not a term')
    check("per-outcome queries are fixed too",
          "_" not in _ep.outcome_query("vitamin_d", "sleep_quality").replace("PUB_TYPE", ""),
          "outcome_query had its own copy of the bug")

    # Three parallel ingredient runs share a store. Before 2026-08-09 the second
    # writer failed instantly with "database is locked".
    print("\nSTORE CONCURRENCY")
    import threading as _th
    with tempfile.TemporaryDirectory() as td:
        p = pathlib.Path(td) / "conc.sqlite"
        with Store(p) as s0:
            check("WAL is on (one writer + many readers)",
                  s0.conn.execute("PRAGMA journal_mode").fetchone()[0].lower() == "wal")
            check("busy_timeout makes a competing writer wait, not raise",
                  s0.conn.execute("PRAGMA busy_timeout").fetchone()[0] >= 5000)
        errs: list[str] = []

        def _w(tag):
            try:
                u, _, _ = dedup([{"pmid": f"{tag}{i}", "title": "T",
                                  "doi": f"10.1/{tag}{i}"} for i in range(60)])
                with Store(p) as writer:
                    writer.upsert_studies(u)
            except Exception as exc:            # noqa: BLE001 - reporting it IS the test
                errs.append(f"{tag}: {exc}")
        threads = [_th.Thread(target=_w, args=(t,)) for t in ("a", "b", "c")]
        [t.start() for t in threads]
        [t.join() for t in threads]
        check("3 concurrent writers all commit", not errs, str(errs))
        with Store(p) as reader:
            check("no writer silently lost its rows",
                  reader.counts()["studies"] == 180,
                  "180 = 3 x 60, the parallel-run case")

    # The predatory check had ZERO coverage until 2026-08-09, in the one feature
    # where a false positive is a defamation-shaped error. Every case below is a
    # real string that a real run produced.
    return {"_b2": _b2, "_ext": _ext, "_pr": _pr}
