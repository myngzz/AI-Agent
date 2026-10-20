/** Hapus seluruh tag HTML dari string. */
export function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, ' ');
}

/** Decode entitas HTML yang umum muncul di hasil pencarian / halaman web. */
export function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&#x27;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code: string) => String.fromCodePoint(parseInt(code, 16)));
}

/** Rapikan whitespace hasil ekstraksi HTML. */
export function normalizeWhitespace(text: string): string {
  return text
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Header HTTP agar request tool terlihat seperti browser biasa. */
export const FETCH_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml,application/json;q=0.9',
  'Accept-Language': 'id-ID,id;q=0.9,en;q=0.8',
};
