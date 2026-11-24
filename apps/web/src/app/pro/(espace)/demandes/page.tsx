'use client';

import {
  ORG_REQUEST_TAB_LABELS,
  ORG_REQUEST_TAB_STATUSES,
  ORG_REQUEST_TABS,
  RequestItemSchema,
  type OrgCustomerInfo,
  type OrgRequestPage,
  type OrgRequestSummary,
  type OrgRequestTab,
} from '@konzia/shared';
import { Plus, Search } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ProNav } from '@/components/pro-nav';
import { DataTable, Pagination, TableTabs, type Column, type Sort } from '@/components/data-table';
import { Drawer } from '@/components/drawer';
import { StatusPill } from '@/components/status-pill';
import { Button, Field, Notice, EmptyState } from '@/components/ui';
import { api, ApiError, fieldErrors } from '@/lib/api';
import { fmtDate } from '@/lib/format';
import { RECIPIENT_STATUS_LABELS, recipientTone } from '@/lib/request-status';
import { useActiveOrg } from '@/lib/use-org';

/** Ancienneté lisible d'une demande reçue (« 5 h », « 3 j »). */
function age(sentAt: string | null): { text: string; late: boolean } | null {
  if (!sentAt) return null;
  const h = Math.max(0, Math.floor((Date.now() - new Date(sentAt).getTime()) / 3_600_000));
  return {
    text: h < 1 ? 'moins d’1 h' : h < 48 ? `${h} h` : `${Math.floor(h / 24)} j`,
    late: h >= 24,
  };
}

const itemsText = (r: OrgRequestSummary) =>
  `${r.itemCount} article(s)${r.firstItemTitle ? ` · ${r.firstItemTitle}` : ''}`;

export default function ProRequestsPage() {
  const router = useRouter();
  const org = useActiveOrg();
  const [tab, setTab] = useState<OrgRequestTab>('todo');
  // À traiter : les plus anciennes d'abord ; ailleurs, les plus récentes.
  const [sort, setSort] = useState<Sort>({ key: 'received', dir: 'asc' });
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [data, setData] = useState<OrgRequestPage>();
  const [error, setError] = useState<string>();
  const [creating, setCreating] = useState(false);

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
      dir: sort.dir,
      page: String(page),
      pageSize: String(pageSize),
    });
    if (q) params.set('q', q);
    try {
      setData(await api<OrgRequestPage>(`/org/requests/page?${params}`, { org }));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401)
        router.replace('/connexion?suite=/pro/demandes');
      else setError(err instanceof ApiError ? err.message : 'Chargement impossible.');
    }
  }, [org, tab, sort, page, pageSize, q, router]);

  useEffect(() => {
    void load();
  }, [load]);

  const closeDrawer = useCallback(() => setCreating(false), []);

  if (!org) return null;

  const columns: Column<OrgRequestSummary>[] = [
    { key: 'customer', label: 'Client', cell: (r) => r.customerName },
    {
      key: 'items',
      label: 'Articles',
      cell: (r) => <span className="line-clamp-1 text-ink-2">{itemsText(r)}</span>,
    },
    {
      key: 'received',
      label: 'Reçue le',
      sortKey: 'received',
      cell: (r) => <span className="whitespace-nowrap text-muted">{fmtDate(r.sentAt)}</span>,
    },
    {
      key: 'age',
      label: 'Attend depuis',
      hideable: true,
      cell: (r) => {
        const a = ORG_REQUEST_TAB_STATUSES.todo.includes(r.status) ? age(r.sentAt) : null;
        return a ? (
          <span
            className={`whitespace-nowrap tabular-nums ${a.late ? 'font-semibold text-warn' : 'text-muted'}`}
          >
            {a.text}
          </span>
        ) : (
          <span className="text-muted">—</span>
        );
      },
    },
    {
      key: 'status',
      label: 'Statut',
      cell: (r) => (
        <StatusPill tone={recipientTone(r.status)}>{RECIPIENT_STATUS_LABELS[r.status]}</StatusPill>
      ),
    },
  ];

  return (
    <main className="mx-auto flex w-full max-w-[1600px] flex-col gap-5 px-4 py-8 lg:px-8">
      <ProNav />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-2xl font-bold">Demandes de devis</h1>
          <p className="text-sm text-muted">
            Demandes de vos clients Konzia, et celles reçues par WhatsApp ou en boutique.
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus aria-hidden size={18} />
          Nouvelle demande pour un client
        </Button>
      </div>

      <TableTabs
        label="Filtrer les demandes"
        value={tab}
        onChange={(t) => {
          setTab(t);
          setSort({ key: 'received', dir: t === 'todo' ? 'asc' : 'desc' });
          setPage(1);
        }}
        tabs={ORG_REQUEST_TABS.map((k) => ({
          key: k,
          label: ORG_REQUEST_TAB_LABELS[k],
          count: data?.counts[k],
        }))}
      />

      <DataTable
        label="Demandes de devis"
        storageKey="pro-demandes"
        columns={columns}
        rows={data?.items}
        error={error}
        onRetry={() => void load()}
        sort={sort}
        onSort={(s) => {
          setSort(s);
          setPage(1);
        }}
        onOpen={(r) => router.push(`/pro/demandes/${r.id}`)}
        openLabel={(r) => `Ouvrir la demande de ${r.customerName}`}
        toolbar={
          <label className="flex min-h-10 w-full items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 focus-within:ring-2 focus-within:ring-primary sm:w-80">
            <Search aria-hidden size={16} className="text-muted" />
            <span className="sr-only">Rechercher une demande</span>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Client ou article…"
              className="min-w-0 flex-1 border-0 bg-transparent text-sm shadow-none outline-none focus-visible:shadow-none"
            />
          </label>
        }
        card={(r) => {
          const a = ORG_REQUEST_TAB_STATUSES.todo.includes(r.status) ? age(r.sentAt) : null;
          return (
            <>
              <span className="flex flex-wrap items-center justify-between gap-2">
                <strong>{r.customerName}</strong>
                <StatusPill tone={recipientTone(r.status)}>
                  {RECIPIENT_STATUS_LABELS[r.status]}
                </StatusPill>
              </span>
              <span className="line-clamp-1 text-sm text-muted">{itemsText(r)}</span>
              <span className={`text-sm ${a?.late ? 'font-semibold text-warn' : 'text-muted'}`}>
                Reçue le {fmtDate(r.sentAt)}
                {a && ` · attend depuis ${a.text}`}
              </span>
            </>
          );
        }}
        empty={
          <EmptyState
            title={
              q
                ? 'Aucune demande trouvée'
                : tab === 'todo'
                  ? 'Aucune demande à traiter'
                  : 'Aucune demande ici'
            }
          >
            {q
              ? 'Aucune demande ne correspond à cette recherche.'
              : 'Les demandes de vos clients Konzia arrivent ici ; vous pouvez aussi saisir celles reçues par WhatsApp.'}
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

      <Drawer open={creating} title="Nouvelle demande pour un client" onClose={closeDrawer}>
        <div className="px-5 py-4">
          <ManagedRequestForm
            org={org}
            onCancel={closeDrawer}
            onCreated={(id) => router.push(`/pro/demandes/${id}`)}
          />
        </div>
      </Drawer>
    </main>
  );
}

