'use client';

import {
  commissionOn,
  lineAmount,
  QUOTE_LINE_KINDS,
  QUOTE_LINE_LABELS,
  QUOTE_STATUS_LABELS,
  quoteTotals,
  transportFor,
  type QuoteCurrency,
  type QuoteInfo,
  type QuoteLineKind,
  type QuoteSettings,
  type QuoteVersionInfo,
} from '@konzia/shared';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ProNav } from '@/components/pro-nav';
import { StatusPill } from '@/components/status-pill';
import { Button, Card, Field, Notice, Loading } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { fmtAmount, fmtDate } from '@/lib/format';
import { inputToMinor, minorToInput } from '@/lib/money-input';
import { useActiveOrg } from '@/lib/use-org';

type Line = {
  key: number;
  kind: QuoteLineKind;
  quoteRequestItemId: string | null;
  description: string;
  quantity: string;
  unit: string;
  isEstimate: boolean;
};

let nextKey = 1;
const toLines = (v: QuoteVersionInfo): Line[] =>
  v.lines.map((l) => ({
    key: nextKey++,
    kind: l.kind,
    quoteRequestItemId: l.quoteRequestItemId,
    description: l.description,
    quantity: String(l.quantity),
    unit: minorToInput(l.unitAmount),
    isEstimate: l.isEstimate,
  }));

const dateInput = (iso: string) => iso.slice(0, 10);

export default function QuoteEditorPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const org = useActiveOrg();
  const [quote, setQuote] = useState<QuoteInfo>();
  const [settings, setSettings] = useState<QuoteSettings>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!org) return;
    Promise.all([
      api<QuoteInfo>(`/org/quotes/${id}`, { org }),
      api<QuoteSettings>('/org/quote-settings', { org }),
    ]).then(
      ([q, s]) => {
        setQuote(q);
        setSettings(s);
      },
      (err: unknown) => {
        if (err instanceof ApiError && err.status === 401)
          router.replace(`/connexion?suite=/pro/devis/${id}`);
        else setError(err instanceof ApiError ? err.message : 'Chargement impossible.');
      },
    );
  }, [id, org, router]);

  if (!org) return null;
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-10">
      <ProNav />
      {quote && (
        <Link
          href={`/pro/demandes/${quote.quoteRequestId}`}
          className="text-sm font-semibold text-primary underline"
        >
          ← Retour à la demande
        </Link>
      )}
      {error && <Notice tone="error">{error}</Notice>}
      {!quote && !error && <Loading />}
      {quote && settings && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h1 className="font-display text-2xl font-bold">
              Devis · version {quote.current?.versionNo ?? 1}
            </h1>
            <StatusPill
              tone={
                quote.status === 'sent' ? 'ok' : quote.status === 'withdrawn' ? 'neutral' : 'warn'
              }
            >
              {QUOTE_STATUS_LABELS[quote.status]}
            </StatusPill>
          </div>
          {quote.changeRequest && (
            <Notice>Correction demandée par le client : {quote.changeRequest}</Notice>
          )}
          {quote.current?.status === 'draft' ? (
            <Editor
              key={quote.current.id}
              org={org}
              quote={quote}
              version={quote.current}
              settings={settings}
              onChange={setQuote}
            />
          ) : (
            quote.current && <SentView org={org} quote={quote} onChange={setQuote} />
          )}
          {quote.previous.length > 0 && (
            <Card>
              <h2 className="font-display text-lg font-bold">Versions précédentes</h2>
              {quote.previous.map((v) => (
                <p key={v.id} className="text-sm">
                  Version {v.versionNo} · {fmtAmount(v.totalAmount, v.currency)} · envoyée le{' '}
                  {fmtDate(v.sentAt)} ({v.status === 'superseded' ? 'remplacée' : v.status})
                </p>
              ))}
            </Card>
          )}
        </>
      )}
    </main>
  );
}

