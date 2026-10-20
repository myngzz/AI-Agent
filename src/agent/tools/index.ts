import type { Tool } from 'ollama';
import type { Scheduler } from '../../services/scheduler.js';
import type { ToolHandler } from './types.js';
import { calculatorTool } from './calculator.js';
import { createDatetimeTool } from './datetime.js';
import { createNewsTools } from './news.js';
import { createReminderTools } from './reminder.js';
import { weatherTool } from './weather.js';
import { webReaderTool } from './webReader.js';
import { webSearchTool } from './webSearch.js';

export interface ToolRegistry {
  /** Daftar definisi tool untuk dikirim ke Ollama. */
  definitions: Tool[];
  /** Map nama tool → handler eksekusinya. */
  handlers: Map<string, ToolHandler>;
}

/** Registrasi semua tool yang tersedia bagi agent. Tambahkan tool baru di sini. */
export function createTools(timezone: string, scheduler?: Scheduler, digestTime = '07:00'): ToolRegistry {
  const list: ToolHandler[] = [
    createDatetimeTool(timezone),
    calculatorTool,
    webSearchTool,
    webReaderTool,
    weatherTool,
  ];
  // Tool stateful per-chat (pengingat & langganan berita) hanya aktif bila scheduler tersedia.
  if (scheduler) {
    list.push(...createReminderTools(scheduler, timezone));
    list.push(...createNewsTools(scheduler, digestTime));
  }
  return {
    definitions: list.map((tool) => tool.definition),
    handlers: new Map(list.map((tool) => [tool.definition.function.name ?? '', tool])),
  };
}
