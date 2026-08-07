# Predatory list chunks

**Status 2026-08-07:** b64 chunks were corrupted during a bad push (only truncated 00/01 remain).

Until restored, put the full list at:

    vocab/predatory_journals.txt

(>10k bytes, one journal title per line, ~2778 titles). Or copy the founder xlsx into `vocab/` and run:

    python -m pipeline.predatory_data

Do not trust `00.b64` / `01.b64` until they are re-expanded from the founder source.
