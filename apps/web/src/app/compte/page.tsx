'use client';

import type { MeResponse, SessionInfo } from '@konzia/shared';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Button, Card, Logo, Notice } from '@/components/ui';
import { api, ApiError } from '@/lib/api';

function deviceLabel(ua: string | null): string {
  if (!ua) return 'Appareil inconnu';
  if (/Android/i.test(ua)) return 'Téléphone Android';
  if (/iPhone|iPad/i.test(ua)) return 'iPhone ou iPad';
  if (/Windows/i.test(ua)) return 'Ordinateur Windows';
  if (/Mac OS/i.test(ua)) return 'Mac';
  if (/Linux/i.test(ua)) return 'Ordinateur Linux';
  return 'Autre appareil';
}

const dateFmt = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Africa/Lubumbashi',
});

export default function AccountPage() {
  const router = useRouter();
  const [me, setMe] = useState<MeResponse>();
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string }>();
  const [busy, setBusy] = useState<string>();

  const load = useCallback(async () => {
    try {
      const [meRes, sessionsRes] = await Promise.all([
        api<MeResponse>('/auth/me'),
        api<SessionInfo[]>('/auth/sessions'),
      ]);
      setMe(meRes);
      setSessions(sessionsRes);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) router.replace('/connexion');
      else if (err instanceof ApiError) setNotice({ tone: 'error', text: err.message });
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(key: string, action: () => Promise<void>, success?: string) {
    setBusy(key);
    setNotice(undefined);
    try {
      await action();
      if (success) setNotice({ tone: 'ok', text: success });
    } catch (err) {
      if (err instanceof ApiError) setNotice({ tone: 'error', text: err.message });
    } finally {
      setBusy(undefined);
    }
  }

  if (!me) {
    return (
      <main className="mx-auto max-w-md px-4 py-10 text-muted" aria-busy="true">
        Chargement de votre compte…
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-md flex-col gap-5 px-4 py-10">
      <Logo />
      <h1 className="font-display text-2xl font-bold">Bonjour {me.displayName}</h1>
      {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
      {!me.emailVerified && (
        <Card>
          <p>
            Confirmez votre adresse <strong>{me.email}</strong> pour pouvoir envoyer des demandes de
            devis.
          </p>
          <Button
            variant="ghost"
            busy={busy === 'resend'}
            onClick={() =>
              run(
                'resend',
                () => api('/auth/verify-email/resend', { method: 'POST' }),
                'Un nouveau lien vient d’être envoyé.',
              )
            }
          >
            Renvoyer le lien
          </Button>
        </Card>
      )}
      <Card>
        <h2 className="font-display text-lg font-bold">Appareils connectés</h2>
        <ul className="flex flex-col divide-y divide-line">
          {sessions.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="font-medium">
                  {deviceLabel(s.userAgent)}
                  {s.current && <span className="ml-2 text-sm text-ok">cet appareil</span>}
                </p>
                <p className="text-sm text-muted">
                  Dernière activité : {dateFmt.format(new Date(s.lastSeenAt))}
                </p>
              </div>
              {!s.current && (
                <Button
                  variant="ghost"
                  busy={busy === s.id}
                  onClick={() =>
                    run(
                      s.id,
                      async () => {
                        await api(`/auth/sessions/${s.id}`, { method: 'DELETE' });
                        await load();
                      },
                      'Appareil déconnecté.',
                    )
                  }
                >
                  Déconnecter
                </Button>
              )}
            </li>
          ))}
        </ul>
        <Button
          variant="ghost"
          busy={busy === 'all'}
          onClick={() =>
            run('all', async () => {
              await api('/auth/logout-all', { method: 'POST' });
              router.replace('/connexion');
            })
          }
        >
          Déconnecter tous les appareils
        </Button>
      </Card>
      <Button
        busy={busy === 'logout'}
        onClick={() =>
          run('logout', async () => {
            await api('/auth/logout', { method: 'POST' });
            router.replace('/connexion');
          })
        }
      >
        Se déconnecter
      </Button>
    </main>
  );
}
