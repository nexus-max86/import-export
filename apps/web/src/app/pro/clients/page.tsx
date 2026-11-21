'use client';

import {
  formatPhone,
  OrgCustomerSchema,
  type CityInfo,
  type ClaimLink,
  type OrgCustomerInfo,
} from '@konzia/shared';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { CustomerImport } from '@/components/customer-import';
import { PlaceSelect } from '@/components/place-select';
import { ProNav } from '@/components/pro-nav';
import { Button, Card, Field, Notice } from '@/components/ui';
import { getActiveOrg } from '@/lib/active-org';
import { api, ApiError, fieldErrors } from '@/lib/api';

type Page = { items: OrgCustomerInfo[]; next: string | null };

export default function CustomersPage() {
  const router = useRouter();
  const [org, setOrg] = useState<string | null>(null);
  const [cities, setCities] = useState<CityInfo[]>([]);
  const [page, setPage] = useState<Page>();
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string }>();

  const load = useCallback(
    async (orgId: string, q: string) => {
      try {
        const params = q.trim() ? `?q=${encodeURIComponent(q.trim())}` : '';
        setPage(await api<Page>(`/org/customers${params}`, { org: orgId }));
      } catch (err) {
        if (err instanceof ApiError && err.status === 401)
          router.replace('/connexion?suite=/pro/clients');
        else if (err instanceof ApiError && (err.status === 403 || err.status === 400))
          router.replace('/pro');
        else if (err instanceof ApiError) setNotice({ tone: 'error', text: err.message });
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
    void load(id, '');
    api<CityInfo[]>('/cities').then(setCities, () => undefined);
  }, [load, router]);

  if (!org) return null;

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-5 px-4 py-10">
      <ProNav />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold">Clients</h1>
        {!adding && !importing && (
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" onClick={() => setImporting(true)}>
              Importer depuis Excel
            </Button>
            <Button onClick={() => setAdding(true)}>Ajouter un client</Button>
          </div>
        )}
      </div>
      {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
      {importing && (
        <CustomerImport
          org={org}
          onCancel={() => setImporting(false)}
          onDone={async (r) => {
            setImporting(false);
            setNotice({
              tone: 'ok',
              text: `${r.imported} client(s) importé(s)${r.skipped ? `, ${r.skipped} ligne(s) ignorée(s)` : ''}.`,
            });
            await load(org, query);
          }}
        />
      )}
      {adding && (
        <NewCustomerForm
          org={org}
          cities={cities}
          onCancel={() => setAdding(false)}
          onCreated={async (c) => {
            setAdding(false);
            setNotice({ tone: 'ok', text: `${c.fullName} ajouté.` });
            await load(org, query);
          }}
        />
      )}
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          void load(org, query);
        }}
        className="flex items-end gap-2"
      >
        <div className="min-w-0 flex-1">
          <Field
            id="q"
            label="Rechercher"
            placeholder="Nom, numéro ou e-mail"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <Button type="submit" variant="ghost">
          Rechercher
        </Button>
      </form>
      {!page && <p className="text-muted">Chargement…</p>}
      {page && page.items.length === 0 && (
        <Card>
          <p>
            {query
              ? `Aucun client ne correspond à « ${query} ».`
              : 'Aucun client pour l’instant. Ajoutez vos clients habituels, même s’ils n’ont pas de compte Konzia : vous pourrez gérer leurs commandes pour eux.'}
          </p>
        </Card>
      )}
      <ul className="flex flex-col gap-3">
        {page?.items.map((c) => (
          <CustomerRow key={c.id} org={org} customer={c} />
        ))}
      </ul>
    </main>
  );
}

