# BS-PROOF demo report

Generated: **placeholder — run the script on your machine to refresh**

```bash
cd ~/BS-PROOF && git pull
python3 scripts/write_demo_report.py --wiring
git add reports/latest.md && git commit -m "Refresh demo report" && git push
```

Then reload this page on GitHub.

---

## What you will see after refresh

1. **Deterministic selftest** — PASS/FAIL for scoring, dedup, vocab, assembly (no AI).
2. **Wiring demo table** (if you used `--wiring`) — **SYNTHETIC** scores that only prove the pipes work.
3. **Pilot DB summary** (if `out/pilot*.sqlite` exists on that machine) — real model rows, labelled **not for public claims**.

## Notes from first pilot runs (see also `CLAUDE.md`)

These are qualitative notes already recorded in the project handoff, not a full scoreboard dump:

- Model layer **proven** via pilot path (S7/S8 behaved correctly on sample text).
- Early end-to-end pilot yields were **sparse** (often few scorable ECU rows) because many retrieved papers were hospital/IV magnesium, not consumer supplements — addressed with optional `scope=supplement`.
- Three silent failures (dropped abstracts, empty-text extractions, SR author+year resolution) were found on first real runs and fixed.
- Full-corpus methods coverage measured **77.5%** (below 80% target); Unpaywall added **0.0 pp** over OpenAlex.

For the live terminal scoreboard format, run:

```bash
python3 run_pipeline.py magnesium --form magnesium_glycinate --wiring
```

---

## How to read labels

| Label | Meaning |
|-------|--------|
| Selftest PASS | Math layer green |
| SYNTHETIC | Fake extractions — plumbing only |
| PILOT | Subscription model output — not production |
| gated | Not enough evidence for a number |
