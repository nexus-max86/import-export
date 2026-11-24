'use client';

import { DISPUTE_CATEGORY_LABELS, DISPUTE_STATUS_LABELS, type DisputeInfo } from '@konzia/shared';
import Link from 'next/link';
import { useState } from 'react';
import { AdminList, AdminShell } from '@/components/admin';
import { fmtDate } from '@/lib/format';

export default function AdminDisputesPage() {
  const [onlyOpen, setOnlyOpen] = useState(true);
  return (
    <AdminShell title="Litiges">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} />
        Seulement les litiges en cours
      </label>
      <AdminList<DisputeInfo>
        key={String(onlyOpen)}
        endpoint="/admin/disputes"
        extraQuery={onlyOpen ? '&status=open' : ''}
        columns={[
          {
            label: 'Problème',
            render: (d) => (
              <Link
                href={`/admin/litiges/${d.id}`}
                className="font-semibold text-primary underline"
              >
                {DISPUTE_CATEGORY_LABELS[d.category]}
              </Link>
            ),
          },
          { label: 'Commande', render: (d) => <span className="font-mono">{d.orderNumber}</span> },
          { label: 'Commissionnaire', render: (d) => d.organizationName },
          { label: 'Client', render: (d) => d.customerName },
          { label: 'Statut', render: (d) => DISPUTE_STATUS_LABELS[d.status] },
          { label: 'Ouvert le', render: (d) => fmtDate(d.createdAt) },
        ]}
      />
    </AdminShell>
  );
}
