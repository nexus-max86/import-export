'use client';

import { ORG_HEADER, type CustomerParcelTracking } from '@konzia/shared';
import { useEffect, useState } from 'react';
import { StatusPill } from '@/components/status-pill';
import { Button, Card, Notice } from '@/components/ui';
import { api } from '@/lib/api';
import { fmtDate } from '@/lib/format';

/** Écran 06 : suivi de MES articles, colis par colis (jamais ceux des autres clients). */
export function CustomerTracking({ orderId }: { orderId: string }) {
  const [parcels, setParcels] = useState<CustomerParcelTracking[]>();
  useEffect(() => {
    api<CustomerParcelTracking[]>(`/orders/${orderId}/tracking`).then(setParcels, () =>
      setParcels([]),
    );
  }, [orderId]);
  if (!parcels || parcels.length === 0) return null;
  return (
    <Card>
      <h2 className="font-display text-lg font-bold">Suivi de mes colis</h2>
      {parcels.map((p) => (
        <section key={p.parcelCode} className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-mono font-bold">{p.parcelCode}</span>
            <StatusPill
              tone={p.status === 'delivered' ? 'ok' : p.status === 'lost' ? 'bad' : 'warn'}
            >
              {p.status === 'delivered'
                ? 'Livré'
                : p.status === 'lost'
                  ? 'Perdu'
                  : (p.currentLabel ?? 'En préparation')}
            </StatusPill>
          </div>
          <ul className="text-sm">
            {p.items.map((i, idx) => (
              <li key={idx}>
                {i.description} × {i.quantity}
              </li>
            ))}
          </ul>
          {p.events.length > 0 && (
            <ol className="flex flex-col gap-2 border-l-2 border-line pl-4 text-sm">
              {p.events.map((e, idx) => (
                <li key={idx} className="flex flex-col">
                  <span className={`font-semibold ${e.kind === 'anomaly' ? 'text-danger' : ''}`}>
                    {e.label}
                  </span>
                  <span className="text-muted">
                    {fmtDate(e.occurredAt)}
                    {e.location ? ` · ${e.location}` : ''}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
      ))}
    </Card>
  );
}

/** Téléchargement d'un export CSV (l'en-tête d'organisation interdit un simple lien). */
export function CsvExportButton({
  org,
  kind,
  label,
}: {
  org: string;
  kind: 'orders' | 'parcels' | 'payments';
  label: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  async function download() {
    setBusy(true);
    setError(undefined);
    try {
      const res = await fetch(`/api/org/exports/${kind}.csv`, {
        credentials: 'same-origin',
        headers: { [ORG_HEADER]: org },
      });
      if (!res.ok)
        throw new Error(
          res.status === 403
            ? 'Export réservé au propriétaire et à la comptabilité.'
            : 'Export impossible.',
        );
      const name =
        res.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1] ?? `${kind}.csv`;
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export impossible.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-col gap-1 lg:items-start">
      <Button variant="ghost" busy={busy} onClick={() => void download()}>
        {label}
      </Button>
      {error && <Notice tone="error">{error}</Notice>}
    </div>
  );
}
