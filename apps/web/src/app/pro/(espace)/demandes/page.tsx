'use client';

import { RequestItemSchema, type OrgCustomerInfo, type OrgRequestSummary } from '@konzia/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ProNav } from '@/components/pro-nav';
import { ResponsiveList } from '@/components/responsive-list';
import { StatusPill } from '@/components/status-pill';
import { Button, Card, Field, Notice, Loading, EmptyState } from '@/components/ui';
import { api, ApiError, fieldErrors } from '@/lib/api';
import { fmtDate } from '@/lib/format';
import { RECIPIENT_STATUS_LABELS, recipientTone } from '@/lib/request-status';
import { useActiveOrg } from '@/lib/use-org';

export default function ProRequestsPage() {
  const router = useRouter();
  const org = useActiveOrg();
  const [list, setList] = useState<OrgRequestSummary[]>();
  const [creating, setCreating] = useState(false);

  const load = useCallback(
    async (orgId: string) => {
      try {
        setList(await api<OrgRequestSummary[]>('/org/requests', { org: orgId }));
      } catch (err) {
        if (err instanceof ApiError && err.status === 401)
          router.replace('/connexion?suite=/pro/demandes');
        else router.replace('/pro');
      }
    },
    [router],
  );

  useEffect(() => {
    if (org) void load(org);
  }, [org, load]);

  if (!org) return null;
  const todo = list?.filter((r) => ['sent', 'viewed', 'evaluating'].includes(r.status)) ?? [];
  const done = list?.filter((r) => !['sent', 'viewed', 'evaluating'].includes(r.status)) ?? [];

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-5 px-4 py-10 lg:max-w-5xl lg:px-8">
      <ProNav />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold">Demandes de devis</h1>
        {!creating && (
          <Button onClick={() => setCreating(true)}>Nouvelle demande pour un client</Button>
        )}
      </div>
      {creating && (
        <div className="lg:max-w-2xl">
          <ManagedRequestForm
            org={org}
            onCancel={() => setCreating(false)}
            onCreated={(id) => router.push(`/pro/demandes/${id}`)}
          />
        </div>
      )}
      {!list && <Loading />}
      {list?.length === 0 && (
        <EmptyState title="Aucune demande pour l’instant">
          Les demandes de vos clients Konzia arrivent ici ; vous pouvez aussi saisir celles reçues
          par WhatsApp.
        </EmptyState>
      )}
      {todo.length > 0 && <RequestList title={`À traiter (${todo.length})`} items={todo} />}
      {done.length > 0 && <RequestList title="Traitées" items={done} />}
    </main>
  );
}

function RequestList({ title, items }: { title: string; items: OrgRequestSummary[] }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-display text-lg font-bold">{title}</h2>
      <ResponsiveList
        rows={items}
        href={(r) => `/pro/demandes/${r.id}`}
        caption={title}
        columns={[
          { label: 'Client', cell: (r) => r.customerName },
          {
            label: 'Articles',
            cell: (r) => (
              <span className="line-clamp-1 text-muted">
                {r.itemCount} article(s){r.firstItemTitle ? ` · ${r.firstItemTitle}` : ''}
              </span>
            ),
          },
          {
            label: 'Reçue le',
            cell: (r) => <span className="text-muted">{fmtDate(r.sentAt)}</span>,
          },
          {
            label: 'Statut',
            cell: (r) => (
              <StatusPill tone={recipientTone(r.status)}>
                {RECIPIENT_STATUS_LABELS[r.status]}
              </StatusPill>
            ),
          },
        ]}
        card={(r) => (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <strong>{r.customerName}</strong>
              <StatusPill tone={recipientTone(r.status)}>
                {RECIPIENT_STATUS_LABELS[r.status]}
              </StatusPill>
            </div>
            <span className="text-sm text-muted">
              {r.itemCount} article(s){r.firstItemTitle ? ` · ${r.firstItemTitle}` : ''} · reçue le{' '}
              {fmtDate(r.sentAt)}
            </span>
          </>
        )}
      />
    </section>
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
    <Card>
      <h2 className="font-display text-lg font-bold">Demande reçue par WhatsApp ou en boutique</h2>
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
    </Card>
  );
}
