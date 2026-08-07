"""Expand embedded Predatory Journals List 2025.

After `git pull` the b64 chunks under predatory_b64/ are expanded on first use.
If chunks are incomplete/missing, falls back to vocab/The Predatory Journals List 2025.xlsx
(or any *predatory*.xlsx) via the import script logic.
"""
from __future__ import annotations
import base64, gzip, re
from pathlib import Path

_DIR = Path(__file__).resolve().parent / "predatory_b64"

def materialize(dest: Path | None = None) -> Path:
    root = Path(__file__).resolve().parents[1]
    dest = dest or (root / "vocab" / "predatory_journals.txt")
    if dest.exists() and dest.stat().st_size > 10000:
        return dest

    # 1) preferred: compressed chunks committed in-repo
    parts = sorted(_DIR.glob("*.b64"))
    if parts:
        try:
            b64 = "".join(p.read_text(encoding="utf-8").strip() for p in parts)
            data = gzip.decompress(base64.b64decode(b64))
            if len(data) > 10000:
                dest.parent.mkdir(parents=True, exist_ok=True)
                dest.write_bytes(data)
                return dest
        except Exception as e:
            print(f"  predatory_data: b64 expand failed ({e}); trying xlsx fallback")

    # 2) fallback: founder xlsx already in vocab/
    vocab = root / "vocab"
    for xlsx in sorted(vocab.glob("*redatory*.xlsx")) + sorted(vocab.glob("*Predatory*.xlsx")):
        try:
            from scripts.import_predatory_xlsx import convert
            convert(xlsx, dest)
            if dest.exists() and dest.stat().st_size > 10000:
                print(f"  predatory_data: expanded from {xlsx.name}")
                return dest
        except Exception as e:
            print(f"  predatory_data: xlsx fallback failed ({e})")

    raise FileNotFoundError(
        f"no usable predatory list. Put the founder xlsx in vocab/ or restore pipeline/predatory_b64/*.b64"
    )

if __name__ == "__main__":
    p = materialize()
    print("wrote", p, p.stat().st_size)
