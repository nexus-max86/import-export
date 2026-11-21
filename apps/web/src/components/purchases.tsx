'use client';

import {
  MARKETPLACES,
  MARKETPLACE_CODES,
  PURCHASE_RULE_LABELS,
  PURCHASE_RULES,
  SUPPLIER_CURRENCIES,
  SUPPLIER_STATUS_LABELS,
  type OrderDetail,
  type PurchasableItem,
  type PurchaseRule,
  type SupplierOrderInfo,
} from '@konzia/shared';
import Link from 'next/link';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { StatusPill } from '@/components/status-pill';
import { Button, Card, Field, Notice } from '@/components/ui';
import { api, ApiError, apiUpload } from '@/lib/api';
import { fmtAmount, fmtDate } from '@/lib/format';
import { inputToMinor } from '@/lib/money-input';

const PRE_PURCHASE = ['awaiting_payment', 'payment_to_verify', 'paid'];

const RULE_HELP: Record<PurchaseRule, string> = {
  full_payment: 'Vous achetez une fois la commande entièrement payée (le plus sûr).',
  deposit: 'Vous achetez dès qu’un acompte confirmé atteint le pourcentage choisi.',
  own_funds: 'Vous avancez l’argent : achat possible avant tout paiement du client.',
};

function ruleText(order: Pick<OrderDetail, 'purchaseRule' | 'depositBps'>) {
  return order.purchaseRule === 'deposit'
    ? `${PURCHASE_RULE_LABELS.deposit} de ${(order.depositBps ?? 0) / 100} %`
    : PURCHASE_RULE_LABELS[order.purchaseRule];
}

