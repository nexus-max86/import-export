import { describe, expect, it } from 'vitest';
import { formatMoney } from './currency';

describe('formatMoney', () => {
  it('formate les centimes en notation française', () => {
    expect(formatMoney(14990, 'USD')).toBe('149,90 USD');
  });
  it('sépare les milliers par une espace fine insécable', () => {
    expect(formatMoney(42721500n, 'CDF')).toBe('427 215,00 CDF');
  });
  it('gère les montants négatifs (remboursements)', () => {
    expect(formatMoney(-305, 'USD')).toBe('-3,05 USD');
  });
});
