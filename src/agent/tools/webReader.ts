import type { ToolHandler } from './types.js';
import { FETCH_HEADERS, decodeEntities, normalizeWhitespace, stripTags } from './utils.js';

/** Panjang maksimal isi halaman yang dikirim ke model (karakter). */
const MAX_CONTENT = 3500;

/** Tool untuk membaca isi halaman web sebagai teks bersih. */
export const webReaderTool: ToolHandler = {
  definition: {
    type: 'function',
    function: {
      name: 'fetch_webpage',
      description:
        'Membaca isi sebuah halaman web dan mengembalikannya sebagai teks bersih. Gunakan setelah web_search untuk membaca detail dari URL yang ditemukan, atau saat pengguna memberikan link.',
      parameters: {
        type: 'object',
        required: ['url'],
        properties: {
          url: { type: 'string', description: 'URL lengkap diawali http:// atau https://' },
        },
      },
    },
  },
  async execute(args) {
    const url = String(args.url ?? '').trim();
    if (!/^https?:\/\//i.test(url)) {
      return 'URL tidak valid. Harus diawali http:// atau https://';
    }

    try {
      const res = await fetch(url, {
        headers: FETCH_HEADERS,
        redirect: 'follow',
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) return `Gagal membuka halaman (HTTP ${res.status}).`;

      const contentType = res.headers.get('content-type') ?? '';
      if (!/text|json|xml/i.test(contentType)) {
        return `Konten bertipe "${contentType}", bukan halaman teks yang bisa dibaca.`;
      }

      let html = await res.text();
      const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];

      html = html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(p|div|section|article|header|footer|li|ul|ol|h[1-6]|tr|table)>/gi, '\n');

      const text = normalizeWhitespace(decodeEntities(stripTags(html)));
      if (!text) return 'Halaman berhasil dibuka tetapi tidak ada teks yang bisa diekstrak.';

      const header = `${title ? `Judul: ${normalizeWhitespace(decodeEntities(title))}\n` : ''}URL: ${res.url}\n\n`;
      const body =
        text.length > MAX_CONTENT
          ? `${text.slice(0, MAX_CONTENT)}\n\n... (dipotong, total ${text.length} karakter)`
          : text;
      return header + body;
    } catch (error) {
      return `Gagal membaca halaman: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
};
