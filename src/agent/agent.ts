import { Ollama } from 'ollama';
import type { ChatResponse, Message, Tool } from 'ollama';
import type { Scheduler } from '../services/scheduler.js';
import { createTools } from './tools/index.js';
import type { ToolContext, ToolHandler } from './tools/types.js';

export interface AgentOptions {
  host: string;
  model: string;
  systemPrompt: string;
  timezone: string;
  maxHistory: number;
  maxToolIterations: number;
  /** Bila diisi, tools pengingat & langganan berita ikut didaftarkan. */
  scheduler?: Scheduler;
  newsDigestTime?: string;
  /** Batas konteks model (token). 0/kosong = default model. Kecilkan untuk hemat RAM. */
  numCtx?: number;
}

/**
 * Inti agent: menerima pesan teks, memanggil LLM Ollama dengan tool calling,
 * mengeksekusi tool yang diminta model, lalu mengembalikan jawaban akhir.
 */
export class Agent {
  private readonly client: Ollama;
  private readonly tools: Tool[];
  private readonly handlers: Map<string, ToolHandler>;
  /** Riwayat percakapan per chat (chatId sudah diprefix channel, mis. "tg:123"). */
  private readonly histories = new Map<string, Message[]>();

  constructor(private readonly options: AgentOptions) {
    this.client = new Ollama({ host: options.host });
    const { definitions, handlers } = createTools(options.timezone, options.scheduler, options.newsDigestTime);
    this.tools = definitions;
    this.handlers = handlers;
  }

  /** Proses satu pesan dari pengguna dan kembalikan jawaban agent. */
  async handleMessage(chatId: string, text: string): Promise<string> {
    const history = this.getHistory(chatId);
    history.push({ role: 'user', content: text });

    try {
      const reply = await this.runLoop(history, chatId);
      this.trimHistory(chatId);
      return reply;
    } catch (error) {
      // Buang pesan user yang gagal diproses agar bisa dicoba ulang dengan bersih.
      history.pop();
      throw toFriendlyError(error);
    }
  }

  /** Prompt satu kali tanpa riwayat tersimpan — dipakai tugas terjadwal seperti digest berita. */
  async askOnce(prompt: string): Promise<string> {
    return this.runLoop([{ role: 'user', content: prompt }], 'system:scheduler');
  }

  private getHistory(chatId: string): Message[] {
    let history = this.histories.get(chatId);
    if (!history) {
      history = [];
      this.histories.set(chatId, history);
    }
    return history;
  }

  private trimHistory(chatId: string): void {
    const history = this.histories.get(chatId);
    if (history && history.length > this.options.maxHistory) {
      this.histories.set(chatId, history.slice(-this.options.maxHistory));
    }
  }

  /** Loop tool calling: panggil model → eksekusi tool bila diminta → ulangi sampai ada jawaban akhir. */
  private async runLoop(history: Message[], chatId: string): Promise<string> {
    const context: ToolContext = { chatId };

    for (let iteration = 0; iteration < this.options.maxToolIterations; iteration++) {
      const response = await this.chatWithRetry([
        { role: 'system', content: this.options.systemPrompt },
        ...history,
      ]);
      const message = response.message;
      history.push(message);

      const toolCalls = message.tool_calls ?? [];
      if (toolCalls.length === 0) {
        return message.content.trim() || '(model tidak memberikan jawaban)';
      }

      for (const call of toolCalls) {
        const result = await this.executeTool(call.function.name, call.function.arguments ?? {}, context);
        history.push({ role: 'tool', tool_name: call.function.name, content: result } as Message);
      }
    }

    const fallback =
      'Maaf, tugas ini memerlukan terlalu banyak langkah. Coba pecah menjadi permintaan yang lebih kecil.';
    history.push({ role: 'assistant', content: fallback });
    return fallback;
  }

  /**
   * Panggil model dengan satu kali retry bila runner lokal terputus di tengah jalan
   * (umum pada LLM lokal di mesin ber-RAM pas-pasan: "unexpected EOF", runner stopped).
   */
  private async chatWithRetry(messages: Message[]): Promise<ChatResponse> {
    const request = {
      model: this.options.model,
      messages,
      tools: this.tools,
      ...(this.options.numCtx ? { options: { num_ctx: this.options.numCtx } } : {}),
    };
    try {
      return await this.client.chat(request);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/unexpected EOF|runner.{0,20}(stop|die|crash|exit)|connection reset/i.test(message)) {
        throw error;
      }
      console.warn('[agent] respons model terputus — mencoba ulang sekali dalam 3 detik...');
      await new Promise((resolve) => setTimeout(resolve, 3000));
      return this.client.chat(request);
    }
  }

  private async executeTool(name: string, args: Record<string, unknown>, context: ToolContext): Promise<string> {
    const handler = this.handlers.get(name);
    if (!handler) return `Tool "${name}" tidak dikenal.`;

    try {
      console.log(`[tool] ${name}(${JSON.stringify(args)})`);
      const result = await handler.execute(args, context);
      console.log(`[tool] ${name} → ${result.slice(0, 120)}${result.length > 120 ? '…' : ''}`);
      return result;
    } catch (error) {
      return `Tool "${name}" gagal: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
}

/** Ubah error teknis menjadi pesan yang bisa ditindaklanjuti pengguna. */
function toFriendlyError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  if (/ECONNREFUSED|fetch failed|connect ECONN/i.test(message)) {
    return new Error(
      'Tidak dapat terhubung ke Ollama. Pastikan Ollama sedang berjalan (ollama serve) dan OLLAMA_HOST di .env sudah benar.',
    );
  }
  if (/model .* (not found|does not exist)/i.test(message)) {
    return new Error('Model belum tersedia di Ollama. Jalankan: ollama pull <nama-model>');
  }
  return error instanceof Error ? error : new Error(message);
}
