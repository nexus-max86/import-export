import { describe, expect, it } from 'vitest';
import { csvAmount, toCsv } from './csv';

describe('export CSV', () => {
  it('produit un CSV lisible par Excel en français', () => {
    const csv = toCsv([
      ['Commande', 'Client', 'Montant'],
      ['KZ-2026-000001', 'Ruth "RK" Kabeya; Lubumbashi', csvAmount(13568)],
    ]);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toBe(
      '﻿Commande;Client;Montant\r\nKZ-2026-000001;"Ruth ""RK"" Kabeya; Lubumbashi";135,68\r\n',
    );
  });

  it('neutralise les formules (injection CSV)', () => {
    expect(toCsv([['=HYPERLINK("http://x")', '+243', '@SUM', '-5']])).toBe(
      '﻿"\'=HYPERLINK(""http://x"")";\'+243;\'@SUM;\'-5\r\n',
    );
    expect(toCsv([[-5, null]])).toBe('﻿-5;\r\n');
  });

  it('formate les montants avec une virgule', () => {
    expect(csvAmount(5)).toBe('0,05');
    expect(csvAmount(-12345)).toBe('-123,45');
  });
});
