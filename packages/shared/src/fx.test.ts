import { describe, expect, it } from 'vitest';
import { convertMinor, convertMinorInverse, formatRate, parseRate } from './fx';

describe('taux de change', () => {
  it('lit un taux à la française ou à l’anglaise, sans flottant', () => {
    expect(parseRate('2850')).toBe(285_000_000_000n);
    expect(parseRate('2 850,5')).toBe(285_050_000_000n);
    expect(parseRate('7.12345678')).toBe(712_345_678n);
    expect(parseRate('0')).toBeNull();
    expect(parseRate('-3')).toBeNull();
    expect(parseRate('1.123456789')).toBeNull();
  });

  it('affiche un taux sans zéros inutiles', () => {
    expect(formatRate(285_050_000_000n)).toBe('2850.5');
    expect(formatRate(285_000_000_000n)).toBe('2850');
  });

  it('convertit 149,90 USD en CDF au taux de 2 850', () => {
    expect(convertMinor(14_990n, parseRate('2850')!)).toBe(42_721_500n);
  });

  it('arrondit au centime le plus proche', () => {
    // 0,01 USD × 7,125 = 0,07125 CNY → 0,07
    expect(convertMinor(1n, parseRate('7.125')!)).toBe(7n);
    // 100,00 CNY / 7,12 = 14,0449… USD → 14,04
    expect(convertMinorInverse(10_000n, parseRate('7.12')!)).toBe(1404n);
  });
});
