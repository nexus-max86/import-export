'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { Card, Notice } from '@/components/ui';
import { api, ApiError } from '@/lib/api';

function VerifyEmail() {
  const token = useSearchParams().get('jeton');
  const [state, setState] = useState<'pending' | 'ok' | 'error'>('pending');
  const [message, setMessage] = useState<string>();
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    if (!token) {
      setState('error');
      setMessage('Lien incomplet. Ouvrez à nouveau le lien reçu par e-mail.');
      return;
    }
    api('/auth/verify-email', { body: { token } })
      .then(() => setState('ok'))
      .catch((err: unknown) => {
        setState('error');
        setMessage(err instanceof ApiError ? err.message : undefined);
      });
  }, [token]);

  return (
    <Card>
      <h1 className="font-display text-2xl font-bold">Confirmation de l’adresse e-mail</h1>
      {state === 'pending' && <p className="text-muted">Vérification en cours…</p>}
      {state === 'ok' && (
        <Notice tone="ok">Votre adresse est confirmée. Votre compte est actif.</Notice>
      )}
      {state === 'error' && (
        <Notice tone="error">
          {message ?? 'Ce lien n’est plus valable.'} Depuis votre compte, vous pouvez demander un
          nouveau lien.
        </Notice>
      )}
      <Link href="/compte" className="font-semibold text-copper underline">
        Aller à mon compte
      </Link>
    </Card>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <VerifyEmail />
    </Suspense>
  );
}
