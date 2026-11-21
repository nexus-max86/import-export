'use client';

import type { OrderDetail } from '@konzia/shared';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { OrderView } from '@/components/order-view';
import { ProNav } from '@/components/pro-nav';
import { Notice } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useActiveOrg } from '@/lib/use-org';

export default function ProOrderPage() {
  const { id } = useParams<{ id: string }>();
  const org = useActiveOrg();
  const [order, setOrder] = useState<OrderDetail>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    if (!org) return;
    api<OrderDetail>(`/org/orders/${id}`, { org }).then(setOrder, (err: unknown) =>
      setError(err instanceof ApiError ? err.message : 'Chargement impossible.'),
    );
  }, [id, org]);
  if (!org) return null;
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-5 px-4 py-10">
      <ProNav />
      <Link href="/pro/commandes" className="text-sm font-semibold text-copper underline">
        ← Toutes les commandes
      </Link>
      {error && <Notice tone="error">{error}</Notice>}
      {order && <OrderView order={order} />}
    </main>
  );
}
