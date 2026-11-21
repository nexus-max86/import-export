'use client';

import type { NotificationInfo, NotificationPreferenceInfo } from '@konzia/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button, Card, Logo, Notice } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { fmtDate } from '@/lib/format';

/** Cloche : nombre de notifications non lues (masquée si non connecté). */
export function NotificationBell() {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    api<{ count: number }>('/notifications/unread-count').then(
      (r) => setCount(r.count),
      () => setCount(null),
    );
  }, []);
  if (count === null) return null;
  return (
    <Link
      href="/notifications"
      aria-label={count > 0 ? `Notifications, ${count} non lue(s)` : 'Notifications'}
      className="relative inline-flex min-h-10 items-center rounded-full border border-line px-3 text-sm font-semibold"
    >
      Notifications
      {count > 0 && (
        <span className="ml-2 rounded-full bg-copper px-2 text-xs text-white">{count}</span>
      )}
    </Link>
  );
}

/** En-tête des pages client connecté : logo + notifications. */
export function ClientHeader() {
  return (
    <header className="flex items-center justify-between gap-3">
      <Logo />
      <NotificationBell />
    </header>
  );
}

export function NotificationCenter() {
  const router = useRouter();
  const [list, setList] = useState<NotificationInfo[]>();
  const [prefs, setPrefs] = useState<NotificationPreferenceInfo[]>();
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    Promise.all([
      api<NotificationInfo[]>('/notifications'),
      api<NotificationPreferenceInfo[]>('/me/notification-preferences'),
    ]).then(
      ([l, p]) => {
        setList(l);
        setPrefs(p);
      },
      (err: unknown) => {
        if (err instanceof ApiError && err.status === 401)
          router.replace('/connexion?suite=/notifications');
        else setError(err instanceof ApiError ? err.message : 'Chargement impossible.');
      },
    );
  }, [router]);

  async function open(n: NotificationInfo) {
    if (!n.read) await api(`/notifications/${n.id}/read`, { body: {} }).catch(() => undefined);
    if (n.link) router.push(n.link);
    else setList((l) => l?.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
  }

  async function readAll() {
    await api('/notifications/read-all', { body: {} });
    setList((l) => l?.map((x) => ({ ...x, read: true })));
  }

  async function toggle(type: NotificationPreferenceInfo['type'], email: boolean) {
    setSaved(false);
    try {
      setPrefs(
        await api<NotificationPreferenceInfo[]>('/me/notification-preferences', {
          method: 'PUT',
          body: { preferences: [{ type, email }] },
        }),
      );
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Enregistrement impossible.');
    }
  }

  if (error) return <Notice tone="error">{error}</Notice>;
  if (!list || !prefs) return <p className="text-sm text-muted">Chargement…</p>;
  return (
    <>
      <Card>
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-lg font-bold">Dernières notifications</h2>
          {list.some((n) => !n.read) && (
            <Button variant="ghost" onClick={() => void readAll()}>
              Tout marquer comme lu
            </Button>
          )}
        </div>
        {list.length === 0 ? (
          <p className="text-sm text-muted">Rien de nouveau pour l’instant.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {list.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => void open(n)}
                  className={`flex w-full flex-col gap-1 rounded-lg border p-3 text-left text-sm ${
                    n.read ? 'border-line' : 'border-copper bg-copper-soft'
                  }`}
                >
                  <span className="font-semibold">
                    {!n.read && <span className="sr-only">Non lue : </span>}
                    {n.title}
                  </span>
                  <span>{n.body}</span>
                  <span className="text-xs text-muted">{fmtDate(n.createdAt)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card>
        <h2 className="font-display text-lg font-bold">Recevoir aussi par e-mail</h2>
        <p className="text-sm text-muted">
          Les notifications restent toujours visibles ici. Décochez ce que vous ne voulez pas
          recevoir par e-mail.
        </p>
        <ul className="flex flex-col gap-2">
          {prefs.map((p) => (
            <li key={p.type}>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={p.email}
                  onChange={(e) => void toggle(p.type, e.target.checked)}
                />
                {p.label}
              </label>
            </li>
          ))}
        </ul>
        {saved && <Notice tone="ok">Préférences enregistrées.</Notice>}
      </Card>
    </>
  );
}
