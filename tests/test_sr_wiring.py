"""Pin the production SR-inheritance wiring in run_pipeline.py.

WHY AST AND NOT AN IMPORT. run_pipeline needs httpx and a signed-in backend,
neither of which a bare test interpreter has (the repo hooks block bare-python
runs of it for exactly that reason). The defect this file pins was structural,
so a structural check catches it: the production branch set `call_fn = None`
and the SR block gated on `call_fn is not None`, which silently skipped SR
inheritance on the one production backend while the report still carried an
`-sr` mode label. Measured 2026-08-25: two full `--with-sr` production runs
reported `requested: 0, s2_ok: 0, resolved: 0` and neither artifact could be
retained.
"""
import ast
import unittest
from pathlib import Path

SOURCE = Path(__file__).resolve().parents[1] / "run_pipeline.py"


class SRWiring(unittest.TestCase):
    def setUp(self):
        self.tree = ast.parse(SOURCE.read_text(encoding="utf-8"))

    def test_call_fn_is_never_assigned_none(self):
        """`call_fn = None` at module/main scope is the exact defect shape.

        The initial declaration before backend selection is allowed to be
        None; every BACKEND branch must assign a real callable. We therefore
        allow at most ONE None assignment (the declaration) and require that
        at least three non-None assignments exist (grok, pilot, production).
        """
        none_assigns, real_assigns = 0, 0
        for node in ast.walk(self.tree):
            if not isinstance(node, ast.Assign):
                continue
            targets = [t.id for t in node.targets if isinstance(t, ast.Name)]
            if "call_fn" not in targets:
                continue
            if isinstance(node.value, ast.Constant) and node.value.value is None:
                none_assigns += 1
            else:
                real_assigns += 1
        self.assertLessEqual(
            none_assigns, 1,
            "a backend branch assigns call_fn = None again; the SR gate "
            "(`with_sr and call_fn is not None`) makes that branch silently "
            "skip SR inheritance while the report still says -sr")
        self.assertGreaterEqual(
            real_assigns, 3,
            "expected grok, pilot AND production to each inject a callable")

    def test_production_branch_injects_the_claude_adapter(self):
        """The production branch must set call_fn to the claude adapter's call."""
        found = any(
            isinstance(node, ast.Assign)
            and any(isinstance(t, ast.Name) and t.id == "call_fn"
                    for t in node.targets)
            and isinstance(node.value, ast.Attribute)
            and node.value.attr == "call"
            and isinstance(node.value.value, ast.Name)
            and node.value.value.id == "ca"
            for node in ast.walk(self.tree))
        self.assertTrue(
            found,
            "production must assign call_fn = ca.call explicitly; relying on "
            "the workers default leaves the SR gate dead on the production path")

    def test_sr_block_still_gates_on_the_injected_call(self):
        """The SR block must gate on with_sr AND a usable call_fn.

        Dropping the call_fn condition would let a wiring run reach the model
        boundary; dropping with_sr would run SR on every extraction. Both
        conditions are load-bearing.
        """
        src = SOURCE.read_text(encoding="utf-8")
        self.assertIn("if with_sr and call_fn is not None:", src)


if __name__ == "__main__":
    unittest.main()
