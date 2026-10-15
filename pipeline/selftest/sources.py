"""Selftest group: Europe PMC, design classification, ClinicalTrials.gov, OA and full text."""
import sys, os, pathlib  # noqa: F401  (sections use them)
from pipeline.selftest._common import dedup, canonical_id, registry_id, vocab, _reasonless_probe  # noqa: F401


def run(check):
    print("\nEUROPE PMC NORMALISATION")
    from sources import europepmc as ep
    raw = {"pmid": "123", "doi": "10.1/x", "title": "A trial",
           "authorString": "Smith J, Jones K", "pubYear": "2019",
           "abstractText": "Registered as NCT01234567. Magnesium 400 mg daily.",
           "pubTypeList": {"pubType": ["Randomized Controlled Trial", "Journal Article"]},
           "isOpenAccess": "N", "journalInfo": {"journal": {"title": "J Test"}}}
    n = ep.normalise(raw)
    check("registry id recovered from abstract", n["registration_id"] == "NCT01234567")
    check("primary not misread as synthesis", n["is_synthesis"] is False)
    check("no OA -> abstract_only", n["oa"] == "abstract_only")
    check("fields with no source stay null",
          n["n"] is None and n["country"] is None and n["dose_text"] is None,
          "no invented defaults")
    syn = ep.normalise({**raw, "pubTypeList": {"pubType": ["Meta-Analysis"]},
                        "pmcid": "PMC1"})
    check("meta-analysis classified as synthesis", syn["is_synthesis"] is True)
    check("PMC id -> full_text", syn["oa"] == "full_text")

    print("\nDESIGN CLASSIFICATION (deterministic; S1 is the fallback)")
    from pipeline.classify import classify, classify_all
    def rec(types=(), mesh=(), title=""):
        return {"pub_types": list(types), "mesh_terms": list(mesh), "title": title}

    check("RCT tag -> rank 4",
          classify(rec(["Randomized Controlled Trial"], ["Humans"]))["design_rank"] == 4)
    check("meta-analysis -> rank 2",
          classify(rec(["Meta-Analysis", "Systematic Review"], ["Humans"]))["design_rank"] == 2)
    check("SR without MA -> rank 3",
          classify(rec(["Systematic Review"], ["Humans"]))["design_rank"] == 3)
    check("umbrella review from title -> rank 1",
          classify(rec(["Systematic Review"], ["Humans"], "An umbrella review of..."))["design_rank"] == 1)
    # The rule that saves the most weight: a rigorous animal study is still 12.
    animal = classify(rec(["Randomized Controlled Trial"], ["Animals", "Rats"]))
    check("randomised RAT trial -> rank 12, not 4", animal["design_rank"] == 12,
          "design weight 0.004 vs 1.00 — a 250x error if missed")
    check("animal tag with Humans present stays a trial",
          classify(rec(["Randomized Controlled Trial"], ["Animals", "Humans"]))["design_rank"] == 4,
          "co-tagged translational papers are not animal studies")
    check("editorial -> rank 14", classify(rec(["Editorial"], ["Humans"]))["design_rank"] == 14)
    check("case-control from MeSH -> rank 8",
          classify(rec(["Journal Article"], ["Humans", "Case-Control Studies"]))["design_rank"] == 8)

    amb = classify(rec(["Clinical Trial"], ["Humans"]))
    check("bare 'Clinical Trial' -> needs S1, not a guess",
          amb["needs_model"] and amb["design_rank"] is None,
          "randomised vs not is 1.00 vs 0.55")
    bare = classify(rec())
    check("untagged record -> needs S1", bare["needs_model"] and bare["design_rank"] is None)
    _, cstats = classify_all([rec(["Randomized Controlled Trial"], ["Humans"]), rec()])
    check("classify_all reports S1 call volume",
          cstats["needs_model"] == 1 and cstats["deterministic_pct"] == 50.0,
          f"{cstats['deterministic_pct']}% settled without a model")

    print("\nCLINICALTRIALS.GOV (RoB items 3+4, unpublished flag)")
    from sources import clinicaltrials as ct
    from datetime import date as _date

    def ctrec(reg, start, **kw):
        return {"protocolSection": {"statusModule": {
            "studyFirstSubmitDate": reg,
            "startDateStruct": {"date": start}, **kw}}}

    check("registered before enrolment -> 1",
          ct.item3_prospective_registration(ctrec("2019-04-30", "2019-09-01"))[0] == 1)
    check("registered after enrolment -> 0",
          ct.item3_prospective_registration(ctrec("2016-03-22", "2008-01-01"))[0] == 0)
    check("missing start date -> null, not a guess",
          ct.item3_prospective_registration(ctrec("1999-11-03", None))[0] is None)
    check("same month at month precision -> null",
          ct.item3_prospective_registration(ctrec("2019-04-15", "2019-04"))[0] is None,
          "the answer would depend on a day we do not have")

    done = {"protocolSection": {"statusModule": {
        "overallStatus": "COMPLETED",
        "completionDateStruct": {"date": "2014-12-01"}}}}
    check("completed, no results, overdue -> flagged",
          ct.unpublished_flag(done, today=_date(2026, 8, 6))["flagged"] is True)
    check("results posted -> not flagged",
          ct.unpublished_flag({**done, "hasResults": True},
                              today=_date(2026, 8, 6))["flagged"] is False)
    check("recently completed -> not flagged",
          ct.unpublished_flag(done, today=_date(2015, 1, 1))["flagged"] is False)

    flow = {"resultsSection": {"participantFlowModule": {"periods": [{"milestones": [
        {"type": "STARTED", "achievements": [{"numSubjects": "800"}, {"numSubjects": "805"}]},
        {"type": "COMPLETED", "achievements": [{"numSubjects": "760"}, {"numSubjects": "747"}]}]}]}}}
    a = ct.attrition(flow)
    check("attrition computed from participant flow",
          a["n_started"] == 1605 and a["dropout_rate"] == 0.061,
          f"{a['n_started']} started, dropout {a['dropout_rate']}")
    check("no posted results -> attrition all null",
          ct.attrition({})["dropout_rate"] is None)

    print("\nGREEN OA RESOLUTION")
    from sources import oa as oamod
    oa_work = {"best_oa_location": {"is_oa": True, "pdf_url": "http://x/y.pdf",
                                    "version": "publishedVersion", "license": "cc-by",
                                    "source": {"type": "repository"}},
               "referenced_works": ["W1", "W2", "W3"]}
    closed = {"best_oa_location": {"is_oa": False}}
    check("OA location normalised",
          oamod.oa_location(oa_work)["url"] == "http://x/y.pdf")
    check("closed access -> None, a real answer",
          oamod.oa_location(closed) is None)
    check("reference list available for SR resolution",
          len(oamod.referenced_work_ids(oa_work)) == 3,
          "narrows S2's search space; never decides membership")
    check("reference ids are OPENALEX ids, and the name now says so",
          oamod.referenced_work_ids({"referenced_works": ["W1"]}) == ["W1"]
          and not oamod.referenced_work_ids({"referenced_works": ["W1"]})[0].startswith("10."),
          "the old name promised DOIs and returned W-ids")
    check("europepmc full_text short-circuits the lookup",
          oamod.resolve({"oa": "full_text", "doi": "10.1/x"})["checked"] == ["europepmc"],
          "free answer wins")
    check("no DOI -> nothing to resolve against",
          oamod.resolve({"oa": "abstract_only", "doi": None})["checked"] == [])
    # Force the unconfigured state. Reading it from the ambient environment made
    # this check pass only on machines with no BSPROOF_CONTACT_EMAIL set -- it
    # failed for anyone who had actually configured OA resolution, which is
    # backwards. The selftest must not depend on the shell it is run from.
    _saved = oamod.CONTACT_EMAIL
    try:
        oamod.CONTACT_EMAIL = None
        try:
            oamod.unpaywall("10.1/x")
            gated = False
        except oamod.ContactEmailMissing:
            gated = True
    finally:
        oamod.CONTACT_EMAIL = _saved
    check("Unpaywall RAISES without an email, never returns 'no OA'", gated,
          "a silent miss is indistinguishable from a paywalled paper")

    print("\nFULL TEXT (JATS parsing, tables)")
    from sources import fulltext as ft
    jats = """<article><front><article-meta><abstract><p>Short abstract.</p>
      </abstract></article-meta></front><body>
      <sec><title>Materials and Methods</title><p>Randomised, double-blind.</p></sec>
      <sec><title>Results</title><p>PSQI improved by 2.1 points.</p></sec>
      <sec><title>Discussion</title><p>We conclude it works.</p></sec>
      <table-wrap><label>Table 1</label><caption><p>Characteristics of included
        studies</p></caption><table><tr><th>Author</th><th>Year</th><th>Dose</th>
        <th>Duration</th></tr><tr><td>Smith</td><td>2019</td><td>400 mg</td>
        <td>8 wk</td></tr></table></table-wrap>
      <table-wrap><label>Table 2</label><caption><p>Adverse events</p></caption>
        <table><tr><th>Event</th><th>n</th></tr><tr><td>Nausea</td><td>3</td></tr>
        </table></table-wrap></body></article>"""
    sec = ft.sections(jats)
    check("JATS sections parsed", set(sec) == {"methods", "results", "discussion"})
    check("'Materials and Methods' matched as methods",
          "double-blind" in sec["methods"],
          "S4 must see methods, not the discussion's confidence")
    check("results kept separate from discussion",
          "PSQI" in sec["results"] and "PSQI" not in sec["discussion"],
          "S5 reads numbers; spin lives in the discussion")
    tabs = ft.extract_tables(jats)
    check("tables keep row structure", len(tabs) == 2 and tabs[0]["rows"][1][2] == "400 mg",
          "flattening a characteristics table loses which dose is whose")
    check("unparseable XML -> empty, never a partial guess",
          ft.sections("<not xml") == {} and ft.extract_tables(None) == [])
    txt, tier = ft.best_text({"pmcid": None, "abstract": "Only an abstract."})
    check("no full text -> abstract tier is REPORTED, not assumed",
          tier == "abstract_only" and txt == "Only an abstract.",
          "silently calling an abstract full_text inflates every score on it")

    print("\nFULL-TEXT LADDER (3 sources, not 1)")
    import json as _json
    check("free Europe PMC URLs are captured, subscription ones dropped",
          [u["style"] for u in ep.free_fulltext_urls({"fullTextUrlList": {"fullTextUrl": [
              {"availability": "Subscription required", "documentStyle": "doi", "url": "a"},
              {"availability": "Free", "documentStyle": "pdf", "url": "b"},
              {"availability": "Open access", "documentStyle": "html", "url": "c"}]}})]
          == ["pdf", "html"],
          "a link we cannot open is not a source; counting it inflates the OA rate")
    check("pdf extraction is OPTIONAL at runtime",
          isinstance(ft.pdf_available(), bool),
          "a machine without pypdf must still run the pipeline")
    # This gate is offline. A fake URL is still a real network attempt when
    # optional PDF support is installed; stub the transport, not the parser.
    from unittest.mock import patch
    with patch.object(ft, "fetch_pdf_text", return_value=None) as pdf_fetch:
        check("a stored oa_location (JSON string) is parsed, not crashed on",
              ft.best_text({"pmcid": None, "abstract": "x",
                            "oa_location": _json.dumps({"url": "http://nope/x.pdf"})})[1]
              == "abstract_only"
              and pdf_fetch.call_args is not None
              and pdf_fetch.call_args.args == ("http://nope/x.pdf",),
              "storage round-trips it as text; an unreadable copy stays abstract_only")
    check("a too-short extraction is REFUSED",
          ft.MIN_USABLE_CHARS >= 1000,
          "a 200-char PDF is a cover page; handing it to S4 as methods "
          "produces confident nonsense")

    # The wiring that made the ladder matter: the filter must accept records
    # whose full text is reachable OFF PubMed Central.
    from bsproof.run import corpus as _rp
    kept = _rp._prioritize_primaries(
        [{"oa": "full_text", "year": 2020},
         {"oa": "abstract_only", "year": 2020, "oa_location": {"url": "x.pdf"}},
         {"oa": "abstract_only", "year": 2020}],
        full_text_only=True)
    check("green-OA records survive the full-text filter", len(kept) == 2,
          "they were being dropped BEFORE best_text could read them, "
          "which made the whole ladder dead weight")
