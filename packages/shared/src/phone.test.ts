import { describe, expect, it } from 'vitest';
import { normalizePhone, whatsappLink } from './phone';

describe('normalizePhone', () => {
  it.each([
    ['081 000 0000', '+243810000000'],
    ['0997123456', '+243997123456'],
    ['243 85 123 4567', '+243851234567'],
    ['+243 81-000-0000', '+243810000000'],
    ['810000000', '+243810000000'],
  ])('%s → %s', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it('conserve un numéro étranger au format international', () => {
    expect(normalizePhone('+260 97 123 4567')).toBe('+260971234567');
  });

  it.each(['12345', '0210000000', 'abc', '+243 21 000 0000'])('refuse %s', (input) => {
    expect(normalizePhone(input)).toBeNull();
  });
});

describe('whatsappLink', () => {
  it('construit un lien wa.me avec message encodé', () => {
    expect(whatsappLink('+243810000000', 'Commande KZ-2026-000123')).toBe(
      'https://wa.me/243810000000?text=Commande%20KZ-2026-000123',
    );
  });
});
