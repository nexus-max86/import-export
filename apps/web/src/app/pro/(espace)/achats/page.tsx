'use client';

import { ProNav } from '@/components/pro-nav';
import { PurchasesBoard } from '@/components/purchases';
import { useActiveOrg } from '@/lib/use-org';

export default function ProPurchasesPage() {
  const org = useActiveOrg();
  if (!org) return null;
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-5 px-4 py-10">
      <ProNav />
      <h1 className="font-display text-2xl font-bold">Achats chez les vendeurs</h1>
      <PurchasesBoard org={org} />
    </main>
  );
}
