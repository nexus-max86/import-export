'use client';

import {
  ANOMALY_LABELS,
  ANOMALY_TYPES,
  chargeableWeightG,
  ORG_HEADER,
  PARCEL_CONDITION_LABELS,
  PARCEL_CONDITIONS,
  PARCEL_STATUS_LABELS,
  VOLUMETRIC_DIVISORS,
  volumetricWeightG,
  type PackableItem,
  type ParcelCondition,
  type ParcelDetail,
  type ParcelSummary,
  type RouteTemplateInfo,
} from '@konzia/shared';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ResponsiveList } from '@/components/responsive-list';
import { StatusPill } from '@/components/status-pill';
import { Button, Card, Field, Notice, Loading, EmptyState } from '@/components/ui';
import { api, ApiError, apiUpload } from '@/lib/api';
import { fmtDate } from '@/lib/format';

/** Poids en kg, une décimale, format français. */
export function fmtKg(grams: number | null): string {
  if (grams == null) return '—';
  return `${(grams / 1000).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg`;
}

/** « 2,5 » → 2500 g ; « 30 » cm → 300 mm. */
function parseDecimal(text: string, factor: number): number | null | undefined {
  const t = text.trim().replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.round(n * factor);
}

const toInput = (v: number | null, factor: number) =>
  v == null ? '' : String(v / factor).replace('.', ',');

function errorText(err: unknown, fallback: string) {
  return err instanceof ApiError ? err.message : fallback;
}

/** Liste des colis + création. */
export function ParcelsBoard({ org }: { org: string }) {
  const router = useRouter();
  const [list, setList] = useState<ParcelSummary[]>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api<ParcelSummary[]>('/org/parcels', { org }).then(setList, (err: unknown) =>
      setError(errorText(err, 'Chargement impossible.')),
    );
  }, [org]);

  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(undefined);
    try {
      const p = await api<ParcelDetail>('/org/parcels', {
        org,
        body: {
          locationLabel: String(f.get('parcelLocation') ?? '') || null,
          volumetricDivisor: Number(f.get('divisor') ?? 5000),
        },
      });
      router.push(`/pro/colis/${p.id}`);
    } catch (err) {
      setError(errorText(err, 'Création impossible.'));
      setBusy(false);
    }
  }

  const summary = (p: ParcelSummary) =>
    [
      `${p.itemCount} article(s)`,
      `${p.customerCount} client(s)`,
      p.weightG != null && fmtKg(p.weightG),
      p.locationLabel,
      fmtDate(p.createdAt),
    ]
      .filter(Boolean)
      .join(' · ');
  const pill = (p: ParcelSummary) => (
    <StatusPill tone={p.status === 'open' ? 'warn' : 'neutral'}>
      {PARCEL_STATUS_LABELS[p.status]}
    </StatusPill>
  );

  return (
    <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
      <div className="lg:sticky lg:top-6 lg:order-2">
        <Card>
          <h2 className="font-display text-lg font-bold">Nouveau colis</h2>
          <form onSubmit={create} className="flex flex-col gap-3">
            <Field id="parcelLocation" label="Lieu (facultatif)" placeholder="Entrepôt Guangzhou" />
            <label className="flex flex-col gap-1 text-sm font-semibold">
              Diviseur volumétrique du transporteur
              <select name="divisor" className="min-h-11 rounded-lg border border-line px-3">
                {VOLUMETRIC_DIVISORS.map((d) => (
                  <option key={d} value={d}>
                    ÷ {d.toLocaleString('fr-FR')}
                  </option>
                ))}
              </select>
            </label>
            {error && <Notice tone="error">{error}</Notice>}
            <Button type="submit" busy={busy}>
              Créer le colis
            </Button>
          </form>
        </Card>
      </div>
      <section className="flex flex-col gap-3 lg:order-1">
        <h2 className="font-display text-lg font-bold">Vos colis</h2>
        {!list ? (
          <Loading lines={2} />
        ) : list.length === 0 ? (
          <EmptyState title="Aucun colis pour l’instant">
            Créez un colis, puis ajoutez-y les articles reçus à l’entrepôt.
          </EmptyState>
        ) : (
          <ResponsiveList
            rows={list}
            href={(p) => `/pro/colis/${p.id}`}
            caption="Colis"
            columns={[
              {
                label: 'Colis',
                cell: (p) => <span className="font-mono whitespace-nowrap">{p.code}</span>,
              },
              { label: 'Articles', numeric: true, cell: (p) => p.itemCount },
              { label: 'Clients', numeric: true, cell: (p) => p.customerCount },
              {
                label: 'Poids',
                numeric: true,
                cell: (p) => (p.weightG != null ? fmtKg(p.weightG) : '—'),
              },
              { label: 'Lieu', wide: true, cell: (p) => p.locationLabel ?? '—' },
              {
                label: 'Créé le',
                wide: true,
                cell: (p) => <span className="text-muted">{fmtDate(p.createdAt)}</span>,
              },
              { label: 'État', cell: pill },
            ]}
            card={(p) => (
              <>
                <span className="flex items-center justify-between gap-2">
                  <strong className="font-mono">{p.code}</strong>
                  {pill(p)}
                </span>
                <span className="text-sm text-muted">{summary(p)}</span>
              </>
            )}
          />
        )}
      </section>
    </div>
  );
}

