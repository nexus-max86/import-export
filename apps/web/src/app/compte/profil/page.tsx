'use client';

import { ClientHeader } from '@/components/notifications';
import {
  AddressSchema,
  UpdateProfileSchema,
  type AddressInfo,
  type CityInfo,
  type ProfileInfo,
} from '@konzia/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { PlaceSelect } from '@/components/place-select';
import { Button, Card, Field, Notice, PageLoading } from '@/components/ui';
import { api, ApiError, fieldErrors } from '@/lib/api';

type Notice = { tone: 'ok' | 'error'; text: string };

export default function ProfilePage() {
  const router = useRouter();
  const [cities, setCities] = useState<CityInfo[]>([]);
  const [profile, setProfile] = useState<ProfileInfo>();
  const [addresses, setAddresses] = useState<AddressInfo[]>([]);
  const [notice, setNotice] = useState<Notice>();

  const load = useCallback(async () => {
    try {
      const [c, p, a] = await Promise.all([
        api<CityInfo[]>('/cities'),
        api<ProfileInfo>('/me/profile'),
        api<AddressInfo[]>('/me/addresses'),
      ]);
      setCities(c);
      setProfile(p);
      setAddresses(a);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) router.replace('/connexion');
      else if (err instanceof ApiError) setNotice({ tone: 'error', text: err.message });
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!profile) {
    return <PageLoading width="max-w-md" />;
  }

  return (
    <main className="mx-auto flex max-w-md flex-col gap-5 px-4 py-10">
      <ClientHeader />
      <Link href="/compte" className="text-sm font-semibold text-primary underline">
        ← Mon compte
      </Link>
      <h1 className="font-display text-2xl font-bold">Profil et adresses</h1>
      {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
      <ProfileForm
        // Recrée le formulaire après enregistrement pour afficher les valeurs normalisées (ex. +243…).
        key={JSON.stringify(profile)}
        profile={profile}
        cities={cities}
        onSaved={(p) => {
          setProfile(p);
          setNotice({ tone: 'ok', text: 'Profil enregistré.' });
        }}
      />
      <Card>
        <h2 className="font-display text-lg font-bold">Adresses de livraison</h2>
        {addresses.length === 0 && (
          <p className="text-muted">
            Ajoutez l’adresse où vous voulez recevoir vos colis. Un point de repère aide le livreur.
          </p>
        )}
        <ul className="flex flex-col gap-3">
          {addresses.map((a) => (
            <AddressItem
              key={a.id}
              address={a}
              cities={cities}
              onChanged={async (text) => {
                await load();
                setNotice({ tone: 'ok', text });
              }}
            />
          ))}
        </ul>
        {addresses.length < 10 && (
          <AddressForm
            cities={cities}
            submitLabel="Ajouter l’adresse"
            onSubmit={async (body) => {
              await api('/me/addresses', { body });
              await load();
              setNotice({ tone: 'ok', text: 'Adresse ajoutée.' });
            }}
          />
        )}
      </Card>
    </main>
  );
}

function ProfileForm({
  profile,
  cities,
  onSaved,
}: {
  profile: ProfileInfo;
  cities: CityInfo[];
  onSaved: (p: ProfileInfo) => void;
}) {
  const [cityId, setCityId] = useState(profile.cityId ?? '');
  const [zoneId, setZoneId] = useState(profile.serviceZoneId ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const phone = String(form.get('phoneWhatsapp') ?? '').trim();
    const parsed = UpdateProfileSchema.safeParse({
      displayName: form.get('displayName'),
      phoneWhatsapp: phone === '' ? null : phone,
      cityId: cityId || null,
      serviceZoneId: zoneId || null,
      deliveryInstructions: form.get('deliveryInstructions'),
    });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error.issues));
      return;
    }
    setErrors({});
    setFormError(undefined);
    setBusy(true);
    try {
      onSaved(await api<ProfileInfo>('/me/profile', { method: 'PUT', body: parsed.data }));
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
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <Field
          id="displayName"
          label="Nom"
          defaultValue={profile.displayName}
          autoComplete="name"
          error={errors.displayName}
        />
        <p className="text-sm text-muted">Adresse e-mail : {profile.email}</p>
        <Field
          id="phoneWhatsapp"
          label="Numéro WhatsApp"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          defaultValue={profile.phoneWhatsapp ?? ''}
          hint="Exemple : 081 000 0000. Vos commissionnaires l’utiliseront pour vous écrire."
          error={errors.phoneWhatsapp}
        />
        <PlaceSelect
          idPrefix="profile"
          cities={cities}
          cityId={cityId}
          zoneId={zoneId}
          onChange={(c, z) => {
            setCityId(c);
            setZoneId(z);
          }}
          error={errors.cityId ?? errors.serviceZoneId}
        />
        <Field
          id="deliveryInstructions"
          label="Instructions de livraison (facultatif)"
          defaultValue={profile.deliveryInstructions ?? ''}
          error={errors.deliveryInstructions}
        />
        {formError && <Notice tone="error">{formError}</Notice>}
        <Button type="submit" busy={busy}>
          Enregistrer le profil
        </Button>
      </form>
    </Card>
  );
}

