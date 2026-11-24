'use client';

import type { AdminOrganizationRow, AdminPage } from '@konzia/shared';
import { useRouter } from 'next/navigation';
import {
  ArrowLeftRight,
  Boxes,
  LayoutDashboard,
  MapPin,
  Package,
  Scale,
  ScrollText,
  Store,
  Users,
  Wallet,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { ScrollNav, SideNav, SidebarLayout, type NavGroup } from '@/components/nav';
import { Button, Logo, Notice } from '@/components/ui';
import { api, ApiError } from '@/lib/api';

const GROUPS: NavGroup[] = [
  {
    title: 'Pilotage',
    links: [
      { href: '/admin', label: 'Vue globale', icon: LayoutDashboard },
      { href: '/admin/commissionnaires', label: 'Commissionnaires', icon: Store },
      { href: '/admin/utilisateurs', label: 'Utilisateurs', icon: Users },
    ],
  },
  {
    title: 'Opérations',
    links: [
      { href: '/admin/commandes', label: 'Commandes', icon: Package },
      { href: '/admin/paiements', label: 'Paiements', icon: Wallet },
      { href: '/admin/colis', label: 'Colis', icon: Boxes },
      { href: '/admin/litiges', label: 'Litiges', icon: Scale },
    ],
  },
  {
    title: 'Plateforme',
    links: [
      { href: '/admin/journal', label: 'Journal', icon: ScrollText },
      { href: '/admin/villes', label: 'Villes', icon: MapPin },
      { href: '/admin/taux', label: 'Taux', icon: ArrowLeftRight },
    ],
  },
];

const auditNote = (
  <p className="text-xs text-muted">Chaque consultation est enregistrée dans le journal d’audit.</p>
);

export function AdminShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <SidebarLayout
      sidebar={
        <SideNav
          label="Administration"
          groups={GROUPS}
          exact={['/admin']}
          badge="Admin"
          tone="admin"
          bottom={
            <p className="text-xs text-[#8f9ab3]">
              Chaque consultation est enregistrée dans le journal d’audit.
            </p>
          }
        />
      }
    >
      <main className="mx-auto flex max-w-4xl flex-col gap-5 px-4 py-10 lg:px-8">
        <header className="flex flex-col gap-3 lg:hidden">
          <div className="flex items-center justify-between gap-3">
            <Logo />
            <span className="text-sm font-semibold text-muted">Administration</span>
          </div>
          <ScrollNav label="Administration" groups={GROUPS} exact={['/admin']} />
        </header>
        <h1 className="font-display text-2xl font-bold">{title}</h1>
        <div className="lg:hidden">{auditNote}</div>
        {children}
      </main>
    </SidebarLayout>
  );
}

/** Chargement d'une ressource d'administration (renvoie vers la connexion ou la MFA si besoin). */
export function useAdmin<T>(path: string | null) {
  const router = useRouter();
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    if (!path) return;
    api<T>(path).then(setData, (err: unknown) => {
      if (err instanceof ApiError && err.status === 401)
        router.replace(`/connexion?suite=${encodeURIComponent(window.location.pathname)}`);
      else if (
        err instanceof ApiError &&
        err.status === 403 &&
        /double authentification/i.test(err.message)
      )
        router.replace(`/admin/securite?suite=${encodeURIComponent(window.location.pathname)}`);
      else setError(err instanceof ApiError ? err.message : 'Chargement impossible.');
    });
  }, [path, router]);
  return { data, error, setData };
}

/** Liste paginée générique avec recherche. */
export function AdminList<T extends { id: string }>({
  endpoint,
  columns,
  searchLabel,
  extraQuery = '',
}: {
  endpoint: string;
  columns: { label: string; render: (row: T) => ReactNode }[];
  searchLabel?: string;
  extraQuery?: string;
}) {
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [submitted, setSubmitted] = useState('');
  const params = new URLSearchParams({ page: String(page), pageSize: '20' });
  if (submitted) params.set('q', submitted);
  const { data, error } = useAdmin<AdminPage<T>>(`${endpoint}?${params}${extraQuery}`);
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  return (
    <div className="flex flex-col gap-3">
      {searchLabel && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
            setSubmitted(q.trim());
          }}
        >
          <input
            aria-label={searchLabel}
            placeholder={searchLabel}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="min-h-11 flex-1 rounded-lg border border-line px-3"
          />
          <Button type="submit" variant="ghost">
            Chercher
          </Button>
        </form>
      )}
      {error && <Notice tone="error">{error}</Notice>}
      {data && (
        <>
          <p className="text-sm text-muted">{data.total} résultat(s)</p>
          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full text-left text-sm">
              <thead className="bg-sunken">
                <tr>
                  {columns.map((c) => (
                    <th key={c.label} className="px-3 py-2 font-semibold">
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.items.map((row) => (
                  <tr
                    key={row.id}
                    className="border-t border-line transition-colors duration-150 hover:bg-sunken/60"
                  >
                    {columns.map((c) => (
                      <td key={c.label} className="px-3 py-2 align-top">
                        {c.render(row)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pages > 1 && (
            <div className="flex items-center gap-2 text-sm">
              <Button variant="ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                Précédente
              </Button>
              <span>
                Page {page} / {pages}
              </span>
              <Button variant="ghost" disabled={page >= pages} onClick={() => setPage(page + 1)}>
                Suivante
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export const ORG_STATUS_LABELS: Record<AdminOrganizationRow['status'], string> = {
  pending: 'En attente',
  approved: 'Approuvé',
  rejected: 'Refusé',
  suspended: 'Suspendu',
};
export const VERIF_LABELS: Record<
  NonNullable<AdminOrganizationRow['verificationStatus']>,
  string
> = {
  draft: 'Dossier en préparation',
  submitted: 'À vérifier',
  approved: 'Vérifié',
  rejected: 'Refusé',
};
