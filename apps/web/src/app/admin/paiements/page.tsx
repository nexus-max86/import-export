'use client';

import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATE_LABELS,
  type AdminPaymentRow,
  type PaymentMethod,
  type PaymentStatusCode,
} from '@konzia/shared';
import { AdminList, AdminShell } from '@/components/admin';
import { fmtAmount, fmtDate } from '@/lib/format';

export default function AdminPaymentsPage() {
  return (
    <AdminShell title="Paiements">
      <AdminList<AdminPaymentRow>
        endpoint="/admin/payments"
        columns={[
          { label: 'Commande', render: (p) => <span className="font-mono">{p.orderNumber}</span> },
          { label: 'Commissionnaire', render: (p) => p.organizationName },
          { label: 'Type', render: (p) => (p.kind === 'refund' ? 'Remboursement' : 'Paiement') },
          { label: 'Moyen', render: (p) => PAYMENT_METHOD_LABELS[p.method as PaymentMethod] },
          { label: 'Montant', render: (p) => fmtAmount(p.amount, p.currency) },
          { label: 'Statut', render: (p) => PAYMENT_STATE_LABELS[p.status as PaymentStatusCode] },
          { label: 'Date', render: (p) => fmtDate(p.createdAt) },
        ]}
      />
    </AdminShell>
  );
}