/** Règle d'achat d'une commande (retour terrain R3) : modifiable jusqu'au premier achat. */
export function PurchaseRuleCard({
  org,
  order,
  onChange,
}: {
  org: string;
  order: OrderDetail;
  onChange: (o: OrderDetail) => void;
}) {
  const [rule, setRule] = useState<PurchaseRule>(order.purchaseRule);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const editable = PRE_PURCHASE.includes(order.status);

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const percent = Number(
      String(new FormData(e.currentTarget).get('depositPercent') ?? '').replace(',', '.'),
    );
    if (rule === 'deposit' && !(percent > 0 && percent <= 100)) {
      setError('Indiquez un pourcentage entre 1 et 100.');
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      onChange(
        await api<OrderDetail>(`/org/orders/${order.id}/purchase-rule`, {
          org,
          method: 'PUT',
          body: {
            rule,
            depositBps: rule === 'deposit' ? Math.round(percent * 100) : null,
          },
        }),
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Enregistrement impossible.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <h2 className="font-display text-lg font-bold">Règle d’achat</h2>
      <p className="text-sm">
        Actuelle : <strong>{ruleText(order)}</strong>
      </p>
      {editable ? (
        <form onSubmit={save} className="flex flex-col gap-3">
          <fieldset className="flex flex-col gap-2">
            <legend className="sr-only">Quand acheter chez le vendeur ?</legend>
            {PURCHASE_RULES.map((r) => (
              <label key={r} className="flex gap-2 text-sm">
                <input
                  type="radio"
                  name="rule"
                  value={r}
                  checked={rule === r}
                  onChange={() => setRule(r)}
                />
                <span>
                  <strong>{PURCHASE_RULE_LABELS[r]}</strong>
                  <span className="block text-muted">{RULE_HELP[r]}</span>
                </span>
              </label>
            ))}
          </fieldset>
          {rule === 'deposit' && (
            <Field
              label="Acompte minimum (%)"
              id="depositPercent"
              inputMode="decimal"
              defaultValue={order.depositBps ? String(order.depositBps / 100) : '50'}
            />
          )}
          {error && <Notice tone="error">{error}</Notice>}
          <Button type="submit" busy={busy}>
            Enregistrer la règle
          </Button>
        </form>
      ) : (
        <p className="text-sm text-muted">L’achat a commencé : la règle ne change plus.</p>
      )}
    </Card>
  );
}

function SupplierOrderLine({
  so,
  orderId,
  actions,
}: {
  so: SupplierOrderInfo;
  orderId?: string;
  actions?: React.ReactNode;
}) {
  const items = orderId ? so.items.filter((i) => i.orderId === orderId) : so.items;
  return (
    <li className="flex flex-col gap-1 rounded-lg border border-line p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <strong>
          {so.storeName}
          {so.marketplace ? ` · ${MARKETPLACES[so.marketplace]}` : ''}
        </strong>
        <StatusPill tone={so.status === 'received' ? 'ok' : 'neutral'}>
          {SUPPLIER_STATUS_LABELS[so.status]}
        </StatusPill>
      </div>
      <span className="text-muted">
        {[
          fmtDate(so.purchasedAt),
          `payé ${fmtAmount(so.amount, so.currency)}`,
          so.conversionFeeAmount > 0 &&
            `frais de conversion ${fmtAmount(so.conversionFeeAmount, so.currency)}`,
          so.externalRef && `réf. ${so.externalRef}`,
          so.sellerTrackingNumber && `suivi ${so.sellerTrackingNumber}`,
        ]
          .filter(Boolean)
          .join(' · ')}
      </span>
      <ul className="flex flex-col">
        {items.map((i) => (
          <li key={i.orderItemId}>
            {orderId ? '' : `${i.orderNumber} — `}
            {i.description} : {i.qtyPurchased} acheté(s), {i.qtyReceived} reçu(s)
          </li>
        ))}
      </ul>
      {so.note && <span>Note : {so.note}</span>}
      {actions}
    </li>
  );
}

/** Achats fournisseurs d'une commande, visibles seulement des rôles autorisés (coûts réels). */
export function OrderPurchases({ org, orderId }: { org: string; orderId: string }) {
  const [list, setList] = useState<SupplierOrderInfo[] | null>(null);
  useEffect(() => {
    api<SupplierOrderInfo[]>(`/org/supplier-orders?commande=${orderId}`, { org }).then(
      setList,
      () => setList(null), // rôle sans accès aux coûts : section masquée
    );
  }, [org, orderId]);
  if (!list) return null;
  return (
    <Card>
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-lg font-bold">Achats chez les vendeurs</h2>
        <Link href="/pro/achats" className="text-sm font-semibold text-copper underline">
          Gérer les achats
        </Link>
      </div>
      <p className="text-xs text-muted">Coûts réels : jamais visibles du client.</p>
      {list.length === 0 ? (
        <p className="text-sm text-muted">Aucun achat enregistré pour cette commande.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {list.map((so) => (
            <SupplierOrderLine key={so.id} so={so} orderId={orderId} />
          ))}
        </ul>
      )}
    </Card>
  );
}

/** Nouvel achat : un panier chez un vendeur, pouvant couvrir plusieurs commandes. */
function NewPurchaseForm({
  org,
  items,
  onDone,
}: {
  org: string;
  items: PurchasableItem[];
  onDone: () => void;
}) {
  const [qty, setQty] = useState<Record<string, number>>({});
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const chosen = Object.entries(qty).filter(([, q]) => q > 0);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const amount = inputToMinor(String(f.get('amount') ?? ''));
    const fee = inputToMinor(String(f.get('fee') ?? '') || '0');
    if (chosen.length === 0) return setError('Cochez au moins un article.');
    if (!amount) return setError('Indiquez le montant payé au vendeur, par exemple 210,00.');
    if (fee === null) return setError('Frais de conversion invalides.');
    setBusy(true);
    setError(undefined);
    try {
      let proofFileId: string | null = null;
      const proof = f.get('proof');
      if (proof instanceof File && proof.size > 0) {
        const up = new FormData();
        up.append('file', proof);
        proofFileId = (await apiUpload<{ fileId: string }>('/org/purchase-proofs', up, org)).fileId;
      }
      const date = String(f.get('purchasedAt') ?? '');
      await api('/org/supplier-orders', {
        org,
        body: {
          marketplace: f.get('marketplace') || null,
          storeName: String(f.get('storeName') ?? ''),
          externalRef: String(f.get('externalRef') ?? '') || null,
          purchasedAt: new Date(date ? `${date}T12:00:00` : Date.now()).toISOString(),
          amount,
          currency: String(f.get('currency')),
          conversionFeeAmount: fee,
          sellerTrackingNumber: String(f.get('tracking') ?? '') || null,
          proofFileId,
          note: String(f.get('note') ?? '') || null,
          items: chosen.map(([orderItemId, quantity]) => ({ orderItemId, quantity })),
        },
      });
      form.reset();
      setQty({});
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Enregistrement impossible.');
    } finally {
      setBusy(false);
    }
  }

  const byOrder = new Map<string, PurchasableItem[]>();
  for (const i of items) byOrder.set(i.orderNumber, [...(byOrder.get(i.orderNumber) ?? []), i]);

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {items.length === 0 ? (
        <p className="text-sm text-muted">Aucun article à acheter pour l’instant.</p>
      ) : (
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1 text-sm font-semibold">Articles achetés dans ce panier</legend>
          {[...byOrder.entries()].map(([number, list]) => (
            <div key={number} className="flex flex-col gap-1 rounded-lg border border-line p-3">
              <span className="text-sm font-semibold">
                {number} · {list[0]!.customerName}
              </span>
              {list[0]!.blockedReason && (
                <span className="text-xs text-danger">{list[0]!.blockedReason}</span>
              )}
              {list.map((i) => {
                const left = i.quantity - i.qtyPurchased;
                return (
                  <label key={i.orderItemId} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      disabled={!i.canPurchase}
                      checked={(qty[i.orderItemId] ?? 0) > 0}
                      onChange={(e) =>
                        setQty((q) => ({ ...q, [i.orderItemId]: e.target.checked ? left : 0 }))
                      }
                      aria-label={`Acheter ${i.description}`}
                    />
                    <span className="flex-1">
                      {i.description} <span className="text-muted">(reste {left})</span>
                    </span>
                    {(qty[i.orderItemId] ?? 0) > 0 && (
                      <input
                        type="number"
                        min={1}
                        max={left}
                        value={qty[i.orderItemId]}
                        onChange={(e) =>
                          setQty((q) => ({
                            ...q,
                            [i.orderItemId]: Math.min(left, Math.max(1, Number(e.target.value))),
                          }))
                        }
                        aria-label={`Quantité pour ${i.description}`}
                        className="w-16 rounded-lg border border-line px-2 py-1"
                      />
                    )}
                  </label>
                );
              })}
            </div>
          ))}
        </fieldset>
      )}
      <label className="flex flex-col gap-1 text-sm font-semibold">
        Site
        <select name="marketplace" className="min-h-11 rounded-lg border border-line px-3">
          <option value="">Autre / boutique directe</option>
          {MARKETPLACE_CODES.map((m) => (
            <option key={m} value={m}>
              {MARKETPLACES[m]}
            </option>
          ))}
        </select>
      </label>
      <Field label="Boutique ou vendeur" id="storeName" required />
      <Field label="Numéro de commande chez le vendeur (facultatif)" id="externalRef" />
      <Field label="Date d’achat" id="purchasedAt" type="date" />
      <div className="flex gap-2">
        <div className="flex-1">
          <Field label="Montant payé au vendeur" id="amount" inputMode="decimal" required />
        </div>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          Devise
          <select name="currency" className="min-h-11 rounded-lg border border-line px-3">
            {SUPPLIER_CURRENCIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
      </div>
      <Field label="Frais de conversion (facultatif)" id="fee" inputMode="decimal" />
      <Field label="Numéro de suivi du vendeur (facultatif)" id="tracking" />
      <label className="flex flex-col gap-1 text-sm font-semibold">
        Preuve d’achat (photo ou PDF, facultatif)
        <input name="proof" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" />
      </label>
      <Field label="Note interne (facultatif)" id="note" />
      {error && <Notice tone="error">{error}</Notice>}
      <Button type="submit" busy={busy} disabled={items.length === 0}>
        Enregistrer l’achat
      </Button>
    </form>
  );
}

