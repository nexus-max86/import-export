'use client';

import {
  CANCELLABLE_STATUSES,
  ORDER_STATUS_LABELS,
  ORG_NEXT_STATUSES,
  type OrderDetail,
} from '@konzia/shared';
import { useState, type FormEvent } from 'react';
import { Button, Card, Field, Notice } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { fmtAmount } from '@/lib/format';
import { inputToMinor } from '@/lib/money-input';

/** Actions du commissionnaire sur une commande. */
export function OrgOrderActions({
  org,
  order,
  onChange,
}: {
  org: string;
  order: OrderDetail;
  onChange: (o: OrderDetail) => void;
}) {
  const [error, setError] = useState<string>();
  const [mode, setMode] = useState<'idle' | 'cancel' | 'adjust'>('idle');
  const [busy, setBusy] = useState<string>();
  // Avant paiement complet, « Achat en cours » n'est proposé que si la règle d'achat le permet.
  const next = (ORG_NEXT_STATUSES[order.status] ?? []).filter(
    (s) => s !== 'purchasing' || order.status === 'paid' || order.purchaseRule !== 'full_payment',
  );
  const pending = order.adjustments.find((a) => a.status === 'proposed');
  const closed = order.status === 'completed' || order.status === 'cancelled';

  async function run(key: string, path: string, body: object) {
    setBusy(key);
    setError(undefined);
    try {
      onChange(await api<OrderDetail>(`/org/orders/${order.id}/${path}`, { org, body }));
      setMode('idle');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Action impossible.');
    } finally {
      setBusy(undefined);
    }
  }

  function propose(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const minor = inputToMinor(String(f.get('adjAmount') ?? ''));
    if (!minor) {
      setError('Indiquez un montant, par exemple 12,50.');
      return;
    }
    const sign = f.get('adjKind') === 'discount' ? -1 : 1;
    void run('adjust', 'adjustments', {
      amountDelta: sign * minor,
      reason: String(f.get('adjReason') ?? ''),
    });
  }

  if (closed && !pending) return null;
  return (
    <Card>
      <h2 className="font-display text-lg font-bold">Faire avancer la commande</h2>
      {order.status === 'awaiting_payment' && (
        <p className="text-sm text-muted">En attente du paiement du client.</p>
      )}
      {next.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {next.map((s) => (
            <Button key={s} busy={busy === s} onClick={() => run(s, 'status', { status: s })}>
              Passer à « {ORDER_STATUS_LABELS[s]} »
            </Button>
          ))}
        </div>
      )}
      {pending && (
        <Notice>
          Ajustement de {fmtAmount(pending.amountDelta, order.currency)} proposé ({pending.reason}).{' '}
          {order.customerHasAccount
            ? 'En attente de la réponse du client.'
            : 'Enregistrez la réponse du client ci-dessous.'}
        </Notice>
      )}
      {pending && !order.customerHasAccount && (
        <DecisionForm
          onSubmit={(accepted, note) =>
            run('decision', `adjustments/${pending.id}/decision`, { accepted, note })
          }
          busy={busy === 'decision'}
        />
      )}
      {error && <Notice tone="error">{error}</Notice>}
      {mode === 'idle' && !closed && (
        <div className="flex flex-wrap gap-2">
          {!pending && (
            <Button variant="ghost" onClick={() => setMode('adjust')}>
              Proposer un ajustement de prix
            </Button>
          )}
          {CANCELLABLE_STATUSES.includes(order.status) && (
            <Button variant="ghost" onClick={() => setMode('cancel')}>
              Annuler la commande
            </Button>
          )}
        </div>
      )}
      {mode === 'adjust' && (
        <form onSubmit={propose} className="flex flex-col gap-3">
          <fieldset className="flex gap-4 text-sm">
            <legend className="sr-only">Type d’ajustement</legend>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="adjKind"
                value="surcharge"
                defaultChecked
                className="size-4 accent-copper"
              />
              Supplément
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="adjKind"
                value="discount"
                className="size-4 accent-copper"
              />
              Remise
            </label>
          </fieldset>
          <Field
            id="adjAmount"
            label={`Montant (${order.currency})`}
            inputMode="decimal"
            placeholder="12,50"
          />
          <Field
            id="adjReason"
            label="Raison (visible du client)"
            placeholder="Ex. : douane plus élevée que l’estimation"
          />
          <p className="text-xs text-muted">
            Le montant de la commande ne change qu’après l’accord du client.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" busy={busy === 'adjust'}>
              Envoyer la proposition
            </Button>
            <Button type="button" variant="ghost" onClick={() => setMode('idle')}>
              Annuler
            </Button>
          </div>
        </form>
      )}
      {mode === 'cancel' && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run('cancel', 'cancel', {
              reason: String(new FormData(e.currentTarget).get('cancelReason') ?? ''),
            });
          }}
          className="flex flex-col gap-3"
        >
          <Field id="cancelReason" label="Motif de l’annulation (visible du client)" />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" busy={busy === 'cancel'}>
              Confirmer l’annulation de {order.number}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setMode('idle')}>
              Ne pas annuler
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}