function CustomerRow({ org, customer }: { org: string; customer: OrgCustomerInfo }) {
  const [claim, setClaim] = useState<ClaimLink>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function createLink() {
    setBusy(true);
    setError(undefined);
    try {
      setClaim(
        await api<ClaimLink>(`/org/customers/${customer.id}/claim-link`, { method: 'POST', org }),
      );
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <strong>{customer.fullName}</strong>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${customer.hasAccount ? 'bg-ok-soft text-ok' : 'bg-copper-soft text-ink'}`}
        >
          {customer.hasAccount ? 'Compte Konzia' : 'Client géré'}
        </span>
      </div>
      <p className="text-sm text-muted">
        {[
          customer.phoneWhatsapp && formatPhone(customer.phoneWhatsapp),
          customer.email,
          customer.zoneName ?? customer.cityName,
        ]
          .filter(Boolean)
          .join(' · ')}
      </p>
      {customer.notesPrivate && <p className="text-sm">Note interne : {customer.notesPrivate}</p>}
      {!customer.hasAccount && !claim && (
        <div>
          <Button variant="ghost" busy={busy} onClick={createLink}>
            Inviter {customer.fullName} à suivre ses commandes
          </Button>
        </div>
      )}
      {claim && (
        <div className="flex flex-col gap-2 rounded-lg bg-copper-soft p-3 text-sm">
          <p>Envoyez ce lien au client (valable 14 jours) :</p>
          <p className="break-all font-mono text-xs select-all">{claim.link}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="ghost"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(claim.link);
                  setCopied(true);
                } catch {
                  setCopied(false);
                }
              }}
            >
              {copied ? 'Lien copié' : 'Copier le lien'}
            </Button>
            {claim.whatsapp && (
              <a
                href={claim.whatsapp}
                target="_blank"
                rel="noreferrer"
                className="flex min-h-11 items-center rounded-lg bg-copper px-4 font-semibold text-white"
              >
                Envoyer sur WhatsApp
              </a>
            )}
          </div>
        </div>
      )}
      {error && <Notice tone="error">{error}</Notice>}
    </li>
  );
}

function NewCustomerForm({
  org,
  cities,
  onCreated,
  onCancel,
}: {
  org: string;
  cities: CityInfo[];
  onCreated: (c: OrgCustomerInfo) => Promise<void>;
  onCancel: () => void;
}) {
  const [cityId, setCityId] = useState(cities[0]?.id ?? '');
  const [zoneId, setZoneId] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const text = (k: string) => String(form.get(k) ?? '').trim();
    const parsed = OrgCustomerSchema.safeParse({
      fullName: text('fullName'),
      phoneWhatsapp: text('phone') || null,
      email: text('email') || null,
      cityId: cityId || null,
      serviceZoneId: zoneId || null,
      addressLine: text('addressLine'),
      landmark: text('landmark'),
      notesPrivate: text('notesPrivate'),
    });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error.issues));
      return;
    }
    setErrors({});
    setFormError(undefined);
    setBusy(true);
    try {
      await onCreated(await api<OrgCustomerInfo>('/org/customers', { body: parsed.data, org }));
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fields);
        setFormError(err.message);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <h2 className="font-display text-lg font-bold">Nouveau client</h2>
      <form onSubmit={submit} noValidate className="flex flex-col gap-3">
        <Field id="fullName" label="Nom complet" error={errors.fullName} />
        <Field
          id="phone"
          label="Numéro WhatsApp"
          type="tel"
          inputMode="tel"
          hint="Exemple : 081 000 0000"
          error={errors.phoneWhatsapp}
        />
        <Field id="email" label="E-mail (facultatif)" type="email" error={errors.email} />
        <PlaceSelect
          idPrefix="customer"
          cities={cities}
          cityId={cityId}
          zoneId={zoneId}
          onChange={(c, z) => {
            setCityId(c);
            setZoneId(z);
          }}
        />
        <Field id="addressLine" label="Adresse (facultatif)" error={errors.addressLine} />
        <Field id="landmark" label="Point de repère (facultatif)" error={errors.landmark} />
        <Field
          id="notesPrivate"
          label="Note interne (jamais visible du client)"
          error={errors.notesPrivate}
        />
        {formError && <Notice tone="error">{formError}</Notice>}
        <div className="flex gap-2">
          <Button type="submit" busy={busy}>
            Enregistrer le client
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel}>
            Annuler
          </Button>
        </div>
      </form>
    </Card>
  );
}
