'use client';

import {
  HANDOVER_LABELS,
  MARKETPLACES,
  REQUIRED_DOCUMENTS,
  TRANSPORT_MODES,
  VERIFICATION_DOCUMENTS,
  type CityInfo,
  type HandoverMode,
  type MarketplaceCode,
  type OrgServiceZoneInfo,
  type TransportMode,
  type VerificationInfo,
} from '@konzia/shared';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ProNav } from '@/components/pro-nav';
import { Button, Card, Notice } from '@/components/ui';
import { getActiveOrg } from '@/lib/active-org';
import { api, ApiError, apiUpload } from '@/lib/api';

interface OrgProfile {
  name: string;
  status: 'pending' | 'approved' | 'rejected' | 'suspended';
  marketplaces: MarketplaceCode[];
  transportModes: TransportMode[];
  pricingPolicy: string | null;
}

type Msg = { tone: 'ok' | 'error'; text: string };

export default function ProProfilePage() {
  const router = useRouter();
  const [org, setOrg] = useState<string | null>(null);
  const [profile, setProfile] = useState<OrgProfile>();
  const [cities, setCities] = useState<CityInfo[]>([]);
  const [zones, setZones] = useState<OrgServiceZoneInfo[]>([]);
  const [verification, setVerification] = useState<VerificationInfo>();
  const [forbidden, setForbidden] = useState(false);

  const load = useCallback(
    async (orgId: string) => {
      try {
        const [p, c, z] = await Promise.all([
          api<OrgProfile>('/org', { org: orgId }),
          api<CityInfo[]>('/cities'),
          api<OrgServiceZoneInfo[]>('/org/service-zones', { org: orgId }),
        ]);
        setProfile(p);
        setCities(c);
        setZones(z);
        try {
          setVerification(await api<VerificationInfo>('/org/verification', { org: orgId }));
        } catch (err) {
          if (err instanceof ApiError && err.status === 403) setForbidden(true);
        }
      } catch (err) {
        if (err instanceof ApiError && err.status === 401)
          router.replace('/connexion?suite=/pro/profil');
        else router.replace('/pro');
      }
    },
    [router],
  );

  useEffect(() => {
    const id = getActiveOrg();
    if (!id) {
      router.replace('/pro');
      return;
    }
    setOrg(id);
    void load(id);
  }, [load, router]);

  if (!org || !profile)
    return <main className="mx-auto max-w-2xl px-4 py-10 text-muted">Chargement…</main>;

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-5 px-4 py-10">
      <ProNav />
      <h1 className="font-display text-2xl font-bold">{profile.name}</h1>
      {forbidden ? (
        <Notice>
          Seul le propriétaire de l’activité peut modifier le profil et la vérification.
        </Notice>
      ) : (
        <>
          {verification && (
            <VerificationCard org={org} orgStatus={profile.status} initial={verification} />
          )}
          <ServicesCard org={org} profile={profile} onSaved={setProfile} />
          <ZonesCard org={org} cities={cities} initial={zones} />
        </>
      )}
    </main>
  );
}

