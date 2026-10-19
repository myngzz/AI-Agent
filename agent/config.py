import os

ENV_FILE = ".env"


def load_env(path=ENV_FILE):
    """Muat file .env sederhana ke os.environ (tidak menimpa variabel yang sudah ada)."""
    if not os.path.exists(path):
        return
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def get(name, default=""):
    return os.environ.get(name, default)