/** Écran 09 : préparer un colis (multi-commandes, multi-clients). */
export function ParcelEditor({ org, id }: { org: string; id: string }) {
  const [parcel, setParcel] = useState<ParcelDetail>();
  const [packable, setPackable] = useState<PackableItem[]>([]);
  const [error, setError] = useState<string>();
  const [info, setInfo] = useState<string>();
  const [busy, setBusy] = useState<string>();
  const [templates, setTemplates] = useState<RouteTemplateInfo[]>([]);
  useEffect(() => {
    api<RouteTemplateInfo[]>('/org/route-templates', { org }).then(setTemplates, () => undefined);
  }, [org]);

  const load = useCallback(() => {
    Promise.all([
      api<ParcelDetail>(`/org/parcels/${id}`, { org }),
      api<PackableItem[]>('/org/packable-items', { org }).catch(() => [] as PackableItem[]),
    ]).then(
      ([p, items]) => {
        setParcel(p);
        setPackable(items);
      },
      (err: unknown) => setError(errorText(err, 'Chargement impossible.')),
    );
  }, [id, org]);
  useEffect(load, [load]);

  async function run(key: string, work: () => Promise<ParcelDetail>, done?: string) {
    setBusy(key);
    setError(undefined);
    setInfo(undefined);
    try {
      setParcel(await work());
      if (done) setInfo(done);
      setPackable(await api<PackableItem[]>('/org/packable-items', { org }).catch(() => []));
    } catch (err) {
      setError(errorText(err, 'Action impossible.'));
    } finally {
      setBusy(undefined);
    }
  }

  if (!parcel) return error ? <Notice tone="error">{error}</Notice> : null;
  const open = parcel.status === 'open';
  const editable = open || parcel.status === 'closed';
  const active = parcel.items.filter((i) => !i.removedAt);
  const removed = parcel.items.filter((i) => i.removedAt);

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <h1 className="font-mono text-2xl font-bold">{parcel.code}</h1>
        <StatusPill tone={open ? 'warn' : 'neutral'}>
          {PARCEL_STATUS_LABELS[parcel.status]}
        </StatusPill>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      {info && <Notice tone="ok">{info}</Notice>}

      <MeasuresCard
        key={`${parcel.weightG}-${parcel.lengthMm}-${parcel.widthMm}-${parcel.heightMm}-${parcel.volumetricDivisor}-${parcel.condition}`}
        parcel={parcel}
        disabled={!editable}
        busy={busy === 'measures'}
        onSave={(body) =>
          run(
            'measures',
            () => api<ParcelDetail>(`/org/parcels/${id}`, { org, method: 'PATCH', body }),
            'Mesures enregistrées.',
          )
        }
      />

      <Card>
        <h2 className="font-display text-lg font-bold">Articles dans ce colis ({active.length})</h2>
        {active.length === 0 ? (
          <p className="text-sm text-muted">Aucun article pour l’instant.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {active.map((i) => (
              <ParcelItemRow
                key={i.id}
                item={i}
                canRemove={open}
                busy={busy === i.id}
                onRemove={(reason) =>
                  run(i.id, () =>
                    api<ParcelDetail>(`/org/parcels/${id}/items/${i.id}/remove`, {
                      org,
                      body: { reason },
                    }),
                  )
                }
              />
            ))}
          </ul>
        )}
        {removed.length > 0 && (
          <details className="text-sm">
            <summary className="cursor-pointer text-muted">
              Articles retirés ({removed.length}) — historique conservé
            </summary>
            <ul className="mt-2 flex flex-col gap-1">
              {removed.map((i) => (
                <li key={i.id} className="text-muted">
                  {i.description} × {i.quantity} · {i.orderNumber} · retiré le{' '}
                  {fmtDate(i.removedAt)} : {i.removedReason}
                </li>
              ))}
            </ul>
          </details>
        )}
      </Card>

      {open && (
        <AddItemsCard
          items={packable}
          busy={busy === 'add'}
          onAdd={(items) =>
            run(
              'add',
              () => api<ParcelDetail>(`/org/parcels/${id}/items`, { org, body: { items } }),
              'Articles ajoutés au colis.',
            )
          }
        />
      )}

      <TrackingCard
        parcel={parcel}
        templates={templates}
        busy={busy}
        onTemplate={(routeTemplateId) =>
          run(
            'route',
            () =>
              api<ParcelDetail>(`/org/parcels/${id}`, {
                org,
                method: 'PATCH',
                body: { routeTemplateId },
              }),
            'Itinéraire enregistré.',
          )
        }
        onEvent={(body) =>
          run(
            'event',
            () => api<ParcelDetail>(`/org/parcels/${id}/events`, { org, body }),
            'Étape enregistrée.',
          )
        }
      />

      <PhotosCard
        org={org}
        parcel={parcel}
        busy={busy === 'photo'}
        onUpload={(file) => {
          const form = new FormData();
          form.append('file', file);
          void run(
            'photo',
            () => apiUpload<ParcelDetail>(`/org/parcels/${id}/photos`, form, org),
            'Photo ajoutée.',
          );
        }}
      />

      <Card>
        <h2 className="font-display text-lg font-bold">État du colis</h2>
        <div className="flex flex-wrap gap-2">
          {open && (
            <Button
              busy={busy === 'close'}
              onClick={() =>
                run(
                  'close',
                  () => api<ParcelDetail>(`/org/parcels/${id}/close`, { org, body: {} }),
                  'Colis fermé.',
                )
              }
            >
              Fermer le colis
            </Button>
          )}
          {parcel.status === 'closed' && (
            <Button
              variant="ghost"
              busy={busy === 'reopen'}
              onClick={() =>
                run('reopen', () =>
                  api<ParcelDetail>(`/org/parcels/${id}/reopen`, { org, body: {} }),
                )
              }
            >
              Rouvrir le colis
            </Button>
          )}
          {open && active.length === 0 && (
            <Button
              variant="ghost"
              busy={busy === 'cancel'}
              onClick={() =>
                run('cancel', () =>
                  api<ParcelDetail>(`/org/parcels/${id}/cancel`, { org, body: {} }),
                )
              }
            >
              Annuler ce colis vide
            </Button>
          )}
        </div>
        <p className="text-xs text-muted">
          Un colis fermé peut rejoindre une expédition (menu « Expéditions »).
        </p>
      </Card>
    </>
  );
}

