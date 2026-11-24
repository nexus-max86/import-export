'use client';

import { ClientHeader } from '@/components/notifications';
import type { RequestSummary } from '@konzia/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { StatusPill } from '@/components/status-pill';
import { buttonClass, Loading, EmptyState } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { fmtDate } from '@/lib/format';
import { REQUEST_STATUS_LABELS, requestTone } from '@/lib/request-status';

export default function MyRequestsPage() {
  const router = useRouter();
  const [list, setList] = useState<RequestSummary[]>();

  useEffect(() => {
    api<RequestSummary[]>('/requests').then(setList, (err: unknown) => {
      if (err instanceof ApiError && err.status === 401)
        router.replace('/connexion?suite=/demandes');
    });
  }, [router]);

  return (
    <main className="mx-auto flex max-w-md flex-col gap-5 px-4 py-10">
      <ClientHeader />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold">Mes demandes</h1>
        <Link href="/demande" className={buttonClass()}>
          Nouvelle demande
        </Link>
      </div>
      {!list && <Loading />}
      {list?.length === 0 && (
        <EmptyState title="Aucune demande pour l’instant">
          Collez le lien d’un article pour commencer.
        </EmptyState>
      )}
      <ul className="flex flex-col gap-3">
        {list?.map((r) => (
          <li key={r.id}>
            <Link
              href={r.status === 'draft' ? '/demande' : `/demandes/${r.id}`}
              className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-4 outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong className="min-w-0 truncate">{r.firstItemTitle ?? 'Demande vide'}</strong>
                <StatusPill tone={requestTone(r.status)}>
                  {REQUEST_STATUS_LABELS[r.status]}
                </StatusPill>
              </div>
              <span className="text-sm text-muted">
                {r.itemCount} article(s) ·{' '}
                {r.sentAt ? `envoyée le ${fmtDate(r.sentAt)}` : 'non envoyée'}
                {r.recipients.length > 0 &&
                  ` · ${r.recipients.map((x) => x.organizationName).join(', ')}`}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
