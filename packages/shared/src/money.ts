/**
 * Convertit un prix texte (« 14.99 », « 14,99 », « 1 299,50 », « 1,299.50 ») en unité mineure,
 * sans passer par un nombre à virgule flottante. Renvoie null si le texte n'est pas un prix.
 */
export function parsePriceToMinor(input: string, decimals = 2): bigint | null {
  let s = input.replace(/[\s\u00a0\u202f]/g, '').replace(/[^\d.,]/g, '');
  if (!/\d/.test(s)) return null;
  const lastSep = Math.max(s.lastIndexOf('.'), s.lastIndexOf(','));
  let whole = s;
  let frac = '';
  // Le dernier séparateur est décimal s'il est suivi de 1 ou 2 chiffres.
  if (lastSep >= 0 && s.length - lastSep - 1 <= decimals && s.length - lastSep - 1 > 0) {
    whole = s.slice(0, lastSep);
    frac = s.slice(lastSep + 1);
  }
  whole = whole.replace(/[.,]/g, '');
  s = whole || '0';
  if (!/^\d+$/.test(s) || !/^\d*$/.test(frac)) return null;
  return (
    BigInt(s) * 10n ** BigInt(decimals) +
    BigInt((frac + '0'.repeat(decimals)).slice(0, decimals) || '0')
  );
}
