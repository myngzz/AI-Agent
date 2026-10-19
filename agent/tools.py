import ast
import json
import operator
import os
import re
import urllib.parse
import urllib.request
from datetime import datetime
from html.parser import HTMLParser

NOTES_FILE = os.path.join("data", "notes.json")
_OPS = {
    ast.Add: operator.add, ast.Sub: operator.sub, ast.Mult: operator.mul,
    ast.Div: operator.truediv, ast.Pow: operator.pow, ast.Mod: operator.mod,
    ast.USub: operator.neg,
}


def calculator(expression):
    """Hitung ekspresi matematika sederhana secara aman."""
    def ev(n):
        if isinstance(n, ast.Constant) and isinstance(n.value, (int, float)):
            return n.value
        if isinstance(n, ast.BinOp) and type(n.op) in _OPS:
            l, r = ev(n.left), ev(n.right)
            if isinstance(n.op, ast.Pow) and abs(r) > 100:
                raise ValueError("pangkat terlalu besar")
            return _OPS[type(n.op)](l, r)
        if isinstance(n, ast.UnaryOp) and type(n.op) in _OPS:
            return _OPS[type(n.op)](ev(n.operand))
        raise ValueError("ekspresi tidak didukung")
    try:
        return str(ev(ast.parse(expression, mode="eval").body))
    except Exception as e:
        return f"Error: {e}"


def current_time():
    """Waktu saat ini."""
    return datetime.now().strftime("%A, %d %B %Y %H:%M:%S")


class _Text(HTMLParser):
    def __init__(self):
        super().__init__()
        self.out, self.skip = [], 0

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style"):
            self.skip += 1

    def handle_endtag(self, tag):
        if tag in ("script", "style") and self.skip:
            self.skip -= 1

    def handle_data(self, data):
        if not self.skip and data.strip():
            self.out.append(data.strip())


def _check_url(url):
    p = urllib.parse.urlparse(url)
    if p.scheme not in ("http", "https") or not p.hostname:
        raise ValueError("hanya URL http/https yang didukung")
    import ipaddress
    import socket
    for info in socket.getaddrinfo(p.hostname, None):
        ip = ipaddress.ip_address(info[4][0])
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:
            raise ValueError("alamat jaringan internal diblokir")


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        _check_url(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def fetch_url(url, max_chars=4000):
    """Ambil teks dari halaman web."""
    try:
        _check_url(url)
        opener = urllib.request.build_opener(_NoRedirect)
        req = urllib.request.Request(url, headers={"User-Agent": "AI-Agent/1.0"})
        with opener.open(req, timeout=15) as r:
            html = r.read(1_000_000).decode("utf-8", "replace")
        p = _Text()
        p.feed(html)
        return " ".join(p.out)[:max_chars]
    except Exception as e:
        return f"Error: {e}"


def web_search(query):
    """Cari di internet (DuckDuckGo)."""
    try:
        url = "https://html.duckduckgo.com/html/?q=" + urllib.parse.quote(query)
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=15) as r:
            html = r.read().decode("utf-8", "replace")
        links = re.findall(r'class="result__a" href="([^"]+)"[^>]*>(.*?)</a>', html, re.S)
        res = []
        for href, title in links[:5]:
            m = re.search(r"uddg=([^&]+)", href)
            href = urllib.parse.unquote(m.group(1)) if m else href
            res.append(f"- {re.sub('<.*?>', '', title).strip()}: {href}")
        return "\n".join(res) or "Tidak ada hasil."
    except Exception as e:
        return f"Error: {e}"


def _load_notes():
    if os.path.exists(NOTES_FILE):
        with open(NOTES_FILE, encoding="utf-8") as f:
            return json.load(f)
    return []


def add_note(text):
    """Simpan catatan / pengingat."""
    os.makedirs(os.path.dirname(NOTES_FILE), exist_ok=True)
    notes = _load_notes()
    notes.append({"time": datetime.now().isoformat(timespec="seconds"), "text": text})
    with open(NOTES_FILE, "w", encoding="utf-8") as f:
        json.dump(notes, f, ensure_ascii=False, indent=2)
    return "Catatan disimpan."


def list_notes():
    """Tampilkan semua catatan."""
    notes = _load_notes()
    return "\n".join(f"{i+1}. [{n['time']}] {n['text']}" for i, n in enumerate(notes)) or "Belum ada catatan."


def _spec(name, desc, props):
    return {"type": "function", "function": {
        "name": name, "description": desc,
        "parameters": {"type": "object", "properties": {k: {"type": "string"} for k in props},
                       "required": list(props)}}}


TOOLS = {
    "calculator": (calculator, _spec("calculator", "Hitung ekspresi matematika", ["expression"])),
    "current_time": (current_time, _spec("current_time", "Waktu saat ini", [])),
    "fetch_url": (fetch_url, _spec("fetch_url", "Baca isi teks halaman web dari URL", ["url"])),
    "web_search": (web_search, _spec("web_search", "Cari informasi di internet", ["query"])),
    "add_note": (add_note, _spec("add_note", "Simpan catatan", ["text"])),
    "list_notes": (list_notes, _spec("list_notes", "Lihat catatan tersimpan", [])),
}


def run_tool(name, args):
    if name not in TOOLS:
        return f"Error: tool {name} tidak ada"
    try:
        return str(TOOLS[name][0](**args))
    except Exception as e:
        return f"Error: {e}"
