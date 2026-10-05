"""Python SourceAccessV3 emission and the worker-side V3 validator (offline).

The shared fixture tests/fixtures/source-access-v3.json carries a hand-built `fake_stream`; the REAL adapter must emit exactly
its `source_access_v3` from it, and the TypeScript server check (tests/scan-research-v3.test.ts) validates that same object.
The adversarial traces below are the Python twins of that file's: the worker refuses before it posts what the server would refuse.
"""
import copy
import hashlib
import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import jsonschema  # noqa: E402
from jsonschema import Draft202012Validator  # noqa: E402
from pipeline import claude_research_adapter as ad  # noqa: E402
from pipeline import research_leads as rl  # noqa: E402

FX = json.loads((ROOT / "tests/fixtures/source-access-v3.json").read_text())
V2 = json.loads((ROOT / "tests/fixtures/source-access-v2.json").read_text())
PUB = "https://pubmed.ncbi.nlm.nih.gov/12345678/"
BLOG = "https://blog.example.org/post/magnesium-sleep"
WALLED = "https://journal.example.org/articles/sleep-trial"


def sha(t):
    return hashlib.sha256(t.encode("utf-8")).hexdigest()


def fresh():
    return copy.deepcopy(FX["audit"]), copy.deepcopy(FX["source_access_v3"])


def set_text(access, i, text):
    e = access["events"][i]
    e["returned_text"], e["text_bytes"], e["text_sha256"] = text, len(text.encode("utf-8")), sha(text)


def ev(tool, kind, req, text, n):
    return {"tool": tool, "tool_use_id": f"t{n}", "kind": kind, "request": req,
            "returned_kind": "no_content" if kind != "request" else ("search_snippet" if tool == "WebSearch" else "fetch_model_summary"),
            "returned_text": text, "text_bytes": len(text.encode()), "text_sha256": sha(text)}


def set_events(access, events):
    access["events"] = events
    s = {k: 0 for k in access["summary"]}
    for e in events:
        s[{"request": "requests", "error": "errors", "wall": "walls", "refusal": "refusals"}[e["kind"]]] += 1
        if e["kind"] == "request" and e["returned_text"]:
            s["search_snippets" if e["returned_kind"] == "search_snippet" else "fetch_summaries"] += 1
    access["summary"] = s


def search(q, links, prose="Prose."):
    return f'Web search results for query: "{q}"\n\nLinks: ' + json.dumps([{"title": "t", "url": u} for u in links]) + f"\n\n{prose}\n"


def fetch_req(url, prompt="state the PMID exactly as printed"):
    """A WebFetch request as SourceAccessV3 carries it: the address AND the prompt the model put to the summariser."""
    return {"url": url, "prompt": prompt}


def cite(audit, i):
    audit["outcomes"][0]["inventory"][0]["id"] = i


