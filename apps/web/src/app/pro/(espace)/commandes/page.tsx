'use client';

import {
  ORDER_NEXT_ACTION_LABELS,
  ORDER_STATUS_LABELS,
  ORG_ORDER_TAB_LABELS,
  ORG_ORDER_TABS,
  PAYMENT_STATUS_LABELS,
  WAITING_NEXT_ACTIONS,
  toCsv,
  type OrderDetail,
  type OrderPaymentStatus,
  type OrderStatus,
  type OrgOrderPage,
  type OrgOrderRow,
  type OrgOrderTab,
} from '@konzia/shared';
import { ArrowRight, Download, ExternalLink, Search } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BulkBar,
  DataTable,
  Pagination,
  TableTabs,
  type Column,
  type Sort,
} from '@/components/data-table';
import { Drawer, DrawerSection } from '@/components/drawer';
import { EVENT_LABELS } from '@/components/order-view';
import { ProNav } from '@/components/pro-nav';
import { StatusPill } from '@/components/status-pill';
import { CsvExportButton } from '@/components/tracking';
import { EmptyState, buttonClass } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { fmtAmount, fmtDate } from '@/lib/format';
import { useActiveOrg } from '@/lib/use-org';

const paymentTone = (p: OrderPaymentStatus) =>
  p === 'paid' ? 'ok' : p === 'partially_paid' ? 'warn' : 'neutral';
const stepTone = (s: OrderStatus) =>
  s === 'completed' ? 'ok' : s === 'cancelled' ? 'neutral' : s === 'in_dispute' ? 'bad' : 'info';

/** Trajet d'une commande (signature KONZIA) : Payée → Achetée → Entrepôt → Transport → Remise. */
const ROUTE: { label: string; reached: OrderStatus[] }[] = [
  { label: 'Payée', reached: ['paid', 'purchasing', 'partially_purchased'] },
  { label: 'Achetée', reached: ['purchased'] },
  { label: 'Entrepôt', reached: ['in_logistics'] },
  { label: 'Transport', reached: ['in_transit', 'at_distribution_point'] },
  { label: 'Remise', reached: ['ready_for_handover', 'completed'] },
];

function RouteBar({ status }: { status: OrderStatus }) {
  const at = ROUTE.findIndex((s) => s.reached.includes(status));
  return (
    <ol
      aria-label="Trajet de la commande"
      className="grid grid-cols-5 gap-1 text-[11px] text-muted"
    >
      {ROUTE.map((s, i) => (
        <li
          key={s.label}
          aria-current={i === at ? 'step' : undefined}
          className="flex flex-col gap-1.5 aria-[current=step]:font-bold aria-[current=step]:text-ink"
        >
          <span className={`h-1 rounded-full ${i <= at ? 'bg-primary' : 'bg-line'}`} />
          {s.label}
        </li>
      ))}
    </ol>
  );
}

