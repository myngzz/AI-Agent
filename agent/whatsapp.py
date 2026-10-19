import json
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer
from xml.sax.saxutils import escape

from . import config


def send_meta(to, text):
    url = f"https://graph.facebook.com/v19.0/{config.get('WA_PHONE_NUMBER_ID')}/messages"
    body = {"messaging_product": "whatsapp", "to": to, "text": {"body": text[:4000]}}
    req = urllib.request.Request(url, data=json.dumps(body).encode(), headers={
        "Content-Type": "application/json",
        "Authorization": "Bearer " + config.get("WA_ACCESS_TOKEN")})
    urllib.request.urlopen(req, timeout=15).read()


def make_handler(agent, send=send_meta):
    class H(BaseHTTPRequestHandler):
        def _send(self, code, body=b"", ctype="text/plain"):
            self.send_response(code)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):  # verifikasi webhook Meta
            q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            token = config.get("WA_VERIFY_TOKEN")
            if token and q.get("hub.verify_token") == [token]:
                return self._send(200, q.get("hub.challenge", [""])[0].encode())
            self._send(403, b"forbidden")

        def do_POST(self):
            raw = self.rfile.read(int(self.headers.get("Content-Length") or 0))
            if "json" in (self.headers.get("Content-Type") or ""):  # Meta Cloud API
                try:
                    for e in json.loads(raw).get("entry", []):
                        for ch in e.get("changes", []):
                            for m in ch["value"].get("messages", []):
                                if m.get("type") == "text":
                                    send(m["from"], agent.reply(m["from"], m["text"]["body"]))
                except Exception as ex:
                    print("error:", ex)
                return self._send(200, b"ok")
            form = urllib.parse.parse_qs(raw.decode())  # Twilio
            sender, text = form.get("From", [""])[0], form.get("Body", [""])[0]
            if not sender or not text:
                return self._send(400, b"bad request")
            try:
                ans = agent.reply(sender, text)
            except Exception as ex:
                print("error:", ex)
                ans = "Maaf, terjadi kesalahan."
            xml = f"<Response><Message>{escape(ans)}</Message></Response>"
            self._send(200, xml.encode(), "application/xml")

    return H


def serve(agent):
    port = int(config.get("PORT", "8000"))
    print(f"Webhook WhatsApp berjalan di http://0.0.0.0:{port}")
    HTTPServer(("0.0.0.0", port), make_handler(agent)).serve_forever()
