'use client';

import {
  SHIPMENT_MODE_LABELS,
  SHIPMENT_MODES,
  SHIPMENT_STATUS_LABELS,
  STEP_LABELS,
  type ParcelSummary,
  type RouteTemplateInfo,
  type ShipmentInfo,
  type ShipmentMode,
} from '@konzia/shared';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { StatusPill } from '@/components/status-pill';
import { Button, Card, Field, Notice } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { fmtAmount, fmtDate } from '@/lib/format';
import { inputToMinor } from '@/lib/money-input';

const errorText = (err: unknown, fallback: string) =>
  err instanceof ApiError ? err.message : fallback;

/** Écran « Expéditions » : un transport regroupe des colis fermés ; ses étapes valent pour chacun. */
export function ShipmentsBoard({ org }: { org: string }) {
  const [list, setList] = useState<ShipmentInfo[]>();
  const [parcels, setParcels] = useState<ParcelSummary[]>([]);
  const [steps, setSteps] = useState<RouteTemplateInfo['steps']>([]);
  const [error, setError] = useState<string>();
  const [info, setInfo] = useState<string>();
  const [busy, setBusy] = useState<string>();

  const load = useCallback(() => {
    Promise.all([
      api<ShipmentInfo[]>('/org/shipments', { org }),
      api<ParcelSummary[]>('/org/parcels', { org }),
      api<RouteTemplateInfo[]>('/org/route-templates', { org }),
    ]).then(
      ([s, p, t]) => {
        setList(s);
        setParcels(p);
        setSteps(t.find((x) => x.global)?.steps ?? []);
      },
      (err: unknown) => setError(errorText(err, 'Chargement impossible.')),
    );
  }, [org]);
  useEffect(load, [load]);

  async function run(key: string, work: () => Promise<unknown>, done: string) {
    setBusy(key);
    setError(undefined);
    setInfo(undefined);
    try {
      const res = (await work()) as { skipped?: string[] } | undefined;
      setInfo(res?.skipped?.length ? `${done} Colis ignorés : ${res.skipped.join(' ; ')}` : done);
      load();
    } catch (err) {
      setError(errorText(err, 'Action impossible.'));
    } finally {
      setBusy(undefined);
    }
  }

  function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const costText = String(f.get('shipCost') ?? '').trim();
    const cost = costText ? inputToMinor(costText) : null;
    if (costText && !cost) return setError('Coût invalide, par exemple 450,00.');
    void run(
      'create',
      async () => {
        await api('/org/shipments', {
          org,
          body: {
            mode: String(f.get('mode')) as ShipmentMode,
            origin: String(f.get('shipOrigin') ?? ''),
            destination: String(f.get('shipDestination') ?? ''),
            carrier: String(f.get('shipCarrier') ?? '') || null,
            trackingNumber: String(f.get('shipTracking') ?? '') || null,
            costAmount: cost,
            currency: cost ? 'USD' : null,
          },
        });
        form.reset();
      },
      'Expédition créée.',
    );
  }

  if (!list) return error ? <Notice tone="error">{error}</Notice> : null;
  const available = parcels.filter((p) => p.status === 'closed' && !p.shipmentId);

  return (
    <>
      {error && <Notice tone="error">{error}</Notice>}
      {info && <Notice tone="ok">{info}</Notice>}
      <Card>
        <h2 className="font-display text-lg font-bold">Nouvelle expédition</h2>
        <form onSubmit={create} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm font-semibold">
            Transport
            <select name="mode" className="min-h-11 rounded-lg border border-line px-3">
              {SHIPMENT_MODES.map((m) => (
                <option key={m} value={m}>
                  {SHIPMENT_MODE_LABELS[m]}
                </option>
              ))}
            </select>
          </label>
          <Field id="shipOrigin" label="Départ" placeholder="Guangzhou" required />
          <Field id="shipDestination" label="Arrivée" placeholder="Lubumbashi" required />
          <Field id="shipCarrier" label="Transporteur ou transitaire (facultatif)" />
          <Field id="shipTracking" label="Numéro de suivi (facultatif)" />
          <Field
            id="shipCost"
            label="Coût du transport en USD (facultatif, interne)"
            inputMode="decimal"
          />
          <Button type="submit" busy={busy === 'create'}>
            Créer l’expédition
          </Button>
        </form>
      </Card>

      {list.length === 0 ? (
        <p className="text-sm text-muted">Aucune expédition pour l’instant.</p>
      ) : (
        list.map((s) => (
          <ShipmentCard
            key={s.id}
            shipment={s}
            available={available}
            steps={steps}
            busy={busy}
            onAdd={(parcelIds) =>
              run(
                `add-${s.id}`,
                () => api(`/org/shipments/${s.id}/parcels`, { org, body: { parcelIds } }),
                'Colis ajoutés à l’expédition.',
              )
            }
            onStep={(body) =>
              run(
                `step-${s.id}`,
                () => api(`/org/shipments/${s.id}/events`, { org, body }),
                'Étape enregistrée pour tous les colis.',
              )
            }
          />
        ))
      )}
    </>
  );
}

