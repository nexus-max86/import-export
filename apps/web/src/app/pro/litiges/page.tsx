'use client';

import type { DisputeInfo } from '@konzia/shared';
import { useEffect, useState } from 'react';
import { DisputeList } from '@/components/disputes';
import { ProNav } from '@/components/pro-nav';
import { Notice } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useActiveOrg } from '@/lib/use-org';

export default function ProDisputesPage() {
  const org = useActiveOrg();
  const [list, setList] = useState<DisputeInfo[]>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    if (!org) return;
    api<DisputeInfo[]>('/org/disputes', { org }).then(setList, (err: unknown) =>
      setError(err instanceof ApiError ? err.message : 'Chargement impossible.'),
    );
  }, [org]);
  if (!org) return null;
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-5 px-4 py-10">
      <ProNav />
      <h1 className="font-display text-2xl font-bold">Litiges</h1>
      {error && <Notice tone="error">{error}</Notice>}
      {list && <DisputeList items={list} hrefBase="/pro/litiges" />}
    </main>
  );
}
