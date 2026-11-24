'use client';

import { ClientHeader } from '@/components/notifications';
import type { OrderDetail } from '@konzia/shared';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { CustomerOrderActions } from '@/components/order-actions';
import { OrderView } from '@/components/order-view';
import { CustomerPayments } from '@/components/payments';
import { CustomerTracking } from '@/components/tracking';
import { CustomerWhatsAppButton } from '@/components/whatsapp';
import { OpenDisputeCard } from '@/components/disputes';
import { Notice } from '@/components/ui';
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
      <ClientHeader />
      <Link href="/commandes" className="text-sm font-semibold text-primary underline">
        ← Mes commandes
      </Link>
      {error && <Notice tone="error">{error}</Notice>}
      {order && (
        <>
          <OrderView order={order} />
          <CustomerTracking key={order.status} orderId={order.id} />
          <CustomerWhatsAppButton order={order} />
          <OpenDisputeCard orderId={order.id} />
          <CustomerPayments
            order={order}
            onChanged={() => void api<OrderDetail>(`/orders/${id}`).then(setOrder)}
          />
          <CustomerOrderActions order={order} onChange={setOrder} />
        </>
      )}
    </main>
  );
}
