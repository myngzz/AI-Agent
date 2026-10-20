/**
 * Smoke test: kirim beberapa pertanyaan ke agent dan tampilkan jawabannya.
 * Memastikan koneksi Ollama + tool calling berfungsi tanpa perlu channel chat.
 * Jalankan: npm run smoke
 */
import { rmSync } from 'node:fs';
import { Agent } from '../src/agent/agent.js';
import { config } from '../src/config.js';
import { OutboundDispatcher } from '../src/services/outbound.js';
import { Scheduler } from '../src/services/scheduler.js';

const DATA_FILE = '/tmp/ai-agent-smoke-scheduler.json';

const QUESTIONS = [
  'Jam berapa sekarang dan hari apa?',
  'Berapa 15% dari 250000?',
  'Bagaimana cuaca di Jakarta saat ini?',
  'Ingatkan saya 30 menit lagi untuk minum air.',
  'Pengingat apa saja yang aktif untuk saya?',
];

async function main(): Promise<void> {
  console.log(`Smoke test — model: ${config.ollama.model} @ ${config.ollama.host}\n`);

  rmSync(DATA_FILE, { force: true });

  // Pesan terjadwal ditangkap stub agar bisa diverifikasi.
  const sent: string[] = [];
  const outbound = new OutboundDispatcher();
  outbound.register('smoke', {
    send: async (_rawId, text) => {
      sent.push(text);
    },
  });
  const scheduler = new Scheduler(outbound, {
    dataFile: DATA_FILE,
    digestTime: config.newsDigestTime,
    timezone: config.timezone,
  });
  scheduler.start();

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

  let failures = 0;
  for (const question of QUESTIONS) {
    console.log(`User  : ${question}`);
    try {
      const reply = await agent.handleMessage('smoke:test', question);
      console.log(`Agent : ${reply}\n`);
    } catch (error) {
      failures++;
      console.error(`ERROR : ${error instanceof Error ? error.message : String(error)}\n`);
    }
  }

  // Verifikasi sisi scheduler: pengingat harus benar-benar tersimpan.
  const pending = scheduler.listReminders('smoke:test');
  console.log(`Pengingat tersimpan untuk smoke:test: ${pending.length}`);
  for (const r of pending) console.log(`  - [${r.id}] ${r.runAt} — ${r.message}`);

  scheduler.stop();
  rmSync(DATA_FILE, { force: true });

  if (failures > 0) {
    console.error(`${failures}/${QUESTIONS.length} pertanyaan gagal.`);
    process.exit(1);
  }
  console.log('Semua pertanyaan berhasil dijawab.');
}

main().catch((error: unknown) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
