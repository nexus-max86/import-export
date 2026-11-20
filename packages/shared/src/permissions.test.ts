import { describe, expect, it } from 'vitest';
import { can, PERMISSIONS } from './permissions';

describe('matrice des permissions', () => {
  it('le propriétaire a toutes les permissions', () => {
    expect(PERMISSIONS.every((p) => can('owner', p))).toBe(true);
  });
  it('un commercial ne confirme pas de paiement et ne voit pas les achats fournisseurs', () => {
    expect(can('sales', 'payment.confirm')).toBe(false);
    expect(can('sales', 'supplier_order.manage')).toBe(false);
    expect(can('sales', 'quote.send')).toBe(true);
  });
  it('un livreur ne voit pas les paiements ni les marges', () => {
    expect(can('courier', 'payment.view')).toBe(false);
    expect(can('courier', 'finance.margins.view')).toBe(false);
    expect(can('courier', 'parcel.deliver')).toBe(true);
  });
  it('seul le propriétaire gère les membres et annule une commande', () => {
    for (const role of ['sales', 'buyer', 'logistics', 'accountant', 'courier'] as const) {
      expect(can(role, 'org.members.manage')).toBe(false);
      expect(can(role, 'order.cancel')).toBe(false);
    }
  });
});
