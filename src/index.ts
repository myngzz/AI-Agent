import { config } from './config.js';
import { Agent } from './agent/agent.js';
import type { Channel } from './channels/base.js';
import { TelegramChannel } from './channels/telegram.js';
import { WhatsAppChannel } from './channels/whatsapp.js';
import { OutboundDispatcher } from './services/outbound.js';
import { DIGEST_PROMPT, Scheduler } from './services/scheduler.js';

async function main(): Promise<void> {
  console.log('=== AI Agent Pribadi ===');
  console.log(`Model Ollama : ${config.ollama.model} @ ${config.ollama.host}`);

  // Dispatcher pesan keluar + penjadwal (pengingat & digest berita).
  const outbound = new OutboundDispatcher();
  const scheduler = new Scheduler(outbound, {
    dataFile: config.dataFile,
    digestTime: config.newsDigestTime,
    timezone: config.timezone,
  });

  const agent = new Agent({
    host: config.ollama.host,
    model: config.ollama.model,
    systemPrompt: config.systemPrompt,
    timezone: config.timezone,
    maxHistory: config.maxHistory,
    maxToolIterations: config.maxToolIterations,
    scheduler,
    newsDigestTime: config.newsDigestTime,
    numCtx: config.ollama.numCtx,
  });

  scheduler.setDigestGenerator(() => agent.askOnce(DIGEST_PROMPT));

  const handler = (chatId: string, text: string): Promise<string> => agent.handleMessage(chatId, text);

  const channels: Channel[] = [];

  if (config.channels.telegram) {
    if (!config.telegramToken) {
      console.warn('[telegram] ENABLE_TELEGRAM=true tetapi TELEGRAM_BOT_TOKEN kosong — channel dilewati.');
    } else {
      const telegram = new TelegramChannel(config.telegramToken, handler, { groupPrefix: config.groupPrefix });
      outbound.register(telegram.prefix, telegram);
      channels.push(telegram);
    }
  }
  if (config.channels.whatsapp) {
    const whatsapp = new WhatsAppChannel(handler, {
      allowGroups: config.allowGroups,
      groupPrefix: config.groupPrefix,
    });
    outbound.register(whatsapp.prefix, whatsapp);
    channels.push(whatsapp);
  }

  if (channels.length === 0) {
    console.error('Tidak ada channel yang aktif. Isi TELEGRAM_BOT_TOKEN atau aktifkan WhatsApp di file .env');
    process.exit(1);
  }

  console.log(`Channel aktif : ${channels.map((c) => c.name).join(', ')}`);
  console.log(`Grup         : ${config.allowGroups ? `aktif (prefix "${config.groupPrefix}" / mention)` : 'nonaktif'}`);
  console.log(`Berita harian: ${config.newsDigestTime} (${config.timezone})\n`);

  scheduler.start();

  // Matikan dengan bersih saat Ctrl+C / kill.
  const shutdown = async (): Promise<void> => {
    console.log('\nMematikan agent...');
    scheduler.stop();
    await Promise.allSettled(channels.map((c) => c.stop()));
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());

  await Promise.all(
    channels.map((channel) =>
      channel.start().catch((error: unknown) => {
        console.error(`[${channel.name}] gagal dimulai:`, error);
      }),
    ),
  );
}

main().catch((error: unknown) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
