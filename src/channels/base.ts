/** Callback streaming: menerima teks jawaban yang terakumulasi sejauh ini. */
export type StreamCallback = (accumulated: string) => void;

/**
 * Fungsi yang menerima pesan masuk dari pengguna dan mengembalikan jawaban agent.
 * Bila onStream diisi, jawaban dikirim bertahap lewat callback tersebut (teks terakumulasi).
 */
export type MessageHandler = (chatId: string, text: string, onStream?: StreamCallback) => Promise<string>;

/** Kontrak umum untuk semua channel chat (Telegram, WhatsApp, dst). */
export interface Channel {
  readonly name: string;
  /** Prefix unik chatId channel ini, mis. "tg" atau "wa" (format chatId: "<prefix>:<rawId>"). */
  readonly prefix: string;
  /** Mulai channel. Promise boleh berjalan lama (long-polling) sampai stop() dipanggil. */
  start(): Promise<void>;
  /** Hentikan channel dengan bersih. */
  stop(): Promise<void>;
  /** Kirim pesan proaktif ke chat. rawId adalah id asli platform (tanpa prefix). */
  send(rawId: string, text: string): Promise<void>;
}

/** Pecah pesan panjang menjadi beberapa bagian agar tidak melebihi batas karakter platform. */
export function splitMessage(text: string, limit: number): string[] {
  if (text.length <= limit) return [text];

  const parts: string[] = [];
  let rest = text;
  while (rest.length > limit) {
    // Utamakan potong di baris baru, lalu spasi, terakhir apa adanya.
    let cut = rest.lastIndexOf('\n', limit);
    if (cut < limit / 2) cut = rest.lastIndexOf(' ', limit);
    if (cut < limit / 2) cut = limit;
    parts.push(rest.slice(0, cut));
    rest = rest.slice(cut).trimStart();
  }
  if (rest.length > 0) parts.push(rest);
  return parts;
}

/** Renderer progresif dengan pembatasan frekuensi render (anti rate-limit platform). */
export interface ThrottledRenderer {
  /** Teruskan teks terbaru; render dilakukan maksimal sekali per interval. */
  push(text: string): void;
  /** Render teks terakhir sekarang juga dan tunggu sampai selesai. */
  flush(): Promise<void>;
}

/**
 * Batasi frekuensi render teks streaming (mis. edit pesan Telegram/WhatsApp)
 * agar tidak melampaui rate limit platform saat jawaban diketik bertahap.
 */
export function createThrottledRenderer(
  intervalMs: number,
  render: (text: string) => Promise<void>,
): ThrottledRenderer {
  let latest = '';
  let lastRendered = '';
  let lastRenderAt = 0;
  let chain: Promise<void> = Promise.resolve();
  let timer: NodeJS.Timeout | undefined;

  const run = (): void => {
    if (timer) {
      clearTimeout(timer);
      timer = undefined;
    }
    if (latest === lastRendered) return;
    const text = latest;
    lastRenderAt = Date.now();
    lastRendered = text;
    // Render berurutan lewat promise chain agar tidak ada edit yang tumpang-tindih.
    chain = chain
      .then(() => render(text))
      .catch((error: unknown) => console.error('[stream] gagal memperbarui pesan:', error));
  };

  return {
    push(text: string): void {
      latest = text;
      const elapsed = Date.now() - lastRenderAt;
      if (elapsed >= intervalMs) {
        run();
      } else if (!timer) {
        timer = setTimeout(run, intervalMs - elapsed);
        timer.unref();
      }
    },
    async flush(): Promise<void> {
      run();
      await chain;
    },
  };
}
