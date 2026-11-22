'use client';

import { RegisterSchema } from '@konzia/shared';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState, type FormEvent } from 'react';
import { Button, Card, Field, Notice } from '@/components/ui';
import { api, ApiError, fieldErrors, safeNext } from '@/lib/api';

function Register() {
  const next = safeNext(useSearchParams().get('suite'));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string>();

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const parsed = RegisterSchema.safeParse({
      displayName: form.get('displayName'),
      email: form.get('email'),
      password: form.get('password'),
      acceptTerms: form.get('acceptTerms') === 'on',
      marketingOptIn: form.get('marketingOptIn') === 'on',
    });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error.issues));
      return;
    }
    setErrors({});
    setFormError(undefined);
    setBusy(true);
    try {
      await api('/auth/register', { body: parsed.data });
      setSentTo(parsed.data.email);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fields);
        setFormError(err.message);
      }
    } finally {
      setBusy(false);
    }
  }

  if (sentTo) {
    return (
      <Card>
        <h1 className="font-display text-2xl font-bold">Vérifiez votre boîte e-mail</h1>
        <p>
          Nous avons envoyé un lien de confirmation à <strong>{sentTo}</strong>. Ouvrez-le pour
          activer votre compte.
        </p>
        <p className="text-sm text-muted">Rien reçu ? Regardez dans les courriers indésirables.</p>
        <Link
          href={next ? `/connexion?suite=${encodeURIComponent(next)}` : '/connexion'}
          className="font-semibold text-copper underline"
        >
          Aller à la connexion
        </Link>
      </Card>
    );
  }

  return (
    <Card>
      <h1 className="font-display text-2xl font-bold">Créer un compte</h1>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <Field id="displayName" label="Nom" autoComplete="name" error={errors.displayName} />
        <Field
          id="email"
          label="Adresse e-mail"
          type="email"
          autoComplete="email"
          error={errors.email}
        />
        <Field
          id="password"
          label="Mot de passe"
          type="password"
          autoComplete="new-password"
          hint="Au moins 10 caractères."
          error={errors.password}
        />
        <div className="flex flex-col gap-2 text-sm">
          <label className="flex items-start gap-2">
            <input type="checkbox" name="acceptTerms" className="mt-1 size-4 accent-copper" />
            <span>
              J’accepte les{' '}
              <Link href="/conditions" target="_blank" className="text-copper underline">
                conditions d’utilisation
              </Link>{' '}
              et la{' '}
              <Link href="/confidentialite" target="_blank" className="text-copper underline">
                politique de confidentialité
              </Link>{' '}
              de Konzia.
            </span>
          </label>
          {errors.acceptTerms && <p className="text-danger">{errors.acceptTerms}</p>}
          <label className="flex items-start gap-2">
            <input type="checkbox" name="marketingOptIn" className="mt-1 size-4 accent-copper" />
            <span>Je souhaite recevoir les nouveautés et offres de Konzia (facultatif).</span>
          </label>
        </div>
        {formError && <Notice tone="error">{formError}</Notice>}
        <Button type="submit" busy={busy}>
          Créer mon compte
        </Button>
      </form>
      <p className="text-sm">
        Déjà inscrit ?{' '}
        <Link href="/connexion" className="font-semibold text-copper underline">
          Se connecter
        </Link>
      </p>
    </Card>
  );
}

export default function RegisterPage() {
  return (
    <Suspense>
      <Register />
    </Suspense>
  );
}
