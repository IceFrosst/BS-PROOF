"""Expand embedded Predatory Journals List 2025.

After `git pull` the b64 chunks under predatory_b64/ are expanded on first use.
If chunks are incomplete/missing, falls back to vocab/*Predatory*.xlsx
(copy the founder xlsx once into vocab/ — after that every machine works).
"""
from __future__ import annotations
import base64, gzip, re, subprocess, sys
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
    xlsx_candidates = list(vocab.glob("*redatory*.xlsx")) + list(vocab.glob("*Predatory*.xlsx"))
    if xlsx_candidates:
        xlsx = xlsx_candidates[0]
        script = root / "scripts" / "import_predatory_xlsx.py"
        # temporarily point the script at the found xlsx
        try:
            import openpyxl
            wb = openpyxl.load_workbook(xlsx, read_only=True, data_only=True)
            ws = wb.active
            names: list[str] = []
            seen: set[str] = set()
            for row in ws.iter_rows(values_only=True):
                vals = [v for v in row if v is not None and str(v).strip()]
                if not vals:
                    continue
                if len(vals) >= 2 and str(vals[0]).strip().replace(".", "", 1).isdigit():
                    text = str(vals[1]).strip()
                else:
                    text = max((str(v).strip() for v in vals), key=len)
                if len(text) < 2 or re.fullmatch(r"\d+(\.\d+)?", text):
                    continue
                k = text.lower()
                if k in seen:
                    continue
                seen.add(k)
                names.append(text)
            header = (
                "# The Predatory Journals List 2025 (founder-supplied)\n"
                "# Policy: FLAG + COUNT only — does not change score yet.\n"
                f"# Entries: {len(names)}\n#\n"
            )
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_text(header + "\n".join(names) + "\n", encoding="utf-8")
            print(f"  predatory_data: expanded from {xlsx.name} ({len(names)} titles)")
            return dest
        except Exception as e:
            print(f"  predatory_data: xlsx fallback failed ({e})")

    raise FileNotFoundError(
        "no usable predatory list. "
        "Either restore pipeline/predatory_b64/*.b64 or copy the founder xlsx into vocab/"
    )

if __name__ == "__main__":
    p = materialize()
    print("wrote", p, p.stat().st_size)
