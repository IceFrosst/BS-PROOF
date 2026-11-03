"""Elsevier and CORE full-text rungs (sources/fulltext.fetch_elsevier_text,
fetch_core_text) and the
pipeline-secret loader (sources/http.secret). No network: httpx.get is mocked.
MEASURED 2026-11-03: 30 of 64 unreadable vitamin C studies are Elsevier's."""
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from sources import fulltext, http

BODY = ("Participants were randomised to 500 mg vitamin C or placebo. " * 30)
XML = f"""<full-text-retrieval-response xmlns:ce="http://www.elsevier.com/xml/common/dtd">
<originalText><ce:sections>
<ce:section><ce:section-title>2. Materials and methods</ce:section-title><ce:para>{BODY}</ce:para></ce:section>
<ce:section><ce:section-title>3. Results</ce:section-title><ce:para>CRP fell by 0.2 mg/L.</ce:para></ce:section>
<ce:section><ce:section-title>Acknowledgements</ce:section-title><ce:para>Thanks.</ce:para></ce:section>
</ce:sections></originalText></full-text-retrieval-response>"""
ABSTRACT_ONLY = """<full-text-retrieval-response><coredata><dc:description xmlns:dc="x">An abstract.</dc:description></coredata></full-text-retrieval-response>"""
REC = {"doi": "10.1016/j.nut.2022.111848", "publisher": "Elsevier BV"}


class Secret(unittest.TestCase):
    def test_env_wins_then_file_then_empty(self):
        with tempfile.TemporaryDirectory() as d:
            f = Path(d) / ".env.pipeline"
            f.write_text("# comment\nELSEVIER_API_KEY=fromfile\n#OTHER=x\n")
            with patch.object(http, "ENV_FILE", f), patch.dict("os.environ", {}, clear=True):
                self.assertEqual(http.secret("ELSEVIER_API_KEY"), "fromfile")
                self.assertEqual(http.secret("OTHER"), "")
            with patch.object(http, "ENV_FILE", f), patch.dict("os.environ", {"ELSEVIER_API_KEY": "fromenv"}):
                self.assertEqual(http.secret("ELSEVIER_API_KEY"), "fromenv")
            with patch.object(http, "ENV_FILE", Path(d) / "missing"), patch.dict("os.environ", {}, clear=True):
                self.assertEqual(http.secret("ELSEVIER_API_KEY"), "")


class ElsevierRung(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.patches = [patch.object(fulltext, "CACHE_DIR", Path(self.tmp.name)),
                        patch.object(fulltext, "throttle", lambda url: None),
                        patch.object(fulltext, "secret", lambda name: "test-key"),
                        patch.object(fulltext, "_ELSEVIER_BLOCKED", [])]
        for p in self.patches:
            p.start()

    def tearDown(self):
        for p in self.patches:
            p.stop()
        self.tmp.cleanup()

    def _get(self, status, text):
        return patch("httpx.get", return_value=SimpleNamespace(status_code=status, text=text))

    def test_methods_and_results_are_read_and_the_key_is_a_header(self):
        with self._get(200, XML) as get:
            text = fulltext.fetch_elsevier_text(REC)
        self.assertIn("randomised to 500 mg", text)
        self.assertIn("CRP fell", text)
        self.assertNotIn("Thanks", text)
        self.assertEqual(get.call_args.kwargs["headers"]["X-ELS-APIKey"], "test-key")
        self.assertNotIn("test-key", get.call_args.args[0])        # never in the URL (or cache name)

    def test_an_abstract_only_response_is_not_full_text(self):
        with self._get(200, ABSTRACT_ONLY):
            self.assertIsNone(fulltext.fetch_elsevier_text(REC))

    def test_a_key_not_enabled_is_said_once_then_not_asked_again(self):
        err = '{"service-error":{"status":{"statusCode":"AUTHENTICATION_ERROR"}}}'
        with self._get(403, err) as get:
            self.assertIsNone(fulltext.fetch_elsevier_text(REC))
            self.assertIsNone(fulltext.fetch_elsevier_text({**REC, "doi": "10.1016/x.2"}))
        self.assertEqual(get.call_count, 1)

    def test_not_elsevier_or_no_key_makes_no_call(self):
        with self._get(200, XML) as get:
            self.assertIsNone(fulltext.fetch_elsevier_text({"doi": "10.3390/nu1", "publisher": "MDPI"}))
            with patch.object(fulltext, "secret", lambda name: ""):
                self.assertIsNone(fulltext.fetch_elsevier_text(REC))
        get.assert_not_called()

    def test_best_text_uses_it_last(self):
        with patch.object(fulltext, "fetch_xml", return_value=None), self._get(200, XML):
            text, tier = fulltext.best_text(REC)
        self.assertEqual(tier, "full_text")
        self.assertIn("randomised to 500 mg", text)


if __name__ == "__main__":
    unittest.main()


class CoreRung(unittest.TestCase):
    """CORE (sources/fulltext.fetch_core_text). MEASURED 2026-11-03: 8 of 64."""
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.patches = [patch.object(fulltext, "CACHE_DIR", Path(self.tmp.name)),
                        patch.object(fulltext, "_core_wait", lambda: None),
                        patch.object(fulltext, "secret", lambda name: "core-key" if name == "CORE_API_KEY" else "")]
        for p in self.patches:
            p.start()

    def tearDown(self):
        for p in self.patches:
            p.stop()
        self.tmp.cleanup()

    def _get(self, results, status=200):
        return patch("httpx.get", return_value=SimpleNamespace(
            status_code=status, json=lambda: {"results": results}))

    def test_exact_doi_full_text_is_used_and_cached(self):
        with self._get([{"doi": "10.1/OTHER", "fullText": "x" * 5000},
                        {"doi": "10.1/A", "fullText": BODY}]) as get:
            self.assertEqual(fulltext.fetch_core_text({"doi": "10.1/a"}), BODY.strip())
            self.assertEqual(fulltext.fetch_core_text({"doi": "10.1/a"}), BODY.strip())   # cache
        self.assertEqual(get.call_count, 1)
        self.assertEqual(get.call_args.kwargs["headers"]["Authorization"], "Bearer core-key")

    def test_a_different_doi_is_never_used(self):
        with self._get([{"doi": "10.1/b", "fullText": BODY}]):
            self.assertIsNone(fulltext.fetch_core_text({"doi": "10.1/a"}))

    def test_broken_sign_text_is_refused(self):
        with self._get([{"doi": "10.1/a", "fullText": BODY + " increased (þ0·12 mmol/l)"}]):
            self.assertIsNone(fulltext.fetch_core_text({"doi": "10.1/a"}))

    def test_rate_limited_then_answers(self):
        responses = [SimpleNamespace(status_code=429, json=lambda: {}),
                     SimpleNamespace(status_code=200, json=lambda: {"results": [{"doi": "10.1/a", "fullText": BODY}]})]
        with patch("httpx.get", side_effect=responses), patch("time.sleep"):
            self.assertEqual(fulltext.fetch_core_text({"doi": "10.1/a"}), BODY.strip())

    def test_no_key_or_no_doi_makes_no_call(self):
        with self._get([]) as get:
            self.assertIsNone(fulltext.fetch_core_text({"title": "no doi"}))
            with patch.object(fulltext, "secret", lambda name: ""):
                self.assertIsNone(fulltext.fetch_core_text({"doi": "10.1/a"}))
        get.assert_not_called()
