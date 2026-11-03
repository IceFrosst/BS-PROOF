"""The text every agent reads (sources/fulltext.best_text). MEASURED 2026-10-26
on run 20261026_034529: 3 MDPI papers lost their methods ("2. Experimental
Section" matched no pattern) and 7 green-OA PDFs were tag-stripped as HTML and
sent as raw "%PDF" bytes, so S4 returned all nulls and 7 studies gave no claims."""
import hashlib
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from sources import fulltext

PAPER = "Methods text. " * 200        # above MIN_USABLE_CHARS


class SectionTitles(unittest.TestCase):
    def test_experimental_section_is_methods(self):
        for title in ("2. Experimental Section", "Experimental Design", "Experimental procedures"):
            self.assertEqual(fulltext._match_section(title), "methods", title)

    def test_other_titles_unchanged(self):
        self.assertEqual(fulltext._match_section("2. Materials and Methods"), "methods")
        self.assertEqual(fulltext._match_section("3. Results"), "results")
        self.assertIsNone(fulltext._match_section("Experimental animals"))   # not a section name

    def test_best_text_includes_an_experimental_section(self):
        xml = ("<article><body><sec><title>2. Experimental Section</title><p>double-blind design</p></sec>"
               "<sec><title>3. Results</title><p>results here</p></sec></body></article>")
        with patch.object(fulltext, "fetch_xml", return_value=xml):
            text, tier = fulltext.best_text({"pmcid": "PMC1"})
        self.assertEqual(tier, "full_text")
        self.assertIn("double-blind design", text)


