import type { Tool } from 'ollama';

/** Konteks eksekusi tool: informasi tentang chat asal pesan. */
export interface ToolContext {
  /** ID chat unik dengan prefix channel, mis. "tg:123" atau "wa:628xxx@c.us". */
  chatId: string;
}

/** Tool yang bisa dipanggil agent: definisi schema untuk model + fungsi eksekusinya. */
export interface ToolHandler {
  /** Definisi tool dalam format Ollama (JSON schema). */
  definition: Tool;
  /** Jalankan tool; kembalikan hasil sebagai teks untuk dikirim balik ke model. */
  execute(args: Record<string, unknown>, context: ToolContext): Promise<string>;
}
