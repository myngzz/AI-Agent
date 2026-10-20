import 'dotenv/config';

const DEFAULT_SYSTEM_PROMPT = `Kamu adalah "Asisten", AI agent pribadi yang membantu pengguna menyelesaikan tugas-tugas sederhana dan aktivitas di internet.

Kemampuanmu:
- Menjawab pertanyaan dan menjelaskan berbagai topik.
- Mencari informasi terkini di internet (tool web_search) dan membaca isi halaman web (tool fetch_webpage).
- Menghitung ekspresi matematika (tool calculator).
- Mengetahui tanggal & waktu sekarang (tool get_current_datetime).
- Mengecek cuaca suatu kota (tool get_weather).
- Menyetel, melihat, dan membatalkan pengingat terjadwal (tools set_reminder, list_reminders, cancel_reminder).
- Mengatur langganan ringkasan berita harian (tools subscribe_news, unsubscribe_news).

Aturan:
- Selalu jawab dalam bahasa yang dipakai pengguna (default: Bahasa Indonesia).
- Jawab dengan ringkas dan jelas — pengguna membaca lewat aplikasi chat.
- Gunakan tool bila butuh data terkini, perhitungan, atau isi halaman web; jangan mengarang fakta.
- Jika tool gagal atau data tidak ditemukan, sampaikan dengan jujur.
- Format jawaban agar nyaman dibaca di chat (paragraf pendek, daftar bila perlu).`;

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return !['false', '0', 'no', 'off'].includes(value.toLowerCase());
}

export const config = {
  ollama: {
    host: process.env.OLLAMA_HOST ?? 'http://localhost:11434',
    model: process.env.OLLAMA_MODEL ?? 'llama3.2:3b',
    /** Batas konteks (token). 0 = default model (4096). Kecilkan (mis. 2048) untuk hemat RAM. */
    numCtx: Number(process.env.OLLAMA_NUM_CTX) || 0,
  },
  telegramToken: process.env.TELEGRAM_BOT_TOKEN?.trim() ?? '',
  channels: {
    telegram: bool(process.env.ENABLE_TELEGRAM, true),
    whatsapp: bool(process.env.ENABLE_WHATSAPP, true),
  },
  timezone: process.env.TZ ?? 'Asia/Jakarta',
  systemPrompt: process.env.SYSTEM_PROMPT?.trim() || DEFAULT_SYSTEM_PROMPT,
  /** Balas pesan di grup Telegram/WhatsApp (hanya bila di-mention atau diawali prefix). */
  allowGroups: bool(process.env.ENABLE_GROUPS, false),
  /** Prefix pemicu di grup. */
  groupPrefix: process.env.GROUP_PREFIX ?? '!ai',
  /** Jam pengiriman ringkasan berita harian (HH:MM, waktu lokal). */
  newsDigestTime: process.env.NEWS_DIGEST_TIME ?? '07:00',
  /** File penyimpanan data pengingat & langganan berita. */
  dataFile: process.env.DATA_FILE ?? 'data/scheduler.json',
  /** Jumlah pesan terakhir yang disimpan sebagai konteks percakapan per chat. */
  maxHistory: 20,
  /** Batas iterasi tool calling agar agent tidak berputar tanpa henti. */
  maxToolIterations: 5,
} as const;
