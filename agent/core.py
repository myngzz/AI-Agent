import json
import urllib.request

from . import config
from .tools import TOOLS, run_tool

SYSTEM = ("Kamu adalah asisten AI yang ramah. Bantu pengguna menyelesaikan tugas sederhana "
          "dan aktivitas di internet. Gunakan tool bila perlu. Jawab singkat dalam bahasa pengguna.")


def chat_completion(messages, tools):
    """Panggil API kompatibel OpenAI (OpenAI, Groq, OpenRouter, Ollama, dll)."""
    base = config.get("LLM_BASE_URL", "https://api.openai.com/v1").rstrip("/")
    body = {"model": config.get("LLM_MODEL", "gpt-4o-mini"), "messages": messages, "tools": tools}
    req = urllib.request.Request(
        base + "/chat/completions", data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json",
                 "Authorization": "Bearer " + config.get("LLM_API_KEY")})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)["choices"][0]["message"]


class Agent:
    def __init__(self, llm=chat_completion, max_history=20, max_steps=5):
        self.llm, self.max_history, self.max_steps = llm, max_history, max_steps
        self.sessions = {}

    def reply(self, user_id, text):
        hist = self.sessions.setdefault(user_id, [])
        hist.append({"role": "user", "content": text})
        specs = [t[1] for t in TOOLS.values()]
        for _ in range(self.max_steps):
            msgs = [{"role": "system", "content": SYSTEM}] + hist[-self.max_history:]
            while len(msgs) > 1 and msgs[1]["role"] == "tool":
                msgs.pop(1)
            msg = self.llm(msgs, specs)
            hist.append({k: v for k, v in msg.items() if v is not None})
            calls = msg.get("tool_calls")
            if not calls:
                return msg.get("content") or ""
            for c in calls:
                try:
                    args = json.loads(c["function"].get("arguments") or "{}")
                except ValueError:
                    args = {}
                hist.append({"role": "tool", "tool_call_id": c["id"],
                             "content": run_tool(c["function"]["name"], args)})
        return "Maaf, tugas terlalu rumit. Coba pertanyaan yang lebih sederhana."
