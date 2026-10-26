"""The figure pilot's image path through the one model boundary
(bsproof/claude_adapter.call, images=): still one shot with no tools, the image
is sent as a stream-json content block, and its hash is in the cache key."""
import json
import sqlite3
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from bsproof import claude_adapter


class ImageCall(unittest.TestCase):
    def setUp(self):
        self.original = claude_adapter._CONN
        claude_adapter._CONN = sqlite3.connect(":memory:", check_same_thread=False)
        claude_adapter._CONN.execute("CREATE TABLE c (k TEXT PRIMARY KEY, v TEXT, cost REAL)")

    def tearDown(self):
        claude_adapter._CONN.close()
        claude_adapter._CONN = self.original

    def test_image_rides_in_one_stream_json_message_and_in_the_key(self):
        answer = {"panel_found": False, "y_axis_label": None, "y_axis_min": None, "y_axis_max": None,
                  "error_bar": None, "readings": [], "evidence": "x"}
        stdout = "\n".join(json.dumps(e) for e in (
            {"type": "result", "subtype": "success", "is_error": False, "structured_output": answer,
             "total_cost_usd": 0.01, "usage": {"input_tokens": 1, "output_tokens": 1}},))
        proc = SimpleNamespace(returncode=0, stdout=stdout, stderr="")
        payload = {"caption": "c", "panel": "p", "arms": ["A"], "timepoints": ["t"], "read": "means"}
        with patch.object(claude_adapter.subprocess, "run", return_value=proc) as run, \
                patch.object(claude_adapter, "_save_failure", return_value=None):
            claude_adapter.call("S5F", payload, retries=0, images=[("image/jpeg", b"\xff\xd8\xffpixels")])
            claude_adapter.call("S5F", payload, retries=0, images=[("image/jpeg", b"\xff\xd8\xffother")])
        self.assertEqual(run.call_count, 2)                     # a different image is a different key
        cmd, kwargs = run.call_args_list[0].args[0], run.call_args_list[0].kwargs
        self.assertIn("--input-format", cmd)
        self.assertEqual(cmd[cmd.index("--tools") + 1], "")
        self.assertEqual(cmd[cmd.index("--max-turns") + 1], "1")
        message = json.loads(kwargs["input"])
        kinds = [b["type"] for b in message["message"]["content"]]
        self.assertEqual(kinds, ["text", "image"])
        self.assertIn("image_sha256", json.loads(message["message"]["content"][0]["text"]))


if __name__ == "__main__":
    unittest.main()
