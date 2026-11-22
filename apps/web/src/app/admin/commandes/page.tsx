'use client';

import {
  ORDER_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  type AdminOrderRow,
  type OrderPaymentStatus,
  type OrderStatus,
} from '@konzia/shared';
import { AdminList, AdminShell } from '@/components/admin';
import { fmtAmount, fmtDate } from '@/lib/format';

export default function AdminOrdersPage() {
  return (
    <AdminShell title="Commandes">
      <AdminList<AdminOrderRow>
        endpoint="/admin/orders"
        searchLabel="Numéro de commande"
        columns={[
          { label: 'Commande', render: (o) => <span className="font-mono">{o.number}</span> },
          { label: 'Commissionnaire', render: (o) => o.organizationName },
          { label: 'Client', render: (o) => o.customerName },
          { label: 'Statut', render: (o) => ORDER_STATUS_LABELS[o.status as OrderStatus] },
          {
            label: 'Paiement',
            render: (o) => PAYMENT_STATUS_LABELS[o.paymentStatus as OrderPaymentStatus],
          },
          { label: 'Montant', render: (o) => fmtAmount(o.finalAmount, o.currency) },
          { label: 'Créée le', render: (o) => fmtDate(o.createdAt) },
        ]}
      />
    </AdminShell>
  );
}
