import type { Agent } from '../agent/agent.js';
import type { OutboundDispatcher } from './outbound.js';

/** Balasan agent bila heartbeat tidak punya hal penting untuk disampaikan. */
export const HEARTBEAT_SILENT = 'HEARTBEAT_OK';

/** Prompt yang dikirim ke agent pada setiap detak heartbeat. */
export const HEARTBEAT_PROMPT = `[HEARTBEAT SISTEM] Ini sinyal rutin otomatis — BUKAN pesan dari pengguna, jadi jangan balas seolah pengguna baru menulis sesuatu.
Periksa apakah ada hal yang benar-benar berguna untuk disampaikan ke pengguna saat ini, misalnya:
- tindak lanjut permintaan sebelumnya yang belum selesai,
- informasi yang sedang dipantau pengguna (cuaca, berita, jadwal).
Kamu boleh memakai tools bila perlu.
Jika ADA yang layak disampaikan: tulis pesan singkat dan langsung untuk pengguna.
Jika TIDAK ADA: balas HANYA dengan teks berikut tanpa tambahan apa pun: ${HEARTBEAT_SILENT}`;

export interface HeartbeatOptions {
  /** Interval antar detak (ms). */
  intervalMs: number;
  /** Target chatId. Kosong = semua chat yang pernah aktif sejak agent menyala. */
  chatIds: readonly string[];
}

/**
 * Heartbeat proaktif (terinspirasi OpenClaw): agent "bangun" berkala, menimbang
 * konteks percakapan, dan mengirim pesan duluan HANYA bila ada hal yang layak
 * disampaikan. Pertukaran heartbeat tidak disimpan ke riwayat percakapan.
 */
export class Heartbeat {
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly outbound: OutboundDispatcher,
    private readonly agent: Agent,
    private readonly options: HeartbeatOptions,
  ) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.beatNow();
    }, this.options.intervalMs);
    // Jangan menahan proses tetap hidup hanya karena timer ini.
    this.timer.unref();
    const target =
      this.options.chatIds.length > 0 ? this.options.chatIds.join(', ') : 'semua chat aktif';
    console.log(
      `[heartbeat] aktif — tiap ${Math.round(this.options.intervalMs / 60_000)} menit, target: ${target}`,
    );
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  /** Jalankan satu putaran heartbeat sekarang (dipakai timer & pengujian). */
  async beatNow(): Promise<void> {
    if (this.running) return; // cegah detak tumpang-tindih
    this.running = true;
    try {
      const targets =
        this.options.chatIds.length > 0 ? [...this.options.chatIds] : this.agent.getActiveChatIds();
      for (const chatId of targets) {
        try {
          const reply = await this.agent.runHeartbeat(chatId, HEARTBEAT_PROMPT);
          if (reply.toUpperCase().includes(HEARTBEAT_SILENT)) continue;
          await this.outbound.send(chatId, reply);
          console.log(`[heartbeat] pesan proaktif terkirim ke ${chatId}`);
        } catch (error) {
          console.error(`[heartbeat] gagal memproses ${chatId}:`, error);
        }
      }
    } finally {
      this.running = false;
    }
  }
}
