import type { Scheduler } from '../../services/scheduler.js';
import type { ToolHandler } from './types.js';

/** Tools langganan ringkasan berita harian per chat. */
export function createNewsTools(scheduler: Scheduler, digestTime: string): ToolHandler[] {
  const subscribe: ToolHandler = {
    definition: {
      type: 'function',
      function: {
        name: 'subscribe_news',
        description:
          'Berlangganan ringkasan berita harian untuk chat ini; dikirim otomatis setiap hari. ' +
          'Dipakai saat pengguna minta langganan/mengikuti berita harian.',
        parameters: { type: 'object', properties: {}, required: [] },
      },
    },
    async execute(_args, context) {
      return scheduler.subscribeNews(context.chatId)
        ? `Berhasil berlangganan! Ringkasan berita dikirim otomatis setiap hari pukul ${digestTime}.`
        : 'Chat ini sudah berlangganan ringkasan berita.';
    },
  };

  const unsubscribe: ToolHandler = {
    definition: {
      type: 'function',
      function: {
        name: 'unsubscribe_news',
        description: 'Berhenti berlangganan ringkasan berita harian untuk chat ini.',
        parameters: { type: 'object', properties: {}, required: [] },
      },
    },
    async execute(_args, context) {
      return scheduler.unsubscribeNews(context.chatId)
        ? 'Berhenti berlangganan. Ringkasan berita tidak lagi dikirim ke chat ini.'
        : 'Chat ini memang tidak sedang berlangganan ringkasan berita.';
    },
  };

  return [subscribe, unsubscribe];
}
