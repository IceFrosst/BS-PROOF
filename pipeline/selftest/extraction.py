"""Selftest group: storage, per-agent section routing, cache keys, batched S6, prompt fitting, the tested arm's dose, search terms, store concurrency."""
import sys, os, pathlib  # noqa: F401  (sections use them)
from pipeline.selftest._common import dedup, canonical_id, registry_id, vocab, _reasonless_probe  # noqa: F401


def run(check):
    print("\nSTORAGE (SQLite on a Postgres-shaped schema)")
    import tempfile
    from pipeline.storage import Store
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
        check("unclassified records are queryable",
              [r["canonical_id"] for r in st_db.unclassified()] == ["pmid:99"])

        try:
            st_db.upsert_studies([{"pmid": "7"}])
            ok = False
        except ValueError:
            ok = True
        check("refuses records that skipped dedup", ok,
              "no _canonical -> one trial would land four times")

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

    # The single defect that zeroed every score: a head-only text trim deleted
    # the Results section, so S5 truthfully reported no claims.
    print("\nPROMPT TEXT FITTING")
    from bsproof import workers as _w
    # The workers module carries its own offline contract checks (S7
    # envelope walls, table shipping). They had ZERO callers, so
    # "the selftest passes" said nothing about them -- reviewed 2026-08-25,
    # the S7 envelope check was failing while every gate printed green.
    _w._self_check_payload_contracts()
    check("workers' embedded contract checks actually ran", True,
          "zero-caller self-checks rot silently; this line keeps them wired")
    _body = ("METHODS " + "m" * 30000 + " RESULTS the group improved, p = 0.001 "
             + "CONCLUSION creatine increased strength.")
    # S8 is a budget-trimmed agent; S4 and S5 are never trimmed (FULL_TEXT_AGENTS).
    _fitted = _w._fit_text("S8", _body, 2000)
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
          _w._fit_text("S8", "short study text", 2000) == "short study text")
    check("S5 (the outcome lister) always gets the full text",
          _w._fit_text("S5", _body, 2000) == _body,
          "v1.37: a 2,225-char slice made S5 miss outcomes v1.36 listed")
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
    print("\nTESTED ARM'S DOSE (pipeline/dose.py)")
    from pipeline import dose as dosemod
    band = {"low": 200, "high": 300}
    check("dose inside the band", dosemod.dose_match_for(250, 250, band) == "in_band")
    check("just under the low end", dosemod.dose_match_for(150, 150, band) == "low_50_99")
    check("far under", dosemod.dose_match_for(40, 40, band) == "below_50")
    check("far over", dosemod.dose_match_for(700, 700, band) == "above_200")
    check("an interval straddling a tier is unspecified, never rounded",
          dosemod.dose_match_for(150, 250, band) == "unspecified")
    check("a missing band end is unspecified",
          dosemod.dose_match_for(200, 200, {"low": None}) == "unspecified")
    # PER-KG DOSING (v1.19). 25 of 76 dose-less extractions were "0.3 g/kg/day"
    # shapes. The multiplication is deterministic and happens only when BOTH
    # numbers are the paper's own.
    from pipeline.dose import study_dose as _sd
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
          "vitamin_d" not in _ep._query("vitamin_d", scope="intervention")
          and 'TITLE:"vitamin d"' in _ep._query("vitamin_d",
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
