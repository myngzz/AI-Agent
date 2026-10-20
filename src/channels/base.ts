/** Fungsi yang menerima pesan masuk dari pengguna dan mengembalikan jawaban agent. */
export type MessageHandler = (chatId: string, text: string) => Promise<string>;

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
