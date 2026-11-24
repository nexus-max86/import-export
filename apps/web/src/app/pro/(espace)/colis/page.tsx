'use client';

import {
  ORG_PARCEL_TABS,
  ORG_PARCEL_TAB_LABELS,
  STEP_LABELS,
  type OrgParcelPage,
  type OrgParcelRow,
  type OrgParcelTab,
  type PackableItem,
} from '@konzia/shared';
import { Plus, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { DataTable, Pagination, TableTabs, type Column, type Sort } from '@/components/data-table';
import { Drawer } from '@/components/drawer';
import { fmtKg, NewParcelForm } from '@/components/parcels';
import { ProNav } from '@/components/pro-nav';
import { StatusPill } from '@/components/status-pill';
import { CsvExportButton } from '@/components/tracking';
import { buttonClass, EmptyState, Notice } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { fmtDate } from '@/lib/format';
import { useActiveOrg } from '@/lib/use-org';

/** État lisible d'un colis : son statut et, s'il est fermé, s'il est déjà dans une expédition. */
function ParcelState({ p }: { p: OrgParcelRow }) {
  if (p.status === 'open') return <StatusPill tone="warn">En préparation</StatusPill>;
  if (p.status === 'closed')
    return p.shipmentId ? (
      <StatusPill tone="info">Expédié</StatusPill>
    ) : (
      <StatusPill tone="info">Fermé, à expédier</StatusPill>
    );
  if (p.status === 'delivered') return <StatusPill tone="ok">Livré</StatusPill>;
  if (p.status === 'lost') return <StatusPill tone="bad">Perdu</StatusPill>;
  return <StatusPill tone="neutral">Annulé</StatusPill>;
}

const customersText = (names: string[]) =>
  names.length <= 2 ? names.join(', ') : `${names.slice(0, 2).join(', ')} +${names.length - 2}`;

export default function ProParcelsPage() {
  const router = useRouter();
  const org = useActiveOrg();
  const [tab, setTab] = useState<OrgParcelTab>('all');
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<Sort>({ key: 'created', dir: 'desc' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [data, setData] = useState<OrgParcelPage>();
  const [error, setError] = useState<string>();
  const [creating, setCreating] = useState(false);
  // Articles reçus pas encore en colis ; `null` = pas le droit de préparer des colis.
  const [packable, setPackable] = useState<number | null>();

  useEffect(() => {
    const id = setTimeout(() => {
      setQ(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(id);
  }, [search]);

  const load = useCallback(async () => {
    if (!org) return;
    setError(undefined);
    const params = new URLSearchParams({
      tab,
      sort: sort.key,
      dir: sort.dir,
      page: String(page),
      pageSize: String(pageSize),
    });
    if (q) params.set('q', q);
    try {
      setData(await api<OrgParcelPage>(`/org/parcels/page?${params}`, { org }));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401)
        router.replace('/connexion?suite=/pro/colis');
      else setError(err instanceof ApiError ? err.message : 'Chargement impossible.');
    }
  }, [org, tab, sort, page, pageSize, q, router]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!org) return;
    api<PackableItem[]>('/org/packable-items', { org }).then(
      (items) =>
        setPackable(items.reduce((n, i) => n + Math.max(0, i.qtyReceived - i.qtyPacked), 0)),
      () => setPackable(null),
    );
  }, [org]);

  const closeDrawer = useCallback(() => setCreating(false), []);

  if (!org) return null;

  const columns: Column<OrgParcelRow>[] = [
    {
      key: 'code',
      label: 'Colis',
      cell: (p) => <span className="font-mono font-semibold whitespace-nowrap">{p.code}</span>,
    },
    { key: 'state', label: 'État', cell: (p) => <ParcelState p={p} /> },
    {
      key: 'customers',
      label: 'Clients',
      cell: (p) =>
        p.customers.length ? (
          <span title={p.customers.join(', ')}>{customersText(p.customers)}</span>
        ) : (
          <span className="text-muted">—</span>
        ),
    },
    { key: 'items', label: 'Articles', numeric: true, cell: (p) => p.itemCount },
    {
      key: 'weight',
      label: 'Poids',
      sortKey: 'weight',
      numeric: true,
      cell: (p) => <span className="whitespace-nowrap">{fmtKg(p.weightG)}</span>,
    },
    {
      key: 'step',
      label: 'Dernière étape',
      hideable: true,
      cell: (p) =>
        p.currentStepCode ? STEP_LABELS[p.currentStepCode] : <span className="text-muted">—</span>,
    },
    {
      key: 'location',
      label: 'Lieu',
      hideable: true,
      cell: (p) => p.locationLabel ?? <span className="text-muted">—</span>,
    },
    {
      key: 'created',
      label: 'Créé le',
      sortKey: 'created',
      hideable: true,
      cell: (p) => <span className="whitespace-nowrap text-muted">{fmtDate(p.createdAt)}</span>,
    },
  ];

  return (
    <main className="mx-auto flex w-full max-w-[1600px] flex-col gap-5 px-4 py-8 lg:px-8">
      <ProNav />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-2xl font-bold">Colis</h1>
          {data && (
            <p className="text-sm text-muted">
              {data.counts.open} en préparation · {data.counts.to_ship} à expédier ·{' '}
              {data.counts.shipped} expédié{data.counts.shipped > 1 ? 's' : ''}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <CsvExportButton org={org} kind="parcels" label="Exporter les colis (Excel)" />
          {packable !== null && packable !== undefined && (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className={buttonClass('primary')}
            >
              <Plus aria-hidden size={18} />
              Nouveau colis
            </button>
          )}
        </div>
      </div>

      {packable != null && packable > 0 && (
        <Notice tone="info">
          {packable} article{packable > 1 ? 's' : ''} reçu{packable > 1 ? 's' : ''} à l’entrepôt{' '}
          {packable > 1 ? 'attendent' : 'attend'} d’être mis en colis.
        </Notice>
      )}

      <TableTabs
        label="Filtrer par avancement"
        value={tab}
        onChange={(t) => {
          setTab(t);
          setPage(1);
        }}
        tabs={ORG_PARCEL_TABS.map((k) => ({
          key: k,
          label: ORG_PARCEL_TAB_LABELS[k],
          count: data?.counts[k],
        }))}
      />

      <DataTable
        label="Colis"
        storageKey="pro-colis"
        columns={columns}
        rows={data?.items}
        error={error}
        onRetry={() => void load()}
        sort={sort}
        onSort={(s) => {
          setSort(s);
          setPage(1);
        }}
        onOpen={(p) => router.push(`/pro/colis/${p.id}`)}
        openLabel={(p) => `Ouvrir le colis ${p.code}`}
        toolbar={
          <label className="flex min-h-10 w-full items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 focus-within:ring-2 focus-within:ring-primary sm:w-80">
            <Search aria-hidden size={16} className="text-muted" />
            <span className="sr-only">Rechercher un colis</span>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Code, client, n° de commande, lieu…"
              className="min-w-0 flex-1 border-0 bg-transparent text-sm shadow-none outline-none focus-visible:shadow-none"
            />
          </label>
        }
        card={(p) => (
          <>
            <span className="flex flex-wrap items-center justify-between gap-2">
              <strong className="font-mono">{p.code}</strong>
              <ParcelState p={p} />
            </span>
            <span className="text-sm text-muted">
              {[
                `${p.itemCount} article(s)`,
                p.customers.length > 0 && customersText(p.customers),
                p.weightG != null && fmtKg(p.weightG),
                p.locationLabel,
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </>
        )}
        empty={
          <EmptyState title={q || tab !== 'all' ? 'Aucun colis ici' : 'Aucun colis pour l’instant'}>
            {q || tab !== 'all'
              ? 'Aucun colis ne correspond à cette recherche ou à cet onglet.'
              : 'Créez un colis, puis ajoutez-y les articles reçus à l’entrepôt.'}
          </EmptyState>
        }
      />

      {data && data.total > 0 && (
        <Pagination
          page={data.page}
          pageSize={data.pageSize}
          total={data.total}
          onPage={setPage}
          onPageSize={(n) => {
            setPageSize(n);
            setPage(1);
          }}
        />
      )}

      <Drawer open={creating} title="Nouveau colis" onClose={closeDrawer}>
        <div className="px-5 py-4">
          <NewParcelForm org={org} />
        </div>
      </Drawer>
    </main>
  );
}
