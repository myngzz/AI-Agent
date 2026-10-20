/**
 * Pengujian cepat scheduler (tanpa LLM): pengiriman pengingat, persistensi,
 * pembatalan, dan langganan berita. Jalankan: npm run test:scheduler
 */
import { rmSync } from 'node:fs';
import { OutboundDispatcher } from '../src/services/outbound.js';
import { Scheduler } from '../src/services/scheduler.js';

const DATA_FILE = '/tmp/ai-agent-test-scheduler.json';
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`GAGAL: ${message}`);
    process.exit(1);
  }
  console.log(`OK: ${message}`);
}

async function main(): Promise<void> {
  rmSync(DATA_FILE, { force: true });

  const sent: Array<{ rawId: string; text: string }> = [];
  const outbound = new OutboundDispatcher();
  outbound.register('test', {
    send: async (rawId, text) => {
      sent.push({ rawId, text });
    },
  });

  const options = { dataFile: DATA_FILE, digestTime: '23:59', timezone: 'Asia/Jakarta', tickMs: 200 };

  // 1. Pengingat jatuh tempo harus terkirim lalu terhapus.
  const scheduler = new Scheduler(outbound, options);
  scheduler.addReminder('test:chat1', 'Minum air', new Date(Date.now() + 500));
  scheduler.start();
  await sleep(1500);
  assert(sent.length === 1 && sent[0].text.includes('Minum air'), 'pengingat jatuh tempo terkirim');
  assert(sent[0].rawId === 'chat1', 'rawId diteruskan dengan benar (tanpa prefix)');
  assert(scheduler.listReminders('test:chat1').length === 0, 'pengingat terkirim dihapus dari daftar');

  // 2. Persistensi: instance baru memuat pengingat dari file.
  scheduler.addReminder('test:chat1', 'Belum jatuh tempo', new Date(Date.now() + 3_600_000));
  scheduler.stop();
  const scheduler2 = new Scheduler(outbound, options);
  scheduler2.start();
  assert(scheduler2.listReminders('test:chat1').length === 1, 'pengingat termuat dari file setelah restart');

  // 3. Pembatalan pengingat.
  const [pending] = scheduler2.listReminders('test:chat1');
  assert(scheduler2.cancelReminder('test:chat1', pending.id), 'pembatalan pengingat berhasil');
  assert(scheduler2.listReminders('test:chat1').length === 0, 'daftar kosong setelah dibatalkan');
  assert(!scheduler2.cancelReminder('test:chat1', 'tidak-ada'), 'pembatalan ID tak dikenal mengembalikan false');

  // 4. Langganan berita.
  assert(scheduler2.subscribeNews('test:chat1'), 'langganan pertama berhasil');
  assert(!scheduler2.subscribeNews('test:chat1'), 'langganan ganda ditolak');
  assert(scheduler2.unsubscribeNews('test:chat1'), 'berhenti langganan berhasil');
  assert(!scheduler2.unsubscribeNews('test:chat1'), 'berhenti tanpa langganan mengembalikan false');
  scheduler2.stop();

  // 5. Dispatcher menolak prefix tak dikenal.
  let rejected = false;
  try {
    await outbound.send('unknown:123', 'tes');
  } catch {
    rejected = true;
  }
  assert(rejected, 'dispatcher menolak prefix yang tidak terdaftar');

  rmSync(DATA_FILE, { force: true });
  console.log('\nSemua pengujian scheduler lolos ✅');
}

main().catch((error: unknown) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
