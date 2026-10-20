import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { OutboundDispatcher } from './outbound.js';

export interface Reminder {
  id: string;
  chatId: string;
  message: string;
  /** Waktu pengiriman dalam ISO 8601 (UTC). */
  runAt: string;
  createdAt: string;
}

interface SchedulerData {
  reminders: Reminder[];
  newsSubscribers: string[];
  /** Tanggal digest terakhir dikirim (YYYY-MM-DD, waktu lokal). */
  lastDigestDate: string | null;
}

export interface SchedulerOptions {
  dataFile: string;
  /** Jam pengiriman digest harian, format "HH:MM" waktu lokal. */
  digestTime: string;
  timezone: string;
  /** Interval pengecekan (ms). Default 15 detik. */
  tickMs?: number;
}

/** Prompt yang dipakai agent untuk membuat ringkasan berita harian. */
export const DIGEST_PROMPT = `Buatkan ringkasan berita harian dalam Bahasa Indonesia.
Langkah:
1. Gunakan tool web_search 2-3 kali dengan query seperti "berita terkini Indonesia hari ini", "berita teknologi terbaru", "berita dunia hari ini".
2. Pilih maksimal 5 berita paling penting dan menarik dari hasil pencarian.
3. Sajikan dengan format:
📰 Ringkasan Berita Harian
1. <judul singkat> — <ringkasan 1-2 kalimat> (<nama sumber>)
Tetap ringkas dan faktual; jangan menambahkan informasi di luar hasil pencarian.`;

/**
 * Penjadwal tugas proaktif:
 * - Pengingat satu kali (disetel pengguna lewat tool set_reminder).
 * - Ringkasan berita harian untuk chat yang berlangganan.
 * Data disimpan ke file JSON agar tahan restart.
 */
export class Scheduler {
  private data: SchedulerData = { reminders: [], newsSubscribers: [], lastDigestDate: null };
  private timer?: NodeJS.Timeout;
  private digestGenerator?: () => Promise<string>;
  private counter = 0;

  constructor(
    private readonly outbound: OutboundDispatcher,
    private readonly options: SchedulerOptions,
  ) {}

  /** Fungsi yang menghasilkan isi digest (biasanya agent.askOnce). Dipasang setelah agent dibuat. */
  setDigestGenerator(generator: () => Promise<string>): void {
    this.digestGenerator = generator;
  }

  start(): void {
    if (this.timer) return;
    this.load();
    const tickMs = this.options.tickMs ?? 15_000;
    this.timer = setInterval(() => {
      void this.tick();
    }, tickMs);
    // Jangan menahan proses tetap hidup hanya karena timer ini.
    this.timer.unref();
    console.log(
      `[scheduler] aktif — ${this.data.reminders.length} pengingat tersimpan, ` +
        `${this.data.newsSubscribers.length} pelanggan berita (kirim ${this.options.digestTime})`,
    );
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  // ===== Pengingat =====

  addReminder(chatId: string, message: string, runAt: Date): Reminder {
    const reminder: Reminder = {
      id: `r${Date.now().toString(36)}${(this.counter++).toString(36)}`,
      chatId,
      message,
      runAt: runAt.toISOString(),
      createdAt: new Date().toISOString(),
    };
    this.data.reminders.push(reminder);
    this.save();
    return reminder;
  }

  listReminders(chatId: string): Reminder[] {
    return this.data.reminders
      .filter((r) => r.chatId === chatId)
      .sort((a, b) => a.runAt.localeCompare(b.runAt));
  }

  cancelReminder(chatId: string, id: string): boolean {
    const before = this.data.reminders.length;
    this.data.reminders = this.data.reminders.filter((r) => !(r.chatId === chatId && r.id === id));
    const removed = this.data.reminders.length < before;
    if (removed) this.save();
    return removed;
  }

  // ===== Langganan berita =====

  subscribeNews(chatId: string): boolean {
    if (this.data.newsSubscribers.includes(chatId)) return false;
    this.data.newsSubscribers.push(chatId);
    this.save();
    return true;
  }

  unsubscribeNews(chatId: string): boolean {
    const before = this.data.newsSubscribers.length;
    this.data.newsSubscribers = this.data.newsSubscribers.filter((id) => id !== chatId);
    const removed = this.data.newsSubscribers.length < before;
    if (removed) this.save();
    return removed;
  }

  // ===== Mesin penjadwal =====

  private async tick(): Promise<void> {
    const now = new Date();

    // 1. Kirim pengingat yang jatuh tempo (termasuk yang terlewat saat offline).
    const due = this.data.reminders.filter((r) => new Date(r.runAt) <= now);
    for (const reminder of due) {
      try {
        await this.outbound.send(reminder.chatId, `⏰ Pengingat: ${reminder.message}`);
        console.log(`[scheduler] pengingat ${reminder.id} terkirim ke ${reminder.chatId}`);
      } catch (error) {
        console.error(`[scheduler] gagal mengirim pengingat ${reminder.id}:`, error);
      }
      this.data.reminders = this.data.reminders.filter((r) => r.id !== reminder.id);
    }
    if (due.length > 0) this.save();

    // 2. Digest berita harian.
    if (this.digestGenerator && this.data.newsSubscribers.length > 0) {
      const timeNow = this.localTime();
      const today = this.localDate();
      if (timeNow >= this.options.digestTime && this.data.lastDigestDate !== today) {
        this.data.lastDigestDate = today;
        this.save();
        await this.sendDigest();
      }
    }
  }

  private async sendDigest(): Promise<void> {
    if (!this.digestGenerator) return;
    try {
      console.log('[scheduler] membuat ringkasan berita harian...');
      const digest = await this.digestGenerator();
      for (const chatId of this.data.newsSubscribers) {
        try {
          await this.outbound.send(chatId, digest);
          console.log(`[scheduler] digest terkirim ke ${chatId}`);
        } catch (error) {
          console.error(`[scheduler] gagal mengirim digest ke ${chatId}:`, error);
        }
      }
    } catch (error) {
      console.error('[scheduler] gagal membuat digest:', error);
    }
  }

  /** Jam:menit sekarang dalam timezone konfigurasi, format "HH:MM". */
  private localTime(): string {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: this.options.timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date());
  }

  /** Tanggal sekarang dalam timezone konfigurasi, format "YYYY-MM-DD". */
  private localDate(): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: this.options.timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  }

  // ===== Persistensi =====

  private load(): void {
    try {
      if (!existsSync(this.options.dataFile)) return;
      const parsed = JSON.parse(readFileSync(this.options.dataFile, 'utf8')) as Partial<SchedulerData>;
      this.data.reminders = Array.isArray(parsed.reminders) ? parsed.reminders : [];
      this.data.newsSubscribers = Array.isArray(parsed.newsSubscribers) ? parsed.newsSubscribers : [];
      this.data.lastDigestDate = typeof parsed.lastDigestDate === 'string' ? parsed.lastDigestDate : null;
    } catch (error) {
      console.error('[scheduler] gagal memuat data, mulai dari kosong:', error);
    }
  }

  private save(): void {
    try {
      mkdirSync(dirname(this.options.dataFile), { recursive: true });
      writeFileSync(this.options.dataFile, JSON.stringify(this.data, null, 2));
    } catch (error) {
      console.error('[scheduler] gagal menyimpan data:', error);
    }
  }
}
