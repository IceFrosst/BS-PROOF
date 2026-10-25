"""Per-agent prompt versions (founder 2026-10-25): a bump re-runs only that agent."""
import unittest

from bsproof import claude_adapter as ca


class AgentPromptVersion(unittest.TestCase):
    def test_every_override_names_a_real_agent(self):
        self.assertTrue(set(ca.AGENT_PROMPT_VERSION) <= set(ca.AGENTS))

    def test_unbumped_agents_keep_the_release_version_and_their_cache_keys(self):
        for agent in set(ca.AGENTS) - set(ca.AGENT_PROMPT_VERSION):
            self.assertEqual(ca.prompt_version(agent), ca.PROMPT_VERSION)

    def test_a_bump_changes_only_that_agents_key(self):
        before = {a: ca._key(a, "m", "{}", "high") for a in ca.AGENTS}
        saved = dict(ca.AGENT_PROMPT_VERSION)
        try:
            ca.AGENT_PROMPT_VERSION["S8"] = "v-test"
            after = {a: ca._key(a, "m", "{}", "high") for a in ca.AGENTS}
        finally:
            ca.AGENT_PROMPT_VERSION.clear(); ca.AGENT_PROMPT_VERSION.update(saved)
        self.assertEqual({a for a in ca.AGENTS if before[a] != after[a]}, {"S8"})


if __name__ == "__main__":
    unittest.main()
