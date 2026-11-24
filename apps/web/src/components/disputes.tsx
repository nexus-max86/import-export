'use client';

import {
  DISPUTE_CATEGORIES,
  DISPUTE_CATEGORY_LABELS,
  DISPUTE_STATUS_LABELS,
  ORG_HEADER,
  type DisputeCategory,
  type DisputeInfo,
} from '@konzia/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { StatusPill } from '@/components/status-pill';
import { Button, Card, Notice } from '@/components/ui';
import { api, ApiError, apiUpload } from '@/lib/api';
import { fmtDate } from '@/lib/format';

/** Envoie les pièces choisies (photos, PDF) et renvoie leurs identifiants. */
async function uploadAll(files: FileList | null): Promise<string[]> {
  const ids: string[] = [];
  for (const f of Array.from(files ?? []).slice(0, 5)) {
    const form = new FormData();
    form.append('file', f);
    ids.push((await apiUpload<{ fileId: string }>('/dispute-evidence', form)).fileId);
  }
  return ids;
}

const ROLE_LABEL = {
  customer: 'Client',
  commissioner: 'Commissionnaire',
  support: 'Konzia',
} as const;

/** Client : signaler un problème sur une commande (EF-100). */
export function OpenDisputeCard({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [existing, setExisting] = useState<DisputeInfo | null>(null);
  useEffect(() => {
    api<DisputeInfo[]>('/disputes').then(
      (all) => setExisting(all.find((d) => d.orderId === orderId && d.status !== 'closed') ?? null),
      () => undefined,
    );
  }, [orderId]);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(undefined);
    try {
      const fileIds = await uploadAll(
        (e.currentTarget.elements.namedItem('evidence') as HTMLInputElement).files,
      );
      const d = await api<DisputeInfo>(`/orders/${orderId}/disputes`, {
        body: {
          category: String(f.get('category')) as DisputeCategory,
          description: String(f.get('description') ?? ''),
          fileIds,
        },
      });
      router.push(`/litiges/${d.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Envoi impossible.');
      setBusy(false);
    }
  }

  if (existing)
    return (
      <Link
        href={`/litiges/${existing.id}`}
        className="self-start text-sm font-semibold text-primary underline"
      >
        Litige en cours : {DISPUTE_STATUS_LABELS[existing.status]} — voir les échanges
      </Link>
    );
  if (!open)
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="self-start text-sm font-semibold text-primary underline"
      >
        Signaler un problème sur cette commande
      </button>
    );
  return (
    <Card>
      <h2 className="font-display text-lg font-bold">Signaler un problème</h2>
      <p className="text-sm text-muted">
        Votre commissionnaire est prévenu et peut répondre ; Konzia tranche si vous ne trouvez pas
        d’accord.
      </p>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm font-semibold">
          Type de problème
          <select name="category" className="min-h-11 rounded-lg border border-line px-3">
            {DISPUTE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {DISPUTE_CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          Que s’est-il passé ?
          <textarea
            name="description"
            rows={4}
            required
            className="rounded-lg border border-line p-3 font-normal"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          Photos ou documents (facultatif, 5 au maximum)
          <input
            name="evidence"
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,application/pdf"
          />
        </label>
        {error && <Notice tone="error">{error}</Notice>}
        <Button type="submit" busy={busy}>
          Envoyer le signalement
        </Button>
      </form>
    </Card>
  );
}

/** Fil d'un litige, commun au client, au commissionnaire et au support. */
export function DisputeThread({
  dispute,
  base,
  org,
  onChange,
}: {
  dispute: DisputeInfo;
  /** Préfixe d'API : /disputes, /org/disputes ou /admin/disputes. */
  base: string;
  org?: string;
  onChange: (d: DisputeInfo) => void;
}) {
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function reply(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const body = String(new FormData(form).get('body') ?? '');
    setBusy(true);
    setError(undefined);
    try {
      const fileIds = await uploadAll(
        (form.elements.namedItem('replyFiles') as HTMLInputElement).files,
      );
      onChange(
        await api<DisputeInfo>(`${base}/${dispute.id}/messages`, { org, body: { body, fileIds } }),
      );
      form.reset();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Envoi impossible.');
    } finally {
      setBusy(false);
    }
  }

  async function openFile(fileId: string) {
    const res = await fetch(`/api${base}/${dispute.id}/files/${fileId}`, {
      credentials: 'same-origin',
      headers: org ? { [ORG_HEADER]: org } : {},
    });
    if (!res.ok) return setError('Pièce indisponible.');
    window.open(URL.createObjectURL(await res.blob()), '_blank', 'noopener');
  }

  return (
    <>
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-lg font-bold">
            {DISPUTE_CATEGORY_LABELS[dispute.category]}
          </h2>
          <StatusPill
            tone={
              dispute.status === 'closed'
                ? 'neutral'
                : dispute.status === 'resolved'
                  ? 'ok'
                  : 'warn'
            }
          >
            {DISPUTE_STATUS_LABELS[dispute.status]}
          </StatusPill>
        </div>
        <p className="text-sm text-muted">
          Commande <span className="font-mono">{dispute.orderNumber}</span> ·{' '}
          {dispute.organizationName} · {dispute.customerName} · ouvert le{' '}
          {fmtDate(dispute.createdAt)}
        </p>
        {dispute.resolution && <Notice tone="ok">Décision de Konzia : {dispute.resolution}</Notice>}
        {dispute.reopenReason && dispute.status !== 'closed' && (
          <p className="text-sm">Rouvert : {dispute.reopenReason}</p>
        )}
      </Card>
      <Card>
        <h2 className="font-display text-lg font-bold">Échanges</h2>
        <ol className="flex flex-col gap-3">
          {dispute.messages.map((m) => (
            <li
              key={m.id}
              className="flex flex-col gap-1 rounded-lg border border-line p-3 text-sm"
            >
              <span className="font-semibold">
                {m.authorName}{' '}
                <span className="font-normal text-muted">
                  · {ROLE_LABEL[m.authorRole]} · {fmtDate(m.createdAt)}
                </span>
              </span>
              <span className="whitespace-pre-line">{m.body}</span>
              {m.files.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => void openFile(f.id)}
                  className="self-start text-primary underline"
                >
                  {f.name}
                </button>
              ))}
            </li>
          ))}
        </ol>
        {dispute.status !== 'closed' ? (
          <form onSubmit={reply} className="flex flex-col gap-2 border-t border-line pt-3">
            <label className="flex flex-col gap-1 text-sm font-semibold">
              Votre message
              <textarea
                name="body"
                rows={3}
                required
                className="rounded-lg border border-line p-3 font-normal"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-semibold">
              Pièces (facultatif)
              <input
                name="replyFiles"
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp,application/pdf"
              />
            </label>
            {error && <Notice tone="error">{error}</Notice>}
            <Button type="submit" busy={busy}>
              Envoyer
            </Button>
          </form>
        ) : (
          <p className="text-sm text-muted">Litige clos : plus de nouveaux messages.</p>
        )}
      </Card>
    </>
  );
}

/** Liste compacte de litiges (client ou commissionnaire). */
export function DisputeList({ items, hrefBase }: { items: DisputeInfo[]; hrefBase: string }) {
  if (items.length === 0) return <p className="text-sm text-muted">Aucun litige.</p>;
  return (
    <ul className="flex flex-col gap-2">
      {items.map((d) => (
        <li key={d.id}>
          <Link
            href={`${hrefBase}/${d.id}`}
            className="flex flex-col gap-1 rounded-lg border border-line p-3 text-sm"
          >
            <span className="flex items-center justify-between gap-2">
              <strong>{DISPUTE_CATEGORY_LABELS[d.category]}</strong>
              <StatusPill
                tone={d.status === 'closed' ? 'neutral' : d.status === 'resolved' ? 'ok' : 'warn'}
              >
                {DISPUTE_STATUS_LABELS[d.status]}
              </StatusPill>
            </span>
            <span className="text-muted">
              {d.orderNumber} · {d.customerName} · {fmtDate(d.createdAt)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
