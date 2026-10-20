# AI-Agent

AI agent pribadi berbasis **Node.js + TypeScript** yang bisa mengerjakan tugas-tugas sederhana dan membantu aktivitas di internet, dengan integrasi **Telegram** dan **WhatsApp**. Otak agent menggunakan **Ollama** — LLM yang berjalan 100% lokal dan gratis.

## Fitur

- 💬 **Multi-channel**: Telegram (resmi via Bot API) dan WhatsApp (via whatsapp-web.js), aktif bersamaan
- 🧠 **LLM lokal gratis**: Ollama dengan tool calling (default: `llama3.2:3b`)
- 🛠️ **Tools bawaan**:
  | Tool | Fungsi |
  |---|---|
  | `web_search` | Cari informasi di internet (DuckDuckGo, tanpa API key) |
  | `fetch_webpage` | Baca isi halaman web sebagai teks |
  | `get_weather` | Cuaca terkini suatu kota (Open-Meteo, tanpa API key) |
  | `calculator` | Perhitungan matematika akurat |
  | `get_current_datetime` | Tanggal & waktu sekarang |
  | `set_reminder` | Menyetel pengingat terjadwal |
  | `list_reminders` / `cancel_reminder` | Lihat & batalkan pengingat |
  | `subscribe_news` / `unsubscribe_news` | Langganan ringkasan berita harian |
- ⚡ **Streaming jawaban** — balasan tampil bertahap: token langsung di terminal, edit pesan berkala di Telegram/WhatsApp
- 💓 **Heartbeat proaktif (ala OpenClaw)** — agent "bangun" berkala dan menyapa duluan hanya bila ada hal penting
- ⏰ **Pengingat terjadwal** — "ingatkan saya 30 menit lagi..." (tersimpan di disk, tahan restart)
- 📰 **Ringkasan berita harian otomatis** — agent mencari & meringkas berita lalu mengirimnya tiap pagi
- 👥 **Dukungan grup** WhatsApp & Telegram (merespons bila di-mention atau diawali prefix `!ai`)
- 🗂️ **Konteks percakapan** per chat (20 pesan terakhir)
- 🖥️ **Mode chat terminal** untuk mencoba agent tanpa aplikasi chat

## Struktur Proyek

```
src/
├── index.ts              # Entry point: nyalakan semua channel
├── cli.ts                # Mode chat via terminal (npm run chat)
├── config.ts             # Konfigurasi dari file .env
├── agent/
│   ├── agent.ts          # Inti agent: loop tool calling + riwayat percakapan
│   └── tools/            # Tools yang bisa dipakai agent
│       ├── index.ts      # Registrasi tool (tambah tool baru di sini)
│       ├── webSearch.ts  # Pencarian web
│       ├── webReader.ts  # Pembaca halaman web
│       ├── weather.ts    # Cuaca
│       ├── calculator.ts # Kalkulator
│       └── datetime.ts   # Tanggal & waktu
├── services/
│   ├── outbound.ts       # Dispatcher pesan keluar (proaktif) ke channel
│   ├── scheduler.ts      # Penjadwal: pengingat + digest berita (persisten di data/)
│   └── heartbeat.ts      # Heartbeat proaktif: agent bangun berkala (HEARTBEAT_OK = diam)
└── channels/
    ├── base.ts           # Interface umum channel
    ├── telegram.ts       # Bot Telegram (grammY)
    └── whatsapp.ts       # Client WhatsApp (whatsapp-web.js)
```

## Persiapan

### 1. Install dependencies

```bash
npm install
```

### 2. Install Ollama & model

```bash
# Install Ollama (Linux/macOS)
curl -fsSL https://ollama.com/install.sh | sh

# Jalankan server (biarkan berjalan di terminal terpisah)
ollama serve

# Download model (pilih salah satu)
ollama pull llama3.2:3b   # ringan, ~2 GB
ollama pull llama3.1      # lebih pintar, ~4.9 GB
```

> Di Windows, download installer dari https://ollama.com/download — server otomatis berjalan.

### 3. Konfigurasi

```bash
cp .env.example .env
```

Edit `.env`:

