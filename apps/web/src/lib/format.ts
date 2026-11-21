import { formatMoney, type Currency } from '@konzia/shared';

const dateTime = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Africa/Lubumbashi',
});

export function fmtDate(iso: string | null): string {
  return iso ? dateTime.format(new Date(iso)) : '—';
}

/** Montant en unité mineure ; devise quelconque (prix indicatif lu sur un site étranger). */
export function fmtAmount(amount: number, currency: string): string {
  if (currency === 'USD' || currency === 'CDF' || currency === 'CNY')
    return formatMoney(amount, currency as Currency);
  const whole = Math.trunc(amount / 100);
  const cents = String(Math.abs(amount % 100)).padStart(2, '0');
  return `${whole},${cents} ${currency}`;
}
