# Reports — viewable test / demo results

This folder is for **human-readable results** committed to GitHub so you can open
them in the browser without digging through a terminal scrollback.

| File | What it is |
|------|------------|
| [`latest.md`](./latest.md) | Most recent local demo / selftest summary (regenerate with the script below) |
| CI artifacts | Every push also runs `pipeline.selftest`; open the **Actions** tab → latest **selftest** run → Artifacts |

## Regenerate after a local run

```bash
cd ~/BS-PROOF
source .venv/bin/activate   # if you use it
python3 scripts/write_demo_report.py
# optional: also exercise synthetic end-to-end scores
python3 scripts/write_demo_report.py --wiring
git add reports/latest.md
git commit -m "Refresh demo report"
git push
```

Then open:

https://github.com/IceFrosst/BS-PROOF/blob/main/reports/latest.md

## What belongs here vs what does not

| OK to commit | Do not commit |
|--------------|----------------|
| Selftest PASS/FAIL summary | API keys, tokens |
| `--wiring` SYNTHETIC score tables | Secrets / `.env` |
| High-level pilot notes already in `CLAUDE.md` | Raw pilot rows meant as public brand claims |
| Coverage headline numbers | Full paper PDFs |

**Pilot extractions** (`--pilot`) are real model output but **not production**.
If you commit a pilot table, keep the `PILOT` label and never treat it as a
public score. Prefer summarizing in `latest.md` rather than dumping full JSON.

## Related

- Live terminal table: `python3 run_pipeline.py … --wiring` or `--pilot`
- DB on disk: `out/*.sqlite` (usually gitignored)
- Design / handoff: root `CLAUDE.md`
