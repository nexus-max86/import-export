'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { Button, Card, Notice } from '@/components/ui';
import { api, ApiError } from '@/lib/api';

/**
 * Page « lien reçu » (invitation d'équipe, réclamation de fiche) : exige d'être connecté,
 * puis appelle l'API avec le jeton du lien.
 */
export function TokenAction<T>({
  title,
  intro,
  action,
  endpoint,
  success,
}: {
  title: string;
  intro: ReactNode;
  action: string;
  endpoint: string;
  success: (result: T) => ReactNode;
}) {
  const params = useSearchParams();
  const token = params.get('jeton') ?? '';
  const here = `${typeof window === 'undefined' ? '' : window.location.pathname}?jeton=${token}`;
  const [state, setState] = useState<
    | { kind: 'idle' }
    | { kind: 'done'; result: T }
    | { kind: 'login' }
    | { kind: 'error'; text: string }
  >({ kind: 'idle' });
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      const result = await api<T>(endpoint, { body: { token } });
      setState({ kind: 'done', result });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setState({ kind: 'login' });
      else
        setState({
          kind: 'error',
          text: err instanceof ApiError ? err.message : 'Une erreur est survenue.',
        });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <h1 className="font-display text-2xl font-bold">{title}</h1>
      {state.kind === 'done' ? (
        success(state.result)
      ) : (
        <>
          {intro}
          {state.kind === 'login' && (
            <Notice>
              Connectez-vous ou créez votre compte, puis vous reviendrez ici automatiquement.{' '}
              <Link
                className="font-semibold underline"
                href={`/connexion?suite=${encodeURIComponent(here)}`}
              >
                Se connecter
              </Link>
            </Notice>
          )}
          {state.kind === 'error' && <Notice tone="error">{state.text}</Notice>}
          <Button onClick={run} busy={busy} disabled={!token}>
            {action}
          </Button>
        </>
      )}
    </Card>
  );
}
