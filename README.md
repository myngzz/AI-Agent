# AI-Agent

Asisten AI sederhana untuk tugas ringan & aktivitas internet (cari info, baca web, hitung, catatan),
bisa dipakai lewat terminal atau **WhatsApp**. Tanpa dependensi tambahan — hanya Python 3.9+.

## Setup cepat
```bash
python -m agent setup     # wizard: isi API key (OpenAI / Groq / OpenRouter / Ollama, dll)
python -m agent chat      # ngobrol di terminal
```
Atau salin `.env.example` menjadi `.env` lalu isi.

## Integrasi WhatsApp
```bash
python -m agent whatsapp  # webhook di port 8000
```
Buka ke internet (mis. `ngrok http 8000`), lalu:
- **Twilio**: set "When a message comes in" ke `https://<url>/`.
- **Meta Cloud API**: webhook `https://<url>/`, verify token = `WA_VERIFY_TOKEN`, isi `WA_ACCESS_TOKEN` dan `WA_PHONE_NUMBER_ID`.

## Tool bawaan
`web_search`, `fetch_url`, `calculator`, `current_time`, `add_note`, `list_notes`.
Tambah tool baru di `agent/tools.py` (daftarkan di `TOOLS`).

## Tes
```bash
python -m unittest discover tests
```
