# Reports — all test runs on GitHub

```text
reports/
  INDEX.md          # table of every committed run
  latest.md         # copy of the newest run (convenient link)
  runs/             # ONE FILE PER RUN (never overwrite history)
    20260806_201500_creatine_creatine-monohydrate_wiring.md
    …
```

## Browse

- **History:** [`INDEX.md`](./INDEX.md)
- **Newest:** [`latest.md`](./latest.md)
- **All files:** [`runs/`](./runs/)

## Regenerate + archive a run

```bash
cd ~/BS-PROOF && git pull
python3 scripts/write_demo_report.py --wiring --ingredient creatine --form creatine_monohydrate

git add reports/
git commit -m "Report: creatine monohydrate wiring audit"
git push
```

Each invocation **appends** a new file under `runs/` and refreshes `INDEX.md` + `latest.md`.

## What each report contains

Product input, corpus counts, study tables with PubMed/DOI/NCT links, ECU scores,
component breakdown (d/c/H/E), per-study weights, selftest status, pilot DB summary if present.

## Demo caps (wiring path in this build)

| Stage | Cap |
|-------|----:|
| Retrieve primaries | 150 |
| Retrieve syntheses | 50 |
| Scored in wiring report | ≤ 40 RCT-rank primaries |

Retrieval is by **ingredient** (e.g. `creatine`). Form (`creatine_monohydrate`) affects transfer matching at score time, not how many papers are fetched.
