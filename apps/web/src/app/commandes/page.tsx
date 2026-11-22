'use client';

import { ClientHeader } from '@/components/notifications';
import type { OrderSummary } from '@konzia/shared';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { OrderList } from '@/components/order-list';
import { Card, Loading } from '@/components/ui';
import { api, ApiError } from '@/lib/api';

export default function MyOrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<OrderSummary[]>();
  useEffect(() => {
    api<OrderSummary[]>('/orders').then(setOrders, (err: unknown) => {
      if (err instanceof ApiError && err.status === 401)
        router.replace('/connexion?suite=/commandes');
    });
  }, [router]);
  return (
    <main className="mx-auto flex max-w-md flex-col gap-5 px-4 py-10">
      <ClientHeader />
      <h1 className="font-display text-2xl font-bold">Mes commandes</h1>
      {!orders && <Loading />}
      {orders?.length === 0 && (
        <Card>
          <p>
            Aucune commande pour l’instant. Une commande est créée quand vous acceptez un devis.
          </p>
        </Card>
      )}
      {orders && <OrderList orders={orders} href={(o) => `/commandes/${o.id}`} />}
    </main>
  );
}
