import { describe, expect, it } from 'vitest';
import { commissionOn, lineAmount, quoteTotals, transportFor } from './quotes';

describe('calculs de devis (centimes entiers)', () => {
  it('ligne = quantité × prix unitaire ; réduction négative', () => {
    expect(lineAmount({ kind: 'product', quantity: 2, unitAmount: 1549 })).toBe(3098n);
    expect(lineAmount({ kind: 'discount', quantity: 1, unitAmount: 500 })).toBe(-500n);
  });

  it('commission de 10 % sur 97,40 USD = 9,74 USD ; 12,5 % arrondi au centime', () => {
    expect(commissionOn(9740n, 1000)).toBe(974n);
    expect(commissionOn(9745n, 1250)).toBe(1218n); // 1218,125 → 1218
  });

  it('transport : 2,4 kg × 11,90 USD/kg = 28,56 USD', () => {
    expect(transportFor(2400, 1190)).toBe(2856n);
  });

  it('totaux du devis de la maquette', () => {
    const t = quoteTotals([
      { kind: 'product', quantity: 1, unitAmount: 9740 },
      { kind: 'service_fee', quantity: 1, unitAmount: 1200 },
      { kind: 'international_shipping', quantity: 1, unitAmount: 2850 },
      { kind: 'customs_estimate', quantity: 1, unitAmount: 900 },
      { kind: 'local_delivery', quantity: 1, unitAmount: 300 },
    ]);
    expect(t).toEqual({ products: 9740n, total: 14990n });
  });
});
