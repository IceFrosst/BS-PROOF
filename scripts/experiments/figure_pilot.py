#!/usr/bin/env python3
"""
Figure pilot (founder 2026-10-26): how accurately can a model read trial results
from a figure? Every case is a figure panel whose values the SAME paper also
prints in a table or the text (scripts/experiments/figure_pilot_cases.json), so
the printed number is the truth. Two readers on two models (S5F tier B, S5FR
tier R, prompts/s5_figure.md) read each panel blind; this script scores them.
Nothing here enters a grade.

    .venv/bin/python scripts/experiments/figure_pilot.py fetch   # images -> out/figure_pilot/
    .venv/bin/python scripts/experiments/figure_pilot.py read    # 2 model calls per case; run solo
    .venv/bin/python scripts/experiments/figure_pilot.py score   # offline

Images come from PMC's article instance (the size PMC serves, often ~750 px
wide; the pilot measures accuracy at that resolution).
"""
from __future__ import annotations

import json
import statistics
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CASES = Path(__file__).with_name("figure_pilot_cases.json")
OUT = ROOT / "out" / "figure_pilot"
READERS = ("S5F", "S5FR")


def _cases() -> list[dict]:
    return json.loads(CASES.read_text(encoding="utf-8"))["cases"]


def _image(case: dict) -> Path:
    return OUT / "images" / f"{case['pmcid']}_{case['image']}"


def fetch() -> int:
    (OUT / "images").mkdir(parents=True, exist_ok=True)
    bad = 0
    for case in _cases():
        path = _image(case)
        if path.exists():
            continue
        url = f"https://pmc.ncbi.nlm.nih.gov/articles/instance/{case['pmcid'][3:]}/bin/{case['image']}"
        r = subprocess.run(["curl", "-s", "-L", "-A", "Mozilla/5.0 (research; bs-proof)",
                            "-o", str(path), "-w", "%{http_code}", url], capture_output=True, text=True)
        ok = r.stdout == "200" and path.read_bytes()[:3] == b"\xff\xd8\xff"
        bad += not ok
        print(f"{'ok ' if ok else 'BAD'} {case['id']:18} {url}")
    return 1 if bad else 0


def read() -> int:
    sys.path.insert(0, str(ROOT))
    from bsproof import claude_adapter as ca
    jobs = [(case, agent) for case in _cases() for agent in READERS]

    def one(job):
        case, agent = job
        payload = {k: case[k] for k in ("caption", "panel", "arms", "timepoints", "read")}
        result, meta = ca.call(agent, payload, timeout=300, retries=1,
                               images=[("image/jpeg", _image(case).read_bytes())])
        print(f"  {agent:5} {case['id']:18} {'ok' if result else 'FAILED ' + str((meta or {}).get('error'))}")
        return case["id"], agent, result, {k: (meta or {}).get(k) for k in ("model", "cached", "error")}
    with ThreadPoolExecutor(max_workers=2) as pool:
        rows = list(pool.map(one, jobs))
    readings: dict = {}
    for cid, agent, result, meta in rows:
        readings.setdefault(cid, {})[agent] = {"result": result, "meta": meta}
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "readings.json").write_text(json.dumps(readings, indent=1), encoding="utf-8")
    failed = sum(r["result"] is None for c in readings.values() for r in c.values())
    print(f"wrote {OUT / 'readings.json'} ({len(rows) - failed}/{len(rows)} readings)")
    return 1 if failed else 0


def _values(result: dict | None) -> dict:
    """{(arm, timepoint): value row} from one reading."""
    return {(v["arm"], v["timepoint"]): v for v in (result or {}).get("readings") or []}


def _read_quantity(case: dict, result: dict | None) -> dict:
    """{(arm, key): (mean, sd)} as the case is scored: a plotted value, a change
    from two read means, or the mean / SD of read points (computed HERE, never
    by the model)."""
    vals, out = _values(result), {}
    err = (result or {}).get("error_bar")
    for arm in case["arms"]:
        if case["quantity"] == "change from two reads":
            pre, post = (vals.get((arm, t), {}).get("mean") for t in case["timepoints"])
            out[(arm, "change")] = (post - pre if pre is not None and post is not None else None, None)
            continue
        for tp in case["timepoints"]:
            v = vals.get((arm, tp)) or {}
            if case["read"] == "points":
                pts = v.get("points") or []
                out[(arm, tp)] = (statistics.fmean(pts) if pts else None,
                                  statistics.stdev(pts) if len(pts) > 1 else None)
            else:
                top, mean = v.get("error_bar_top"), v.get("mean")
                sd = top - mean if err == "sd" and top is not None and mean is not None else None
                key = "change" if case["quantity"] in ("mean change", "mean % change") and tp == "change" else tp
                out[(arm, key)] = (mean, sd)
    return out


