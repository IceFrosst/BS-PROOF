"""Tests never see real API keys: the machine's `.env.pipeline` and key
environment variables are hidden, so no test can reach a keyed service.
A test that needs a key patches `sources.fulltext.secret` itself."""
import os
from pathlib import Path

import pytest


@pytest.fixture(autouse=True)
def _no_real_api_keys(monkeypatch):
    from sources import http
    monkeypatch.setattr(http, "ENV_FILE", Path(os.devnull + ".missing"))
    for name in ("ELSEVIER_API_KEY", "CORE_API_KEY"):
        monkeypatch.delenv(name, raising=False)
