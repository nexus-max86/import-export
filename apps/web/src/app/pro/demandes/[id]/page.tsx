'use client';

import { formatPhone, whatsappLink, type RequestDetail } from '@konzia/shared';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { ProNav } from '@/components/pro-nav';
import { RequestItems } from '@/components/request-items';
import { StatusPill } from '@/components/status-pill';
import { Button, Card, Field, Notice } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { fmtDate } from '@/lib/format';
import { RECIPIENT_STATUS_LABELS, recipientTone } from '@/lib/request-status';
import { useActiveOrg } from '@/lib/use-org';

export default function ProRequestPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const org = useActiveOrg();
  const [r, setR] = useState<RequestDetail>();
  const [error, setError] = useState<string>();
  const [declining, setDeclining] = useState(false);

  useEffect(() => {
    if (!org) return;
    api<RequestDetail>(`/org/requests/${id}`, { org }).then(setR, (err: unknown) => {
      if (err instanceof ApiError && err.status === 401)
        router.replace(`/connexion?suite=/pro/demandes/${id}`);
      else setError(err instanceof ApiError ? err.message : 'Chargement impossible.');
    });
  }, [id, org, router]);

  async function decline(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const reason = String(new FormData(e.currentTarget).get('reason') ?? '').trim();
    try {
      await api(`/org/requests/${id}/decline`, { org: org!, body: { reason } });
      setR(await api<RequestDetail>(`/org/requests/${id}`, { org: org! }));
      setDeclining(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Action impossible.');
    }
  }

  if (!org) return null;
  const mine = r?.recipients[0];
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-5 px-4 py-10">
      <ProNav />
      <Link href="/pro/demandes" className="text-sm font-semibold text-copper underline">
        ← Toutes les demandes
      </Link>
      {error && <Notice tone="error">{error}</Notice>}
      {!r && !error && <p className="text-muted">Chargement…</p>}
      {r && mine && r.customer && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h1 className="font-display text-2xl font-bold">{r.customer.fullName}</h1>
            <StatusPill tone={recipientTone(mine.status)}>
              {RECIPIENT_STATUS_LABELS[mine.status]}
            </StatusPill>
          </div>
          <Card>
            <p className="text-sm text-muted">
              Reçue le {fmtDate(r.sentAt)} ·{' '}
              {r.customer.hasAccount ? 'client avec compte Konzia' : 'client géré'}
            </p>
            {r.deliveryAddress && (
              <p className="text-sm">
                Livraison : {r.deliveryAddress.line},{' '}
                {r.deliveryAddress.zone ? `${r.deliveryAddress.zone}, ` : ''}
                {r.deliveryAddress.city}
                {r.deliveryAddress.landmark ? ` (repère : ${r.deliveryAddress.landmark})` : ''}
              </p>
            )}
            {r.note && <p className="text-sm">Message du client : {r.note}</p>}
            {r.customer.phoneWhatsapp && (
              <p className="text-sm">
                WhatsApp :{' '}
                <span className="font-semibold select-all">
                  {formatPhone(r.customer.phoneWhatsapp)}
                </span>{' '}
                <a
                  className="font-semibold text-copper underline"
                  target="_blank"
                  rel="noreferrer"
                  href={whatsappLink(
                    r.customer.phoneWhatsapp,
                    `Bonjour ${r.customer.fullName}, au sujet de votre demande Konzia :`,
                  )}
                >
                  Écrire
                </a>
              </p>
            )}
          </Card>
          <Card>
            <h2 className="font-display text-lg font-bold">Articles ({r.items.length})</h2>
            <RequestItems items={r.items} />
            <p className="text-sm text-muted">
              Les prix lus sur les sites sont indicatifs : vérifiez prix, variante et disponibilité
              avant votre devis.
            </p>
          </Card>
          {['sent', 'viewed', 'evaluating'].includes(mine.status) && (
            <Card>
              <Button
                onClick={async () => {
                  try {
                    const q = await api<{ id: string }>(`/org/requests/${id}/quote`, {
                      method: 'POST',
                      org: org!,
                    });
                    router.push(`/pro/devis/${q.id}`);
                  } catch (err) {
                    setError(err instanceof ApiError ? err.message : 'Action impossible.');
                  }
                }}
              >
                {r.quoteId ? 'Continuer le devis' : 'Préparer le devis'}
              </Button>
              {declining ? (
                <form onSubmit={decline} className="flex flex-col gap-3">
                  <Field
                    id="reason"
                    label="Motif (visible du client)"
                    placeholder="Ex. : article interdit à l’importation"
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button type="submit">Décliner la demande</Button>
                    <Button type="button" variant="ghost" onClick={() => setDeclining(false)}>
                      Annuler
                    </Button>
                  </div>
                </form>
              ) : (
                <Button variant="ghost" onClick={() => setDeclining(true)}>
                  Décliner cette demande
                </Button>
              )}
            </Card>
          )}
          {mine.status === 'quoted' && r.quoteId && (
            <Link
              href={`/pro/devis/${r.quoteId}`}
              className="flex min-h-11 items-center justify-center rounded-lg border border-line px-4 font-semibold"
            >
              Voir le devis envoyé
            </Link>
          )}
          {mine.declineReason && <Notice>Demande déclinée : {mine.declineReason}</Notice>}
        </>
      )}
    </main>
  );
}
