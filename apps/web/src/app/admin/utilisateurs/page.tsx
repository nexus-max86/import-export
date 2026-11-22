'use client';

import type { AdminUserRow } from '@konzia/shared';
import { AdminList, AdminShell } from '@/components/admin';
import { fmtDate } from '@/lib/format';

export default function AdminUsersPage() {
  return (
    <AdminShell title="Utilisateurs">
      <AdminList<AdminUserRow>
        endpoint="/admin/users"
        searchLabel="Nom ou e-mail"
        columns={[
          { label: 'Nom', render: (u) => u.displayName },
          {
            label: 'E-mail',
            render: (u) => `${u.email}${u.emailVerified ? '' : ' (non vérifié)'}`,
          },
          {
            label: 'Rôle',
            render: (u) =>
              u.platformRole === 'admin' ? `Admin${u.mfaEnabled ? ' · MFA' : ''}` : '—',
          },
          { label: 'Organisations', render: (u) => u.organizations },
          { label: 'Statut', render: (u) => (u.status === 'active' ? 'Actif' : 'Suspendu') },
          { label: 'Inscrit le', render: (u) => fmtDate(u.createdAt) },
        ]}
      />
    </AdminShell>
  );
}