class Emission(unittest.TestCase):
    def test_schema_is_valid_draft_2020_12_and_the_canonical_audit_schema_is_untouched(self):
        schema = json.loads((ROOT / ad.SOURCE_ACCESS_V3_SCHEMA_FILE).read_text())
        self.assertEqual(schema["$schema"], "https://json-schema.org/draft/2020-12/schema")
        Draft202012Validator.check_schema(schema)
        self.assertEqual(hashlib.sha256((ROOT / "schemas/research_audit.json").read_bytes()).hexdigest(),
                         "0cef5ec381e653e4fbc55ec6f4eebe0204b7d534671bad3bdfa4f3fb8ba64c2b")
        v2 = json.loads((ROOT / "schemas/source_access_v2.json").read_text())
        self.assertEqual(v2["properties"]["runner"]["properties"]["prompt_version"]["enum"],
                         ["live-research-v0.4", "live-research-v0.3", "live-research-v0.2"])   # the V2 wire is frozen at v0.4

    def test_the_real_adapter_emits_exactly_the_shared_fixture_from_its_fake_stream(self):
        with tempfile.TemporaryDirectory() as td:
            raw = Path(td) / "s.jsonl"
            raw.write_text("".join(json.dumps(x) + "\n" for x in FX["fake_stream"]))
            an = ad.analyze_stream(raw)
        self.assertTrue(an.envelope)
        self.assertEqual(an.audit, FX["audit"])
        rr = ad.RunResult(Path("."), Path("."), Path("."), Path("."), Path("."), Path("."), FX["source_access_v3"]["runner"]["started_at"],
                          ended_utc=FX["source_access_v3"]["runner"]["finished_at"], cli_version="2.1.287", user_turns=2)
        self.assertEqual(ad.source_access_v3(an, rr), FX["source_access_v3"])

    def test_the_fixture_passes_the_worker_validator(self):
        audit, access = fresh()
        ad.validate_live_receipts_and_inventory_v3(audit, access)

    def test_v2_events_never_carry_the_request_and_v3_events_always_do(self):
        self.assertTrue(all("request" in e for e in FX["source_access_v3"]["events"]))
        self.assertTrue(all("request" not in e for e in V2["source_access_v2"]["events"]))

    def test_the_v2_validator_refuses_a_v0_5_runner(self):
        access = copy.deepcopy(V2["source_access_v2"])
        access["runner"]["prompt_version"] = "live-research-v0.5"
        with self.assertRaises(ad.ResearchAdapterError):
            ad.validate_live_receipts_and_inventory(V2["audit"], access)

    def test_a_bare_audit_cannot_become_a_v3_receipt(self):
        an = ad.StreamAnalysis()
        an.audit, an.init = copy.deepcopy(FX["audit"]), {"model": ad.MODEL, "apiKeySource": "none"}
        an.model_usage = {ad.MODEL: {}}
        an.model_usage_keys = {ad.MODEL}
        rr = ad.RunResult(Path("."), Path("."), Path("."), Path("."), Path("."), Path("."), "2026-10-03T12:00:00Z", ended_utc="2026-10-03T12:00:03Z", cli_version="2.1.287")
        with self.assertRaises(ad.ResearchAdapterError):
            ad.source_access_v3(an, rr)

    def emit_with(self, mutate):
        with tempfile.TemporaryDirectory() as td:
            s = copy.deepcopy(FX["fake_stream"])
            mutate(s)
            raw = Path(td) / "s.jsonl"
            raw.write_text("".join(json.dumps(x) + "\n" for x in s))
            an = ad.analyze_stream(raw)
        rr = ad.RunResult(Path("."), Path("."), Path("."), Path("."), Path("."), Path("."), "2026-10-03T12:00:00Z", ended_utc="2026-10-03T12:00:03Z", cli_version="2.1.287")
        return ad.source_access_v3(an, rr)

    def test_a_request_without_a_usable_query_or_address_is_refused_at_emission(self):
        for bad in ("", "x" * 4001):
            with self.assertRaisesRegex(ad.ResearchAdapterError, "invalid_request_metadata: a WebSearch request has no usable query"):
                self.emit_with(lambda s: s[1]["message"]["content"][0]["input"].update(query=bad))
            with self.assertRaisesRegex(ad.ResearchAdapterError, "invalid_request_metadata: a WebFetch request has no usable url"):
                self.emit_with(lambda s: s[1]["message"]["content"][1]["input"].update(url=bad))

    def test_a_webfetch_prompt_is_captured_whole_and_a_missing_or_oversized_one_is_refused_never_shortened(self):
        # captured exactly (control characters out, nothing else touched), up to the 4000 the wire allows
        long_ok = "p" * 4000
        access = self.emit_with(lambda s: s[1]["message"]["content"][1]["input"].update(prompt=long_ok))
        self.assertEqual(access["events"][1]["request"], {"url": PUB, "prompt": long_ok})
        access = self.emit_with(lambda s: s[1]["message"]["content"][1]["input"].update(prompt="a\x00b\x07c\nd"))
        self.assertEqual(access["events"][1]["request"]["prompt"], "abc\nd")
        for bad in ("", "x" * 4001, None):
            def mutate(s, bad=bad):
                if bad is None:
                    s[1]["message"]["content"][1]["input"].pop("prompt")
                else:
                    s[1]["message"]["content"][1]["input"].update(prompt=bad)
            with self.assertRaisesRegex(ad.ResearchAdapterError, "invalid_request_metadata: a WebFetch request has no usable prompt .*never truncated"):
                self.emit_with(mutate)

    def test_the_schema_requires_url_and_prompt_for_a_webfetch_and_the_query_alone_for_a_websearch(self):
        schema = json.loads((ROOT / ad.SOURCE_ACCESS_V3_SCHEMA_FILE).read_text())
        validator = Draft202012Validator(schema)
        self.assertEqual(list(validator.iter_errors(FX["source_access_v3"])), [])
        def invalid(mut):
            access = copy.deepcopy(FX["source_access_v3"])
            mut(access)
            return bool(list(validator.iter_errors(access)))
        self.assertTrue(invalid(lambda a: a["events"][1]["request"].pop("prompt")))                      # fetch: url alone
        self.assertTrue(invalid(lambda a: a["events"][1]["request"].pop("url")))                         # fetch: prompt alone
        self.assertTrue(invalid(lambda a: a["events"][1]["request"].update(query="x")))                  # fetch: a third field
        self.assertTrue(invalid(lambda a: a["events"][0]["request"].update(prompt="x")))                 # search: query only
        self.assertTrue(invalid(lambda a: a["events"][0]["request"].update(url="https://example.org/")))
        self.assertTrue(invalid(lambda a: a["events"][1]["request"].update(prompt="x" * 4001)))
        self.assertTrue(invalid(lambda a: a["events"][1]["request"].update(prompt="")))

    def test_the_frozen_v2_wire_still_carries_no_request_and_its_schema_is_byte_identical(self):
        self.assertEqual(hashlib.sha256((ROOT / "schemas/source_access_v2.json").read_bytes()).hexdigest(),
                         "c510b052c293cef4d4f8a9b55e6dd3f59ad5e986299af010bf0682ee15f64ed2")      # frozen historical compatibility
        v2 = json.loads((ROOT / "schemas/source_access_v2.json").read_text())
        self.assertNotIn("request", v2["properties"]["events"]["items"]["properties"])
        self.assertTrue(all("request" not in e for e in V2["source_access_v2"]["events"]))


