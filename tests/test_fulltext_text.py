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


if __name__ == "__main__":
    unittest.main()
