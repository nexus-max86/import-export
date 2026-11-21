import { parsePriceToMinor } from '@konzia/shared';

/** Centimes → texte saisissable (« 15,49 »). */
export function minorToInput(amount: number): string {
  const sign = amount < 0 ? '-' : '';
  const a = Math.abs(amount);
  return `${sign}${Math.trunc(a / 100)},${String(a % 100).padStart(2, '0')}`;
}

/** Texte saisi (« 15,49 », « 15.49 », « 15 ») → centimes, ou null si invalide. */
export function inputToMinor(text: string): number | null {
  if (!text.trim()) return 0;
  const v = parsePriceToMinor(text);
  return v === null ? null : Number(v);
}
