'use client';

import type { OrderDetail } from '@konzia/shared';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { CustomerOrderActions } from '@/components/order-actions';
import { OrderView } from '@/components/order-view';
import { Logo, Notice } from '@/components/ui';
import { api, ApiError } from '@/lib/api';

export default function OrderPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [order, setOrder] = useState<OrderDetail>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    api<OrderDetail>(`/orders/${id}`).then(setOrder, (err: unknown) => {
      if (err instanceof ApiError && err.status === 401)
        router.replace(`/connexion?suite=/commandes/${id}`);
      else setError(err instanceof ApiError ? err.message : 'Chargement impossible.');
    });
  }, [id, router]);
  return (
    <main className="mx-auto flex max-w-md flex-col gap-5 px-4 py-10">
      <Logo />
      <Link href="/commandes" className="text-sm font-semibold text-copper underline">
        ← Mes commandes
      </Link>
      {error && <Notice tone="error">{error}</Notice>}
      {order && (
        <>
          <OrderView order={order} />
          <CustomerOrderActions order={order} onChange={setOrder} />
          {order.status === 'awaiting_payment' && (
            <Notice>
              Prochaine étape : payer {order.organizationName}. Les instructions de paiement
              arrivent avec la prochaine version de Konzia.
            </Notice>
          )}
        </>
      )}
    </main>
  );
}
