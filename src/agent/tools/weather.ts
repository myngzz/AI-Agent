import type { ToolHandler } from './types.js';
import { FETCH_HEADERS } from './utils.js';

/** Kode cuaca WMO → deskripsi Bahasa Indonesia. */
const WMO_CODES: Record<number, string> = {
  0: 'Cerah',
  1: 'Cerah berawan',
  2: 'Berawan sebagian',
  3: 'Berawan',
  45: 'Berkabut',
  48: 'Kabut beku',
  51: 'Gerimis ringan',
  53: 'Gerimis',
  55: 'Gerimis lebat',
  56: 'Gerimis beku',
  57: 'Gerimis beku lebat',
  61: 'Hujan ringan',
  63: 'Hujan sedang',
  65: 'Hujan deras',
  66: 'Hujan beku',
  67: 'Hujan beku deras',
  71: 'Salju ringan',
  73: 'Salju sedang',
  75: 'Salju lebat',
  77: 'Butiran salju',
  80: 'Hujan lokal ringan',
  81: 'Hujan lokal',
  82: 'Hujan lokal deras',
  85: 'Hujan salju ringan',
  86: 'Hujan salju lebat',
  95: 'Badai petir',
  96: 'Badai petir dengan es ringan',
  99: 'Badai petir dengan es',
};

interface GeocodingResponse {
  results?: Array<{ latitude: number; longitude: number; name: string; country?: string }>;
}

interface ForecastResponse {
  current?: {
    temperature_2m: number;
    relative_humidity_2m: number;
    apparent_temperature: number;
    weather_code: number;
    wind_speed_10m: number;
  };
}

/** Tool cuaca gratis via Open-Meteo (tanpa API key). */
export const weatherTool: ToolHandler = {
  definition: {
    type: 'function',
    function: {
      name: 'get_weather',
      description: 'Mengecek kondisi cuaca saat ini di sebuah kota. Gunakan saat pengguna menanyakan cuaca.',
      parameters: {
        type: 'object',
        required: ['city'],
        properties: {
          city: { type: 'string', description: 'Nama kota, mis. "Jakarta" atau "Bandung".' },
        },
      },
    },
  },
  async execute(args) {
    const city = String(args.city ?? '').trim();
    if (!city) return 'Nama kota kosong.';

    try {
      const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=id&format=json`;
      const geoRes = await fetch(geoUrl, { headers: FETCH_HEADERS, signal: AbortSignal.timeout(15000) });
      const geo = (await geoRes.json()) as GeocodingResponse;
      const place = geo.results?.[0];
      if (!place) return `Kota "${city}" tidak ditemukan.`;

      const wxUrl =
        `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}` +
        `&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&timezone=auto`;
      const wxRes = await fetch(wxUrl, { headers: FETCH_HEADERS, signal: AbortSignal.timeout(15000) });
      const wx = (await wxRes.json()) as ForecastResponse;
      const current = wx.current;
      if (!current) return 'Data cuaca tidak tersedia saat ini.';

      const desc = WMO_CODES[current.weather_code] ?? `Kode cuaca ${current.weather_code}`;
      return (
        `Cuaca di ${place.name}${place.country ? `, ${place.country}` : ''}: ${desc}, ` +
        `suhu ${current.temperature_2m}°C (terasa ${current.apparent_temperature}°C), ` +
        `kelembapan ${current.relative_humidity_2m}%, angin ${current.wind_speed_10m} km/jam.`
      );
    } catch (error) {
      return `Gagal mengambil data cuaca: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
};
