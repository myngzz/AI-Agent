import WAWebJS from 'whatsapp-web.js';
import qrcodeTerminal from 'qrcode-terminal';
import { createThrottledRenderer, splitMessage } from './base.js';
import type { Channel, MessageHandler } from './base.js';

/** Batas aman karakter per pesan WhatsApp. */
const WA_LIMIT = 4000;

export interface WhatsAppOptions {
  /** Balas pesan di grup (hanya bila di-mention atau diawali prefix). Default false. */
  allowGroups?: boolean;
  /** Prefix pemicu di grup. Default "!ai". */
  groupPrefix?: string;
  /** Jeda minimal antar edit pesan saat streaming (ms). Default 2000. */
  streamIntervalMs?: number;
}

/**
 * Integrasi WhatsApp via whatsapp-web.js (library UNOFFICIAL).
 * Login dengan scan QR code; sesi tersimpan di folder .wwebjs_auth.
 * Catatan: library ini melanggar ToS WhatsApp — gunakan untuk eksperimen/personal saja.
 */
export class WhatsAppChannel implements Channel {
  readonly name = 'whatsapp';
  readonly prefix = 'wa';
  private readonly client: WAWebJS.Client;
  private readonly options: Required<WhatsAppOptions>;

  constructor(handler: MessageHandler, options: WhatsAppOptions = {}) {
    this.options = {
      allowGroups: options.allowGroups ?? false,
      groupPrefix: options.groupPrefix ?? '!ai',
      streamIntervalMs: options.streamIntervalMs ?? 2000,
    };
    this.client = new WAWebJS.Client({
      authStrategy: new WAWebJS.LocalAuth({ dataPath: '.wwebjs_auth' }),
      puppeteer: {
        headless: true,
        // Diperlukan saat berjalan sebagai root / di dalam container Linux.
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      },
    });

    this.client.on('qr', (qr) => {
      console.log(
        '\n[whatsapp] Pindai QR code di bawah ini dengan WhatsApp ' +
          '(Setelan → Perangkat Tertaut → Tautkan Perangkat):\n',
      );
      qrcodeTerminal.generate(qr, { small: true });
    });

    this.client.on('authenticated', () => console.log('[whatsapp] Autentikasi berhasil, sesi tersimpan.'));
    this.client.on('ready', () => console.log('[whatsapp] Client siap menerima pesan.'));
    this.client.on('auth_failure', (msg) =>
      console.error('[whatsapp] Autentikasi gagal:', msg, '\nHapus folder .wwebjs_auth lalu coba lagi.'),
    );
    this.client.on('disconnected', (reason) => console.warn('[whatsapp] Terputus:', reason));

    this.client.on('message', async (msg) => {
      // Abaikan pesan sendiri dan status broadcast.
      if (msg.fromMe || msg.from === 'status@broadcast') return;

      const isGroup = msg.from.endsWith('@g.us');
      let text = msg.body.trim();

      // Di grup: hanya balas bila diizinkan DAN pesan diawali prefix atau bot di-mention.
      if (isGroup) {
        if (!this.options.allowGroups) return;

        const myId = this.client.info?.wid._serialized;
        const myNumber = myId?.split('@')[0];
        const mentioned = myId ? msg.mentionedIds.includes(myId) : false;

        if (text.toLowerCase().startsWith(this.options.groupPrefix.toLowerCase())) {
          text = text.slice(this.options.groupPrefix.length).trim();
        } else if (mentioned && myNumber) {
          text = text.replace(new RegExp(`@${myNumber}`, 'g'), ' ').trim();
        } else {
          return;
        }
      }
      if (!text) return;

      const chatId = `wa:${msg.from}`;
      console.log(`[whatsapp] pesan dari ${msg.from}: ${text}`);

      // Streaming: kirim placeholder lalu edit berkala dengan jawaban yang terakumulasi.
      let placeholder: WAWebJS.Message | undefined;
      try {
        const chat = await msg.getChat();
        await chat.sendStateTyping();

        placeholder = await msg.reply('✍️');
        let rendered = '';
        const renderer = createThrottledRenderer(this.options.streamIntervalMs, async (partial) => {
          const preview = partial.length > WA_LIMIT ? `${partial.slice(0, WA_LIMIT - 1)}…` : partial;
          await placeholder!.edit(preview);
          rendered = preview;
        });

        const reply = await handler(chatId, text, (accumulated) => renderer.push(accumulated));
        await renderer.flush();

        // Pastikan pesan akhir utuh; kirim sisanya sebagai pesan lanjutan bila melebihi batas.
        const parts = splitMessage(reply, WA_LIMIT);
        if (rendered !== parts[0]) await placeholder.edit(parts[0]);
        for (const part of parts.slice(1)) {
          await msg.reply(part);
        }
      } catch (error) {
        console.error('[whatsapp] error:', error);
        const message = `Maaf, terjadi kesalahan: ${error instanceof Error ? error.message : String(error)}`;
        try {
          if (placeholder) {
            await placeholder.edit(message);
          } else {
            await msg.reply(message);
          }
        } catch {
          await msg.reply(message);
        }
      }
    });
  }

  async send(rawId: string, text: string): Promise<void> {
    for (const part of splitMessage(text, WA_LIMIT)) {
      await this.client.sendMessage(rawId, part);
    }
  }

  async start(): Promise<void> {
    console.log('[whatsapp] Memulai client... (pertama kali perlu scan QR code)');
    await this.client.initialize();
  }

  async stop(): Promise<void> {
    await this.client.destroy();
  }
}
