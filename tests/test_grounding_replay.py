"""
Replay of the three Vitamin D research attempts of 2026-10-05 (all three refused by the inventory-grounding guard).

WHY THIS EXISTS. A research job was refused three times with "inventory ID is not grounded in returned tool text".
Whether that is the model inventing papers or the worker discarding papers it really retrieved cannot be settled by
reading the message; it is settled by replaying the ORIGINAL raw streams through the real guard. The result (see
docs/research/pc-research-worker.md "Why the Vitamin D job failed three times"):

  * most rejected ids WERE printed in returned tool text -- in a form the extraction did not recognise
    (a Markdown-bold "**PMID:** 123" label; a DOI read from a URL that ends in "/full" or "/pdf");
  * the rest were NOT printed as an identifier anywhere the guard may look (typed only into the model's own request,
    a bare number in a list line, a number or a DOI tail inside the address of a link the model never opened) and
    must stay rejected.

What this file pins:
  1. with the OLD extraction patched back in, the guard reproduces the three recorded failure messages exactly;
  2. with the fixed extraction, exactly the rows whose id is printed in a returned result are grounded and exactly
     the model's unprinted assertions stay rejected -- the guard itself is unchanged;
  3. adversarial negatives: a receipt that is missing, failed, for a different paper, or an invented paper cannot
     ground a row;
  4. (only where the private captures exist, hash-pinned) the same, replayed through `source_access_v2` on the
     untouched originals. The captures are opened read-only and never modified.

No model, no network. jsonschema is required (the guard validates the receipt with it) and a missing module fails.
"""
import copy
import hashlib
import json
import os
import re
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import jsonschema  # noqa: E402,F401
from pipeline import claude_research_adapter as ad  # noqa: E402

REPLAY = json.loads((ROOT / "tests/fixtures/grounding-replay-vitd-20261005.json").read_text())
TEMPLATE = json.loads((ROOT / "tests/fixtures/source-access-v2.json").read_text())["source_access_v2"]

# What the extraction looked like before 2026-10-06 (patched back in to reproduce the production failures).
OLD_PMID_RE = re.compile(r"\bPMID[:\s#]*(\d{5,9})\b", re.I)

# Per cited id: does a returned tool result print it, in a form the FIXED extraction recognises?
# False = the model asserted an id that no returned result prints. These must stay rejected.
RESIDUAL = {
    "vitd-run-1": {"36853379"},                       # a bare number in a "PMID list" line; the later fetch summary never printed it
    "vitd-run-2": {"PMID:35939577"},                  # only in the model's own Europe PMC request; the summary has the title, not the id
    "vitd-run-3": {"31454046", "10.1039/C9FO03063H"},  # a number in a link address; a DOI assembled from link addresses (neither is printed as an identifier)
}
# The first row the OLD extraction refused = the message the worker posted.
RECORDED_FIRST = {
    "vitd-run-1": "35939577",
    "vitd-run-2": "PMID:32219282",
    "vitd-run-3": "31454046",
}


def access_from(receipts):
    """A SourceAccessV2 object (the real schema, the real counters) whose events are exactly `receipts`."""
    access = copy.deepcopy(TEMPLATE)
    access["runner"]["prompt_version"] = ad.LIVE_PROMPT_VERSION
    events = []
    summary = {k: 0 for k in access["summary"]}
    for i, r in enumerate(receipts):
        raw = r["returned_text"].encode("utf-8")
        events.append({"tool": r["tool"], "tool_use_id": f"toolu_replay_{i}", "kind": r["kind"],
                       "returned_kind": r["returned_kind"], "returned_text": r["returned_text"],
                       "text_bytes": len(raw), "text_sha256": hashlib.sha256(raw).hexdigest()})
        summary[{"request": "requests", "error": "errors", "wall": "walls", "refusal": "refusals"}[r["kind"]]] += 1
        if r["kind"] == "request" and r["returned_text"]:
            summary["search_snippets" if r["returned_kind"] == "search_snippet" else "fetch_summaries"] += 1
    access["events"], access["summary"] = events, summary
    return access