class PdfServedAsHtml(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.patches = [patch.object(fulltext, "CACHE_DIR", Path(self.tmp.name)),
                        patch.object(fulltext, "throttle", lambda url: None)]
        for p in self.patches:
            p.start()

    def tearDown(self):
        for p in self.patches:
            p.stop()
        self.tmp.cleanup()

    def _get(self, content: bytes):
        return patch("httpx.get", return_value=SimpleNamespace(
            status_code=200, content=content, text=content.decode("latin-1")))

    def test_pdf_bytes_are_parsed_as_pdf_never_tag_stripped(self):
        with self._get(b"%PDF-1.4 binary"), \
                patch.object(fulltext, "_pdf_bytes_text", return_value=PAPER) as parse:
            self.assertEqual(fulltext.fetch_html_text("https://repo.example/handle/1"), PAPER)
        parse.assert_called_once()

    def test_an_unreadable_pdf_is_none_not_bytes(self):
        with self._get(b"%PDF-1.4 binary"), patch.object(fulltext, "_pdf_bytes_text", return_value=None):
            self.assertIsNone(fulltext.fetch_html_text("https://repo.example/handle/2"))

    def test_a_poisoned_cache_entry_is_fetched_again(self):
        url = "https://repo.example/handle/3"
        cache = Path(self.tmp.name) / f"html_{hashlib.sha256(url.encode()).hexdigest()[:24]}.txt"
        cache.write_text("%PDF-1.3 garbage " * 200)
        with self._get(b"%PDF-1.4 binary"), patch.object(fulltext, "_pdf_bytes_text", return_value=PAPER):
            self.assertEqual(fulltext.fetch_html_text(url), PAPER)
        self.assertEqual(cache.read_text(), PAPER)

    def test_html_still_tag_stripped(self):
        html = ("<html><body><p>" + PAPER + "</p></body></html>").encode()
        with self._get(html):
            self.assertTrue(fulltext.fetch_html_text("https://repo.example/handle/4").startswith("Methods text."))


class FullTextOnly(unittest.TestCase):
    """Under --full-text-only an abstract is never extracted (founder
    2026-10-17); measured 2026-10-28: the tier was being discarded."""
    def test_an_abstract_gets_no_text_under_full_text_only(self):
        from bsproof.run.corpus import _best_text
        with patch.object(fulltext, "best_text", return_value=("an abstract " * 50, "abstract_only")):
            self.assertEqual(_best_text({"title": "t"}, full_text_only=True), "")
            self.assertTrue(_best_text({"title": "t"}).startswith("an abstract"))
        with patch.object(fulltext, "best_text", return_value=(PAPER, "full_text")):
            self.assertEqual(_best_text({"title": "t"}, full_text_only=True), PAPER)
        with patch.object(fulltext, "best_text", side_effect=RuntimeError("fetch failed")):
            self.assertEqual(_best_text({"title": "t", "abstract": "x"}, full_text_only=True), "")


if __name__ == "__main__":
    unittest.main()


class BrokenSignFont(unittest.TestCase):
    """MEASURED 2026-11-03 (vitamin C run): Cambridge PDFs whose symbol font maps
    minus to "2" and plus to "thorn" -- "(-0.12, 95 % CI -0.32, 0.09)" read as
    "(20·12 mmol/l, 95 % CI 20·32, 0·09)". Refused, never decoded."""
    BROKEN = ("Methods text. " * 200
              + "decreased (20·12 mmol/l, 95 % CI 20·32, 0·09) but increased (þ0·12 mmol/l)")

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.patch = patch.object(fulltext, "CACHE_DIR", Path(self.tmp.name))
        self.patch.start()

    def tearDown(self):
        self.patch.stop()
        self.tmp.cleanup()

    def test_signature(self):
        self.assertTrue(fulltext._broken_signs("increased (þ0·12 mmol/l"))
        self.assertTrue(fulltext._broken_signs("fax þ44 1792"))
        self.assertFalse(fulltext._broken_signs("Þingvellir 2019; mean 0·12 ± 0·03"))
        self.assertFalse(fulltext._broken_signs(PAPER))

    def test_a_cached_broken_pdf_text_is_refused(self):
        url = "https://www.cambridge.org/x.pdf"
        (Path(self.tmp.name) / f"pdf_{hashlib.sha256(url.encode()).hexdigest()[:24]}.txt").write_text(self.BROKEN)
        self.assertIsNone(fulltext.fetch_pdf_text(url))

    def test_a_cached_clean_pdf_text_is_kept(self):
        url = "https://link.springer.com/y.pdf"
        (Path(self.tmp.name) / f"pdf_{hashlib.sha256(url.encode()).hexdigest()[:24]}.txt").write_text(PAPER)
        self.assertEqual(fulltext.fetch_pdf_text(url), PAPER)

    def test_a_fresh_pdf_with_the_broken_font_is_refused(self):
        page = SimpleNamespace(extract_text=lambda: PAPER,
                               get=lambda k: {"/Font": {"/F1": SimpleNamespace(
                                   get_object=lambda: {"/BaseFont": "/IKAPPK+AdvP4C4E51"})}})
        with patch.object(fulltext, "PdfReader", lambda _b: SimpleNamespace(pages=[page])):
            self.assertIsNone(fulltext._pdf_bytes_text(b"%PDF"))

    def test_a_fresh_clean_pdf_is_kept(self):
        page = SimpleNamespace(extract_text=lambda: PAPER,
                               get=lambda k: {"/Font": {"/F1": SimpleNamespace(
                                   get_object=lambda: {"/BaseFont": "/ABCDEF+TimesNewRoman"})}})
        with patch.object(fulltext, "PdfReader", lambda _b: SimpleNamespace(pages=[page])):
            self.assertEqual(fulltext._pdf_bytes_text(b"%PDF"), PAPER.strip())


class KeyedSourcesWidenTheFilter(unittest.TestCase):
    """MEASURED 2026-11-03: 29 readable creatine RCTs had no listed free copy and
    were dropped by --full-text-only before Semantic Scholar or CORE was tried."""
    def test_a_doi_is_enough_only_when_a_keyed_source_is_configured(self):
        from bsproof.run import corpus
        recs = [{"oa": "abstract_only", "year": 2020, "doi": "10.1/a"},
                {"oa": "abstract_only", "year": 2020}]
        with patch("sources.http.secret", lambda name: ""):
            self.assertEqual(corpus._prioritize_primaries(recs, full_text_only=True), [])
        with patch("sources.http.secret", lambda name: "k" if name == "S2_API_KEY" else ""):
            kept = corpus._prioritize_primaries(recs, full_text_only=True)
        self.assertEqual([r.get("doi") for r in kept], ["10.1/a"])


class InterventionQuery(unittest.TestCase):
    """MEASURED 2026-11-03: requiring "oral"/"supplementation" hid 66 of 119
    glucosamine RCTs. The intervention scope keeps only the drug-context exclusions."""
    def test_no_supplement_wording_required(self):
        from sources import europepmc as ep
        q = ep._query("glucosamine", scope="intervention")
        self.assertNotIn(ep.SUPPLEMENT_CONTEXT, q)
        self.assertIn('TITLE:"glucosamine"', q)
        self.assertIn("NOT (eclampsia", q)
