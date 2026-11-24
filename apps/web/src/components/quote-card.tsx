'use client';

import { convertMinor, parseRate, QUOTE_STATUS_LABELS, type QuoteInfo } from '@konzia/shared';
import { useState } from 'react';
import { StatusPill } from '@/components/status-pill';
import { Button, Field, Notice } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { fmtAmount, fmtDate } from '@/lib/format';

/** Devis reçu par le client, avec ses actions (accepter, corriger, refuser). */
export function QuoteCard({
  quote,
  onAccepted,
  onChanged,
}: {
  quote: QuoteInfo;
  onAccepted: (orderId: string) => void;
  onChanged: () => void;
}) {
  const v = quote.current!;
  const [mode, setMode] = useState<'idle' | 'accept' | 'changes' | 'reject'>('idle');
  const [text, setText] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const open =
    (quote.status === 'sent' || quote.status === 'changes_requested') && v.status === 'sent';
  const cdf =
    v.currency === 'USD' && v.fxUsdCdf
      ? convertMinor(BigInt(v.totalAmount), parseRate(v.fxUsdCdf)!)
      : null;

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(undefined);
    try {
      await action();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Action impossible.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-lg font-bold">{quote.organizationName}</h3>
        <StatusPill tone={quote.status === 'accepted' ? 'ok' : open ? 'warn' : 'neutral'}>
          {QUOTE_STATUS_LABELS[quote.status]} · v{v.versionNo}
        </StatusPill>
      </div>
      <table className="w-full text-sm">
        <tbody>
          {v.lines.map((l) => (
            <tr key={l.id} className="border-b border-line align-top">
              <td className="py-1.5 pr-2">
                {l.description}
                {l.quantity > 1 && ` × ${l.quantity}`}
                {l.isEstimate && (
                  <span className="ml-1 text-xs font-semibold text-primary">estimation</span>
                )}
              </td>
              <td className="py-1.5 text-right tabular-nums whitespace-nowrap">
                {fmtAmount(l.amount, v.currency)}
              </td>
            </tr>
          ))}
          <tr>
            <td className="pt-2 font-bold">Total</td>
            <td className="pt-2 text-right font-display text-lg font-bold tabular-nums whitespace-nowrap">
              {fmtAmount(v.totalAmount, v.currency)}
            </td>
          </tr>
        </tbody>
      </table>
      {cdf !== null && (
        <p className="text-sm text-muted">
          ≈ {fmtAmount(Number(cdf), 'CDF')} au taux de {v.fxUsdCdf} CDF ({v.fxSource},{' '}
          {fmtDate(v.fxAt)})
        </p>
      )}
      <p className="text-sm">
        Délai estimé : {v.leadTimeMinDays} à {v.leadTimeMaxDays} jours · valable jusqu’au{' '}
        {fmtDate(v.validUntil)}
      </p>
      {v.lines.some((l) => l.isEstimate) && (
        <p className="text-xs text-muted">
          « estimation » : le montant final peut varier. Toute hausse vous sera soumise pour accord.
        </p>
      )}
      {v.assumptions && <p className="text-sm">Hypothèses : {v.assumptions}</p>}
      {v.cancellationTerms && (
        <p className="text-sm">Annulation et remboursement : {v.cancellationTerms}</p>
      )}
      {quote.status === 'changes_requested' && (
        <Notice>
          Correction demandée : {quote.changeRequest}. En attente de la nouvelle version.
        </Notice>
      )}
      {error && <Notice tone="error">{error}</Notice>}
      {open && mode === 'idle' && (
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setMode('accept')}>Accepter ce devis</Button>
          <Button variant="ghost" onClick={() => setMode('changes')}>
            Demander une correction
          </Button>
          <Button variant="ghost" onClick={() => setMode('reject')}>
            Refuser
          </Button>
        </div>
      )}
      {mode === 'accept' && (
        <div className="flex flex-col gap-2 rounded-lg bg-primary-soft p-3">
          <p className="text-sm">
            En acceptant, vous créez une commande chez {quote.organizationName} pour{' '}
            {fmtAmount(v.totalAmount, v.currency)}. Vous paierez ensuite le commissionnaire selon
            ses instructions.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              busy={busy}
              onClick={() =>
                run(async () => {
                  const r = await api<{ orderId: string }>(`/quotes/${quote.id}/accept`, {
                    body: { versionId: v.id },
                  });
                  onAccepted(r.orderId);
                })
              }
            >
              Confirmer et créer la commande
            </Button>
            <Button variant="ghost" onClick={() => setMode('idle')}>
              Annuler
            </Button>
          </div>
        </div>
      )}
      {(mode === 'changes' || mode === 'reject') && (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              if (mode === 'changes')
                await api(`/quotes/${quote.id}/request-changes`, { body: { message: text } });
              else await api(`/quotes/${quote.id}/reject`, { body: { reason: text || null } });
              setMode('idle');
              onChanged();
            });
          }}
        >
          <Field
            id={`t-${quote.id}`}
            label={mode === 'changes' ? 'Que faut-il corriger ?' : 'Motif (facultatif)'}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" busy={busy}>
              {mode === 'changes' ? 'Envoyer la demande de correction' : 'Refuser ce devis'}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setMode('idle')}>
              Annuler
            </Button>
          </div>
        </form>
      )}
    </article>
  );
}
