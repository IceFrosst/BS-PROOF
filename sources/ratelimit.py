"""Per-domain token bucket. The bottleneck is fetch, not tokens (Amdahl)."""
import time, threading
from urllib.parse import urlparse

# requests per second, per domain. v1 = UNAUTHENTICATED settings.
# Add an NCBI API key later and raise eutils to 9.0 -- 3x for one env var.
LIMITS = {"eutils.ncbi.nlm.nih.gov": 2.5, "www.ebi.ac.uk": 5.0,
          "clinicaltrials.gov": 5.0, "api.epistemonikos.org": 1.0,
          "api.openalex.org": 5.0, "api.unpaywall.org": 5.0,
          "api.crossref.org": 5.0, "_default": 2.0}

class Bucket:
    def __init__(self, rate):
        self.rate, self.tokens = rate, rate
        self.ts, self.lock = time.monotonic(), threading.Lock()
    def take(self):
        with self.lock:
            now = time.monotonic()
            self.tokens = min(self.rate, self.tokens + (now - self.ts) * self.rate)
            self.ts = now
            if self.tokens < 1:
                wait = (1 - self.tokens) / self.rate
                time.sleep(wait); self.tokens = 0; self.ts = time.monotonic()
            else:
                self.tokens -= 1

_buckets, _lock = {}, threading.Lock()

def throttle(url: str):
    host = urlparse(url).netloc
    rate = LIMITS.get(host, LIMITS["_default"])
    with _lock:
        b = _buckets.setdefault(host, Bucket(rate))
    b.take()
