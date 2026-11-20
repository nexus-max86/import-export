'use client';

import { CreateOrganizationSchema, ORG_ROLE_LABELS, type MembershipSummary } from '@konzia/shared';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Button, Card, Field, Logo, Notice } from '@/components/ui';
import { setActiveOrg } from '@/lib/active-org';
import { api, ApiError, fieldErrors } from '@/lib/api';

const STATUS_LABEL = {
  pending: 'En attente de vérification',
  approved: 'Vérifié',
  rejected: 'Refusé',
  suspended: 'Suspendu',
} as const;

export default function ProHomePage() {
  const router = useRouter();
  const [orgs, setOrgs] = useState<MembershipSummary[]>();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setOrgs(await api<MembershipSummary[]>('/organizations/mine'));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) router.replace('/connexion?suite=/pro');
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  function open(id: string) {
    setActiveOrg(id);
    router.push('/pro/clients');
  }

  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const phone = String(form.get('orgPhone') ?? '').trim();
    const parsed = CreateOrganizationSchema.safeParse({
      name: form.get('orgName'),
      type: form.get('orgType'),
      ...(phone ? { phoneWhatsapp: phone } : {}),
    });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error.issues));
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const org = await api<MembershipSummary>('/organizations', { body: parsed.data });
      open(org.organizationId);
    } catch (err) {
      if (err instanceof ApiError) setFormError(err.message);
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex max-w-md flex-col gap-5 px-4 py-10">
      <Logo />
      <h1 className="font-display text-2xl font-bold">Espace professionnel</h1>
      {!orgs && <p className="text-muted">Chargement…</p>}
      {orgs && orgs.length > 0 && (
        <ul className="flex flex-col gap-3">
          {orgs.map((o) => (
            <li key={o.organizationId}>
              <button
                type="button"
                onClick={() => open(o.organizationId)}
                className="flex w-full flex-col items-start gap-1 rounded-2xl border border-line bg-surface px-5 py-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-copper"
              >
                <span className="font-semibold">{o.name}</span>
                <span className="text-sm text-muted">
                  {ORG_ROLE_LABELS[o.role]} · {STATUS_LABEL[o.status]}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {orgs && (
        <Card>
          <h2 className="font-display text-lg font-bold">
            {orgs.length === 0
              ? 'Créez votre activité de commissionnaire'
              : 'Créer une autre activité'}
          </h2>
          <p className="text-sm text-muted">
            Vous pourrez gérer vos clients tout de suite. Vous apparaîtrez dans l’annuaire Konzia
            après vérification de vos documents.
          </p>
          <form onSubmit={create} noValidate className="flex flex-col gap-4">
            <Field id="orgName" label="Nom commercial" error={errors.name} />
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-semibold">Type</legend>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="orgType"
                  value="independent"
                  defaultChecked
                  className="size-4 accent-copper"
                />
                Commissionnaire indépendant
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="orgType"
                  value="company"
                  className="size-4 accent-copper"
                />
                Entreprise (plusieurs employés)
              </label>
            </fieldset>
            <Field
              id="orgPhone"
              label="WhatsApp professionnel (facultatif)"
              type="tel"
              inputMode="tel"
              error={errors.phoneWhatsapp}
            />
            {formError && <Notice tone="error">{formError}</Notice>}
            <Button type="submit" busy={busy}>
              Créer mon espace
            </Button>
          </form>
        </Card>
      )}
    </main>
  );
}