class Grounding(unittest.TestCase):
    def refused(self, audit, access, exc=ad.InventoryNotGroundedError):
        with self.assertRaises(exc):
            ad.validate_live_receipts_and_inventory_v3(audit, access)

    def test_a_printed_id_is_recognised(self):
        audit, access = fresh()
        cite(audit, "PMID 87654321")
        set_text(access, 1, "Summary for PMID: 87654321: randomized sleep trial.")
        ad.validate_live_receipts_and_inventory_v3(audit, access)

    def test_a_raw_query_echo_cannot_ground_its_own_id(self):
        audit, access = fresh()
        cite(audit, "PMID 99999999")
        q = "PMID 99999999 magnesium sleep"
        access["events"][0]["request"]["query"] = q
        set_text(access, 0, search(q, [PUB, WALLED, BLOG], "A randomized trial is listed."))
        self.assertIn("pmid:99999999", ad.extract_ids(access["events"][0]["returned_text"]))     # V2 behaviour, for contrast
        self.refused(audit, access)

    def test_an_id_the_model_typed_into_the_query_is_not_grounded_by_the_same_result_even_outside_the_echo(self):
        """A search tool that paraphrases the query back (not a verbatim copy) still prints the id it was asked about."""
        audit, access = fresh()
        cite(audit, "PMID 99999999")
        q = "PMID 99999999 magnesium sleep"
        access["events"][0]["request"]["query"] = q
        set_text(access, 0, search(q, [PUB, WALLED, BLOG], "A randomized trial is listed. PMID: 99999999 reports sleep outcomes."))
        self.refused(audit, access)

    def test_the_same_id_printed_by_a_different_independent_result_is_grounded(self):
        audit, access = fresh()
        cite(audit, "PMID 99999999")
        access["events"][0]["request"]["query"] = "magnesium sleep"
        set_text(access, 0, search("magnesium sleep", [PUB, WALLED, BLOG], "A randomized trial is listed. PMID: 99999999 reports sleep outcomes."))
        access["events"][1]["request"]["prompt"] = "Does this page report PMID 99999999?"     # typed later, into ANOTHER call
        set_text(access, 1, "The page does not mention PMID 99999999.")
        ad.validate_live_receipts_and_inventory_v3(audit, access)

    def test_a_page_that_does_not_mention_the_pmid_in_the_prompt_cannot_ground_it(self):
        """The model's WebFetch `prompt` is its own question to the summariser; 'the page does not mention PMID X' is a paraphrase echo."""
        for answer in ("The page does not mention PMID 31234567.", "PMID: 31234567 is not shown. Title as printed.",
                       "You asked: Does this page report PMID 31234567? No."):
            audit, access = fresh()
            cite(audit, "PMID 31234567")
            access["events"][1]["request"]["prompt"] = "Does this page report PMID 31234567?"
            set_text(access, 1, answer)
            self.refused(audit, access)

    def test_a_doi_typed_into_the_prompt_is_excluded_but_what_the_page_prints_is_kept(self):
        audit, access = fresh()
        cite(audit, "10.1234/abcd.5678")
        access["events"][1]["request"]["prompt"] = "Is this 10.1234/ABCD.5678 the paper?"
        set_text(access, 1, "Yes, DOI 10.1234/abcd.5678. PMID: 12345678.")
        self.refused(audit, access)
        cite(audit, "PMID 12345678")
        ad.validate_live_receipts_and_inventory_v3(audit, access)

    def test_the_prompt_text_echoed_back_verbatim_is_stripped_and_the_event_may_still_ground_another_id(self):
        audit, access = fresh()
        cite(audit, "PMID 27654321")
        access["events"][1]["request"]["prompt"] = "Report PMID 31234567 and the title"
        set_text(access, 1, "You asked: Report PMID 31234567 and the title. The page prints PMID: 27654321.")
        ad.validate_live_receipts_and_inventory_v3(audit, access)

    def test_a_failed_fetch_whose_prompt_and_text_name_the_id_grounds_nothing(self):
        for kind in ("error", "wall", "refusal"):
            audit, access = fresh()
            cite(audit, "PMID 88888888")
            events = access["events"]
            events[2] = ev("WebFetch", kind, fetch_req(WALLED, "Does it print PMID 88888888?"), "PMID: 88888888", 3)
            set_events(access, events)
            self.refused(audit, access)

    def test_the_shared_grounding_cases_hold_in_python(self):
        cases = json.loads((ROOT / "tests/fixtures/lead-accounting-cases.json").read_text())["grounding_cases"]
        self.assertGreaterEqual(len(cases), 8)
        for c in cases:
            self.assertEqual(sorted(ad.grounded_ids_v3(c["events"])), sorted(c["expect_grounded"]), c["name"])

    def test_a_fetched_address_echoed_back_cannot_ground_the_pmid_in_it(self):
        audit, access = fresh()
        cite(audit, "PMID 77777777")
        url = "https://pubmed.ncbi.nlm.nih.gov/77777777/"
        access["events"][1]["request"]["url"] = url
        set_text(access, 1, f"Fetched {url} and summarised it. The page has a title and abstract.")
        self.refused(audit, access)

    def test_error_wall_and_refusal_results_cannot_ground(self):
        for kind in ("error", "wall", "refusal"):
            audit, access = fresh()
            cite(audit, "PMID 88888888")
            events = access["events"]
            events[2] = ev("WebFetch", kind, fetch_req(WALLED), "PMID: 88888888 Please complete the CAPTCHA", 3)
            set_events(access, events)
            self.refused(audit, access)

    def test_wrong_missing_and_unprinted_ids_are_refused(self):
        for bad in ("PMID 12345679", "PMID 1234", "not an id", "", "10.9999/never.printed", "NCT00000000"):
            audit, access = fresh()
            cite(audit, bad)
            self.refused(audit, access)

    def test_non_snippet_access_is_refused(self):
        for acc in ("abstract", "full_text"):
            audit, access = fresh()
            audit["outcomes"][0]["inventory"][0]["access"] = acc
            self.refused(audit, access, ad.ResearchAdapterError)

    def test_the_old_xhigh_unprinted_ids_stay_refused_by_the_v3_rule_too(self):
        """The strict negatives of the 2026-10-05 captures (a bare number in a list line, a number in a link address) are not printed IDs."""
        for text, cited in (("PMID list: 36853379, 11111111", "36853379"),
                            ("Links: [{\"title\":\"x\",\"url\":\"https://example.org/31454046\"}]", "31454046")):
            audit, access = fresh()
            cite(audit, cited)
            set_text(access, 1, text)
            self.refused(audit, access)


