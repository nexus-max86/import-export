'use client';

import { CsvExportButton } from '@/components/tracking';
import { ParcelsBoard } from '@/components/parcels';
import { ProNav } from '@/components/pro-nav';
import { useActiveOrg } from '@/lib/use-org';

export default function ProParcelsPage() {
  const org = useActiveOrg();
  if (!org) return null;
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-5 px-4 py-10">
      <ProNav />
      <h1 className="font-display text-2xl font-bold">Colis</h1>
      <CsvExportButton org={org} kind="parcels" label="Exporter les colis (Excel)" />
      <ParcelsBoard org={org} />
    </main>
  );
}
