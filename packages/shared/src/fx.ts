import { z } from 'zod';

/** Précision des taux : 8 décimales (numeric(18,8) en base). */
export const RATE_SCALE = 100_000_000n;

/** Paires gérées : le dollar est la devise de référence (décision G9). */
export const FX_PAIRS = ['USD_CDF', 'USD_CNY'] as const;
export type FxPair = (typeof FX_PAIRS)[number];

/** « 2850.5 » ou « 2 850,5 » → taux entier à 8 décimales. Null si invalide. */
export function parseRate(input: string): bigint | null {
  const s = input.replace(/[\s\u00a0\u202f]/g, '').replace(',', '.');
  const m = s.match(/^(\d{1,10})(?:\.(\d{1,8}))?$/);
  if (!m) return null;
  const rate = BigInt(m[1]!) * RATE_SCALE + BigInt((m[2] ?? '').padEnd(8, '0'));
  return rate > 0n ? rate : null;
}

export function formatRate(rate: bigint): string {
  const whole = rate / RATE_SCALE;
  const frac = (rate % RATE_SCALE).toString().padStart(8, '0').replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : `${whole}`;
}

/** Arrondi au plus proche (demi vers le haut) d'une division entière positive ou négative. */
function divRound(n: bigint, d: bigint): bigint {
  const q = n / d;
  const r = n % d;
  if (r === 0n) return q;
  const up = (r < 0n ? -r : r) * 2n >= d;
  return up ? q + (n < 0n ? -1n : 1n) : q;
}

/** Montant en unité mineure de la devise de base → devise cotée (ex. centimes USD → centimes CDF). */
export function convertMinor(amount: bigint, rate: bigint): bigint {
  return divRound(amount * rate, RATE_SCALE);
}

/** Conversion inverse (ex. centimes CNY → centimes USD). */
export function convertMinorInverse(amount: bigint, rate: bigint): bigint {
  return divRound(amount * RATE_SCALE, rate);
}

export const CreateRateSchema = z.object({
  pair: z.enum(FX_PAIRS),
  rate: z
    .string()
    .trim()
    .refine((v) => parseRate(v) !== null, 'Taux invalide (ex. 2850 ou 2850,5).'),
  source: z.string().trim().min(2, 'Indiquez la source (ex. BCC, marché de Lubumbashi).').max(200),
});
export type CreateRateInput = z.infer<typeof CreateRateSchema>;

export interface RateInfo {
  id: string;
  pair: FxPair;
  /** Texte décimal exact, ex. « 2850.5 ». */
  rate: string;
  source: string;
  validFrom: string;
}