class Ledger(unittest.TestCase):
    def incomplete(self, audit, access, code):
        with self.assertRaises(ad.FollowThroughIncompleteError) as cm:
            ad.validate_live_receipts_and_inventory_v3(audit, access)
        self.assertIn(code, ad.follow_through_message(cm.exception.report))
        return cm.exception.report

    def test_silent_lead(self):
        audit, access = fresh()
        access["lead_ledger"] = [r for r in access["lead_ledger"] if r["address"] != BLOG]
        self.incomplete(audit, access, "lead_unaccounted x1")

    def test_ledger_cannot_claim_a_page_that_was_not_requested(self):
        audit, access = fresh()
        next(r for r in access["lead_ledger"] if r["address"] == BLOG)["disposition"] = "opened"
        self.incomplete(audit, access, "ledger_claims_open_without_request x1")

    def test_invented_address(self):
        audit, access = fresh()
        access["lead_ledger"].append({"address": "https://invented.example.org/study", "disposition": "opened", "note": "n"})
        self.incomplete(audit, access, "ledger_unknown_address x1")

    def test_other_locale_of_a_blocked_page_is_not_independent(self):
        audit, access = fresh()
        set_events(access, [access["events"][0], access["events"][1], ev("WebFetch", "error", fetch_req(WALLED), "", 3),
                            ev("WebFetch", "error", fetch_req("https://journal.example.org/es/articles/sleep-trial"), "", 4)])
        self.incomplete(audit, access, "blocked_without_independent_attempt x1")

    def test_the_v0_3_and_v0_4_shapes(self):
        nine = [f"https://lead{i}.example.org/page" for i in range(9)]
        audit, access = fresh()
        for o in audit["outcomes"]:
            o["inventory"] = []
        set_events(access, [ev("WebSearch", "request", {"query": "q"}, search("q", nine), 1)])
        access["lead_ledger"] = []
        msg = ad.follow_through_message(self.incomplete(audit, access, "empty_without_any_page_request x1"))
        self.assertIn("lead_unaccounted x9", msg)
        rsc = "https://pubs.rsc.org/%s/content/articlelanding/2020/fo/c9fo03063h"
        audit, access = fresh()
        for o in audit["outcomes"]:
            o["inventory"] = []
        set_events(access, [ev("WebSearch", "request", {"query": "q"}, search("q", [PUB] + nine[:7] + [rsc % "es"]), 1),
                            ev("WebFetch", "error", fetch_req(rsc % "en"), "", 2), ev("WebFetch", "error", fetch_req(rsc % "es"), "", 3)])
        access["lead_ledger"] = []
        msg = ad.follow_through_message(self.incomplete(audit, access, "identifier_lead_unopened x1"))
        self.assertIn("blocked_without_independent_attempt x1", msg)

    def test_the_failure_message_fits_the_api_limit_even_with_many_problems(self):
        audit, access = fresh()
        for o in audit["outcomes"]:
            o["inventory"] = []
        set_events(access, [ev("WebSearch", "request", {"query": "q"}, search("q", [f"https://l{i}.example.org/p" for i in range(300)]), 1)])
        access["lead_ledger"] = []
        report = self.incomplete(audit, access, "lead_unaccounted x300")
        self.assertLessEqual(len(ad.follow_through_message(report, "stalled", 3)), 300)

    def test_a_bad_ledger_is_refused_by_the_schema(self):
        for mut in (lambda r: r[0].update(disposition="I did not get to it"), lambda r: r[0].update(extra=1),
                    lambda r: r[0].pop("note"), lambda r: r[0].update(note="x" * 301), lambda r: r[0].update(address="short")):
            audit, access = fresh()
            mut(access["lead_ledger"])
            with self.assertRaises(ad.ResearchAdapterError):
                ad.validate_live_receipts_and_inventory_v3(audit, access)

    def test_integrity_checks_still_hold(self):
        for mut in (lambda a: a["events"][0].update(text_bytes=999), lambda a: a["events"][0].update(text_sha256="0" * 64),
                    lambda a: a["summary"].update(requests=99), lambda a: a["events"][1].update(tool_use_id=a["events"][0]["tool_use_id"]),
                    lambda a: a["runner"].update(prompt_version="live-research-v0.4"), lambda a: a["runner"].update(api_key_source="x"),
                    lambda a: a["events"][0].update(request={"url": PUB})):
            audit, access = fresh()
            mut(access)
            with self.assertRaises(ad.ResearchAdapterError):
                ad.validate_live_receipts_and_inventory_v3(audit, access)


if __name__ == "__main__":
    unittest.main()
