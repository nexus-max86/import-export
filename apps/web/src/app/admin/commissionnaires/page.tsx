'use client';

import type { AdminOrganizationRow } from '@konzia/shared';
import Link from 'next/link';
import { useState } from 'react';
import { AdminList, AdminShell, ORG_STATUS_LABELS, VERIF_LABELS } from '@/components/admin';
import { fmtDate } from '@/lib/format';

export default function AdminCommissionersPage() {
  const [filter, setFilter] = useState('');
  return (
    <AdminShell title="Commissionnaires">
      <label className="flex flex-col gap-1 text-sm font-semibold">
        Afficher
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="min-h-11 rounded-lg border border-line px-3"
        >
          <option value="">Tous</option>
          <option value="to_review">Dossiers à vérifier</option>
          <option value="pending">En attente</option>
          <option value="approved">Approuvés</option>
          <option value="suspended">Suspendus</option>
          <option value="rejected">Refusés</option>
        </select>
      </label>
      <AdminList<AdminOrganizationRow>
        key={filter}
        endpoint="/admin/organizations"
        extraQuery={filter ? `&status=${filter}` : ''}
        searchLabel="Nom du commissionnaire"
        columns={[
          {
            label: 'Nom',
            render: (o) => (
              <Link
                href={`/admin/commissionnaires/${o.id}`}
                className="font-semibold text-copper underline"
              >
                {o.name}
              </Link>
            ),
          },
          { label: 'Statut', render: (o) => ORG_STATUS_LABELS[o.status] },
          {
            label: 'Vérification',
            render: (o) => (o.verificationStatus ? VERIF_LABELS[o.verificationStatus] : '—'),
          },
          { label: 'Membres', render: (o) => o.members },
          { label: 'Commandes', render: (o) => o.orders },
          { label: 'Inscrit le', render: (o) => fmtDate(o.createdAt) },
        ]}
      />
    </AdminShell>
  );
}