def _truth(case: dict) -> dict:
    return {(arm, tp): (t.get("mean"), t.get("sd")) for arm, tps in case["truth"].items() for tp, t in tps.items()}


def score() -> int:
    readings = json.loads((OUT / "readings.json").read_text(encoding="utf-8"))
    rows, agree, smd_err, sd_err = [], [], [], []
    for case in _cases():
        truth = _truth(case)
        reads = {a: (readings.get(case["id"], {}).get(a) or {}).get("result") for a in READERS}
        q = {a: _read_quantity(case, r) for a, r in reads.items()}
        rng = [r["y_axis_max"] - r["y_axis_min"] for r in reads.values()
               if r and r.get("y_axis_max") is not None and r.get("y_axis_min") is not None]
        span = statistics.median(rng) if rng else None
        for key, (t_mean, t_sd) in truth.items():
            for a in READERS:
                m, sd = q[a].get(key, (None, None))
                rows.append({"case": case["id"], "reader": a, "key": key, "truth": t_mean, "read": m,
                             "abs_err": None if m is None or t_mean is None else abs(m - t_mean),
                             "pct_axis": None if m is None or t_mean is None or not span else 100 * abs(m - t_mean) / span,
                             "sd_units": None if m is None or t_mean is None or not t_sd else abs(m - t_mean) / t_sd,
                             "note": case.get("note")})
                if sd is not None and t_sd:
                    sd_err.append((case["id"], a, key, t_sd, sd))
            m1, m2 = (q[a].get(key, (None, None))[0] for a in READERS)
            if m1 is not None and m2 is not None and span:
                agree.append((case["id"], key, 100 * abs(m1 - m2) / span))
        # the error a reading puts into a between-arm SMD: (read diff - true diff) / pooled true SD
        i_arm, c_arm = case["contrast"]
        for tpkey in {k[1] for k in truth}:
            ti, tc = truth.get((i_arm, tpkey)), truth.get((c_arm, tpkey))
            if not ti or not tc or not ti[1] or not tc[1]:
                continue
            pooled = ((ti[1] ** 2 + tc[1] ** 2) / 2) ** 0.5
            for a in READERS:
                ri, rc = q[a].get((i_arm, tpkey), (None,))[0], q[a].get((c_arm, tpkey), (None,))[0]
                if ri is not None and rc is not None:
                    smd_err.append((case["id"], a, tpkey, ((ri - rc) - (ti[0] - tc[0])) / pooled))

    def summary(xs):
        xs = sorted(x for x in xs if x is not None)
        if not xs:
            return "none"
        return (f"n={len(xs)}  median {statistics.median(xs):.2f}  "
                f"90th {xs[min(len(xs) - 1, int(0.9 * len(xs)))]:.2f}  max {xs[-1]:.2f}")

    print("PER VALUE (reader vs the printed number)")
    for r in rows:
        flag = "" if r["read"] is not None else "  NULL"
        print(f"  {r['case']:18} {r['reader']:5} {str(r['key']):40} truth {r['truth']!s:>8} read {r['read'] if r['read'] is None else round(r['read'], 2)!s:>8}"
              f"  |err| {'' if r['abs_err'] is None else round(r['abs_err'], 2)!s:>6}  %axis {'' if r['pct_axis'] is None else round(r['pct_axis'], 1)!s:>5}{flag}")
    for a in READERS:
        mine = [r for r in rows if r["reader"] == a]
        print(f"\n{a}: values read {sum(r['read'] is not None for r in mine)}/{len(mine)}")
        print(f"  error, % of the y-axis range : {summary(r['pct_axis'] for r in mine)}")
        print(f"  error, in SD units           : {summary(r['sd_units'] for r in mine)}")
        print(f"  error in a between-arm SMD   : {summary(abs(e) for c, ra, k, e in smd_err if ra == a)}")
    print(f"\nREADERS AGREE (|S5F - S5FR|, % of axis): {summary(x for _, _, x in agree)}")
    for tol in (1, 2, 3, 5):
        print(f"  within {tol} % of the axis: {sum(x <= tol for _, _, x in agree)}/{len(agree)}")
    if sd_err:
        print("\nSD FROM ERROR BARS (truth vs read)")
        for cid, a, key, t, s in sd_err:
            print(f"  {cid:18} {a:5} {str(key):40} truth {t:.2f} read {s:.2f}")
    return 0


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    sys.exit({"fetch": fetch, "read": read, "score": score}.get(cmd, lambda: print(__doc__) or 2)())
