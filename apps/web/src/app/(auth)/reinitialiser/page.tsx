'use client';

import { ResetPasswordSchema } from '@konzia/shared';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState, type FormEvent } from 'react';
import { Button, Card, Field, Notice } from '@/components/ui';
import { api, ApiError, fieldErrors } from '@/lib/api';

function ResetPassword() {
  const token = useSearchParams().get('jeton') ?? '';
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const password = form.get('password');
    if (password !== form.get('confirm')) {
      setErrors({ confirm: 'Les deux mots de passe ne correspondent pas.' });
      return;
    }
    const parsed = ResetPasswordSchema.safeParse({ token, password });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error.issues));
      if (!token) setFormError('Lien incomplet. Ouvrez à nouveau le lien reçu par e-mail.');
      return;
    }
    setErrors({});
    setFormError(undefined);
    setBusy(true);
    try {
      await api('/auth/password/reset', { body: parsed.data });
      setDone(true);
    } catch (err) {
      if (err instanceof ApiError) setFormError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <Card>
        <Notice tone="ok">Mot de passe changé. Tous vos appareils ont été déconnectés.</Notice>
        <Link href="/connexion" className="font-semibold text-primary underline">
          Se connecter
        </Link>
      </Card>
    );
  }

  return (
    <Card>
      <h1 className="font-display text-2xl font-bold">Nouveau mot de passe</h1>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <Field
          id="password"
          label="Nouveau mot de passe"
          type="password"
          autoComplete="new-password"
          hint="Au moins 10 caractères."
          error={errors.password}
        />
        <Field
          id="confirm"
          label="Confirmez le mot de passe"
          type="password"
          autoComplete="new-password"
          error={errors.confirm}
        />
        {formError && <Notice tone="error">{formError}</Notice>}
        <Button type="submit" busy={busy}>
          Changer le mot de passe
        </Button>
      </form>
    </Card>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPassword />
    </Suspense>
  );
}
