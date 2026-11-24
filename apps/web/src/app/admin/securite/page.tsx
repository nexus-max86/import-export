'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { AdminShell } from '@/components/admin';
import { Button, Card, Field, Notice } from '@/components/ui';
import { api, ApiError, safeNext } from '@/lib/api';

function Security() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get('suite')) ?? '/admin';
  const [status, setStatus] = useState<{ enabled: boolean; verified: boolean }>();
  const [setup, setSetup] = useState<{ secret: string; otpauthUrl: string }>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ enabled: boolean; verified: boolean }>('/auth/mfa').then(setStatus, (err: unknown) => {
      if (err instanceof ApiError && err.status === 401)
        router.replace('/connexion?suite=/admin/securite');
      else setError('Chargement impossible.');
    });
  }, [router]);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const code = String(new FormData(e.currentTarget).get('mfaCode') ?? '').replace(/\s/g, '');
    setBusy(true);
    setError(undefined);
    try {
      await api(status?.enabled ? '/auth/mfa/verify' : '/auth/mfa/enable', { body: { code } });
      router.replace(next);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Vérification impossible.');
      setBusy(false);
    }
  }

  return (
    <AdminShell title="Double authentification">
      {error && <Notice tone="error">{error}</Notice>}
      {status && !status.enabled && !setup && (
        <Card>
          <p className="text-sm">
            L’administration exige un code à 6 chiffres généré par une application
            d’authentification sur votre téléphone (Google Authenticator, Aegis, Microsoft
            Authenticator…).
          </p>
          <Button
            onClick={() =>
              void api<{ secret: string; otpauthUrl: string }>('/auth/mfa/setup', {
                body: {},
              }).then(setSetup, (err: unknown) =>
                setError(err instanceof ApiError ? err.message : 'Erreur.'),
              )
            }
          >
            Activer la double authentification
          </Button>
        </Card>
      )}
      {setup && (
        <Card>
          <p className="text-sm">
            Dans l’application, choisissez « Saisir une clé » et recopiez cette clé (ou ouvrez le
            lien depuis votre téléphone) :
          </p>
          <code
            className="break-all rounded-lg bg-primary-soft p-3 font-mono text-lg"
            aria-label="Clé secrète"
          >
            {setup.secret.replace(/(.{4})/g, '$1 ').trim()}
          </code>
          <a href={setup.otpauthUrl} className="text-sm font-semibold text-primary underline">
            Ouvrir dans l’application d’authentification
          </a>
        </Card>
      )}
      {status && (status.enabled || setup) && (
        <Card>
          <form onSubmit={submit} className="flex flex-col gap-3">
            <Field
              id="mfaCode"
              label="Code à 6 chiffres"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={7}
              required
            />
            <Button type="submit" busy={busy}>
              {status.enabled ? 'Valider' : 'Activer'}
            </Button>
          </form>
        </Card>
      )}
    </AdminShell>
  );
}

export default function AdminSecurityPage() {
  return (
    <Suspense>
      <Security />
    </Suspense>
  );
}
