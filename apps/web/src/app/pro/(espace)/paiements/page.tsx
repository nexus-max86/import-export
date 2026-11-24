'use client';

import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATE_LABELS,
  type CustomerBalance,
  type PaymentInfo,
} from '@konzia/shared';
import { FileText, Search } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { DataTable, TableTabs, type Column, type Sort } from '@/components/data-table';
import { PaymentHistory, paymentTone } from '@/components/payments';
import { ProNav } from '@/components/pro-nav';
import { StatusPill } from '@/components/status-pill';
import { CsvExportButton } from '@/components/tracking';
import { Button, EmptyState, Field, Loading, Notice } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { fmtAmount, fmtDate } from '@/lib/format';
import { useActiveOrg } from '@/lib/use-org';

type Tab = 'verifier' | 'tous' | 'soldes';
type Status = PaymentInfo['status'] | 'all';

const LIST_LIMIT = 300; // plafond de GET /org/payments (les plus récents)

/** Totaux par devise, sans jamais additionner deux devises. */
function totals(rows: { amount: number; currency: string }[]) {
  const by = new Map<string, number>();
  for (const r of rows) by.set(r.currency, (by.get(r.currency) ?? 0) + r.amount);
  return [...by].map(([currency, amount]) => fmtAmount(amount, currency)).join(' · ') || '0';
}

function Summary({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-2xl border border-line bg-surface px-5 py-4">
      <span className="text-[13px] font-semibold text-muted">{label}</span>
      <span className="font-display text-xl leading-tight font-extrabold tabular-nums">
        {value}
      </span>
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </div>
  );
}