function Editor({
  org,
  quote,
  version,
  settings,
  onChange,
}: {
  org: string;
  quote: QuoteInfo;
  version: QuoteVersionInfo;
  settings: QuoteSettings;
  onChange: (q: QuoteInfo) => void;
}) {
  const [currency, setCurrency] = useState<QuoteCurrency>(version.currency);
  const [lines, setLines] = useState<Line[]>(() => toLines(version));
  const [weightKg, setWeightKg] = useState(
    version.weightGrams ? String(version.weightGrams / 1000).replace('.', ',') : '',
  );
  const [validUntil, setValidUntil] = useState(dateInput(version.validUntil));
  const [leadMin, setLeadMin] = useState(String(version.leadTimeMinDays));
  const [leadMax, setLeadMax] = useState(String(version.leadTimeMaxDays));
  const [assumptions, setAssumptions] = useState(version.assumptions ?? '');
  const [terms, setTerms] = useState(version.cancellationTerms ?? '');
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string }>();
  const [busy, setBusy] = useState<string>();
  const [confirmSend, setConfirmSend] = useState(false);

  const parsed = useMemo(
    () =>
      lines.map((l) => ({
        ...l,
        qty: Number.parseInt(l.quantity, 10),
        unitAmount: inputToMinor(l.unit),
      })),
    [lines],
  );
  const invalid = parsed.some(
    (l) =>
      !Number.isInteger(l.qty) ||
      l.qty < 1 ||
      l.unitAmount === null ||
      l.unitAmount < 0 ||
      !l.description.trim(),
  );
  const totals = invalid
    ? null
    : quoteTotals(
        parsed.map((l) => ({ kind: l.kind, quantity: l.qty, unitAmount: l.unitAmount! })),
      );

  const set = (key: number, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const weightGrams = (() => {
    const g = inputToMinor(weightKg);
    return g === null ? null : Math.round(g * 10); // kg avec 2 décimales → grammes
  })();

  function applyAssistant() {
    if (!totals) return;
    setLines((ls) =>
      ls.map((l) => {
        if (l.kind === 'service_fee' && settings.commissionBps !== null) {
          return {
            ...l,
            unit: minorToInput(Number(commissionOn(totals.products, settings.commissionBps))),
          };
        }
        if (
          l.kind === 'international_shipping' &&
          settings.transportPerKg &&
          settings.transportPerKg.currency === currency &&
          weightGrams
        ) {
          return {
            ...l,
            unit: minorToInput(Number(transportFor(weightGrams, settings.transportPerKg.amount))),
            description: `Transport jusqu’en RDC : ${weightKg} kg × ${fmtAmount(settings.transportPerKg.amount, currency)}/kg`,
          };
        }
        return l;
      }),
    );
  }

  function body() {
    return {
      currency,
      validUntil: new Date(`${validUntil}T23:59:00`).toISOString(),
      leadTimeMinDays: Number.parseInt(leadMin, 10),
      leadTimeMaxDays: Number.parseInt(leadMax, 10),
      weightGrams: weightGrams || null,
      assumptions: assumptions.trim() || null,
      cancellationTerms: terms.trim() || null,
      lines: parsed.map((l) => ({
        kind: l.kind,
        quoteRequestItemId: l.quoteRequestItemId,
        description: l.description.trim(),
        quantity: l.qty,
        unitAmount: l.unitAmount!,
        isEstimate: l.isEstimate,
      })),
    };
  }

  async function save(then?: 'send') {
    if (invalid) {
      setMsg({
        tone: 'error',
        text: 'Vérifiez les lignes : description, quantité et montant (ex. 15,49) sont obligatoires.',
      });
      return;
    }
    setBusy(then ?? 'save');
    setMsg(undefined);
    try {
      let q = await api<QuoteInfo>(`/org/quotes/${quote.id}/draft`, {
        method: 'PUT',
        org,
        body: body(),
      });
      if (then === 'send')
        q = await api<QuoteInfo>(`/org/quotes/${quote.id}/send`, { method: 'POST', org });
      onChange(q);
      setMsg({
        tone: 'ok',
        text: then === 'send' ? 'Devis envoyé au client.' : 'Brouillon enregistré.',
      });
    } catch (err) {
      setMsg({
        tone: 'error',
        text: err instanceof ApiError ? err.message : 'Enregistrement impossible.',
      });
    } finally {
      setBusy(undefined);
      setConfirmSend(false);
    }
  }

  return (
    <>
      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="currency" className="text-sm font-semibold">
              Devise du devis
            </label>
            <select
              id="currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value as QuoteCurrency)}
              className="min-h-11 rounded-lg border border-line bg-surface px-3"
            >
              <option value="USD">Dollar (USD)</option>
              <option value="CDF">Franc congolais (CDF)</option>
            </select>
          </div>
          <div className="w-32">
            <Field
              id="weight"
              label="Poids estimé (kg)"
              inputMode="decimal"
              value={weightKg}
              onChange={(e) => setWeightKg(e.target.value)}
            />
          </div>
          <Button variant="ghost" onClick={applyAssistant} disabled={!totals}>
            Calculer commission et transport
          </Button>
        </div>
        <p className="text-xs text-muted">
          Vos réglages :{' '}
          {settings.commissionBps !== null
            ? `commission ${settings.commissionBps / 100} %`
            : 'commission non réglée'}{' '}
          ·{' '}
          {settings.transportPerKg
            ? `transport ${fmtAmount(settings.transportPerKg.amount, settings.transportPerKg.currency)}/kg`
            : 'tarif au kilo non réglé'}{' '}
          (
          <Link href="/pro/profil" className="underline">
            modifier
          </Link>
          )
        </p>
      </Card>
      <Card>
        <h2 className="font-display text-lg font-bold">Lignes du devis</h2>
        <ul className="flex flex-col gap-3">
          {lines.map((l, i) => {
            const p = parsed[i]!;
            const amount =
              p.unitAmount !== null && Number.isInteger(p.qty) && p.qty > 0
                ? Number(lineAmount({ kind: l.kind, quantity: p.qty, unitAmount: p.unitAmount }))
                : null;
            return (
              <li key={l.key} className="flex flex-col gap-2 rounded-lg border border-line p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <select
                    aria-label={`Type de la ligne ${i + 1}`}
                    value={l.kind}
                    onChange={(e) => set(l.key, { kind: e.target.value as QuoteLineKind })}
                    className="min-h-10 rounded-lg border border-line bg-surface px-2 text-sm font-semibold"
                  >
                    {QUOTE_LINE_KINDS.map((k) => (
                      <option key={k} value={k}>
                        {QUOTE_LINE_LABELS[k]}
                      </option>
                    ))}
                  </select>
                  <span className="text-sm font-semibold tabular-nums">
                    {amount !== null ? fmtAmount(amount, currency) : '—'}
                  </span>
                </div>
                <Field
                  id={`d-${l.key}`}
                  label="Description"
                  value={l.description}
                  onChange={(e) => set(l.key, { description: e.target.value })}
                />
                <div className="grid grid-cols-2 gap-3">
                  <Field
                    id={`q-${l.key}`}
                    label="Quantité"
                    inputMode="numeric"
                    value={l.quantity}
                    onChange={(e) => set(l.key, { quantity: e.target.value })}
                  />
                  <Field
                    id={`u-${l.key}`}
                    label={`Prix unitaire (${currency})`}
                    inputMode="decimal"
                    value={l.unit}
                    onChange={(e) => set(l.key, { unit: e.target.value })}
                    error={p.unitAmount === null ? 'Montant invalide' : undefined}
                  />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={l.isEstimate}
                      onChange={(e) => set(l.key, { isEstimate: e.target.checked })}
                      className="size-4 accent-primary"
                    />
                    Estimation (le montant final peut varier)
                  </label>
                  <Button
                    variant="ghost"
                    aria-label={`Retirer la ligne ${i + 1}`}
                    onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                  >
                    Retirer
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
        <Button
          variant="ghost"
          onClick={() =>
            setLines((ls) => [
              ...ls,
              {
                key: nextKey++,
                kind: 'local_delivery',
                quoteRequestItemId: null,
                description: QUOTE_LINE_LABELS.local_delivery,
                quantity: '1',
                unit: '0,00',
                isEstimate: false,
              },
            ])
          }
        >
          Ajouter une ligne
        </Button>
        <div className="flex flex-col gap-1 border-t border-line pt-3">
          <p className="flex justify-between text-sm">
            <span>Articles</span>
            <span className="tabular-nums">
              {totals ? fmtAmount(Number(totals.products), currency) : '—'}
            </span>
          </p>
          <p className="flex justify-between font-display text-xl font-bold">
            <span>Total</span>
            <span className="tabular-nums">
              {totals ? fmtAmount(Number(totals.total), currency) : '—'}
            </span>
          </p>
        </div>
      </Card>
      <Card>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field
            id="validUntil"
            label="Valable jusqu’au"
            type="date"
            value={validUntil}
            onChange={(e) => setValidUntil(e.target.value)}
          />
          <Field
            id="leadMin"
            label="Délai minimum (jours)"
            inputMode="numeric"
            value={leadMin}
            onChange={(e) => setLeadMin(e.target.value)}
          />
          <Field
            id="leadMax"
            label="Délai maximum (jours)"
            inputMode="numeric"
            value={leadMax}
            onChange={(e) => setLeadMax(e.target.value)}
          />
        </div>
        <Field
          id="assumptions"
          label="Hypothèses (visibles du client)"
          placeholder="Ex. : douane estimée sur 2,4 kg"
          value={assumptions}
          onChange={(e) => setAssumptions(e.target.value)}
        />
        <Field
          id="terms"
          label="Conditions d’annulation et de remboursement"
          value={terms}
          onChange={(e) => setTerms(e.target.value)}
        />
      </Card>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <div className="flex flex-wrap gap-2">
        <Button variant="ghost" busy={busy === 'save'} onClick={() => save()}>
          Enregistrer le brouillon
        </Button>
        {confirmSend ? (
          <Button busy={busy === 'send'} onClick={() => save('send')}>
            Confirmer l’envoi de {totals ? fmtAmount(Number(totals.total), currency) : 'ce devis'}
          </Button>
        ) : (
          <Button onClick={() => setConfirmSend(true)} disabled={!totals}>
            Envoyer le devis au client
          </Button>
        )}
      </div>
      <p className="text-sm text-muted">
        Une fois envoyée, cette version ne peut plus être modifiée. Toute correction crée une
        nouvelle version.
      </p>
    </>
  );
}

function SentView({
  org,
  quote,
  onChange,
}: {
  org: string;
  quote: QuoteInfo;
  onChange: (q: QuoteInfo) => void;
}) {
  const v = quote.current!;
  const [error, setError] = useState<string>();
  const [withdrawing, setWithdrawing] = useState(false);
  const [reason, setReason] = useState('');
  const canChange = quote.status === 'sent' || quote.status === 'changes_requested';

  async function run(path: string, body?: object) {
    try {
      onChange(
        await api<QuoteInfo>(`/org/quotes/${quote.id}/${path}`, { method: 'POST', org, body }),
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Action impossible.');
    }
  }

  return (
    <>
      <Card>
        <p className="text-sm text-muted">
          Envoyée le {fmtDate(v.sentAt)} · valable jusqu’au {fmtDate(v.validUntil)} · délai{' '}
          {v.leadTimeMinDays} à {v.leadTimeMaxDays} jours
          {v.fxUsdCdf ? ` · taux 1 USD = ${v.fxUsdCdf} CDF (${v.fxSource})` : ''}
        </p>
        <table className="w-full text-sm">
          <tbody>
            {v.lines.map((l) => (
              <tr key={l.id} className="border-b border-line align-top">
                <td className="py-2">
                  {l.description}
                  {l.quantity > 1 ? ` × ${l.quantity}` : ''}
                  {l.isEstimate && (
                    <span className="ml-1 text-xs font-semibold text-primary">estimation</span>
                  )}
                </td>
                <td className="py-2 text-right tabular-nums whitespace-nowrap">
                  {fmtAmount(l.amount, v.currency)}
                </td>
              </tr>
            ))}
            <tr className="font-bold">
              <td className="py-2">Total</td>
              <td className="py-2 text-right tabular-nums">
                {fmtAmount(v.totalAmount, v.currency)}
              </td>
            </tr>
          </tbody>
        </table>
      </Card>
      {error && <Notice tone="error">{error}</Notice>}
      {canChange && !quote.customerHasAccount && v.status === 'sent' && (
        <ManagedAccept org={org} quoteId={quote.id} versionId={v.id} />
      )}
      {canChange && (
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => run('revise')}>Corriger (nouvelle version)</Button>
          {withdrawing ? (
            <form
              className="flex w-full flex-col gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void run('withdraw', { reason });
              }}
            >
              <Field
                id="reason"
                label="Motif du retrait (visible du client)"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              <Button type="submit" variant="ghost">
                Retirer le devis
              </Button>
            </form>
          ) : (
            <Button variant="ghost" onClick={() => setWithdrawing(true)}>
              Retirer le devis
            </Button>
          )}
        </div>
      )}
    </>
  );
}

function ManagedAccept({
  org,
  quoteId,
  versionId,
}: {
  org: string;
  quoteId: string;
  versionId: string;
}) {
  const router = useRouter();
  const [note, setNote] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  return (
    <Card>
      <h2 className="font-display text-lg font-bold">Le client a donné son accord ?</h2>
      <p className="text-sm text-muted">
        Ce client n’a pas de compte Konzia. Enregistrez son accord pour créer la commande.
      </p>
      <Field
        id="managedNote"
        label="Comment le client a accepté"
        placeholder="Ex. : accord par WhatsApp le 21/11"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      {error && <Notice tone="error">{error}</Notice>}
      <Button
        busy={busy}
        onClick={async () => {
          setBusy(true);
          setError(undefined);
          try {
            const r = await api<{ orderId: string }>(`/org/quotes/${quoteId}/accept-for-customer`, {
              org,
              body: { versionId, note },
            });
            router.push(`/pro/commandes/${r.orderId}`);
          } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Action impossible.');
            setBusy(false);
          }
        }}
      >
        Enregistrer l’accord et créer la commande
      </Button>
    </Card>
  );
}
