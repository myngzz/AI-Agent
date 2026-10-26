import { Ollama } from 'ollama';
import type { ChatResponse, Message, Tool } from 'ollama';
import type { StreamCallback } from '../channels/base.js';
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

  /**
   * Proses satu pesan dari pengguna dan kembalikan jawaban agent.
   * Bila onStream diisi, jawaban akhir dikirim bertahap (teks terakumulasi) lewat callback itu.
   */
  async handleMessage(chatId: string, text: string, onStream?: StreamCallback): Promise<string> {
    const history = this.getHistory(chatId);
    history.push({ role: 'user', content: text });

    try {
      const reply = await this.runLoop(history, chatId, onStream);
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

  /** Daftar chatId yang pernah berinteraksi sejak proses menyala (dipakai heartbeat). */
  getActiveChatIds(): string[] {
    return [...this.histories.keys()];
  }

  /**
   * Jalankan satu detak heartbeat pada konteks chat tertentu (non-streaming).
   * Pertukaran heartbeat TIDAK disimpan ke riwayat agar tidak mengotori percakapan.
   */
  async runHeartbeat(chatId: string, prompt: string): Promise<string> {
    const history = this.getHistory(chatId);
    const keep = history.length;
    history.push({ role: 'user', content: prompt });
    try {
      return await this.runLoop(history, chatId);
    } catch (error) {
      throw toFriendlyError(error);
    } finally {
      history.length = keep;
    }
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
  private async runLoop(history: Message[], chatId: string, onStream?: StreamCallback): Promise<string> {
    const context: ToolContext = { chatId };

    for (let iteration = 0; iteration < this.options.maxToolIterations; iteration++) {
      const messages: Message[] = [{ role: 'system', content: this.options.systemPrompt }, ...history];
      // Mode streaming: token jawaban diteruskan ke pemanggil begitu diterima dari model.
      // Tool calls tetap dikumpulkan sampai stream selesai lalu dieksekusi seperti biasa.
      const message = onStream
        ? await this.chatStreamWithRetry(messages, onStream)
        : (await this.chatWithRetry(messages)).message;
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

  /**
   * Versi streaming dari chatWithRetry: token jawaban diteruskan ke onToken begitu diterima.
   * Retry hanya dilakukan bila belum ada token yang terkirim (agar teks tidak terkirim ganda).
   */
  private async chatStreamWithRetry(messages: Message[], onToken: StreamCallback): Promise<Message> {
    let emitted = false;

    const streamOnce = async (): Promise<Message> => {
      const stream = await this.client.chat({
        model: this.options.model,
        messages,
        tools: this.tools,
        stream: true,
        ...(this.options.numCtx ? { options: { num_ctx: this.options.numCtx } } : {}),
      });

      let content = '';
      const toolCalls: NonNullable<Message['tool_calls']> = [];
      for await (const chunk of stream) {
        if (chunk.message.content) {
          content += chunk.message.content;
          emitted = true;
          onToken(content);
        }
        // Tool calls tiba utuh (biasanya di chunk akhir), bukan per-token.
        if (chunk.message.tool_calls?.length) toolCalls.push(...chunk.message.tool_calls);
      }

      const message: Message = { role: 'assistant', content };
      if (toolCalls.length > 0) message.tool_calls = toolCalls;
      return message;
    };

    try {
      return await streamOnce();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (emitted || !/unexpected EOF|runner.{0,20}(stop|die|crash|exit)|connection reset/i.test(message)) {
        throw error;
      }
      console.warn('[agent] stream model terputus — mencoba ulang sekali dalam 3 detik...');
      await new Promise((resolve) => setTimeout(resolve, 3000));
      return streamOnce();
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
