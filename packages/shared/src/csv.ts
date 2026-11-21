/**
 * CSV pour Excel en français : séparateur « ; », fin de ligne CRLF, BOM UTF-8.
 * Les cellules commençant par = + - @ (ou tabulation) sont préfixées d'une apostrophe pour
 * qu'un tableur ne les exécute pas comme formules (injection CSV).
 */
export function toCsv(rows: (string | number | null | undefined)[][]): string {
  const cell = (v: string | number | null | undefined) => {
    if (v == null) return '';
    let s = String(v);
    if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + rows.map((r) => r.map(cell).join(';')).join('\r\n') + '\r\n';
}

/** Montant en unité mineure → « 1234,56 » (virgule décimale, sans séparateur de milliers). */
export function csvAmount(minor: number): string {
  const sign = minor < 0 ? '-' : '';
  const abs = Math.abs(minor);
  return `${sign}${Math.trunc(abs / 100)},${String(abs % 100).padStart(2, '0')}`;
}
