"""Zero-model regression test for the deterministic layer. python -m pipeline.selftest

One package, run in a fixed order. Each group module holds the sections that
used to sit in a single 2,980-line main(); a few fixtures are handed from one
group to the next explicitly (the returned dicts below), never through globals.
"""
from pipeline.selftest import core, dose_arcs, extraction, misc, sources


def main():
    fails = []
    def check(name, cond, detail=""):
        print(f"  {'PASS' if cond else 'FAIL'}  {name}  {detail}")
        if not cond: fails.append(name)

    shared = core.run(check)
    shared |= sources.run(check, _sc=shared["_sc"])
    dose_arcs.run(check, product=shared["product"], _score=shared["_score"])
    shared |= extraction.run(check)
    misc.run(check, _b2=shared["_b2"], _ext=shared["_ext"], _pr=shared["_pr"])

    print(f"\n{'ALL PASSED' if not fails else 'FAILURES: ' + ', '.join(fails)}\n")
    return 1 if fails else 0
