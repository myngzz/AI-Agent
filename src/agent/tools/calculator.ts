import type { ToolHandler } from './types.js';

// Hanya angka, spasi, dan operator dasar yang boleh masuk evaluasi.
const ALLOWED = /^[0-9+\-*/().\s%]*$/;

/** Tool kalkulator untuk perhitungan matematika yang akurat. */
export const calculatorTool: ToolHandler = {
  definition: {
    type: 'function',
    function: {
      name: 'calculator',
      description:
        'Menghitung ekspresi matematika, mis. "12 * (3 + 4)" atau "250000 * 15 / 100". Gunakan untuk semua perhitungan agar hasil akurat.',
      parameters: {
        type: 'object',
        required: ['expression'],
        properties: {
          expression: {
            type: 'string',
            description: 'Ekspresi matematika. Hanya angka dan operator + - * / % ( ) .',
          },
        },
      },
    },
  },
  async execute(args) {
    const raw = String(args.expression ?? '');
    const expression = raw.replace(/,/g, '.').replace(/\^/g, '**').trim();

    if (expression.length === 0 || expression.length > 200 || !ALLOWED.test(expression)) {
      return 'Ekspresi tidak valid. Hanya angka dan operator + - * / % ( ) . yang diperbolehkan.';
    }

    try {
      // Aman: whitelist karakter di atas memastikan tidak ada identifier atau pemanggilan fungsi.
      const result = Function(`"use strict"; return (${expression});`)() as unknown;
      if (typeof result !== 'number' || Number.isNaN(result)) {
        return 'Hasil perhitungan tidak valid.';
      }
      if (!Number.isFinite(result)) {
        return 'Hasil perhitungan tak terhingga (misalnya pembagian dengan nol).';
      }
      // Hindari artefak floating point seperti 0.30000000000000004.
      const rounded = Math.abs(result) < 1e-12 ? 0 : Number(result.toPrecision(12));
      return `${raw.trim()} = ${rounded}`;
    } catch {
      return 'Ekspresi tidak dapat dihitung. Periksa kembali tanda kurung dan operator.';
    }
  },
};
