'use client';

import {
  PARCEL_STATUS_LABELS,
  STEP_LABELS,
  type AdminParcelRow,
  type ParcelStatus,
  type TrackingStepCode,
} from '@konzia/shared';
import { AdminList, AdminShell } from '@/components/admin';
import { fmtDate } from '@/lib/format';

export default function AdminParcelsPage() {
  return (
    <AdminShell title="Colis">
      <AdminList<AdminParcelRow>
        endpoint="/admin/parcels"
        searchLabel="Code du colis"
        columns={[
          { label: 'Colis', render: (p) => <span className="font-mono">{p.code}</span> },
          { label: 'Commissionnaire', render: (p) => p.organizationName },
          { label: 'État', render: (p) => PARCEL_STATUS_LABELS[p.status as ParcelStatus] },
          {
            label: 'Étape',
            render: (p) =>
              p.currentStepCode ? STEP_LABELS[p.currentStepCode as TrackingStepCode] : '—',
          },
          { label: 'Articles', render: (p) => p.items },
          { label: 'Créé le', render: (p) => fmtDate(p.createdAt) },
        ]}
      />
    </AdminShell>
  );
}
