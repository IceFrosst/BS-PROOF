"""Zero-model regression test for the deterministic layer. python -m pipeline.selftest

One package, run in a fixed order; each group module is independent.
"""
from pipeline.selftest import core, extraction, misc, sources


def main():
    fails = []
    def check(name, cond, detail=""):
        print(f"  {'PASS' if cond else 'FAIL'}  {name}  {detail}")
        if not cond: fails.append(name)

    for group in (core, sources, extraction, misc):
        group.run(check)

    print(f"\n{'ALL PASSED' if not fails else 'FAILURES: ' + ', '.join(fails)}\n")
    return 1 if fails else 0