function MeasuresCard({
  parcel,
  disabled,
  busy,
  onSave,
}: {
  parcel: ParcelDetail;
  disabled: boolean;
  busy: boolean;
  onSave: (body: object) => void;
}) {
  const [dims, setDims] = useState({
    l: toInput(parcel.lengthMm, 10),
    w: toInput(parcel.widthMm, 10),
    h: toInput(parcel.heightMm, 10),
    weight: toInput(parcel.weightG, 1000),
  });
  const [divisor, setDivisor] = useState(parcel.volumetricDivisor);
  const [condition, setCondition] = useState<ParcelCondition>(parcel.condition);
  const [error, setError] = useState<string>();
  const parsed = {
    lengthMm: parseDecimal(dims.l, 10),
    widthMm: parseDecimal(dims.w, 10),
    heightMm: parseDecimal(dims.h, 10),
    weightG: parseDecimal(dims.weight, 1000),
  };
  const valid = Object.values(parsed).every((v) => v !== undefined);
  const volumetric = valid
    ? volumetricWeightG(
        {
          lengthMm: parsed.lengthMm ?? null,
          widthMm: parsed.widthMm ?? null,
          heightMm: parsed.heightMm ?? null,
        },
        divisor,
      )
    : null;
  const chargeable = chargeableWeightG(parsed.weightG ?? null, volumetric);

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!valid) return setError('Utilisez des nombres positifs, par exemple 2,5 ou 30.');
    setError(undefined);
    onSave({ ...parsed, volumetricDivisor: divisor, condition });
  }
  const set = (k: keyof typeof dims) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setDims((d) => ({ ...d, [k]: e.target.value }));

  return (
    <Card>
      <h2 className="font-display text-lg font-bold">Poids et dimensions</h2>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <fieldset disabled={disabled} className="flex flex-col gap-3">
          <Field
            id="parcelWeight"
            label="Poids (kg)"
            inputMode="decimal"
            value={dims.weight}
            onChange={set('weight')}
          />
          <div className="grid grid-cols-3 gap-2">
            <Field
              id="parcelLength"
              label="Longueur (cm)"
              inputMode="decimal"
              value={dims.l}
              onChange={set('l')}
            />
            <Field
              id="parcelWidth"
              label="Largeur (cm)"
              inputMode="decimal"
              value={dims.w}
              onChange={set('w')}
            />
            <Field
              id="parcelHeight"
              label="Hauteur (cm)"
              inputMode="decimal"
              value={dims.h}
              onChange={set('h')}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <label className="flex flex-1 flex-col gap-1 text-sm font-semibold">
              Diviseur
              <select
                value={divisor}
                onChange={(e) => setDivisor(Number(e.target.value))}
                className="min-h-11 rounded-lg border border-line px-3"
              >
                {[...new Set([...VOLUMETRIC_DIVISORS, parcel.volumetricDivisor])].map((d) => (
                  <option key={d} value={d}>
                    ÷ {d.toLocaleString('fr-FR')}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-1 flex-col gap-1 text-sm font-semibold">
              État
              <select
                value={condition}
                onChange={(e) => setCondition(e.target.value as ParcelCondition)}
                className="min-h-11 rounded-lg border border-line px-3"
              >
                {PARCEL_CONDITIONS.map((c) => (
                  <option key={c} value={c}>
                    {PARCEL_CONDITION_LABELS[c]}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </fieldset>
        <p className="text-sm" role="status">
          Poids volumétrique (÷ {divisor.toLocaleString('fr-FR')}) : {fmtKg(volumetric)}
          {chargeable != null && ` · poids facturé : ${fmtKg(chargeable)} (le plus élevé)`}
        </p>
        {error && <Notice tone="error">{error}</Notice>}
        {!disabled && (
          <Button type="submit" busy={busy}>
            Enregistrer les mesures
          </Button>
        )}
      </form>
    </Card>
  );
}

function ParcelItemRow({
  item,
  canRemove,
  busy,
  onRemove,
}: {
  item: ParcelDetail['items'][number];
  canRemove: boolean;
  busy: boolean;
  onRemove: (reason: string) => void;
}) {
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState('');
  return (
    <li className="flex flex-col gap-1 rounded-lg border border-line p-3 text-sm">
      <span className="flex flex-wrap items-center justify-between gap-2">
        <strong>
          {item.description} × {item.quantity}
        </strong>
        <span className="font-mono text-xs">{item.orderNumber}</span>
      </span>
      <span className="text-muted">
        {item.customerName}
        {item.managedCustomer ? ' · client géré' : ''}
      </span>
      {canRemove && !asking && (
        <button
          type="button"
          onClick={() => setAsking(true)}
          className="self-start text-sm font-semibold text-copper underline"
        >
          Retirer du colis
        </button>
      )}
      {asking && (
        <div className="flex flex-col gap-2">
          <Field
            id={`reason-${item.id}`}
            label="Motif du retrait"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <div className="flex gap-2">
            <Button busy={busy} onClick={() => onRemove(reason)}>
              Confirmer le retrait
            </Button>
            <Button variant="ghost" onClick={() => setAsking(false)}>
              Garder
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

function AddItemsCard({
  items,
  busy,
  onAdd,
}: {
  items: PackableItem[];
  busy: boolean;
  onAdd: (items: { orderItemId: string; quantity: number }[]) => void;
}) {
  const [qty, setQty] = useState<Record<string, number>>({});
  const chosen = Object.entries(qty).filter(([, q]) => q > 0);
  return (
    <Card>
      <h2 className="font-display text-lg font-bold">Ajouter des articles reçus</h2>
      {items.length === 0 ? (
        <p className="text-sm text-muted">
          Aucun article reçu en attente de colis. Enregistrez d’abord la réception dans « Achats ».
        </p>
      ) : (
        <>
          <ul className="flex flex-col gap-2">
            {items.map((i) => {
              const free = i.qtyReceived - i.qtyPacked;
              const value = qty[i.orderItemId] ?? 0;
              return (
                <li key={i.orderItemId} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={value > 0}
                    onChange={(e) =>
                      setQty((q) => ({ ...q, [i.orderItemId]: e.target.checked ? free : 0 }))
                    }
                    aria-label={`Mettre en colis ${i.description}`}
                  />
                  <span className="flex-1">
                    {i.description}{' '}
                    <span className="text-muted">
                      · {i.orderNumber} · {i.customerName} · {free} disponible(s)
                    </span>
                  </span>
                  {value > 0 && (
                    <input
                      type="number"
                      min={1}
                      max={free}
                      value={value}
                      onChange={(e) =>
                        setQty((q) => ({
                          ...q,
                          [i.orderItemId]: Math.min(free, Math.max(1, Number(e.target.value))),
                        }))
                      }
                      aria-label={`Quantité à mettre en colis pour ${i.description}`}
                      className="w-16 rounded-lg border border-line px-2 py-1"
                    />
                  )}
                </li>
              );
            })}
          </ul>
          <Button
            busy={busy}
            disabled={chosen.length === 0}
            onClick={() => {
              onAdd(chosen.map(([orderItemId, quantity]) => ({ orderItemId, quantity })));
              setQty({});
            }}
          >
            Ajouter au colis
          </Button>
        </>
      )}
    </Card>
  );
}

function PhotosCard({
  org,
  parcel,
  busy,
  onUpload,
}: {
  org: string;
  parcel: ParcelDetail;
  busy: boolean;
  onUpload: (file: File) => void;
}) {
  return (
    <Card>
      <h2 className="font-display text-lg font-bold">Photos ({parcel.photoFileIds.length})</h2>
      {parcel.photoFileIds.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {parcel.photoFileIds.map((f) => (
            <ParcelPhoto key={f} org={org} parcelId={parcel.id} fileId={f} />
          ))}
        </div>
      )}
      <label className="flex flex-col gap-1 text-sm font-semibold">
        Ajouter une photo (état, étiquette…)
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          disabled={busy || parcel.photoFileIds.length >= 10}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onUpload(file);
            e.target.value = '';
          }}
        />
      </label>
    </Card>
  );
}

/** Photo chargée avec l'en-tête d'organisation (une balise <img> ne peut pas l'envoyer). */
function ParcelPhoto({ org, parcelId, fileId }: { org: string; parcelId: string; fileId: string }) {
  const [src, setSrc] = useState<string>();
  useEffect(() => {
    let url: string | undefined;
    fetch(`/api/org/parcels/${parcelId}/photos/${fileId}`, {
      credentials: 'same-origin',
      headers: { [ORG_HEADER]: org },
    })
      .then((r) => (r.ok ? r.blob() : null))
      .then((b) => {
        if (b) setSrc((url = URL.createObjectURL(b)));
      })
      .catch(() => undefined);
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [org, parcelId, fileId]);
  return src ? (
    <img src={src} alt="Photo du colis" className="aspect-square rounded-lg object-cover" />
  ) : (
    <div className="aspect-square rounded-lg bg-copper-soft" aria-hidden />
  );
}

/** Itinéraire, frise des étapes et enregistrement d'une nouvelle étape (insertion seule). */
function TrackingCard({
  parcel,
  templates,
  busy,
  onTemplate,
  onEvent,
}: {
  parcel: ParcelDetail;
  templates: RouteTemplateInfo[];
  busy: string | undefined;
  onTemplate: (id: string | null) => void;
  onEvent: (body: object) => void;
}) {
  const template =
    templates.find((t) => t.id === parcel.routeTemplateId) ?? templates.find((t) => t.global);
  const [kind, setKind] = useState<'step' | 'anomaly' | 'correction'>('step');
  const [error, setError] = useState<string>();
  const currentIdx = template?.steps.findIndex((st) => st.code === parcel.currentStepCode) ?? -1;
  const nextSteps = (template?.steps ?? []).filter(
    (_, i) => kind === 'correction' || i > currentIdx,
  );
  const closed = parcel.status === 'delivered' || parcel.status === 'lost';

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const note = String(f.get('eventNote') ?? '').trim() || null;
    if (kind !== 'step' && !note) return setError('Ajoutez une explication.');
    setError(undefined);
    onEvent({
      kind,
      ...(kind === 'anomaly'
        ? { anomalyType: String(f.get('anomalyType')) }
        : { stepCode: String(f.get('stepCode')) }),
      location: String(f.get('eventLocation') ?? '').trim() || null,
      note,
    });
  }

  return (
    <Card>
      <h2 className="font-display text-lg font-bold">Suivi du colis</h2>
      {parcel.events.length === 0 ? (
        <label className="flex flex-col gap-1 text-sm font-semibold">
          Itinéraire
          <select
            value={parcel.routeTemplateId ?? ''}
            disabled={busy === 'route'}
            onChange={(e) => onTemplate(e.target.value || null)}
            className="min-h-11 rounded-lg border border-line px-3"
          >
            {templates.map((t) => (
              <option key={t.id} value={t.global ? '' : t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p className="text-sm">
          Itinéraire : <strong>{template?.name}</strong>
        </p>
      )}
      {parcel.events.length > 0 && (
        <ol className="flex flex-col gap-2 border-l-2 border-line pl-4 text-sm">
          {parcel.events.map((ev) => (
            <li key={ev.id} className="flex flex-col">
              <span className="font-semibold">
                {ev.kind === 'anomaly'
                  ? `Anomalie : ${ev.anomalyType ? ANOMALY_LABELS[ev.anomalyType] : ''}`
                  : ev.kind === 'correction'
                    ? `Correction → ${ev.label}`
                    : ev.label}
                {!ev.visibleToCustomer && (
                  <span className="font-normal text-muted"> (interne)</span>
                )}
              </span>
              <span className="text-muted">
                {[
                  fmtDate(ev.occurredAt),
                  ev.location,
                  ev.viaShipment && 'via l’expédition',
                  ev.note,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </li>
          ))}
        </ol>
      )}
      <form onSubmit={submit} className="flex flex-col gap-3 border-t border-line pt-3">
        <h3 className="font-semibold">Enregistrer une étape</h3>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Type d’événement">
          {(
            [
              ['step', 'Étape suivante'],
              ['anomaly', 'Anomalie'],
              ['correction', 'Correction'],
            ] as const
          ).map(([k, label]) => (
            <label key={k} className="flex items-center gap-1 text-sm">
              <input
                type="radio"
                name="kind"
                checked={kind === k}
                disabled={closed && k !== 'correction'}
                onChange={() => setKind(k)}
              />
              {label}
            </label>
          ))}
        </div>
        {kind === 'anomaly' ? (
          <label className="flex flex-col gap-1 text-sm font-semibold">
            Nature de l’anomalie
            <select name="anomalyType" className="min-h-11 rounded-lg border border-line px-3">
              {ANOMALY_TYPES.map((a) => (
                <option key={a} value={a}>
                  {ANOMALY_LABELS[a]}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label className="flex flex-col gap-1 text-sm font-semibold">
            Étape
            <select name="stepCode" className="min-h-11 rounded-lg border border-line px-3">
              {nextSteps.map((st) => (
                <option key={st.code} value={st.code}>
                  {st.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <Field id="eventLocation" label="Lieu (facultatif)" />
        <Field
          id="eventNote"
          label={kind === 'step' ? 'Note interne (facultatif)' : 'Explication (obligatoire)'}
        />
        {error && <Notice tone="error">{error}</Notice>}
        <Button
          type="submit"
          busy={busy === 'event'}
          disabled={kind !== 'anomaly' && nextSteps.length === 0}
        >
          Enregistrer l’étape
        </Button>
        <p className="text-xs text-muted">
          Chaque étape est horodatée et ne peut pas être effacée. Une erreur se corrige par une
          nouvelle étape.
        </p>
      </form>
    </Card>
  );
}