function ReceiveForm({
  org,
  so,
  onDone,
}: {
  org: string;
  so: SupplierOrderInfo;
  onDone: (s: SupplierOrderInfo) => void;
}) {
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(undefined);
    try {
      onDone(
        await api<SupplierOrderInfo>(`/org/supplier-orders/${so.id}/receive`, {
          org,
          body: {
            items: so.items.map((i) => ({
              orderItemId: i.orderItemId,
              qtyReceived: Number(f.get(i.orderItemId) ?? 0),
            })),
          },
        }),
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Enregistrement impossible.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="mt-2 flex flex-col gap-2 border-t border-line pt-2">
      {so.items.map((i) => (
        <label key={i.orderItemId} className="flex items-center gap-2 text-sm">
          <span className="flex-1">
            Reçu — {i.description} (sur {i.qtyPurchased})
          </span>
          <input
            type="number"
            name={i.orderItemId}
            min={0}
            max={i.qtyPurchased}
            defaultValue={i.qtyReceived || i.qtyPurchased}
            className="w-16 rounded-lg border border-line px-2 py-1"
          />
        </label>
      ))}
      {error && <Notice tone="error">{error}</Notice>}
      <Button type="submit" busy={busy}>
        Enregistrer la réception
      </Button>
    </form>
  );
}

/** Écran « Achats » : panier à composer, puis suivi et réception des achats. */
export function PurchasesBoard({ org }: { org: string }) {
  const [items, setItems] = useState<PurchasableItem[]>();
  const [list, setList] = useState<SupplierOrderInfo[]>();
  const [error, setError] = useState<string>();
  const [open, setOpen] = useState<string>();

  const load = useCallback(() => {
    Promise.all([
      api<PurchasableItem[]>('/org/purchasable-items', { org }),
      api<SupplierOrderInfo[]>('/org/supplier-orders', { org }),
    ]).then(
      ([i, l]) => {
        setItems(i);
        setList(l);
      },
      (err: unknown) => setError(err instanceof ApiError ? err.message : 'Chargement impossible.'),
    );
  }, [org]);
  useEffect(load, [load]);

  async function shipped(so: SupplierOrderInfo) {
    try {
      const updated = await api<SupplierOrderInfo>(`/org/supplier-orders/${so.id}`, {
        org,
        method: 'PATCH',
        body: { status: 'shipped_by_seller' },
      });
      setList((l) => l?.map((x) => (x.id === so.id ? updated : x)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Action impossible.');
    }
  }

  if (error) return <Notice tone="error">{error}</Notice>;
  if (!items || !list) return <p className="text-sm text-muted">Chargement…</p>;
  return (
    <>
      <Card>
        <h2 className="font-display text-lg font-bold">Nouvel achat chez un vendeur</h2>
        <p className="text-sm text-muted">
          Un panier peut regrouper des articles de plusieurs commandes. Le montant payé reste
          interne.
        </p>
        <NewPurchaseForm org={org} items={items} onDone={load} />
      </Card>
      <Card>
        <h2 className="font-display text-lg font-bold">Achats enregistrés</h2>
        {list.length === 0 ? (
          <p className="text-sm text-muted">Aucun achat pour l’instant.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {list.map((so) => (
              <SupplierOrderLine
                key={so.id}
                so={so}
                actions={
                  so.status === 'received' ? null : (
                    <div className="flex flex-col gap-2">
                      <div className="flex flex-wrap gap-2">
                        {so.status === 'placed' && (
                          <Button variant="ghost" onClick={() => void shipped(so)}>
                            Expédié par le vendeur
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          onClick={() => setOpen(open === so.id ? undefined : so.id)}
                        >
                          Réception à l’entrepôt
                        </Button>
                      </div>
                      {open === so.id && (
                        <ReceiveForm
                          org={org}
                          so={so}
                          onDone={(s) => {
                            setOpen(undefined);
                            setList((l) => l?.map((x) => (x.id === s.id ? s : x)));
                          }}
                        />
                      )}
                    </div>
                  )
                }
              />
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
