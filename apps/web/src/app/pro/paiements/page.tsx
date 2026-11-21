'use client';

import { type CustomerBalance, type PaymentInfo } from '@konzia/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { PaymentHistory } from '@/components/payments';
import { ProNav } from '@/components/pro-nav';
import { Button, Card, Field, Notice } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { fmtAmount } from '@/lib/format';
import { useActiveOrg } from '@/lib/use-org';

export default function ProPaymentsPage() {
  const router = useRouter();
  const org = useActiveOrg();
  const [pending, setPending] = useState<PaymentInfo[]>();
  const [balances, setBalances] = useState<CustomerBalance[]>();
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string }>();
  const [rejecting, setRejecting] = useState<string>();
  const [reason, setReason] = useState('');

  const load = useCallback(async () => {
    if (!org) return;
    try {
      const [p, b] = await Promise.all([
        api<PaymentInfo[]>('/org/payments?statut=a-verifier', { org }),
        api<CustomerBalance[]>('/org/balances', { org }),
      ]);
      setPending(p);
      setBalances(b);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401)
        router.replace('/connexion?suite=/pro/paiements');
      else if (err instanceof ApiError) setMsg({ tone: 'error', text: err.message });
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

  if (!org) return null;
  const owed = balances?.filter((b) => b.outstanding > 0) ?? [];
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-5 px-4 py-10">
      <ProNav />
      <h1 className="font-display text-2xl font-bold">Paiements</h1>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <Card>
        <h2 className="font-display text-lg font-bold">À vérifier ({pending?.length ?? '…'})</h2>
        <p className="text-sm text-muted">
          Vérifiez sur votre relevé (M-Pesa, Orange Money, banque) avant de confirmer.
        </p>
        {pending && (
          <PaymentHistory
            payments={pending}
            actions={(p) => (
              <div className="flex flex-col gap-2">
                <span className="text-sm">
                  Commande{' '}
                  <Link className="font-mono underline" href={`/pro/commandes/${p.orderId}`}>
                    {p.orderNumber}
                  </Link>
                  {p.hasProof && (
                    <>
                      {' · '}
                      <a
                        className="underline"
                        href={`/api/org/payments/${p.id}/proof`}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => {
                          // L'en-tête d'organisation est requis : on ouvre la preuve via fetch.
                          e.preventDefault();
                          void fetch(`/api/org/payments/${p.id}/proof`, {
                            headers: { 'x-konzia-org': org },
                          })
                            .then((r) => r.blob())
                            .then((b) => window.open(URL.createObjectURL(b), '_blank'));
                        }}
                      >
                        Voir la preuve
                      </a>
                    </>
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
                      <Button type="button" variant="ghost" onClick={() => setRejecting(undefined)}>
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
        )}
      </Card>
      <Card>
        <h2 className="font-display text-lg font-bold">Qui doit combien</h2>
        {balances && owed.length === 0 && (
          <p className="text-sm text-muted">Aucun solde en attente : tout est payé.</p>
        )}
        <ul className="flex flex-col gap-3">
          {owed.map((b) => (
            <li
              key={`${b.orgCustomerId}-${b.currency}`}
              className="flex flex-col gap-1 rounded-lg border border-line p-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong>{b.customerName}</strong>
                <strong className="tabular-nums text-copper">
                  {fmtAmount(b.outstanding, b.currency)}
                </strong>
              </div>
              <span className="text-sm text-muted">
                Payé {fmtAmount(b.paid, b.currency)} sur {fmtAmount(b.due, b.currency)}
                {b.pendingVerification > 0 &&
                  ` · ${fmtAmount(b.pendingVerification, b.currency)} à vérifier`}
              </span>
              <span className="text-sm">
                {b.orders
                  .filter((o) => o.outstanding > 0)
                  .map((o) => (
                    <Link
                      key={o.id}
                      href={`/pro/commandes/${o.id}`}
                      className="mr-3 font-mono underline"
                    >
                      {o.number} : {fmtAmount(o.outstanding, b.currency)}
                    </Link>
                  ))}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </main>
  );
}