function VerificationCard({
  org,
  orgStatus,
  initial,
}: {
  org: string;
  orgStatus: OrgProfile['status'];
  initial: VerificationInfo;
}) {
  const [v, setV] = useState(initial);
  const [msg, setMsg] = useState<Msg>();
  const [busy, setBusy] = useState<string>();
  const locked = v.status === 'submitted' || orgStatus === 'approved';

  async function send(kind: string, file: File | undefined) {
    if (!file) return;
    const form = new FormData();
    form.set('kind', kind);
    form.set('file', file);
    setBusy(kind);
    setMsg(undefined);
    try {
      setV(await apiUpload<VerificationInfo>('/org/verification/documents', form, org));
      setMsg({ tone: 'ok', text: 'Document reçu.' });
    } catch (err) {
      if (err instanceof ApiError) setMsg({ tone: 'error', text: err.message });
    } finally {
      setBusy(undefined);
    }
  }

  async function submit() {
    setBusy('submit');
    setMsg(undefined);
    try {
      setV(await api<VerificationInfo>('/org/verification/submit', { method: 'POST', org }));
      setMsg({ tone: 'ok', text: 'Dossier envoyé. L’équipe Konzia vous répondra rapidement.' });
    } catch (err) {
      if (err instanceof ApiError) setMsg({ tone: 'error', text: err.message });
    } finally {
      setBusy(undefined);
    }
  }

  const statusText =
    orgStatus === 'approved'
      ? 'Votre activité est vérifiée : vous apparaissez dans l’annuaire Konzia.'
      : v.status === 'submitted'
        ? 'Dossier en cours d’examen par l’équipe Konzia.'
        : v.status === 'rejected'
          ? `Dossier refusé${v.reason ? ` : ${v.reason}` : '.'} Corrigez-le et renvoyez-le.`
          : 'Pour apparaître dans l’annuaire, envoyez ces deux documents. Ils sont chiffrés et visibles uniquement par vous et l’équipe de vérification.';

  return (
    <Card>
      <h2 className="font-display text-lg font-bold">Vérification</h2>
      <Notice tone={orgStatus === 'approved' ? 'ok' : 'info'}>{statusText}</Notice>
      <ul className="flex flex-col gap-3">
        {REQUIRED_DOCUMENTS.map((kind) => {
          const doc = v.documents.find((d) => d.kind === kind);
          return (
            <li key={kind} className="flex flex-col gap-2 rounded-lg border border-line p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong className="min-w-0">{VERIFICATION_DOCUMENTS[kind]}</strong>
                <span
                  className={`rounded-full px-2 text-xs font-semibold ${doc ? 'bg-ok-soft text-ok' : 'bg-copper-soft'}`}
                >
                  {doc ? 'Reçu' : 'À envoyer'}
                </span>
              </div>
              {doc && <p className="text-sm text-muted break-all">{doc.originalName}</p>}
              {!locked && (
                <label className="flex min-h-11 cursor-pointer items-center justify-center rounded-lg border border-line px-4 font-semibold focus-within:ring-2 focus-within:ring-copper">
                  {busy === kind
                    ? 'Envoi…'
                    : doc
                      ? 'Remplacer le fichier'
                      : 'Choisir une photo ou un PDF'}
                  <input
                    type="file"
                    accept="application/pdf,image/jpeg,image/png,image/webp"
                    className="sr-only"
                    aria-label={`Envoyer : ${VERIFICATION_DOCUMENTS[kind]}`}
                    onChange={(e) => send(kind, e.target.files?.[0])}
                  />
                </label>
              )}
            </li>
          );
        })}
      </ul>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      {!locked && (
        <Button
          busy={busy === 'submit'}
          disabled={v.documents.length < REQUIRED_DOCUMENTS.length}
          onClick={submit}
        >
          Envoyer mon dossier
        </Button>
      )}
    </Card>
  );
}

