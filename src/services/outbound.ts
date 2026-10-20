/** Target pengiriman pesan proaktif — dipenuhi oleh Channel maupun stub (CLI/tes). */
export interface SendTarget {
  send(rawId: string, text: string): Promise<void>;
}

/**
 * Mengirim pesan keluar (proaktif) ke channel yang tepat berdasarkan prefix chatId.
 * Format chatId: "<prefix>:<rawId>", mis. "tg:123456" atau "wa:628xxx@c.us".
 */
export class OutboundDispatcher {
  private readonly targets = new Map<string, SendTarget>();

  register(prefix: string, target: SendTarget): void {
    this.targets.set(prefix, target);
  }

  async send(chatId: string, text: string): Promise<void> {
    const sep = chatId.indexOf(':');
    const prefix = sep === -1 ? chatId : chatId.slice(0, sep);
    const rawId = sep === -1 ? '' : chatId.slice(sep + 1);

    const target = this.targets.get(prefix);
    if (!target) {
      throw new Error(`Tidak ada channel terdaftar untuk prefix "${prefix}".`);
    }
    await target.send(rawId, text);
  }
}
