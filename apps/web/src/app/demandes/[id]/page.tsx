'use client';

import type { QuoteInfo, RequestDetail } from '@konzia/shared';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { QuoteCard } from '@/components/quote-card';
import { RequestItems } from '@/components/request-items';
import { StatusPill } from '@/components/status-pill';
import { Button, Card, Logo, Notice } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { fmtDate } from '@/lib/format';
import {
  RECIPIENT_STATUS_LABELS,
  REQUEST_STATUS_LABELS,
  recipientTone,
  requestTone,
} from '@/lib/request-status';

export default function RequestPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [r, setR] = useState<RequestDetail>();
  const [error, setError] = useState<string>();
  const [confirm, setConfirm] = useState(false);
  const [quotes, setQuotes] = useState<QuoteInfo[]>([]);

  const loadQuotes = () =>
    api<QuoteInfo[]>(`/requests/${id}/quotes`).then(setQuotes, () => undefined);

  useEffect(() => {
    void api<QuoteInfo[]>(`/requests/${id}/quotes`).then(setQuotes, () => undefined);
    api<RequestDetail>(`/requests/${id}`).then(setR, (err: unknown) => {
      if (err instanceof ApiError && err.status === 401)
        router.replace(`/connexion?suite=/demandes/${id}`);
      else setError(err instanceof ApiError ? err.message : 'Chargement impossible.');
    });
  }, [id, router]);

  if (error)
    return (
      <main className="mx-auto max-w-md px-4 py-10">
        <Notice tone="error">{error}</Notice>
      </main>
    );
  if (!r) return <main className="mx-auto max-w-md px-4 py-10 text-muted">Chargement…</main>;

  const open = ['sent', 'partially_quoted', 'quoted'].includes(r.status);
  return (
    <main className="mx-auto flex max-w-md flex-col gap-5 px-4 py-10">
      <Logo />
      <Link href="/demandes" className="text-sm font-semibold text-copper underline">
        ← Mes demandes
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-display text-2xl font-bold">
          Demande du {fmtDate(r.sentAt ?? r.createdAt)}
        </h1>
        <StatusPill tone={requestTone(r.status)}>{REQUEST_STATUS_LABELS[r.status]}</StatusPill>
      </div>
      {quotes.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="font-display text-lg font-bold">
            {quotes.length > 1 ? `Comparer les ${quotes.length} devis` : 'Devis reçu'}
          </h2>
          <p className="text-sm text-muted">
            Chaque devis vient d’un commissionnaire différent ; chaque devis accepté devient une
            commande séparée.
          </p>
          {quotes.map((q) => (
            <QuoteCard
              key={q.id}
              quote={q}
              onAccepted={(orderId) => router.push(`/commandes/${orderId}`)}
              onChanged={() => void loadQuotes()}
            />
          ))}
        </section>
      )}
      <Card>
        <h2 className="font-display text-lg font-bold">Commissionnaires</h2>
        <ul className="flex flex-col gap-2">
          {r.recipients.map((x) => (
            <li
              key={x.slug}
              className="flex flex-col gap-1 border-b border-line pb-2 last:border-0"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Link href={`/commissionnaires/${x.slug}`} className="font-semibold underline">
                  {x.organizationName}
                </Link>
                <StatusPill tone={recipientTone(x.status)}>
                  {RECIPIENT_STATUS_LABELS[x.status]}
                </StatusPill>
              </div>
              {x.declineReason && (
                <span className="text-sm text-muted">Motif : {x.declineReason}</span>
              )}
            </li>
          ))}
        </ul>
        <p className="text-sm text-muted">Vous recevrez une notification dès qu’un devis arrive.</p>
      </Card>
      <Card>
        <h2 className="font-display text-lg font-bold">Articles</h2>
        <RequestItems items={r.items} />
      </Card>
      {open &&
        (confirm ? (
          <Button
            variant="ghost"
            onClick={async () => {
              setR(await api<RequestDetail>(`/requests/${r.id}/cancel`, { method: 'POST' }));
              setConfirm(false);
            }}
          >
            Confirmer l’annulation de la demande
          </Button>
        ) : (
          <Button variant="ghost" onClick={() => setConfirm(true)}>
            Annuler la demande
          </Button>
        ))}
    </main>
  );
}
