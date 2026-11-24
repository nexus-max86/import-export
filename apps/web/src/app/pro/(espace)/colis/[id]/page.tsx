'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ParcelEditor } from '@/components/parcels';
import { ProNav } from '@/components/pro-nav';
import { useActiveOrg } from '@/lib/use-org';

export default function ProParcelPage() {
  const { id } = useParams<{ id: string }>();
  const org = useActiveOrg();
  if (!org) return null;
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-8 lg:px-8">
      <ProNav />
      <Link href="/pro/colis" className="text-sm font-semibold text-primary underline">
        ← Tous les colis
      </Link>
      <ParcelEditor org={org} id={id} />
    </main>
  );
}