export default function ProPaymentsPage() {
  const router = useRouter();
  const org = useActiveOrg();
  const [tab, setTab] = useState<Tab>('verifier');
  const [all, setAll] = useState<PaymentInfo[]>();
  const [pending, setPending] = useState<PaymentInfo[]>();
  const [balances, setBalances] = useState<CustomerBalance[]>();
  const [error, setError] = useState<string>();
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string }>();
  const [rejecting, setRejecting] = useState<string>();
  const [reason, setReason] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<Status>('all');
  const [sort, setSort] = useState<Sort>({ key: 'date', dir: 'desc' });

  const load = useCallback(async () => {
    if (!org) return;
    setError(undefined);
    try {
      // À vérifier : liste dédiée (complète, les plus anciennes d'abord) ; « Tous » est plafonné.
      const [v, p, b] = await Promise.all([
        api<PaymentInfo[]>('/org/payments?statut=a-verifier', { org }),
        api<PaymentInfo[]>('/org/payments', { org }),
        api<CustomerBalance[]>('/org/balances', { org }),
      ]);
      setPending(v);
      setAll(p);
      setBalances(b);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401)
        router.replace('/connexion?suite=/pro/paiements');
      else setError(err instanceof ApiError ? err.message : 'Chargement impossible.');
    }
  }, [org, router]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(path: string, body?: object, ok?: string) {
    setMsg(undefined);
    try {
      await api(path, { method: 'POST', org: org!, body });
      setRejecting(undefined);
      setReason('');
      if (ok) setMsg({ tone: 'ok', text: ok });
      await load();
    } catch (err) {
      setMsg({ tone: 'error', text: err instanceof ApiError ? err.message : 'Action impossible.' });
    }
  }

  const owed = useMemo(() => balances?.filter((b) => b.outstanding > 0), [balances]);
  const weekAgo = useMemo(() => Date.now() - 7 * 86_400_000, []);

  const rows = useMemo(() => {
    if (!all) return undefined;
    const q = search.trim().toLowerCase();
    const list = all.filter(
      (p) =>
        (status === 'all' || p.status === status) &&
        (!q ||
          p.orderNumber.toLowerCase().includes(q) ||
          (p.customerName ?? '').toLowerCase().includes(q) ||
          (p.reference ?? '').toLowerCase().includes(q)),
    );
    const sign = sort.dir === 'asc' ? 1 : -1;
    return list.sort((a, b) =>
      sort.key === 'amount'
        ? sign * (a.orderAmount - b.orderAmount)
        : sign * a.createdAt.localeCompare(b.createdAt),
    );
  }, [all, search, status, sort]);

  if (!org) return null;

  function openProof(id: string) {
    // L'en-tête d'organisation est requis : on ouvre la preuve via fetch.
    void fetch(`/api/org/payments/${id}/proof`, { headers: { 'x-konzia-org': org! } })
      .then((r) => r.blob())
      .then((b) => window.open(URL.createObjectURL(b), '_blank'));
  }

  const columns: Column<PaymentInfo>[] = [
    {
      key: 'date',
      label: 'Date',
      sortKey: 'date',
      cell: (p) => <span className="whitespace-nowrap text-muted">{fmtDate(p.createdAt)}</span>,
    },
    {
      key: 'order',
      label: 'Commande',
      cell: (p) => (
        <Link
          href={`/pro/commandes/${p.orderId}`}
          className="font-mono font-semibold whitespace-nowrap text-primary-strong hover:underline"
        >
          {p.orderNumber}
        </Link>
      ),
    },
    { key: 'customer', label: 'Client', cell: (p) => p.customerName ?? '—' },
    {
      key: 'method',
      label: 'Moyen',
      hideable: true,
      cell: (p) => (
        <span className="flex flex-col">
          <span>{[PAYMENT_METHOD_LABELS[p.method], p.provider].filter(Boolean).join(' · ')}</span>
          {p.reference && <span className="text-xs text-muted">réf. {p.reference}</span>}
        </span>
      ),
    },
    {
      key: 'amount',
      label: 'Montant',
      sortKey: 'amount',
      numeric: true,
      cell: (p) => (
        <span className="flex flex-col items-end">
          <strong className="whitespace-nowrap tabular-nums">
            {p.kind === 'refund' ? '− ' : ''}
            {fmtAmount(p.amount, p.currency)}
          </strong>
          {p.currency !== p.orderCurrency && (
            <span className="text-xs whitespace-nowrap text-muted">
              = {fmtAmount(p.orderAmount, p.orderCurrency)}
            </span>
          )}
        </span>
      ),
    },
    {
      key: 'status',
      label: 'Statut',
      cell: (p) => (
        <span className="flex flex-col items-start gap-1">
          <StatusPill tone={paymentTone(p.status)}>
            {p.kind === 'refund' ? 'Remboursement · ' : ''}
            {PAYMENT_STATE_LABELS[p.status]}
          </StatusPill>
          {p.rejectionReason && <span className="text-xs text-danger">{p.rejectionReason}</span>}
        </span>
      ),
    },
    {
      key: 'origin',
      label: 'Saisi par',
      hideable: true,
      cell: (p) => (
        <span className="text-muted">{p.declaredByCustomer ? 'Client' : 'Votre équipe'}</span>
      ),
    },
  ];

  const confirmed7 =
    all?.filter(
      (p) =>
        p.status === 'confirmed' &&
        p.kind === 'payment' &&
        new Date(p.confirmedAt ?? p.createdAt).getTime() >= weekAgo,
    ) ?? [];

  return (
    <main className="mx-auto flex w-full max-w-[1600px] flex-col gap-5 px-4 py-8 lg:px-8">
      <ProNav />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-2xl font-bold">Paiements</h1>
          <p className="text-sm text-muted">
            Konzia n’encaisse rien : vous confirmez ici ce que vous avez reçu sur vos comptes.
          </p>
        </div>
        <CsvExportButton org={org} kind="payments" label="Exporter les paiements (Excel)" />
      </div>

      {error && (
        <Notice tone="error">
          {error}{' '}
          <button type="button" onClick={() => void load()} className="font-semibold underline">
            Réessayer
          </button>
        </Notice>
      )}
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}

      {all && balances && (
        <section
          aria-label="Résumé"
          className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3"
        >
          <Summary
            label="À vérifier"
            value={totals(pending ?? [])}
            hint={`${pending?.length ?? 0} paiement(s) déclaré(s)`}
          />
          <Summary
            label="Reste dû par les clients"
            value={totals(
              (owed ?? []).map((b) => ({ amount: b.outstanding, currency: b.currency })),
            )}
            hint={`${new Set(owed?.map((b) => b.orgCustomerId)).size} client(s)`}
          />
          <Summary label="Confirmé sur 7 jours" value={totals(confirmed7)} />
        </section>
      )}

      <TableTabs
        label="Rubriques des paiements"
        value={tab}
        onChange={setTab}
        tabs={[
          { key: 'verifier', label: 'À vérifier', count: pending?.length },
          { key: 'tous', label: 'Tous les paiements', count: all?.length },
          { key: 'soldes', label: 'Soldes clients', count: owed?.length },
        ]}
      />

      {tab === 'verifier' && (
        <section aria-labelledby="p-pending" className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h2 id="p-pending" className="font-display text-lg font-bold">
              À vérifier ({pending?.length ?? '…'})
            </h2>
            <p className="text-sm text-muted">
              Vérifiez sur votre relevé (M-Pesa, Orange Money, banque) avant de confirmer. Les plus
              anciens sont en haut.
            </p>
          </div>
          {!pending && !error && <Loading lines={2} />}
          {pending && pending.length === 0 && (
            <EmptyState title="Aucun paiement à vérifier">
              Quand un client déclare un paiement, il apparaît ici avec sa référence et sa preuve.
            </EmptyState>
          )}
          {pending && pending.length > 0 && (
            <div className="max-w-3xl">
              <PaymentHistory
                payments={pending}
                actions={(p) => (
                  <div className="flex flex-col gap-2">
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                      <span>
                        Commande{' '}
                        <Link
                          className="font-mono font-semibold text-primary-strong underline"
                          href={`/pro/commandes/${p.orderId}`}
                        >
                          {p.orderNumber}
                        </Link>
                        {p.customerName && ` · ${p.customerName}`}
                      </span>
                      {p.hasProof && (
                        <button
                          type="button"
                          onClick={() => openProof(p.id)}
                          className="inline-flex items-center gap-1 font-semibold text-primary-strong underline"
                        >
                          <FileText aria-hidden size={15} />
                          Voir la preuve
                        </button>
                      )}
                    </span>
                    {rejecting === p.id ? (
                      <form
                        className="flex flex-col gap-2"
                        onSubmit={(e) => {
                          e.preventDefault();
                          void act(
                            `/org/payments/${p.id}/reject`,
                            { reason },
                            'Paiement refusé ; le client est informé du motif.',
                          );
                        }}
                      >
                        <Field
                          id={`r-${p.id}`}
                          label="Motif du refus (visible du client)"
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                        />
                        <div className="flex flex-wrap gap-2">
                          <Button type="submit">Refuser ce paiement</Button>
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => setRejecting(undefined)}
                          >
                            Annuler
                          </Button>
                        </div>
                      </form>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          onClick={() =>
                            act(
                              `/org/payments/${p.id}/confirm`,
                              undefined,
                              `Paiement de ${fmtAmount(p.amount, p.currency)} confirmé.`,
                            )
                          }
                        >
                          Confirmer la réception
                        </Button>
                        <Button variant="ghost" onClick={() => setRejecting(p.id)}>
                          Refuser
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              />
            </div>
          )}
        </section>
      )}

      {tab === 'tous' && (
        <>
          <DataTable
            label="Paiements"
            storageKey="pro-paiements"
            columns={columns}
            rows={rows}
            error={error}
            onRetry={() => void load()}
            sort={sort}
            onSort={setSort}
            onOpen={(p) => router.push(`/pro/commandes/${p.orderId}`)}
            openLabel={(p) => `Ouvrir la commande ${p.orderNumber}`}
            toolbar={
              <>
                <label className="flex min-h-10 w-full items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 focus-within:ring-2 focus-within:ring-primary sm:w-72">
                  <Search aria-hidden size={16} className="text-muted" />
                  <span className="sr-only">Rechercher un paiement</span>
                  <input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="N° de commande, client, référence…"
                    className="min-w-0 flex-1 border-0 bg-transparent text-sm shadow-none outline-none focus-visible:shadow-none"
                  />
                </label>
                <label className="flex min-h-10 items-center gap-2 text-sm font-semibold">
                  Statut
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as Status)}
                    className="min-h-10 rounded-lg border border-line-strong bg-surface px-2 text-sm"
                  >
                    <option value="all">Tous</option>
                    {(Object.keys(PAYMENT_STATE_LABELS) as PaymentInfo['status'][]).map((s) => (
                      <option key={s} value={s}>
                        {PAYMENT_STATE_LABELS[s]}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            }
            card={(p) => (
              <>
                <span className="flex flex-wrap items-center justify-between gap-2">
                  <strong className="tabular-nums">
                    {p.kind === 'refund' ? '− ' : ''}
                    {fmtAmount(p.amount, p.currency)}
                  </strong>
                  <StatusPill tone={paymentTone(p.status)}>
                    {PAYMENT_STATE_LABELS[p.status]}
                  </StatusPill>
                </span>
                <span className="text-sm text-muted">
                  <span className="font-mono">{p.orderNumber}</span>
                  {p.customerName && ` · ${p.customerName}`} · {PAYMENT_METHOD_LABELS[p.method]} ·{' '}
                  {fmtDate(p.createdAt)}
                </span>
              </>
            )}
            empty={
              <EmptyState title="Aucun paiement">
                {search || status !== 'all'
                  ? 'Aucun paiement ne correspond à ces filtres.'
                  : 'Les paiements déclarés par vos clients ou saisis par votre équipe apparaîtront ici.'}
              </EmptyState>
            }
          />
          {all?.length === LIST_LIMIT && (
            <p className="text-xs text-muted">
              Seuls les {LIST_LIMIT} paiements les plus récents sont affichés ; l’export contient
              l’historique complet.
            </p>
          )}
        </>
      )}

      {tab === 'soldes' && (
        <section aria-labelledby="p-owed" className="flex flex-col gap-3">
          <h2 id="p-owed" className="font-display text-lg font-bold">
            Qui doit combien
          </h2>
          {!owed && !error && <Loading lines={2} />}
          {owed && owed.length === 0 && (
            <EmptyState title="Aucun solde en attente">Tout est payé.</EmptyState>
          )}
          {owed && owed.length > 0 && (
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-3">
              {owed.map((b) => (
                <li
                  key={`${b.orgCustomerId}-${b.currency}`}
                  className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-4"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <strong>{b.customerName}</strong>
                    <strong className="font-display text-lg tabular-nums text-primary-strong">
                      {fmtAmount(b.outstanding, b.currency)}
                    </strong>
                  </div>
                  <div
                    className="h-1.5 overflow-hidden rounded-full bg-sunken"
                    role="img"
                    aria-label={`Payé ${fmtAmount(b.paid, b.currency)} sur ${fmtAmount(b.due, b.currency)}`}
                  >
                    <div
                      className="h-full rounded-full bg-ok"
                      style={{ width: `${b.due > 0 ? Math.min(100, (b.paid / b.due) * 100) : 0}%` }}
                    />
                  </div>
                  <span className="text-sm text-muted">
                    Payé {fmtAmount(b.paid, b.currency)} sur {fmtAmount(b.due, b.currency)}
                    {b.pendingVerification > 0 &&
                      ` · ${fmtAmount(b.pendingVerification, b.currency)} à vérifier`}
                  </span>
                  <ul className="flex flex-col border-t border-line pt-2 text-sm">
                    {b.orders
                      .filter((o) => o.outstanding > 0)
                      .map((o) => (
                        <li key={o.id} className="flex justify-between gap-2 py-0.5">
                          <Link
                            href={`/pro/commandes/${o.id}`}
                            className="font-mono font-semibold text-primary-strong hover:underline"
                          >
                            {o.number}
                          </Link>
                          <span className="tabular-nums">
                            {fmtAmount(o.outstanding, b.currency)}
                          </span>
                        </li>
                      ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </main>
  );
}