function ShipmentCard({
  shipment: s,
  available,
  steps,
  busy,
  onAdd,
  onStep,
}: {
  shipment: ShipmentInfo;
  available: ParcelSummary[];
  steps: RouteTemplateInfo['steps'];
  busy: string | undefined;
  onAdd: (ids: string[]) => void;
  onStep: (body: object) => void;
}) {
  const [chosen, setChosen] = useState<string[]>([]);
  const fromIdx = steps.findIndex((st) => st.code === 'shipped_to_drc');
  const lastIdx = Math.max(
    -1,
    ...s.events
      .filter((e) => e.kind !== 'anomaly')
      .map((e) => steps.findIndex((st) => st.code === e.stepCode)),
  );
  const next = steps.filter((_, i) => i >= fromIdx && i > lastIdx);

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg font-bold">
          {s.origin} → {s.destination}
        </h2>
        <StatusPill tone={s.status === 'arrived' ? 'ok' : 'neutral'}>
          {SHIPMENT_STATUS_LABELS[s.status]}
        </StatusPill>
      </div>
      <p className="text-sm text-muted">
        {[
          SHIPMENT_MODE_LABELS[s.mode],
          s.carrier,
          s.trackingNumber && `suivi ${s.trackingNumber}`,
          s.departureAt && `parti le ${fmtDate(s.departureAt)}`,
          s.arrivalAt && `arrivé le ${fmtDate(s.arrivalAt)}`,
          s.costAmount != null && s.currency && `coût ${fmtAmount(s.costAmount, s.currency)}`,
        ]
          .filter(Boolean)
          .join(' · ')}
      </p>
      <div className="text-sm">
        <strong>Colis ({s.parcels.length})</strong>
        {s.parcels.length === 0 ? (
          <p className="text-muted">Aucun colis.</p>
        ) : (
          <ul>
            {s.parcels.map((p) => (
              <li key={p.id}>
                <span className="font-mono">{p.code}</span>
                {p.currentStepCode ? ` · ${STEP_LABELS[p.currentStepCode]}` : ''}
              </li>
            ))}
          </ul>
        )}
      </div>
      {s.status === 'planned' && available.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-sm font-semibold">Ajouter des colis fermés</span>
          {available.map((p) => (
            <label key={p.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={chosen.includes(p.id)}
                onChange={(e) =>
                  setChosen((c) => (e.target.checked ? [...c, p.id] : c.filter((x) => x !== p.id)))
                }
                aria-label={`Ajouter le colis ${p.code}`}
              />
              <span className="font-mono">{p.code}</span>
              <span className="text-muted">
                {p.itemCount} article(s) · {p.customerCount} client(s)
              </span>
            </label>
          ))}
          <Button
            variant="ghost"
            busy={busy === `add-${s.id}`}
            disabled={chosen.length === 0}
            onClick={() => {
              onAdd(chosen);
              setChosen([]);
            }}
          >
            Ajouter à l’expédition
          </Button>
        </div>
      )}
      {s.parcels.length > 0 && next.length > 0 && (
        <form
          className="flex flex-col gap-2 border-t border-line pt-3"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            onStep({
              kind: 'step',
              stepCode: String(f.get('stepCode')),
              location: String(f.get('location') ?? '').trim() || null,
            });
          }}
        >
          <label className="flex flex-col gap-1 text-sm font-semibold">
            Étape pour toute l’expédition
            <select name="stepCode" className="min-h-11 rounded-lg border border-line px-3">
              {next.map((st) => (
                <option key={st.code} value={st.code}>
                  {st.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-semibold">
            Lieu (facultatif)
            <input name="location" className="min-h-11 rounded-lg border border-line px-3" />
          </label>
          <Button type="submit" busy={busy === `step-${s.id}`}>
            Enregistrer l’étape
          </Button>
        </form>
      )}
      {s.events.length > 0 && (
        <ol className="flex flex-col gap-1 border-l-2 border-line pl-4 text-sm">
          {s.events.map((e) => (
            <li key={e.id}>
              <strong>{e.label}</strong>{' '}
              <span className="text-muted">
                · {fmtDate(e.occurredAt)}
                {e.location ? ` · ${e.location}` : ''}
              </span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
