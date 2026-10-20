import type { ToolHandler } from './types.js';
import { FETCH_HEADERS, decodeEntities, normalizeWhitespace, stripTags } from './utils.js';

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

/** Scrape halaman hasil DuckDuckGo versi HTML (tanpa API key). */
async function searchDuckDuckGo(query: string, maxResults: number): Promise<SearchResult[]> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: FETCH_HEADERS, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`DuckDuckGo menjawab HTTP ${res.status}`);
  const html = await res.text();

  const anchors = [...html.matchAll(/<a\b[^>]*class="result__a"[^>]*>([\s\S]*?)<\/a>/g)];
  const snippets = [...html.matchAll(/<a\b[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g)];

  const results: SearchResult[] = [];
  for (let i = 0; i < anchors.length && results.length < maxResults; i++) {
    const openTag = /<a\b[^>]*>/.exec(anchors[i][0])?.[0] ?? '';
    const rawHref = decodeEntities(/href="([^"]+)"/.exec(openTag)?.[1] ?? '');
    // Link DuckDuckGo berupa redirect: //duckduckgo.com/l/?uddg=<url-terencode>
    const uddg = /[?&]uddg=([^&]+)/.exec(rawHref);
    const link = uddg ? decodeURIComponent(uddg[1]) : rawHref;
    if (!link.startsWith('http')) continue;

    results.push({
      title: normalizeWhitespace(decodeEntities(stripTags(anchors[i][1]))),
      url: link,
      snippet: snippets[i] ? normalizeWhitespace(decodeEntities(stripTags(snippets[i][1]))) : '',
    });
  }
  return results;
}

/** Fallback: DuckDuckGo Instant Answer API (jawaban ringkas, tanpa API key). */
async function instantAnswer(query: string): Promise<string | null> {
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
  const res = await fetch(url, { headers: FETCH_HEADERS, signal: AbortSignal.timeout(15000) });
  if (!res.ok) return null;
  const data = (await res.json()) as { AbstractText?: string; AbstractURL?: string };
  if (!data.AbstractText) return null;
  return data.AbstractURL ? `${data.AbstractText}\nSumber: ${data.AbstractURL}` : data.AbstractText;
}

/** Tool pencarian web gratis tanpa API key. */
export const webSearchTool: ToolHandler = {
  definition: {
    type: 'function',
    function: {
      name: 'web_search',
      description:
        'Mencari informasi di internet via DuckDuckGo. Gunakan untuk berita, fakta terkini, atau hal yang tidak kamu ketahui. Hasil berupa daftar judul, URL, dan cuplikan.',
      parameters: {
        type: 'object',
        required: ['query'],
        properties: {
          query: { type: 'string', description: 'Kata kunci pencarian yang spesifik.' },
          max_results: { type: 'number', description: 'Jumlah hasil maksimal (default 5, maks 8).' },
        },
      },
    },
  },
  async execute(args) {
    const query = String(args.query ?? '').trim();
    if (!query) return 'Query pencarian kosong.';
    const maxResults = Math.min(Math.max(Number(args.max_results) || 5, 1), 8);

    try {
      const results = await searchDuckDuckGo(query, maxResults);
      if (results.length > 0) {
        const lines = results.map(
          (r, i) => `${i + 1}. ${r.title}\n   ${r.url}${r.snippet ? `\n   ${r.snippet}` : ''}`,
        );
        return `Hasil pencarian untuk "${query}":\n\n${lines.join('\n\n')}`;
      }
      // Fallback ke instant answer bila scraping tidak menemukan hasil.
      const answer = await instantAnswer(query);
      if (answer) return `Jawaban untuk "${query}":\n${answer}`;
      return `Tidak ditemukan hasil untuk "${query}". Coba kata kunci lain.`;
    } catch (error) {
      const answer = await instantAnswer(query).catch(() => null);
      if (answer) return `Jawaban untuk "${query}":\n${answer}`;
      return `Pencarian gagal: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
};