export default function ProOrdersPage() {
  const router = useRouter();
  const org = useActiveOrg();
  const [tab, setTab] = useState<OrgOrderTab>('all');
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [owing, setOwing] = useState(false);
  const [sort, setSort] = useState<Sort>({ key: 'activity', dir: 'desc' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [data, setData] = useState<OrgOrderPage>();
  const [error, setError] = useState<string>();
  const [selected, setSelected] = useState<string[]>([]);
  const seen = useRef(new Map<string, OrgOrderRow>());
  const [openId, setOpenId] = useState<string>();
  const [detail, setDetail] = useState<OrderDetail>();

  // Recherche lancée 300 ms après la dernière frappe.
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
    if (owing) params.set('payment', 'owing');
    try {
      const p = await api<OrgOrderPage>(`/org/orders/page?${params}`, { org });
      p.items.forEach((r) => seen.current.set(r.id, r));
      setData(p);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401)
        router.replace('/connexion?suite=/pro/commandes');
      else setError(err instanceof ApiError ? err.message : 'Chargement impossible.');
    }
  }, [org, tab, sort, page, pageSize, q, owing, router]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!org || !openId) return;
    setDetail(undefined);
    api<OrderDetail>(`/org/orders/${openId}`, { org }).then(setDetail, () => setDetail(undefined));
  }, [org, openId]);

  const closeDrawer = useCallback(() => setOpenId(undefined), []);

  function exportSelection() {
    const rows = selected.map((id) => seen.current.get(id)).filter(Boolean) as OrgOrderRow[];
    const csv = toCsv([
      ['Commande', 'Client', 'Montant', 'Devise', 'Paiement', 'Étape', 'Créée le'],
      ...rows.map((r) => [
        r.number,
        r.customerName,
        (r.finalAmount / 100).toFixed(2).replace('.', ','),
        r.currency,
        PAYMENT_STATUS_LABELS[r.paymentStatus],
        ORDER_STATUS_LABELS[r.status],
        r.createdAt.slice(0, 10),
      ]),
    ]);
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `commandes-selection-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!org) return null;

  const columns: Column<OrgOrderRow>[] = [
    {
      key: 'number',
      label: 'Commande',
      cell: (r) => (
        <span className="font-mono text-[13px] font-bold whitespace-nowrap">{r.number}</span>
      ),
    },
    { key: 'customer', label: 'Client', cell: (r) => r.customerName },
    {
      key: 'items',
      label: 'Articles',
      hideable: true,
      cell: (r) => (
        <span className="line-clamp-1 max-w-56 text-ink-2">
          {r.itemCount}
          {r.firstItem ? ` · ${r.firstItem}` : ''}
        </span>
      ),
    },
    {
      key: 'amount',
      label: 'Montant',
      sortKey: 'amount',
      numeric: true,
      cell: (r) => <strong>{fmtAmount(r.finalAmount, r.currency)}</strong>,
    },
    {
      key: 'payment',
      label: 'Paiement',
      cell: (r) => (
        <StatusPill tone={paymentTone(r.paymentStatus)}>
          {PAYMENT_STATUS_LABELS[r.paymentStatus]}
        </StatusPill>
      ),
    },
    {
      key: 'status',
      label: 'Étape',
      cell: (r) => (
        <StatusPill tone={stepTone(r.status)}>{ORDER_STATUS_LABELS[r.status]}</StatusPill>
      ),
    },
    {
      key: 'next',
      label: 'Prochaine action',
      hideable: true,
      cell: (r) =>
        r.nextAction ? (
          <span
            className={`text-[13px] font-semibold ${WAITING_NEXT_ACTIONS.includes(r.nextAction) ? 'text-muted' : 'text-primary-strong'}`}
          >
            {ORDER_NEXT_ACTION_LABELS[r.nextAction]}
          </span>
        ) : (
          <span className="text-muted">—</span>
        ),
    },
    {
      key: 'activity',
      label: 'Activité',
      sortKey: 'activity',
      hideable: true,
      cell: (r) => <span className="whitespace-nowrap text-muted">{fmtDate(r.updatedAt)}</span>,
    },
  ];

  const owes = detail && detail.finalAmount - detail.netPaid > 0;

  return (
    <main className="mx-auto flex w-full max-w-[1600px] flex-col gap-5 px-4 py-8 lg:px-8">
      <ProNav />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-2xl font-bold">Commandes</h1>
          {data && (
            <p className="text-sm text-muted">
              {data.counts.all} commande{data.counts.all > 1 ? 's' : ''} ·{' '}
              {data.counts.all - data.counts.completed - data.counts.cancelled} en cours
            </p>
          )}
        </div>
        <CsvExportButton org={org} kind="orders" label="Exporter les commandes (Excel)" />
      </div>

      <TableTabs
        label="Filtrer par étape"
        value={tab}
        onChange={(t) => {
          setTab(t);
          setPage(1);
        }}
        tabs={ORG_ORDER_TABS.map((k) => ({
          key: k,
          label: ORG_ORDER_TAB_LABELS[k],
          count: data?.counts[k],
        }))}
      />

      <BulkBar count={selected.length} onClear={() => setSelected([])}>
        <button
          type="button"
          onClick={exportSelection}
          className="flex min-h-9 items-center gap-2 rounded-lg bg-surface px-3 font-semibold text-ink outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Download aria-hidden size={16} />
          Exporter la sélection (CSV)
        </button>
      </BulkBar>

      <DataTable
        label="Commandes"
        storageKey="pro-commandes"
        columns={columns}
        rows={data?.items}
        error={error}
        onRetry={() => void load()}
        sort={sort}
        onSort={(s) => {
          setSort(s);
          setPage(1);
        }}
        selected={selected}
        onSelectedChange={setSelected}
        activeId={openId}
        onOpen={(r) => setOpenId(r.id)}
        openLabel={(r) => `Aperçu de la commande ${r.number}`}
        toolbar={
          <>
            <label className="flex min-h-10 w-full items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 focus-within:ring-2 focus-within:ring-primary sm:w-72">
              <Search aria-hidden size={16} className="text-muted" />
              <span className="sr-only">Rechercher une commande</span>
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="N°, client, téléphone…"
                className="min-w-0 flex-1 border-0 bg-transparent text-sm shadow-none outline-none focus-visible:shadow-none"
              />
            </label>
            <button
              type="button"
              aria-pressed={owing}
              onClick={() => {
                setOwing((v) => !v);
                setPage(1);
              }}
              className="min-h-10 rounded-lg border border-line-strong bg-surface px-3 text-sm font-semibold outline-none hover:border-muted focus-visible:ring-2 focus-visible:ring-primary aria-pressed:border-primary aria-pressed:bg-primary-soft aria-pressed:text-primary-strong"
            >
              Solde à encaisser
            </button>
          </>
        }
        card={(r) => (
          <>
            <span className="flex flex-wrap items-center justify-between gap-2">
              <strong className="font-mono">{r.number}</strong>
              <StatusPill tone={stepTone(r.status)}>{ORDER_STATUS_LABELS[r.status]}</StatusPill>
            </span>
            <span className="text-sm text-muted">
              {r.customerName} · {fmtAmount(r.finalAmount, r.currency)} ·{' '}
              {PAYMENT_STATUS_LABELS[r.paymentStatus]}
            </span>
            {r.nextAction && !WAITING_NEXT_ACTIONS.includes(r.nextAction) && (
              <span className="text-sm font-semibold text-primary-strong">
                {ORDER_NEXT_ACTION_LABELS[r.nextAction]}
              </span>
            )}
          </>
        )}
        empty={
          <EmptyState
            title={
              q || owing || tab !== 'all'
                ? 'Aucune commande ne correspond'
                : 'Aucune commande pour l’instant'
            }
          >
            {q || owing || tab !== 'all'
              ? 'Changez d’onglet ou effacez la recherche.'
              : 'Une commande est créée quand un client accepte votre devis.'}
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

      <Drawer
        open={Boolean(openId)}
        onClose={closeDrawer}
        title={
          <span className="font-mono text-base font-bold">
            {detail?.number ?? seen.current.get(openId ?? '')?.number ?? 'Commande'}
          </span>
        }
        actions={
          openId && (
            <Link
              href={`/pro/commandes/${openId}`}
              className={buttonClass('secondary', 'min-h-9 px-3 text-sm')}
            >
              <ExternalLink aria-hidden size={15} />
              Ouvrir la fiche
            </Link>
          )
        }
      >
        {!detail ? (
          <div className="flex flex-col gap-3 p-5" aria-busy="true">
            <span className="sr-only">Chargement…</span>
            {[0, 1, 2].map((i) => (
              <span key={i} aria-hidden className="h-12 animate-shimmer rounded-xl bg-line/70" />
            ))}
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-3 px-5 py-4">
              <div className="flex flex-wrap gap-1.5">
                <StatusPill tone={paymentTone(detail.paymentStatus)}>
                  {PAYMENT_STATUS_LABELS[detail.paymentStatus]}
                </StatusPill>
                <StatusPill tone={stepTone(detail.status)}>
                  {ORDER_STATUS_LABELS[detail.status]}
                </StatusPill>
              </div>
              <RouteBar status={detail.status} />
            </div>
            {(() => {
              const next = seen.current.get(detail.id)?.nextAction;
              return next && !WAITING_NEXT_ACTIONS.includes(next) ? (
                <div className="mx-5 mb-4 flex flex-col gap-2 rounded-xl bg-primary-soft p-4">
                  <span className="text-xs font-bold tracking-wide text-primary-strong uppercase">
                    Prochaine action
                  </span>
                  <strong>{ORDER_NEXT_ACTION_LABELS[next]}</strong>
                  <Link
                    href={`/pro/commandes/${detail.id}`}
                    className={buttonClass('primary', 'self-start min-h-10')}
                  >
                    Traiter dans la fiche
                    <ArrowRight aria-hidden size={16} />
                  </Link>
                </div>
              ) : null;
            })()}
            <DrawerSection title="Client">
              <p className="text-sm">
                <strong>{detail.customerName}</strong>
                {!detail.customerHasAccount && <span className="text-muted"> · client géré</span>}
                {detail.contactWhatsapp && (
                  <span className="block text-muted">{detail.contactWhatsapp}</span>
                )}
              </p>
            </DrawerSection>
            <DrawerSection title={`Articles (${detail.items.length})`}>
              <ul className="flex flex-col gap-2 text-sm">
                {detail.items.map((it) => (
                  <li key={it.id} className="flex items-start justify-between gap-3">
                    <span>
                      {it.description} × {it.quantity}
                    </span>
                    <span className="shrink-0 text-xs text-muted">
                      {it.qtyPurchased}/{it.quantity} acheté · {it.qtyReceived} reçu
                    </span>
                  </li>
                ))}
              </ul>
            </DrawerSection>
            <DrawerSection title="Paiements">
              <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5 text-sm tabular-nums">
                <dt className="text-ink-2">Montant de la commande</dt>
                <dd className="text-right font-bold">
                  {fmtAmount(detail.finalAmount, detail.currency)}
                </dd>
                <dt className="text-ink-2">Encaissé (confirmé)</dt>
                <dd className="text-right font-bold text-ok">
                  {fmtAmount(detail.netPaid, detail.currency)}
                </dd>
                <dt className="text-ink-2">Reste à payer</dt>
                <dd className={`text-right font-extrabold ${owes ? 'text-danger' : ''}`}>
                  {fmtAmount(Math.max(detail.finalAmount - detail.netPaid, 0), detail.currency)}
                </dd>
              </dl>
            </DrawerSection>
            <DrawerSection title="Historique">
              <ol className="flex flex-col gap-2 text-sm">
                {[...detail.events]
                  .reverse()
                  .slice(0, 6)
                  .map((e, i) => (
                    <li key={i}>
                      <strong>
                        {e.toStatus
                          ? ORDER_STATUS_LABELS[e.toStatus]
                          : (EVENT_LABELS[e.type] ?? e.type)}
                      </strong>{' '}
                      <span className="text-muted">· {fmtDate(e.at)}</span>
                      {e.note && <span className="block text-ink-2">{e.note}</span>}
                    </li>
                  ))}
              </ol>
            </DrawerSection>
          </>
        )}
      </Drawer>
    </main>
  );
}
