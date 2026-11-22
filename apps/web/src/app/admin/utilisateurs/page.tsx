'use client';

import type { AdminUserRow } from '@konzia/shared';
import { useState } from 'react';
import { AdminList, AdminShell } from '@/components/admin';
import { Button, Notice } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { fmtDate } from '@/lib/format';

function UserAction({ user }: { user: AdminUserRow }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [status, setStatus] = useState(user.status);
  const [error, setError] = useState<string>();
  const decision = status === 'active' ? 'suspend' : 'reactivate';
  async function confirm() {
    setError(undefined);
    try {
      await api(`/admin/users/${user.id}/${decision}`, { body: { reason } });
      setStatus(decision === 'suspend' ? 'suspended' : 'active');
      setOpen(false);
      setReason('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Action impossible.');
    }
  }
  return (
    <div className="flex flex-col gap-1">
      <span>{status === 'active' ? 'Actif' : 'Suspendu'}</span>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-left text-copper underline"
        >
          {decision === 'suspend' ? 'Suspendre…' : 'Réactiver…'}
        </button>
      ) : (
        <>
          <input
            aria-label={`Motif pour ${user.displayName}`}
            placeholder="Motif"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="rounded border border-line px-2 py-1"
          />
          <Button variant="ghost" onClick={() => void confirm()}>
            Confirmer
          </Button>
        </>
      )}
      {error && <Notice tone="error">{error}</Notice>}
    </div>
  );
}

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
          { label: 'Statut', render: (u) => <UserAction user={u} /> },
          { label: 'Inscrit le', render: (u) => fmtDate(u.createdAt) },
        ]}
      />
    </AdminShell>
  );
}
