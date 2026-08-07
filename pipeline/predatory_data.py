"""Expand embedded Predatory Journals List 2025."""
from __future__ import annotations
import base64, gzip
from pathlib import Path

_DIR = Path(__file__).resolve().parent / "predatory_b64"

def materialize(dest: Path | None = None) -> Path:
    root = Path(__file__).resolve().parents[1]
    dest = dest or (root / "vocab" / "predatory_journals.txt")
    if dest.exists() and dest.stat().st_size > 10000:
        return dest
    parts = sorted(_DIR.glob("*.b64"))
    if not parts:
        raise FileNotFoundError(f"no b64 parts in {_DIR}")
    b64 = "".join(p.read_text(encoding="utf-8").strip() for p in parts)
    data = gzip.decompress(base64.b64decode(b64))
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(data)
    return dest

if __name__ == "__main__":
    p = materialize()
    print("wrote", p, p.stat().st_size)
