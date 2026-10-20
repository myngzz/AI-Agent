import * as readline from 'node:readline/promises';
import { Agent } from './agent/agent.js';
import { config } from './config.js';
import { OutboundDispatcher } from './services/outbound.js';
import { DIGEST_PROMPT, Scheduler } from './services/scheduler.js';

/**
 * Mode chat via terminal — cara cepat mencoba agent tanpa Telegram/WhatsApp.
 * Jalankan: npm run chat
 */
async function main(): Promise<void> {
  console.log('=== Chat dengan AI Agent (terminal) ===');
  console.log(`Model: ${config.ollama.model} @ ${config.ollama.host}`);
  console.log('Ketik pesan lalu Enter. Ketik "exit" untuk keluar.\n');

  // Pesan terjadwal (pengingat/digest) dicetak langsung ke terminal.
  const outbound = new OutboundDispatcher();
  outbound.register('cli', {
    send: async (_rawId, text) => {
      console.log(`\n[🔔 Pesan terjadwal]\n${text}\n`);
    },
  });
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
  scheduler.start();

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  // Mendukung input interaktif maupun piped (echo "..." | npm run chat).
  rl.on('close', () => process.exit(0));

  for (;;) {
    const line = (await rl.question('Anda: ')).trim();
    if (['exit', 'quit', 'keluar'].includes(line.toLowerCase())) break;
    if (!line) continue;

    try {
      const reply = await agent.handleMessage('cli:local', line);
      console.log(`Agent: ${reply}\n`);
    } catch (error) {
      console.error(`Error: ${error instanceof Error ? error.message : String(error)}\n`);
    }
  }

  rl.close();
}

main().catch((error: unknown) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