def guard(row_id, receipts, access_level="snippet"):
    """Run the REAL guard for one inventory row. Returns None if grounded, else the refusal message."""
    audit = {"outcomes": [{"inventory": [{"id": row_id, "access": access_level}]}]}
    try:
        ad.validate_live_receipts_and_inventory(audit, access_from(receipts))
    except ad.InventoryNotGroundedError as exc:
        return str(exc)
    return None


class OldExtraction:
    """Context manager: the pre-2026-10-06 PMID pattern and no DOI view-suffix unwrapping."""

    def __enter__(self):
        self._saved = (ad.PMID_RE, ad.DOI_WEB_VIEW_SUFFIXES)
        ad.PMID_RE, ad.DOI_WEB_VIEW_SUFFIXES = OLD_PMID_RE, ()

    def __exit__(self, *exc):
        ad.PMID_RE, ad.DOI_WEB_VIEW_SUFFIXES = self._saved


class PortableReplay(unittest.TestCase):
    """Verbatim excerpts of the original streams: runs everywhere, needs no private file."""

    def test_the_old_extraction_reproduces_each_recorded_failure_exactly(self):
        with OldExtraction():
            for name, run in REPLAY["runs"].items():
                first = next((guard(r["id"], run["receipts"]) for r in run["rows"] if guard(r["id"], run["receipts"])), None)
                self.assertEqual(first, run["recorded_failure"], name)
                self.assertIn(f"'{RECORDED_FIRST[name]}'", first, name)

    def test_fixed_extraction_grounds_exactly_the_ids_a_returned_result_prints(self):
        for name, run in REPLAY["runs"].items():
            refused = {r["id"] for r in run["rows"] if guard(r["id"], run["receipts"])}
            self.assertEqual(refused, RESIDUAL[name], name)
            self.assertGreater(len(run["rows"]) - len(refused), 0, name)

    def test_most_of_what_was_refused_had_been_retrieved(self):
        # The measured split, row by row: refused by the OLD extraction vs. still refused by the fixed one.
        old_refused = new_refused = total = 0
        for name, run in REPLAY["runs"].items():
            for r in run["rows"]:
                total += 1
                with OldExtraction():
                    old_refused += bool(guard(r["id"], run["receipts"]))
                new_refused += bool(guard(r["id"], run["receipts"]))
        # 33 cited rows; 18 refused before (10 + 5 + 3 per attempt); 14 of those 18 were printed in returned text
        # in a form the extraction did not recognise; 4 stay refused.
        self.assertEqual((total, old_refused, new_refused), (33, 18, 4))

    def test_every_remaining_refusal_is_an_id_no_returned_result_prints_as_an_identifier(self):
        """The four rows that stay refused, by the exact form in which their digits occur in returned text."""
        def occurrences(run, digits):
            return [t for t in (r["returned_text"] for r in run["receipts"] if r["kind"] == "request") if digits in t]

        # (a) a bare number in a "PMID list" line: never labelled as a PMID next to the number, so a number, not a citation
        run = REPLAY["runs"]["vitd-run-1"]
        texts = occurrences(run, "36853379")
        self.assertEqual(len(texts), 1)
        self.assertIn("The PMID list is:\n\n36853379", texts[0])
        self.assertIsNone(re.search(r"PMID[\s:#*]*36853379", texts[0], re.I))
        # (b) typed only into the model's own request: the summary that came back has no such digits at all
        self.assertEqual(occurrences(REPLAY["runs"]["vitd-run-2"], "35939577"), [])
        # (c) a number inside the address of a third-party link the model never opened
        run = REPLAY["runs"]["vitd-run-3"]
        texts = occurrences(run, "31454046")
        self.assertEqual(len(texts), 1)
        self.assertEqual(texts[0].count("31454046"), 1)
        self.assertIn("/medline/citation/31454046/full_citation", texts[0])
        self.assertIsNone(re.search(r"PMID[\s:#*]*31454046", texts[0], re.I))
        # (d) a DOI the model ASSEMBLED: the string "10.1039/C9FO03063H" is printed nowhere; only the tail "c9fo03063h"
        # occurs, inside the addresses of two publisher links of an unopened search result (the registrant prefix
        # 10.1039 had to come from the model). Plausible and probably right -- and not printed, so not grounded.
        self.assertEqual(occurrences(run, "10.1039/c9fo03063h") + occurrences(run, "10.1039/C9FO03063H"), [])
        tails = occurrences(run, "c9fo03063h")
        self.assertEqual(len(tails), 3)  # three search results mention it ...
        inside_links = sum(len(re.findall(r"https://pubs\.rsc\.org/[^\"\s]*c9fo03063h", t)) for t in tails)
        self.assertEqual(inside_links, sum(len(re.findall("c9fo03063h", t, re.I)) for t in tails))  # ... only ever inside a link address
        self.assertEqual(inside_links, 5)

    def test_the_guard_is_unchanged_the_wrong_access_level_is_still_refused(self):
        run = REPLAY["runs"]["vitd-run-1"]
        audit = {"outcomes": [{"inventory": [{"id": "PMID:35939577", "access": "abstract"}]}]}
        with self.assertRaisesRegex(ad.ResearchAdapterError, "must be snippet"):
            ad.validate_live_receipts_and_inventory(audit, access_from(run["receipts"]))

    # ---- adversarial negatives: receipt missing / failed / wrong paper / invented paper ----

    def labelled(self):
        run = REPLAY["runs"]["vitd-run-1"]
        hit = [r for r in run["receipts"] if "**PMID:** 35939577" in r["returned_text"]]
        self.assertEqual(len(hit), 1)
        return run["receipts"], hit[0]

    def test_positive_the_bold_label_grounds_the_paper_it_names(self):
        receipts, _ = self.labelled()
        self.assertIsNone(guard("35939577", receipts))
        self.assertIsNone(guard("PMID:35939577", receipts))

    def test_negative_receipt_missing(self):
        receipts, hit = self.labelled()
        without = [r for r in receipts if r is not hit]
        self.assertIn("not grounded", guard("35939577", without))

    def test_negative_receipt_failed_even_if_its_text_still_shows_the_label(self):
        receipts, hit = self.labelled()
        for kind in ("error", "wall", "refusal"):
            failed = [dict(r, kind=kind, returned_kind="no_content") if r is hit else r for r in receipts]
            self.assertIn("not grounded", guard("35939577", failed), kind)

    def test_negative_receipt_is_for_a_different_paper(self):
        receipts, hit = self.labelled()
        other = [dict(r, returned_text=r["returned_text"].replace("**PMID:** 35939577", "**PMID:** 35939578")) if r is hit else r for r in receipts]
        self.assertIn("not grounded", guard("35939577", other))
        self.assertIsNone(guard("35939578", other))  # and it grounds what it actually prints, nothing else

    def test_negative_the_summary_names_the_paper_but_does_not_print_the_id(self):
        receipts, hit = self.labelled()
        unlabelled = [dict(r, returned_text=re.sub(r"\*\*PMID:\*\* 35939577\s*", "", r["returned_text"])) if r is hit else r for r in receipts]
        self.assertIn("not grounded", guard("35939577", unlabelled))

    def test_negative_an_invented_or_remembered_paper(self):
        receipts, _ = self.labelled()
        for rid in ("PMID:99999999", "99999999", "10.1000/invented.2026.1", "NCT00000000"):
            self.assertIn("not grounded", guard(rid, receipts), rid)

    def test_negative_a_bare_listed_number_is_not_a_label(self):
        run = REPLAY["runs"]["vitd-run-1"]
        self.assertIn("not grounded", guard("36853379", run["receipts"]))

    def test_doi_view_suffix_positive_and_negatives(self):
        run = REPLAY["runs"]["vitd-run-3"]
        self.assertIsNone(guard("10.3389/fpubh.2022.979649", run["receipts"]))
        self.assertIsNone(guard("10.3389/fpubh.2022.979649/full", run["receipts"]))
        altered = [dict(r, returned_text=r["returned_text"].replace("979649", "979650")) for r in run["receipts"]]
        self.assertIn("not grounded", guard("10.3389/fpubh.2022.979649", altered))  # a different DOI behind /full
        longer = [dict(r, returned_text=r["returned_text"].replace("979649/full", "979649/fullxyz").replace("979649/pdf", "979649/pdfxyz")) for r in run["receipts"]]
        self.assertIn("not grounded", guard("10.3389/fpubh.2022.979649", longer))  # only /full and /pdf are unwrapped
        self.assertIn("not grounded", guard("10.1039/C9FO03063H", run["receipts"]))  # assembled from link addresses, never printed


