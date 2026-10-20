import type { ToolHandler } from './types.js';

/** Tool untuk mengetahui tanggal & waktu sekarang. */
export function createDatetimeTool(timezone: string): ToolHandler {
  return {
    definition: {
      type: 'function',
      function: {
        name: 'get_current_datetime',
        description:
          'Mendapatkan tanggal dan waktu saat ini. Gunakan saat pengguna menanyakan hari, tanggal, atau jam sekarang.',
        parameters: { type: 'object', properties: {}, required: [] },
      },
    },
    async execute() {
      const formatted = new Intl.DateTimeFormat('id-ID', {
        dateStyle: 'full',
        timeStyle: 'long',
        timeZone: timezone,
      }).format(new Date());
      return `Sekarang: ${formatted} (zona waktu: ${timezone})`;
    },
  };
}
