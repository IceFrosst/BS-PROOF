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

    def test_a_request_without_a_usable_query_or_address_is_refused_at_emission(self):
        for bad in ("", "x" * 4001):
            with tempfile.TemporaryDirectory() as td:
                s = copy.deepcopy(FX["fake_stream"])
                s[1]["message"]["content"][0]["input"]["query"] = bad
                raw = Path(td) / "s.jsonl"
                raw.write_text("".join(json.dumps(x) + "\n" for x in s))
                an = ad.analyze_stream(raw)
            rr = ad.RunResult(Path("."), Path("."), Path("."), Path("."), Path("."), Path("."), "2026-10-03T12:00:00Z", ended_utc="2026-10-03T12:00:03Z", cli_version="2.1.287")
            with self.assertRaisesRegex(ad.ResearchAdapterError, "invalid_request_metadata"):
                ad.source_access_v3(an, rr)


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

    def test_the_same_id_printed_outside_the_echo_is_grounded(self):
        audit, access = fresh()
        cite(audit, "PMID 99999999")
        q = "PMID 99999999 magnesium sleep"
        access["events"][0]["request"]["query"] = q
        set_text(access, 0, search(q, [PUB, WALLED, BLOG], "A randomized trial is listed. PMID: 99999999 reports sleep outcomes."))
        ad.validate_live_receipts_and_inventory_v3(audit, access)

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
            events[2] = ev("WebFetch", kind, {"url": WALLED}, "PMID: 88888888 Please complete the CAPTCHA", 3)
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
        set_events(access, [access["events"][0], access["events"][1], ev("WebFetch", "error", {"url": WALLED}, "", 3),
                            ev("WebFetch", "error", {"url": "https://journal.example.org/es/articles/sleep-trial"}, "", 4)])
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
                            ev("WebFetch", "error", {"url": rsc % "en"}, "", 2), ev("WebFetch", "error", {"url": rsc % "es"}, "", 3)])
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
