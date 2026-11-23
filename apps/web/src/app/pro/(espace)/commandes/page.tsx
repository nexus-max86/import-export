'use client';

import { CsvExportButton } from '@/components/tracking';
import type { OrderSummary } from '@konzia/shared';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { OrderList } from '@/components/order-list';
import { ProNav } from '@/components/pro-nav';
import { Loading, EmptyState } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useActiveOrg } from '@/lib/use-org';

export default function ProOrdersPage() {
  const router = useRouter();
  const org = useActiveOrg();
  const [orders, setOrders] = useState<OrderSummary[]>();
  useEffect(() => {
    if (!org) return;
    api<OrderSummary[]>('/org/orders', { org }).then(setOrders, (err: unknown) => {
      if (err instanceof ApiError && err.status === 401)
        router.replace('/connexion?suite=/pro/commandes');
      else router.replace('/pro');
    });
  }, [org, router]);
  if (!org) return null;
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-5 px-4 py-10 lg:max-w-5xl lg:px-8">
      <ProNav />
      <h1 className="font-display text-2xl font-bold">Commandes</h1>
      <CsvExportButton org={org} kind="orders" label="Exporter les commandes (Excel)" />
      {!orders && <Loading />}
      {orders?.length === 0 && (
        <EmptyState title="Aucune commande pour l’instant">
          Une commande est créée quand un client accepte votre devis.
        </EmptyState>
      )}
      {orders && <OrderList orders={orders} href={(o) => `/pro/commandes/${o.id}`} showCustomer />}
    </main>
  );
}