# --------------------------------------------------------------------------- #
# the untouched originals, where they exist

CAPTURES = Path(os.environ.get("BS_PROOF_REPLAY_CAPTURES", str(Path.home() / ".local/share/bsproof-research-worker/data/runs")))
CAPTURE_DIRS = {
    "vitd-run-1": "20261005T111436Z-7d2f20abcfd04559b3df850c67a411d8",
    "vitd-run-2": "20261005T112130Z-0a5158a0915f4fd29b7a1aa4499b192a",
    "vitd-run-3": "20261005T112912Z-b4397d2b2a4c484abf06df55ef08af31",
}
HAVE_CAPTURES = all((CAPTURES / d / "raw-stream.jsonl").is_file() for d in CAPTURE_DIRS.values())


@unittest.skipUnless(HAVE_CAPTURES, "the private 2026-10-05 captures are not on this machine (the portable replay above still ran)")
class FullCaptureReplay(unittest.TestCase):
    def rr(self):
        return ad.RunResult(Path("."), Path("."), Path("."), Path("."), Path("."), Path("."),
                            "2026-10-05T11:14:36Z", ended_utc="2026-10-05T11:21:28Z", cli_version="2.1.287")

    def stream(self, name):
        raw = CAPTURES / CAPTURE_DIRS[name] / "raw-stream.jsonl"
        digest = hashlib.sha256(raw.read_bytes()).hexdigest()  # read-only; the file is never opened for writing
        self.assertEqual(digest, REPLAY["runs"][name]["raw_stream_sha256"], f"{name}: this is not the original capture")
        return ad.analyze_stream(raw)

    def test_the_old_extraction_fails_each_original_exactly_as_recorded(self):
        with OldExtraction():
            for name in CAPTURE_DIRS:
                an = self.stream(name)
                with self.assertRaises(ad.InventoryNotGroundedError) as ctx:
                    ad.source_access_v2(an, self.rr())
                self.assertEqual(str(ctx.exception), REPLAY["runs"][name]["recorded_failure"], name)

    def test_the_fixed_extraction_moves_each_failure_to_the_models_unprinted_id(self):
        for name in CAPTURE_DIRS:
            an = self.stream(name)
            with self.assertRaises(ad.InventoryNotGroundedError) as ctx:
                ad.source_access_v2(an, self.rr())
            first_unprinted = next(r["id"] for r in REPLAY["runs"][name]["rows"] if r["id"] in RESIDUAL[name])
            self.assertEqual(str(ctx.exception), f"inventory ID is not grounded in returned tool text: {first_unprinted!r}", name)

    def test_the_originals_are_still_byte_identical(self):
        for name in CAPTURE_DIRS:
            self.stream(name)  # asserts the pinned sha256


if __name__ == "__main__":
    unittest.main()
