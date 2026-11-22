'use client';

import type { DisputeInfo } from '@konzia/shared';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { DisputeThread } from '@/components/disputes';
import { ClientHeader } from '@/components/notifications';
import { Notice } from '@/components/ui';
import { api, ApiError } from '@/lib/api';

export default function CustomerDisputePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [dispute, setDispute] = useState<DisputeInfo>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    api<DisputeInfo>(`/disputes/${id}`).then(setDispute, (err: unknown) => {
      if (err instanceof ApiError && err.status === 401)
        router.replace(`/connexion?suite=/litiges/${id}`);
      else setError(err instanceof ApiError ? err.message : 'Chargement impossible.');
    });
  }, [id, router]);
  return (
    <main className="mx-auto flex max-w-md flex-col gap-5 px-4 py-10">
      <ClientHeader />
      {dispute && (
        <Link
          href={`/commandes/${dispute.orderId}`}
          className="text-sm font-semibold text-copper underline"
        >
          ← Commande {dispute.orderNumber}
        </Link>
      )}
      <h1 className="font-display text-2xl font-bold">Litige</h1>
      {error && <Notice tone="error">{error}</Notice>}
      {dispute && <DisputeThread dispute={dispute} base="/disputes" onChange={setDispute} />}
    </main>
  );
}