function DecisionForm({
  onSubmit,
  busy,
}: {
  onSubmit: (accepted: boolean, note: string) => void;
  busy: boolean;
}) {
  const [note, setNote] = useState('');
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-line p-3">
      <Field
        id="decisionNote"
        label="Comment le client a répondu"
        placeholder="Ex. : accord par WhatsApp le 21/11"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <div className="flex flex-wrap gap-2">
        <Button busy={busy} onClick={() => onSubmit(true, note)}>
          Le client accepte
        </Button>
        <Button variant="ghost" onClick={() => onSubmit(false, note)}>
          Le client refuse
        </Button>
      </div>
    </div>
  );
}

/** Actions du client : répondre à un ajustement, annuler tant que rien n'est payé. */
export function CustomerOrderActions({
  order,
  onChange,
}: {
  order: OrderDetail;
  onChange: (o: OrderDetail) => void;
}) {
  const [error, setError] = useState<string>();
  const [cancelling, setCancelling] = useState(false);
  const pending = order.adjustments.find((a) => a.status === 'proposed');

  async function run(path: string, body: object) {
    setError(undefined);
    try {
      onChange(await api<OrderDetail>(`/orders/${order.id}/${path}`, { body }));
      setCancelling(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Action impossible.');
    }
  }

  if (!pending && order.status !== 'awaiting_payment') return null;
  return (
    <Card>
      {pending && (
        <>
          <h2 className="font-display text-lg font-bold">Ajustement proposé</h2>
          <p>
            {order.organizationName} propose{' '}
            {pending.amountDelta > 0 ? 'un supplément' : 'une remise'} de{' '}
            <strong>{fmtAmount(Math.abs(pending.amountDelta), order.currency)}</strong> :{' '}
            {pending.reason}
          </p>
          <p className="text-sm text-muted">
            Nouveau montant si vous acceptez :{' '}
            {fmtAmount(order.finalAmount + pending.amountDelta, order.currency)}. Sans votre accord,
            rien ne change.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => run(`adjustments/${pending.id}/decision`, { accepted: true })}>
              Accepter l’ajustement
            </Button>
            <Button
              variant="ghost"
              onClick={() => run(`adjustments/${pending.id}/decision`, { accepted: false })}
            >
              Refuser l’ajustement
            </Button>
          </div>
        </>
      )}
      {order.status === 'awaiting_payment' &&
        (cancelling ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run('cancel', {
                reason: String(new FormData(e.currentTarget).get('reason') ?? ''),
              });
            }}
            className="flex flex-col gap-2"
          >
            <Field id="reason" label="Pourquoi annulez-vous ?" />
            <div className="flex flex-wrap gap-2">
              <Button type="submit">Confirmer l’annulation</Button>
              <Button type="button" variant="ghost" onClick={() => setCancelling(false)}>
                Garder la commande
              </Button>
            </div>
          </form>
        ) : (
          <Button variant="ghost" onClick={() => setCancelling(true)}>
            Annuler la commande
          </Button>
        ))}
      {error && <Notice tone="error">{error}</Notice>}
    </Card>
  );
}