function ServicesCard({
  org,
  profile,
  onSaved,
}: {
  org: string;
  profile: OrgProfile;
  onSaved: (p: OrgProfile) => void;
}) {
  const [msg, setMsg] = useState<Msg>();
  const [busy, setBusy] = useState(false);

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const body = {
      marketplaces: form.getAll('marketplaces') as MarketplaceCode[],
      transportModes: form.getAll('transportModes') as TransportMode[],
      pricingPolicy: String(form.get('pricingPolicy') ?? ''),
    };
    setBusy(true);
    setMsg(undefined);
    try {
      await api('/org', { method: 'PATCH', body, org });
      onSaved({ ...profile, ...body });
      setMsg({ tone: 'ok', text: 'Services enregistrés.' });
    } catch (err) {
      if (err instanceof ApiError) setMsg({ tone: 'error', text: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <h2 className="font-display text-lg font-bold">Services</h2>
      <form onSubmit={save} className="flex flex-col gap-4">
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-semibold">Sites sur lesquels vous achetez</legend>
          <div className="flex flex-wrap gap-2">
            {(Object.entries(MARKETPLACES) as [MarketplaceCode, string][]).map(([code, label]) => (
              <label
                key={code}
                className="flex min-h-10 items-center gap-2 rounded-full border border-line px-3 has-[:checked]:border-copper has-[:checked]:bg-copper-soft"
              >
                <input
                  type="checkbox"
                  name="marketplaces"
                  value={code}
                  defaultChecked={profile.marketplaces.includes(code)}
                  className="size-4 accent-copper"
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-semibold">Transport proposé</legend>
          <div className="flex flex-wrap gap-2">
            {(Object.entries(TRANSPORT_MODES) as [TransportMode, string][]).map(([code, label]) => (
              <label
                key={code}
                className="flex min-h-10 items-center gap-2 rounded-full border border-line px-3 has-[:checked]:border-copper has-[:checked]:bg-copper-soft"
              >
                <input
                  type="checkbox"
                  name="transportModes"
                  value={code}
                  defaultChecked={profile.transportModes.includes(code)}
                  className="size-4 accent-copper"
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="flex flex-col gap-1">
          <label htmlFor="pricingPolicy" className="text-sm font-semibold">
            Comment vous fixez vos prix (visible des clients)
          </label>
          <textarea
            id="pricingPolicy"
            name="pricingPolicy"
            maxLength={1000}
            rows={3}
            defaultValue={profile.pricingPolicy ?? ''}
            placeholder="Ex. : commission de 10 % du prix des articles, transport aérien au kilo."
            className="rounded-lg border border-line bg-surface p-3 outline-none focus-visible:ring-2 focus-visible:ring-copper"
          />
        </div>
        {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
        <Button type="submit" busy={busy}>
          Enregistrer les services
        </Button>
      </form>
    </Card>
  );
}

function ZonesCard({
  org,
  cities,
  initial,
}: {
  org: string;
  cities: CityInfo[];
  initial: OrgServiceZoneInfo[];
}) {
  const [selected, setSelected] = useState<Map<string, HandoverMode[]>>(
    () => new Map(initial.map((z) => [z.serviceZoneId, z.handoverModes])),
  );
  const [msg, setMsg] = useState<Msg>();
  const [busy, setBusy] = useState(false);

  function toggle(zoneId: string, mode: HandoverMode) {
    setSelected((prev) => {
      const next = new Map(prev);
      const modes = new Set(next.get(zoneId) ?? []);
      if (modes.has(mode)) modes.delete(mode);
      else modes.add(mode);
      if (modes.size === 0) next.delete(zoneId);
      else next.set(zoneId, [...modes]);
      return next;
    });
  }

  async function save() {
    setBusy(true);
    setMsg(undefined);
    const previousFees = new Map(initial.map((z) => [z.serviceZoneId, z.localFee]));
    try {
      await api('/org/service-zones', {
        method: 'PUT',
        org,
        body: {
          zones: [...selected].map(([serviceZoneId, handoverModes]) => ({
            serviceZoneId,
            handoverModes,
            localFee: previousFees.get(serviceZoneId) ?? null,
          })),
        },
      });
      setMsg({ tone: 'ok', text: 'Zones enregistrées.' });
    } catch (err) {
      if (err instanceof ApiError) setMsg({ tone: 'error', text: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <h2 className="font-display text-lg font-bold">Communes desservies</h2>
      <p className="text-sm text-muted">
        Pour chaque commune, cochez comment vos clients récupèrent leurs colis.
      </p>
      {cities.map((city) => (
        <div key={city.id} className="flex flex-col gap-2">
          <h3 className="font-semibold">{city.name}</h3>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[22rem] text-sm">
              <thead>
                <tr className="text-left text-muted">
                  <th className="py-1 font-medium">Commune</th>
                  {(Object.keys(HANDOVER_LABELS) as HandoverMode[]).map((m) => (
                    <th key={m} className="py-1 text-center font-medium">
                      {HANDOVER_LABELS[m]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {city.zones.map((z) => (
                  <tr key={z.id} className="border-t border-line">
                    <td className="py-2">{z.name}</td>
                    {(Object.keys(HANDOVER_LABELS) as HandoverMode[]).map((m) => (
                      <td key={m} className="text-center">
                        <input
                          type="checkbox"
                          aria-label={`${HANDOVER_LABELS[m]} à ${z.name}`}
                          checked={selected.get(z.id)?.includes(m) ?? false}
                          onChange={() => toggle(z.id, m)}
                          className="size-5 accent-copper"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <Button busy={busy} onClick={save}>
        Enregistrer les communes
      </Button>
    </Card>
  );
}