- **`TELEGRAM_BOT_TOKEN`** — buat bot lewat [@BotFather](https://t.me/BotFather) di Telegram: kirim `/newbot`, ikuti instruksinya, lalu tempel token yang diberikan.
- **`OLLAMA_MODEL`** — sesuaikan dengan model yang sudah di-pull.
- **`ENABLE_TELEGRAM` / `ENABLE_WHATSAPP`** — set `false` untuk mematikan channel.
- **`ENABLE_GROUPS`** — set `true` agar agent merespons di grup (via mention atau prefix).
- **`GROUP_PREFIX`** — prefix pemicu di grup (default `!ai`).
- **`NEWS_DIGEST_TIME`** — jam pengiriman ringkasan berita harian (default `07:00`).
- **`HEARTBEAT_INTERVAL_MINUTES`** — interval heartbeat proaktif dalam menit (default `30`, `0` = nonaktif).
- **`HEARTBEAT_CHAT_IDS`** — (opsional) target heartbeat dipisah koma, mis. `tg:123456,wa:628xxx@c.us`; kosong = semua chat yang pernah aktif.
- **`STREAM_EDIT_INTERVAL_MS`** — (opsional) jeda minimal antar edit pesan saat streaming (default `1500`).

## Menjalankan

```bash
# Mode chat di terminal (cara tercepat mencoba agent)
npm run chat

# Mode produksi: Telegram + WhatsApp
npm start

# Mode development (auto-restart saat file berubah)
npm run dev
```

**Login WhatsApp pertama kali:** saat agent start, QR code muncul di terminal. Pindai dengan WhatsApp (Setelan → Perangkat Tertaut → Tautkan Perangkat). Sesi tersimpan di folder `.wwebjs_auth` sehingga tidak perlu scan ulang.

## Contoh Pertanyaan untuk Agent

- "Jam berapa sekarang?"
- "Berapa 15% dari 250000?"
- "Cuaca di Bandung gimana?"
- "Cari berita terbaru tentang AI"
- "Bacakan isi halaman https://example.com"
- "Ringkas artikel ini: <link>"
- "Ingatkan saya 30 menit lagi untuk minum air"
- "Ingatkan saya besok jam 7 pagi untuk olahraga"
- "Pengingat apa saja yang aktif?"
- "Langganan berita harian dong"

## Fitur Terjadwal & Grup

### ⏰ Pengingat

Tulis permintaan natural ke agent: "ingatkan saya 20 menit lagi untuk cek oven". Saat jatuh tempo, pesan `⏰ Pengingat: ...` dikirim ke chat yang sama — **walau agent baru saja direstart** (data tersimpan di `data/scheduler.json`).

Kelola lewat chat: "pengingat apa saja yang aktif?" lalu "batalkan pengingat <id>".

### 📰 Ringkasan berita harian

Kirim **"langganan berita"** ke agent → chat Anda terdaftar. Setiap hari pukul `NEWS_DIGEST_TIME`, agent mencari berita terkini di internet, meringkas 5 berita utama, lalu mengirimkannya otomatis. Berhenti dengan **"berhenti berlangganan berita"**.

### � Heartbeat proaktif

Terinspirasi OpenClaw: tiap `HEARTBEAT_INTERVAL_MINUTES` menit agent "bangun" dengan konteks percakapan terakhir, boleh memakai tools, lalu menimbang apakah ada hal yang layak disampaikan. Bila tidak ada, agent membalas `HEARTBEAT_OK` dan **tidak ada pesan yang dikirim**. Pertukaran heartbeat tidak disimpan ke riwayat percakapan.

- Target: `HEARTBEAT_CHAT_IDS` (dipisah koma); kosong = semua chat yang pernah aktif sejak agent menyala.
- Set `HEARTBEAT_INTERVAL_MINUTES=0` untuk mematikan.

### �👥 Dukungan grup

Set `ENABLE_GROUPS=true` di `.env`. Di grup, agent hanya merespons bila:

- di-**mention** (@nama-bot), atau
- pesan diawali **prefix** `!ai` — mis. `!ai berapa 12 * 8?`

Ini mencegah agent membalas semua pesan grup. Pengingat & digest juga bisa menargetkan grup (selama disetel dari dalam grup tersebut).

## Menambah Tool Baru

1. Buat file baru di `src/agent/tools/`, contoh `reminder.ts`:

```ts
import type { ToolHandler } from './types.js';

export const reminderTool: ToolHandler = {
  definition: {
    type: 'function',
    function: {
      name: 'my_tool',
      description: 'Deskripsi untuk model: kapan tool ini dipakai.',
      parameters: {
        type: 'object',
        required: ['param1'],
        properties: {
          param1: { type: 'string', description: 'Penjelasan parameter.' },
        },
      },
    },
  },
  async execute(args) {
    return `Hasil untuk ${args.param1}`;
  },
};
```

2. Daftarkan di `src/agent/tools/index.ts` pada array `list`.

## Catatan Penting

- ⚠️ **WhatsApp unofficial**: whatsapp-web.js melanggar ToS WhatsApp dan berisiko nomor diblokir. Gunakan nomor cadangan untuk eksperimen. Untuk produksi, migrasi ke [WhatsApp Business API resmi](https://business.whatsapp.com/).
- WhatsApp channel menjalankan Chrome headless via puppeteer (butuh ~500 MB RAM).
- LLM lokal di CPU bisa lambat (10–60 detik/jawaban). GPU sangat membantu; alternatifnya gunakan model lebih kecil atau ganti `OLLAMA_HOST` ke server Ollama lain.
- Secara default agent hanya membalas **chat pribadi** (bukan grup). Aktifkan dengan `ENABLE_GROUPS=true` — di grup agent tetap hanya merespons mention/prefix.

## Troubleshooting

| Masalah | Solusi |
|---|---|
| "Tidak dapat terhubung ke Ollama" | Jalankan `ollama serve`, cek `OLLAMA_HOST` di `.env` |
| "Model belum tersedia" | `ollama pull llama3.2:3b` |
| "unexpected EOF" / runner berhenti | RAM tidak cukup. Tutup aplikasi berat, set `OLLAMA_NUM_CTX=2048` di `.env`, jalankan server dengan `OLLAMA_KV_CACHE_TYPE=q8_0 ollama serve`, atau pakai model lebih kecil (`ollama pull llama3.2:1b`). Agent otomatis me-retry 1× untuk error ini. |
| WhatsApp auth gagal | Hapus folder `.wwebjs_auth`, restart, scan QR ulang |
| Chrome gagal launch (Linux) | Install library: `sudo apt-get install -y libatk1.0-0t64 libatk-bridge2.0-0t64 libcups2t64 libnss3 libgbm1 libasound2t64` |
| Telegram tidak merespons | Pastikan token benar dan tidak ada instance bot lain yang berjalan |

## Scripts

| Perintah | Fungsi |
|---|---|
| `npm start` | Jalankan agent dengan semua channel aktif |
| `npm run dev` | Mode development (auto-reload) |
| `npm run chat` | Chat dengan agent lewat terminal |
| `npm run smoke` | Smoke test koneksi Ollama + tools (via LLM) |
| `npm run test:scheduler` | Uji cepat scheduler tanpa LLM |
| `npm run typecheck` | Cek error TypeScript |
| `npm run build` | Compile ke `dist/` |