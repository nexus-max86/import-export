'use client';

import type { DisputeInfo } from '@konzia/shared';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { DisputeThread } from '@/components/disputes';
import { ProNav } from '@/components/pro-nav';
import { Notice } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useActiveOrg } from '@/lib/use-org';

export default function ProDisputePage() {
  const { id } = useParams<{ id: string }>();
  const org = useActiveOrg();
  const [dispute, setDispute] = useState<DisputeInfo>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    if (!org) return;
    api<DisputeInfo>(`/org/disputes/${id}`, { org }).then(setDispute, (err: unknown) =>
      setError(err instanceof ApiError ? err.message : 'Chargement impossible.'),
    );
  }, [id, org]);
  if (!org) return null;
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-5 px-4 py-10">
      <ProNav />
      <Link href="/pro/litiges" className="text-sm font-semibold text-copper underline">
        ← Tous les litiges
      </Link>
      {error && <Notice tone="error">{error}</Notice>}
      {dispute && (
        <>
          {dispute.status === 'awaiting_commissioner' && (
            <Notice>Le client attend votre réponse : proposez une solution ci-dessous.</Notice>
          )}
          <DisputeThread dispute={dispute} base="/org/disputes" org={org} onChange={setDispute} />
        </>
      )}
    </main>
  );
}