type Line = { key: number; title: string; url: string; quantity: string; notes: string };

function ManagedRequestForm({
  org,
  onCreated,
  onCancel,
}: {
  org: string;
  onCreated: (id: string) => void;
  onCancel: () => void;
}) {
  const [customers, setCustomers] = useState<OrgCustomerInfo[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [lines, setLines] = useState<Line[]>([
    { key: 1, title: '', url: '', quantity: '1', notes: '' },
  ]);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ items: OrgCustomerInfo[] }>('/org/customers', { org }).then(
      (p) => setCustomers(p.items),
      () => undefined,
    );
  }, [org]);

  const set = (key: number, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const items = [];
    for (const [idx, l] of lines.entries()) {
      const parsed = RequestItemSchema.safeParse({
        source: 'manual',
        sourceUrl: l.url.trim() || null,
        title: l.title,
        quantity: Number(l.quantity || '1'),
        notes: l.notes,
      });
      if (!parsed.success) {
        const f = fieldErrors(parsed.error.issues);
        setError(`Article ${idx + 1} : ${Object.values(f)[0]}`);
        return;
      }
      items.push(parsed.data);
    }
    if (!customerId) {
      setError('Choisissez le client.');
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const r = await api<{ id: string }>('/org/requests', {
        org,
        body: { orgCustomerId: customerId, items },
      });
      onCreated(r.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Création impossible.');
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">Saisissez une demande reçue par WhatsApp ou en boutique.</p>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="customer" className="text-sm font-semibold">
            Client
          </label>
          <select
            id="customer"
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            className="min-h-11 rounded-lg border border-line bg-surface px-3"
          >
            <option value="">Choisir…</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.fullName}
              </option>
            ))}
          </select>
          <Link href="/pro/clients" className="text-sm text-primary underline">
            Client absent de la liste ? Ajoutez-le d’abord
          </Link>
        </div>
        {lines.map((l, idx) => (
          <fieldset key={l.key} className="flex flex-col gap-2 rounded-lg border border-line p-3">
            <legend className="px-1 text-sm font-semibold">Article {idx + 1}</legend>
            <Field
              id={`t-${l.key}`}
              label="Article"
              value={l.title}
              onChange={(e) => set(l.key, { title: e.target.value })}
            />
            <Field
              id={`u-${l.key}`}
              label="Lien (facultatif)"
              type="url"
              value={l.url}
              onChange={(e) => set(l.key, { url: e.target.value })}
            />
            <div className="grid grid-cols-2 gap-3">
              <Field
                id={`q-${l.key}`}
                label="Quantité"
                type="number"
                min={1}
                value={l.quantity}
                onChange={(e) => set(l.key, { quantity: e.target.value })}
              />
              <Field
                id={`n-${l.key}`}
                label="Taille, couleur…"
                value={l.notes}
                onChange={(e) => set(l.key, { notes: e.target.value })}
              />
            </div>
            {lines.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
              >
                Retirer l’article {idx + 1}
              </Button>
            )}
          </fieldset>
        ))}
        <Button
          type="button"
          variant="ghost"
          onClick={() =>
            setLines((ls) => [
              ...ls,
              {
                key: Math.max(...ls.map((x) => x.key)) + 1,
                title: '',
                url: '',
                quantity: '1',
                notes: '',
              },
            ])
          }
        >
          Ajouter un article
        </Button>
        {error && <Notice tone="error">{error}</Notice>}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" busy={busy}>
            Créer la demande
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel}>
            Annuler
          </Button>
        </div>
      </form>
    </div>
  );
}
