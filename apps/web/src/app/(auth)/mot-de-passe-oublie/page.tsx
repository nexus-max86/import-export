'use client';

import { ForgotPasswordSchema } from '@konzia/shared';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { Button, Card, Field, Notice } from '@/components/ui';
import { api, ApiError, fieldErrors } from '@/lib/api';

export default function ForgotPasswordPage() {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const parsed = ForgotPasswordSchema.safeParse({
      email: new FormData(e.currentTarget).get('email'),
    });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error.issues));
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      await api('/auth/password/forgot', { body: parsed.data });
      setDone(true);
    } catch (err) {
      if (err instanceof ApiError) setFormError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <h1 className="font-display text-2xl font-bold">Mot de passe oublié</h1>
      {done ? (
        <Notice tone="ok">
          Si un compte existe avec cette adresse, un lien de réinitialisation vient d’être envoyé.
          Il est valable 1 heure.
        </Notice>
      ) : (
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          <Field
            id="email"
            label="Adresse e-mail"
            type="email"
            autoComplete="email"
            error={errors.email}
          />
          {formError && <Notice tone="error">{formError}</Notice>}
          <Button type="submit" busy={busy}>
            Recevoir un lien
          </Button>
        </form>
      )}
      <Link href="/connexion" className="text-sm font-semibold text-copper underline">
        Retour à la connexion
      </Link>
    </Card>
  );
}