type AddressBody = ReturnType<typeof AddressSchema.parse>;

function AddressForm({
  cities,
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  cities: CityInfo[];
  initial?: AddressInfo;
  submitLabel: string;
  onSubmit: (body: AddressBody) => Promise<void>;
  onCancel?: () => void;
}) {
  const prefix = initial ? `addr-${initial.id}` : 'addr-new';
  const [cityId, setCityId] = useState(initial?.cityId ?? cities[0]?.id ?? '');
  const [zoneId, setZoneId] = useState(initial?.serviceZoneId ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    const parsed = AddressSchema.safeParse({
      label: form.get(`${prefix}-label`),
      cityId,
      serviceZoneId: zoneId || null,
      line: form.get(`${prefix}-line`),
      landmark: form.get(`${prefix}-landmark`),
      isDefault: form.get(`${prefix}-default`) === 'on',
    });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error.issues));
      return;
    }
    setErrors({});
    setFormError(undefined);
    setBusy(true);
    try {
      await onSubmit(parsed.data);
      if (!initial) {
        formEl.reset();
        setZoneId('');
      }
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
    <form onSubmit={submit} noValidate className="flex flex-col gap-3 border-t border-line pt-4">
      <Field
        id={`${prefix}-label`}
        label="Nom de l’adresse"
        placeholder="Maison, Bureau…"
        defaultValue={initial?.label}
        error={errors.label}
      />
      <PlaceSelect
        idPrefix={prefix}
        cities={cities}
        cityId={cityId}
        zoneId={zoneId}
        onChange={(c, z) => {
          setCityId(c);
          setZoneId(z);
        }}
        error={errors.cityId ?? errors.serviceZoneId}
      />
      <Field
        id={`${prefix}-line`}
        label="Avenue et numéro"
        defaultValue={initial?.line}
        error={errors.line}
      />
      <Field
        id={`${prefix}-landmark`}
        label="Point de repère (facultatif)"
        placeholder="En face de…"
        defaultValue={initial?.landmark ?? ''}
        error={errors.landmark}
      />
      {!initial?.isDefault && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name={`${prefix}-default`} className="size-4 accent-primary" />
          Utiliser par défaut
        </label>
      )}
      {formError && <Notice tone="error">{formError}</Notice>}
      <div className="flex gap-2">
        <Button type="submit" busy={busy} variant={initial ? 'primary' : 'ghost'}>
          {submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Annuler
          </Button>
        )}
      </div>
    </form>
  );
}

function AddressItem({
  address,
  cities,
  onChanged,
}: {
  address: AddressInfo;
  cities: CityInfo[];
  onChanged: (message: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  if (editing) {
    return (
      <li>
        <AddressForm
          cities={cities}
          initial={address}
          submitLabel="Enregistrer l’adresse"
          onCancel={() => setEditing(false)}
          onSubmit={async (body) => {
            await api(`/me/addresses/${address.id}`, { method: 'PATCH', body });
            setEditing(false);
            await onChanged('Adresse modifiée.');
          }}
        />
      </li>
    );
  }

  return (
    <li className="flex flex-col gap-2 rounded-lg border border-line p-3">
      <div className="flex items-center justify-between gap-2">
        <strong>{address.label}</strong>
        {address.isDefault && (
          <span className="rounded-full bg-ok-soft px-2 text-xs font-semibold text-ok">
            Par défaut
          </span>
        )}
      </div>
      <p className="text-sm">
        {address.line}
        <br />
        {address.zoneName ? `${address.zoneName}, ` : ''}
        {address.cityName}
        {address.landmark && (
          <>
            <br />
            <span className="text-muted">Repère : {address.landmark}</span>
          </>
        )}
      </p>
      <div className="flex gap-2">
        <Button variant="ghost" onClick={() => setEditing(true)}>
          Modifier
        </Button>
        {confirming ? (
          <Button
            variant="ghost"
            busy={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await api(`/me/addresses/${address.id}`, { method: 'DELETE' });
                await onChanged(`Adresse « ${address.label} » supprimée.`);
              } finally {
                setBusy(false);
              }
            }}
          >
            Confirmer la suppression de « {address.label} »
          </Button>
        ) : (
          <Button variant="ghost" onClick={() => setConfirming(true)}>
            Supprimer
          </Button>
        )}
      </div>
    </li>
  );
}
