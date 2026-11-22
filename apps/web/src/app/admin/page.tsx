'use client';

import type { AdminOverview } from '@konzia/shared';
import Link from 'next/link';
import { AdminShell, useAdmin } from '@/components/admin';
import { Card, Notice } from '@/components/ui';

export default function AdminHome() {
  const { data, error } = useAdmin<AdminOverview>('/admin/overview');
  const tiles = data
    ? [
        {
          label: 'Dossiers à vérifier',
          value: data.verificationsToReview,
          href: '/admin/commissionnaires',
        },
        {
          label: 'Commissionnaires approuvés',
          value: data.organizations.approved,
          href: '/admin/commissionnaires',
        },
        {
          label: 'Commissionnaires suspendus',
          value: data.organizations.suspended,
          href: '/admin/commissionnaires',
        },
        { label: 'Utilisateurs', value: data.users, href: '/admin/utilisateurs' },
        { label: 'Commandes en cours', value: data.ordersActive, href: '/admin/commandes' },
        { label: 'Commandes terminées', value: data.ordersCompleted, href: '/admin/commandes' },
        { label: 'Paiements à vérifier', value: data.paymentsToVerify, href: '/admin/paiements' },
        { label: 'Colis en cours', value: data.parcelsInProgress, href: '/admin/colis' },
        { label: 'Litiges ouverts', value: data.disputesOpen, href: '/admin/litiges' },
      ]
    : [];
  return (
    <AdminShell title="Vue globale">
      {error && <Notice tone="error">{error}</Notice>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {tiles.map((t) => (
          <Link key={t.label} href={t.href}>
            <Card>
              <span className="text-sm text-muted">{t.label}</span>
              <strong className="font-display text-3xl tabular-nums">{t.value}</strong>
            </Card>
          </Link>
        ))}
      </div>
    </AdminShell>
  );
}
