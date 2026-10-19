import sys

from . import config


def setup():
    print("=== Setup AI Agent ===")
    vals = {}
    vals["LLM_API_KEY"] = input("API key LLM: ").strip()
    vals["LLM_BASE_URL"] = input("Base URL [https://api.openai.com/v1]: ").strip() or "https://api.openai.com/v1"
    vals["LLM_MODEL"] = input("Model [gpt-4o-mini]: ").strip() or "gpt-4o-mini"
    if input("Aktifkan WhatsApp? (y/N): ").strip().lower() == "y":
        if input("Pakai Meta Cloud API? (y=Meta, N=Twilio): ").strip().lower() == "y":
            vals["WA_VERIFY_TOKEN"] = input("Verify token (bebas): ").strip()
            vals["WA_ACCESS_TOKEN"] = input("Access token: ").strip()
            vals["WA_PHONE_NUMBER_ID"] = input("Phone number ID: ").strip()
    with open(config.ENV_FILE, "w", encoding="utf-8") as f:
        for k, v in vals.items():
            f.write(f"{k}={v}\n")
    try:
        import os
        os.chmod(config.ENV_FILE, 0o600)
    except OSError:
        pass
    print("Tersimpan di .env. Jalankan: python -m agent chat")


def chat(agent):
    print("Ketik pesan (Ctrl+C untuk keluar)")
    while True:
        try:
            text = input("Anda: ")
        except (KeyboardInterrupt, EOFError):
            break
        if text.strip():
            print("Agent:", agent.reply("cli", text))


def main():
    config.load_env()
    cmd = sys.argv[1] if len(sys.argv) > 1 else "help"
    if cmd == "setup":
        return setup()
    if cmd in ("chat", "whatsapp"):
        if not config.get("LLM_API_KEY"):
            sys.exit("LLM_API_KEY belum diisi. Jalankan: python -m agent setup")
        from .core import Agent
        if cmd == "chat":
            return chat(Agent())
        from .whatsapp import serve
        return serve(Agent())
    print("Perintah: python -m agent [setup|chat|whatsapp]")


main()
