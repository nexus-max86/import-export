'use client';

import type { NotificationInfo, NotificationPreferenceInfo } from '@konzia/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button, Card, Logo, Notice, Loading } from '@/components/ui';
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
      className="relative inline-flex min-h-10 min-w-10 items-center justify-center gap-2 rounded-full border border-line bg-surface px-2.5 text-sm font-semibold outline-none transition-[border-color,background-color] duration-150 ease-out-quint hover:border-muted focus-visible:ring-2 focus-visible:ring-copper sm:px-3"
    >
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        className="size-[18px] fill-none stroke-current stroke-[1.8]"
      >
        <path d="M6 9a6 6 0 1 1 12 0c0 5 2 6.5 2 6.5H4S6 14 6 9Z" strokeLinejoin="round" />
        <path d="M10 19a2 2 0 0 0 4 0" strokeLinecap="round" />
      </svg>
      <span className="hidden sm:inline">Notifications</span>
      {count > 0 && (
        <span
          key={count}
          className="animate-enter rounded-full bg-copper px-1.5 text-xs leading-5 text-on-copper tabular"
        >
          {count}
        </span>
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
  if (!list || !prefs) return <Loading lines={2} />;
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
                  className={`relative flex w-full flex-col gap-1 rounded-lg border border-line py-3 pr-3 pl-4 text-left text-sm outline-none transition-[background-color,border-color] duration-150 ease-out-quint hover:bg-sunken focus-visible:ring-2 focus-visible:ring-copper ${
                    n.read
                      ? 'text-muted'
                      : 'bg-surface before:absolute before:inset-y-3 before:left-0 before:w-[3px] before:rounded-full before:bg-copper'
                  }`}
                >
                  <span
                    className={`flex items-center gap-2 font-semibold ${n.read ? '' : 'text-ink'}`}
                  >
                    {!n.read && (
                      <>
                        <span aria-hidden className="size-2 shrink-0 rounded-full bg-copper" />
                        <span className="sr-only">Non lue : </span>
                      </>
                    )}
                    {n.title}
                  </span>
                  <span className={n.read ? '' : 'text-ink'}>{n.body}</span>
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
