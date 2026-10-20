import type { Scheduler } from '../../services/scheduler.js';
import type { ToolHandler } from './types.js';

/**
 * Parse string tanggal/waktu dari model.
 * Bila tanpa offset timezone (mis. "2026-10-21T07:00"), dianggap waktu lokal di timezone konfigurasi.
 */
function parseDateTime(input: string, timezone: string): Date | null {
  const str = input.trim().replace(/\s+/, 'T');

  if (/([+-]\d{2}:?\d{2}|Z)$/i.test(str)) {
    const date = new Date(str);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  // Tanpa offset: interpretasikan sebagai waktu lokal timezone, lalu konversi ke UTC.
  const asUtc = new Date(str.length === 16 ? `${str}:00Z` : `${str}Z`);
  if (Number.isNaN(asUtc.getTime())) return null;

  const local = new Date(asUtc.toLocaleString('en-US', { timeZone: timezone }));
  const utc = new Date(asUtc.toLocaleString('en-US', { timeZone: 'UTC' }));
  const offsetMs = local.getTime() - utc.getTime();
  return new Date(asUtc.getTime() - offsetMs);
}

function formatTime(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: timezone,
  }).format(new Date(iso));
}

/** Tools pengingat terjadwal: setel, lihat, dan batalkan. */
export function createReminderTools(scheduler: Scheduler, timezone: string): ToolHandler[] {
  const setReminder: ToolHandler = {
    definition: {
      type: 'function',
      function: {
        name: 'set_reminder',
        description:
          'Menyetel pengingat untuk pengguna di chat ini; pesan dikirim otomatis pada waktunya. ' +
          'Isi in_minutes untuk "X menit/jam lagi", atau remind_at untuk waktu spesifik. ' +
          'Gunakan get_current_datetime bila perlu mengetahui waktu sekarang.',
        parameters: {
          type: 'object',
          required: ['message'],
          properties: {
            message: { type: 'string', description: 'Isi pengingat, mis. "Minum air" atau "Menelepon ibu".' },
            in_minutes: { type: 'number', description: 'Berapa menit dari sekarang, mis. 30 atau 120.' },
            remind_at: {
              type: 'string',
              description: 'Waktu spesifik format ISO 8601 dengan offset, mis. 2026-10-21T07:00:00+07:00.',
            },
          },
        },
      },
    },
    async execute(args, context) {
      const message = String(args.message ?? '').trim();
      if (!message) return 'Pesan pengingat tidak boleh kosong.';

      let runAt: Date | null = null;
      const inMinutes = Number(args.in_minutes);
      if (Number.isFinite(inMinutes) && inMinutes > 0) {
        runAt = new Date(Date.now() + inMinutes * 60_000);
      } else if (typeof args.remind_at === 'string' && args.remind_at.trim()) {
        runAt = parseDateTime(args.remind_at, timezone);
      }

      if (!runAt) {
        return 'Waktu pengingat tidak valid. Isi in_minutes (mis. 30) atau remind_at format ISO (mis. 2026-10-21T07:00:00+07:00).';
      }
      if (runAt.getTime() <= Date.now()) {
        return 'Waktu pengingat sudah lewat. Minta pengguna memberi waktu di masa depan.';
      }

      const reminder = scheduler.addReminder(context.chatId, message, runAt);
      return `Pengingat berhasil disetel (ID: ${reminder.id}) untuk ${formatTime(reminder.runAt, timezone)} — "${message}".`;
    },
  };

  const listReminders: ToolHandler = {
    definition: {
      type: 'function',
      function: {
        name: 'list_reminders',
        description: 'Menampilkan semua pengingat aktif milik pengguna di chat ini beserta ID-nya.',
        parameters: { type: 'object', properties: {}, required: [] },
      },
    },
    async execute(_args, context) {
      const reminders = scheduler.listReminders(context.chatId);
      if (reminders.length === 0) return 'Tidak ada pengingat aktif di chat ini.';
      const lines = reminders.map((r) => `- [${r.id}] ${formatTime(r.runAt, timezone)} — ${r.message}`);
      return `Pengingat aktif:\n${lines.join('\n')}`;
    },
  };

  const cancelReminder: ToolHandler = {
    definition: {
      type: 'function',
      function: {
        name: 'cancel_reminder',
        description: 'Membatalkan pengingat berdasarkan ID. Lihat ID lewat tool list_reminders.',
        parameters: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', description: 'ID pengingat dari list_reminders.' },
          },
        },
      },
    },
    async execute(args, context) {
      const id = String(args.id ?? '').trim();
      if (!id) return 'ID pengingat kosong.';
      return scheduler.cancelReminder(context.chatId, id)
        ? `Pengingat ${id} berhasil dibatalkan.`
        : `Pengingat ${id} tidak ditemukan di chat ini.`;
    },
  };

  return [setReminder, listReminders, cancelReminder];
}
