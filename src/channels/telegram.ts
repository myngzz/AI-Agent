import { Bot } from 'grammy';
import { createThrottledRenderer, splitMessage } from './base.js';
import type { Channel, MessageHandler } from './base.js';

/** Batas karakter per pesan Telegram. */
const TELEGRAM_LIMIT = 4096;

/** Integrasi Telegram via grammY (long polling, tanpa webhook). */
export class TelegramChannel implements Channel {
  readonly name = 'telegram';
  readonly prefix = 'tg';
  private readonly bot: Bot;
  private readonly groupPrefix: string;
  /** Jeda minimal antar edit pesan saat streaming (ms). */
  private readonly streamIntervalMs: number;

  constructor(
    token: string,
    handler: MessageHandler,
    options: { groupPrefix?: string; streamIntervalMs?: number } = {},
  ) {
    this.bot = new Bot(token);
    this.groupPrefix = options.groupPrefix ?? '!ai';
    this.streamIntervalMs = options.streamIntervalMs ?? 1500;

    this.bot.on('message:text', async (ctx) => {
      let text = ctx.message.text.trim();
      if (!text) return;

      // Di grup: hanya balas bila pesan diawali prefix atau bot di-mention.
      const isGroup = ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';
      if (isGroup) {
        const username = ctx.me.username;
        const mention = username ? `@${username}` : '';
        if (text.toLowerCase().startsWith(this.groupPrefix.toLowerCase())) {
          text = text.slice(this.groupPrefix.length).trim();
        } else if (mention && text.includes(mention)) {
          text = text.split(mention).join(' ').trim();
        } else {
          return;
        }
        if (!text) return;
      }

      const chatId = `tg:${ctx.chat.id}`;
      console.log(`[telegram] pesan dari @${ctx.from?.username ?? ctx.chat.id}: ${text}`);

      // Streaming: kirim placeholder lalu edit berkala dengan jawaban yang terakumulasi.
      let placeholder: { message_id: number } | undefined;
      try {
        await ctx.replyWithChatAction('typing');
        placeholder = await ctx.reply('✍️');

        let rendered = '';
        const renderer = createThrottledRenderer(this.streamIntervalMs, async (partial) => {
          const preview =
            partial.length > TELEGRAM_LIMIT ? `${partial.slice(0, TELEGRAM_LIMIT - 1)}…` : partial;
          await this.bot.api.editMessageText(ctx.chat.id, placeholder!.message_id, preview);
          rendered = preview;
        });

        const reply = await handler(chatId, text, (accumulated) => renderer.push(accumulated));
        await renderer.flush();

        // Pastikan pesan akhir utuh; kirim sisanya sebagai pesan lanjutan bila melebihi batas.
        const parts = splitMessage(reply, TELEGRAM_LIMIT);
        if (rendered !== parts[0]) {
          await this.bot.api.editMessageText(ctx.chat.id, placeholder.message_id, parts[0]);
        }
        for (const part of parts.slice(1)) {
          await ctx.reply(part);
        }
      } catch (error) {
        console.error('[telegram] error:', error);
        const message = `Maaf, terjadi kesalahan: ${error instanceof Error ? error.message : String(error)}`;
        try {
          if (placeholder) {
            await this.bot.api.editMessageText(ctx.chat.id, placeholder.message_id, message);
          } else {
            await ctx.reply(message);
          }
        } catch {
          await ctx.reply(message);
        }
      }
    });

    this.bot.catch((err) => console.error('[telegram] bot error:', err));
  }

  async start(): Promise<void> {
    console.log('[telegram] Memulai bot...');
    await this.bot.start({
      drop_pending_updates: true,
      onStart: (info) => console.log(`[telegram] Bot @${info.username} aktif dan siap menerima pesan.`),
    });
  }

  async send(rawId: string, text: string): Promise<void> {
    for (const part of splitMessage(text, TELEGRAM_LIMIT)) {
      await this.bot.api.sendMessage(rawId, part);
    }
  }

  async stop(): Promise<void> {
    await this.bot.stop();
  }
}
