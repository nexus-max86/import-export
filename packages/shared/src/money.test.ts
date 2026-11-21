import { describe, expect, it } from 'vitest';
import { parsePriceToMinor } from './money';

describe('parsePriceToMinor', () => {
  it.each([
    ['14.99', 1499n],
    ['14,99', 1499n],
    ['14', 1400n],
    ['14.5', 1450n],
    ['1 299,50 €', 129950n],
    ['1,299.50', 129950n],
    ['US $3.07', 307n],
    ['1.299', 129900n],
  ])('%s → %s', (input, expected) => {
    expect(parsePriceToMinor(input)).toBe(expected);
  });
  it.each(['', 'gratuit', '—'])('refuse « %s »', (input) => {
    expect(parsePriceToMinor(input)).toBeNull();
  });
});
