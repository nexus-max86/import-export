'use client';

import {
  MOBILE_MONEY_PROVIDERS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHODS,
  PAYMENT_STATE_LABELS,
  type OrderDetail,
  type PaymentInfo,
  type PaymentInstruction,
  type PaymentMethod,
} from '@konzia/shared';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { StatusPill } from '@/components/status-pill';
import { Button, Card, Field, Notice } from '@/components/ui';
import { api, ApiError, apiUpload } from '@/lib/api';
import { fmtAmount, fmtDate } from '@/lib/format';
import { inputToMinor, minorToInput } from '@/lib/money-input';

export const paymentTone = (s: PaymentInfo['status']) =>
  s === 'confirmed'
    ? 'ok'
    : s === 'pending_verification'
      ? 'warn'
      : s === 'rejected'
        ? 'bad'
        : 'neutral';

export function PaymentHistory({
  payments,
  actions,
}: {
  payments: PaymentInfo[];
  actions?: (p: PaymentInfo) => React.ReactNode;
}) {
  if (payments.length === 0)
    return <p className="text-sm text-muted">Aucun paiement pour l’instant.</p>;
  return (
    <ul className="flex flex-col gap-2">
      {payments.map((p) => (
        <li key={p.id} className="flex flex-col gap-1 rounded-lg border border-line p-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <strong className="tabular-nums">
              {p.kind === 'refund' ? 'Remboursement ' : ''}
              {fmtAmount(p.amount, p.currency)}
              {p.currency !== p.orderCurrency && (
                <span className="font-normal text-muted">
                  {' '}
                  (= {fmtAmount(p.orderAmount, p.orderCurrency)} au taux {p.fxRate})
                </span>
              )}
            </strong>
            <StatusPill tone={paymentTone(p.status)}>{PAYMENT_STATE_LABELS[p.status]}</StatusPill>
          </div>
          <span className="text-muted">
            {[
              PAYMENT_METHOD_LABELS[p.method],
              p.provider,
              p.reference && `réf. ${p.reference}`,
              fmtDate(p.createdAt),
              p.declaredByCustomer ? 'déclaré par le client' : 'enregistré par le commissionnaire',
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
          {p.note && <span>Note : {p.note}</span>}
          {p.rejectionReason && <span className="text-danger">Refusé : {p.rejectionReason}</span>}
          {actions?.(p)}
        </li>
      ))}
    </ul>
  );
}

function MethodFields({
  prefix,
  method,
  setMethod,
}: {
  prefix: string;
  method: PaymentMethod;
  setMethod: (m: PaymentMethod) => void;
}) {
  return (
    <>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${prefix}-method`} className="text-sm font-semibold">
          Moyen de paiement
        </label>
        <select
          id={`${prefix}-method`}
          value={method}
          onChange={(e) => setMethod(e.target.value as PaymentMethod)}
          className="min-h-11 rounded-lg border border-line bg-surface px-3"
        >
          {PAYMENT_METHODS.map((m) => (
            <option key={m} value={m}>
              {PAYMENT_METHOD_LABELS[m]}
            </option>
          ))}
        </select>
      </div>
      {method === 'mobile_money' && (
        <div className="flex flex-col gap-1">
          <label htmlFor={`${prefix}-provider`} className="text-sm font-semibold">
            Opérateur
          </label>
          <select
            id={`${prefix}-provider`}
            name={`${prefix}-provider`}
            className="min-h-11 rounded-lg border border-line bg-surface px-3"
          >
            {MOBILE_MONEY_PROVIDERS.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </div>
      )}
    </>
  );
}

/** Côté client : instructions, déclaration avec preuve, historique. */
export function CustomerPayments({
  order,
  onChanged,
}: {
  order: OrderDetail;
  onChanged: () => void;
}) {
  const [info, setInfo] = useState<{
    organizationName: string;
    instructions: PaymentInstruction[];
  }>();
  const [payments, setPayments] = useState<PaymentInfo[]>([]);
  const [method, setMethod] = useState<PaymentMethod>('mobile_money');
  const [proof, setProof] = useState<{ id: string; name: string }>();
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string }>();
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState(() => crypto.randomUUID());

  const load = useCallback(async () => {
    setPayments(await api<PaymentInfo[]>(`/orders/${order.id}/payments`));
  }, [order.id]);

  useEffect(() => {
    void load();
    api<{ organizationName: string; instructions: PaymentInstruction[] }>(
      `/orders/${order.id}/payment-instructions`,
    ).then(setInfo, () => undefined);
  }, [order.id, load]);

  const paid = payments
    .filter((p) => p.status === 'confirmed')
    .reduce((s, p) => s + (p.kind === 'refund' ? -p.orderAmount : p.orderAmount), 0);
  const pending = payments
    .filter((p) => p.status === 'pending_verification')
    .reduce((s, p) => s + p.orderAmount, 0);
  const remaining = Math.max(order.finalAmount - paid - pending, 0);
  // Décision D-1 : une commande terminée avec un solde dû accepte encore une déclaration.
  const owes = order.paymentStatus === 'unpaid' || order.paymentStatus === 'partially_paid';
  const open = order.status !== 'cancelled' && (order.status !== 'completed' || owes);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const amount = inputToMinor(String(f.get('pay-amount') ?? ''));
    if (!amount) {
      setMsg({ tone: 'error', text: 'Indiquez le montant payé, par exemple 135,68.' });
      return;
    }
    setBusy(true);
    setMsg(undefined);
    try {
      await api(`/orders/${order.id}/payments`, {
        body: {
          method,
          provider: method === 'mobile_money' ? String(f.get('pay-provider') ?? '') : null,
          amount,
          currency: String(f.get('pay-currency')),
          reference: String(f.get('pay-reference') ?? '') || null,
          proofFileId: proof?.id ?? null,
          idempotencyKey: key,
        },
      });
      setKey(crypto.randomUUID());
      setProof(undefined);
      setMsg({
        tone: 'ok',
        text: 'Paiement envoyé. Il sera « payé » dès que le commissionnaire aura confirmé la réception.',
      });
      await load();
      onChanged();
    } catch (err) {
      setMsg({
        tone: 'error',
        text:
          err instanceof ApiError
            ? err.message
            : 'Envoi impossible. Réessayez : votre paiement ne sera pas compté deux fois.',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <h2 className="font-display text-lg font-bold">Paiement</h2>
      <p className="text-sm">
        Payé et confirmé : <strong>{fmtAmount(paid, order.currency)}</strong> sur{' '}
        {fmtAmount(order.finalAmount, order.currency)}
        {pending > 0 && ` · ${fmtAmount(pending, order.currency)} à vérifier`}
      </p>
      {open && remaining > 0 && info && (
        <div className="flex flex-col gap-2 rounded-lg bg-primary-soft p-3 text-sm">
          <strong>Comment payer {info.organizationName}</strong>
          {info.instructions.length === 0 && (
            <span>
              Le commissionnaire n’a pas encore indiqué ses moyens de paiement. Contactez-le sur
              WhatsApp.
            </span>
          )}
          {info.instructions.map((i, idx) => (
            <span key={idx}>
              {PAYMENT_METHOD_LABELS[i.method]}
              {i.provider ? ` ${i.provider}` : ''} :{' '}
              {i.accountNumber && (
                <span className="font-semibold select-all">{i.accountNumber}</span>
              )}{' '}
              ({i.accountName}){i.details ? ` · ${i.details}` : ''}
            </span>
          ))}
          <span className="text-muted">
            Vous payez directement le commissionnaire. Konzia ne détient pas votre argent.
          </span>
        </div>
      )}
      {open && remaining > 0 && (
        // Recréé quand le reste à payer change (ajustement accepté, paiement confirmé) pour pré-remplir le bon montant.
        <form key={remaining} onSubmit={submit} className="flex flex-col gap-3">
          <h3 className="font-semibold">J’ai payé : envoyer la preuve</h3>
          <MethodFields prefix="pay" method={method} setMethod={setMethod} />
          <div className="grid grid-cols-[minmax(0,1fr)_6rem] gap-3">
            <Field
              id="pay-amount"
              label="Montant payé"
              inputMode="decimal"
              defaultValue={minorToInput(remaining)}
            />
            <div className="flex flex-col gap-1">
              <label htmlFor="pay-currency" className="text-sm font-semibold">
                Devise
              </label>
              <select
                id="pay-currency"
                name="pay-currency"
                defaultValue={order.currency}
                className="min-h-11 rounded-lg border border-line bg-surface px-2"
              >
                <option>USD</option>
                <option>CDF</option>
              </select>
            </div>
          </div>
          <Field
            id="pay-reference"
            label="Référence de la transaction"
            placeholder="Ex. : MP241121.1042.K93811"
          />
          <label className="flex min-h-11 cursor-pointer items-center justify-center rounded-lg border border-line px-4 text-sm font-semibold focus-within:ring-2 focus-within:ring-primary">
            {proof
              ? `Preuve : ${proof.name} (changer)`
              : 'Joindre une capture ou un reçu (recommandé)'}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              className="sr-only"
              aria-label="Joindre une preuve de paiement"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const fd = new FormData();
                fd.set('file', file);
                try {
                  const r = await apiUpload<{ fileId: string }>('/payments/proofs', fd);
                  setProof({ id: r.fileId, name: file.name });
                } catch (err) {
                  setMsg({
                    tone: 'error',
                    text: err instanceof ApiError ? err.message : 'Envoi impossible.',
                  });
                }
              }}
            />
          </label>
          <Button type="submit" busy={busy}>
            Envoyer mon paiement
          </Button>
        </form>
      )}
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <PaymentHistory
        payments={payments}
        actions={(p) =>
          p.status === 'pending_verification' && p.declaredByCustomer ? (
            <button
              type="button"
              className="self-start text-sm font-semibold text-primary underline"
              onClick={async () => {
                await api(`/payments/${p.id}/cancel`, { method: 'POST' });
                await load();
                onChanged();
              }}
            >
              Annuler cette déclaration
            </button>
          ) : null
        }
      />
    </Card>
  );
}

/** Côté commissionnaire : historique, paiement reçu hors application, remboursement. */
export function OrgOrderPayments({
  org,
  order,
  onChanged,
}: {
  org: string;
  order: OrderDetail;
  onChanged: () => void;
}) {
  const [payments, setPayments] = useState<PaymentInfo[]>([]);
  const [mode, setMode] = useState<'idle' | 'record' | 'refund'>('idle');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string }>();
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState(() => crypto.randomUUID());

  const load = useCallback(async () => {
    try {
      setPayments(await api<PaymentInfo[]>(`/org/payments?commande=${order.id}`, { org }));
    } catch {
      setPayments([]);
    }
  }, [org, order.id]);
  useEffect(() => {
    void load();
  }, [load]);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const amount = inputToMinor(String(f.get('rec-amount') ?? ''));
    if (!amount) {
      setMsg({ tone: 'error', text: 'Indiquez un montant.' });
      return;
    }
    setBusy(true);
    setMsg(undefined);
    try {
      await api(`/org/orders/${order.id}/${mode === 'refund' ? 'refunds' : 'payments'}`, {
        org,
        body: {
          method,
          provider: method === 'mobile_money' ? String(f.get('rec-provider') ?? '') : null,
          amount,
          currency: String(f.get('rec-currency')),
          reference: String(f.get('rec-reference') ?? '') || null,
          note: String(f.get('rec-note') ?? '') || null,
          idempotencyKey: key,
        },
      });
      setKey(crypto.randomUUID());
      setMode('idle');
      setMsg({
        tone: 'ok',
        text: mode === 'refund' ? 'Remboursement enregistré.' : 'Paiement enregistré.',
      });
      await load();
      onChanged();
    } catch (err) {
      setMsg({
        tone: 'error',
        text: err instanceof ApiError ? err.message : 'Enregistrement impossible.',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <h2 className="font-display text-lg font-bold">Paiements</h2>
      <PaymentHistory payments={payments} />
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      {mode === 'idle' ? (
        <div className="flex flex-wrap gap-2">
          {order.status !== 'cancelled' && (
            <Button variant="ghost" onClick={() => setMode('record')}>
              Enregistrer un paiement reçu
            </Button>
          )}
          {payments.some((p) => p.status === 'confirmed' && p.kind === 'payment') && (
            <Button variant="ghost" onClick={() => setMode('refund')}>
              Enregistrer un remboursement
            </Button>
          )}
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-3 border-t border-line pt-3">
          <h3 className="font-semibold">
            {mode === 'refund' ? 'Remboursement au client' : 'Paiement reçu (espèces, WhatsApp…)'}
          </h3>
          <MethodFields prefix="rec" method={method} setMethod={setMethod} />
          <div className="grid grid-cols-[minmax(0,1fr)_6rem] gap-3">
            <Field id="rec-amount" label="Montant" inputMode="decimal" />
            <div className="flex flex-col gap-1">
              <label htmlFor="rec-currency" className="text-sm font-semibold">
                Devise
              </label>
              <select
                id="rec-currency"
                name="rec-currency"
                defaultValue={order.currency}
                className="min-h-11 rounded-lg border border-line bg-surface px-2"
              >
                <option>USD</option>
                <option>CDF</option>
              </select>
            </div>
          </div>
          <Field id="rec-reference" label="Référence (facultatif)" />
          <Field
            id="rec-note"
            label={mode === 'refund' ? 'Motif du remboursement' : 'Note (facultatif)'}
          />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" busy={busy}>
              {mode === 'refund' ? 'Enregistrer le remboursement' : 'Enregistrer le paiement'}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setMode('idle')}>
              Annuler
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}
