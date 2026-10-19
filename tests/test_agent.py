import unittest

from agent.core import Agent
from agent.tools import calculator, run_tool


class T(unittest.TestCase):
    def test_calc(self):
        self.assertEqual(calculator("2+3*4"), "14")
        self.assertTrue(calculator("__import__('os')").startswith("Error"))

    def test_ssrf_blocked(self):
        self.assertTrue(run_tool("fetch_url", {"url": "http://127.0.0.1/"}).startswith("Error"))

    def test_tool_loop(self):
        calls = []

        def llm(msgs, tools):
            calls.append(1)
            if len(calls) == 1:
                return {"role": "assistant", "content": None, "tool_calls": [
                    {"id": "1", "type": "function",
                     "function": {"name": "calculator", "arguments": '{"expression":"6*7"}'}}]}
            assert msgs[-1]["content"] == "42"
            return {"role": "assistant", "content": "Hasilnya 42"}

        self.assertEqual(Agent(llm).reply("u", "6*7?"), "Hasilnya 42")


if __name__ == "__main__":
    unittest.main()
