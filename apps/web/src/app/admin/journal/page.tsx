'use client';

import type { AdminAuditRow } from '@konzia/shared';
import { AdminList, AdminShell } from '@/components/admin';
import { fmtDate } from '@/lib/format';

export default function AdminAuditPage() {
  return (
    <AdminShell title="Journal d’audit">
      <AdminList<AdminAuditRow>
        endpoint="/admin/audit"
        searchLabel="Action (début), ex. payment."
        columns={[
          { label: 'Date', render: (a) => fmtDate(a.createdAt) },
          { label: 'Acteur', render: (a) => `${a.actorEmail ?? 'système'} (${a.actorRole})` },
          { label: 'Organisation', render: (a) => a.organizationName ?? '—' },
          { label: 'Action', render: (a) => <span className="font-mono">{a.action}</span> },
          {
            label: 'Objet',
            render: (a) => `${a.entityType}${a.entityId ? ` ${a.entityId.slice(0, 8)}…` : ''}`,
          },
          { label: 'Motif', render: (a) => a.reason ?? '' },
        ]}
      />
    </AdminShell>
  );
}
