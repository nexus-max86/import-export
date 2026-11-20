/** Devises gérées. USD = référence, CDF = affichage local, CNY = coûts d'achat. */
export const CURRENCIES = ['USD', 'CDF', 'CNY'] as const;
export type Currency = (typeof CURRENCIES)[number];

/** Nombre de décimales de l'unité mineure (centimes, fen…). */
export const MINOR_UNITS: Record<Currency, number> = { USD: 2, CDF: 2, CNY: 2 };

/**
 * Formate un montant stocké en unité mineure (entier) pour l'affichage en français.
 * Les montants ne sont jamais manipulés en flottants dans la logique métier (D3).
 */
export function formatMoney(minorAmount: bigint | number, currency: Currency): string {
  const amount = typeof minorAmount === 'bigint' ? minorAmount : BigInt(minorAmount);
  const digits = MINOR_UNITS[currency];
  const factor = 10n ** BigInt(digits);
  const negative = amount < 0n;
  const abs = negative ? -amount : amount;
  const whole = (abs / factor).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const fraction = (abs % factor).toString().padStart(digits, '0');
  return `${negative ? '-' : ''}${whole},${fraction} ${currency}`;
}
