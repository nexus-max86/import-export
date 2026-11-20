'use client';

import { LoginSchema } from '@konzia/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button, Card, Field, Notice } from '@/components/ui';
import { api, ApiError, fieldErrors } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const parsed = LoginSchema.safeParse({
      email: form.get('email'),
      password: form.get('password'),
    });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error.issues));
      return;
    }
    setErrors({});
    setFormError(undefined);
    setBusy(true);
    try {
      await api('/auth/login', { body: parsed.data });
      router.push('/compte');
    } catch (err) {
      if (err instanceof ApiError) setFormError(err.message);
      setBusy(false);
    }
  }

  return (
    <Card>
      <h1 className="font-display text-2xl font-bold">Se connecter</h1>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
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
          autoComplete="current-password"
          error={errors.password}
        />
        {formError && <Notice tone="error">{formError}</Notice>}
        <Button type="submit" busy={busy}>
          Se connecter
        </Button>
      </form>
      <div className="flex flex-col gap-1 text-sm">
        <Link href="/mot-de-passe-oublie" className="font-semibold text-copper underline">
          Mot de passe oublié ?
        </Link>
        <p>
          Pas encore de compte ?{' '}
          <Link href="/inscription" className="font-semibold text-copper underline">
            Créer un compte
          </Link>
        </p>
      </div>
    </Card>
  );
}
