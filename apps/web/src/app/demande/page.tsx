'use client';

import { ClientHeader } from '@/components/notifications';
import {
  MARKETPLACES,
  RequestItemSchema,
  type AddressInfo,
  type ProductLookup,
  type PublicCommissioner,
  type RequestDetail,
} from '@konzia/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { RequestItems } from '@/components/request-items';
import { Button, Card, Field, Notice, Loading, PageLoading } from '@/components/ui';
import { api, ApiError, apiUpload, fieldErrors } from '@/lib/api';
import { fmtAmount, fmtDate } from '@/lib/format';

type Msg = { tone: 'ok' | 'error'; text: string };

export default function NewRequestPage() {
  const router = useRouter();
  const [draft, setDraft] = useState<RequestDetail | null>();
  const [msg, setMsg] = useState<Msg>();

  const load = useCallback(async () => {
    try {
      setDraft(await api<RequestDetail | null>('/requests/draft'));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401)
        router.replace('/connexion?suite=/demande');
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  if (draft === undefined) return <PageLoading width="max-w-md" />;

  return (
    <main className="mx-auto flex max-w-md flex-col gap-5 px-4 py-10">
      <div className="flex items-center justify-between">
        <ClientHeader />
        <Link href="/demandes" className="text-sm font-semibold text-primary underline">
          Mes demandes
        </Link>
      </div>
      <h1 className="font-display text-2xl font-bold">Ma demande de devis</h1>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <AddItem
        onAdded={(d) => {
          setDraft(d);
          setMsg({ tone: 'ok', text: 'Article ajouté à votre demande.' });
        }}
      />
      {draft && draft.items.length > 0 && (
        <>
          <Card>
            <h2 className="font-display text-lg font-bold">Articles ({draft.items.length})</h2>
            <RequestItems
              items={draft.items}
              actions={(item) => (
                <Button
                  variant="ghost"
                  aria-label={`Retirer « ${item.title} »`}
                  onClick={async () => {
                    try {
                      setDraft(
                        await api<RequestDetail>(`/requests/${draft.id}/items/${item.id}`, {
                          method: 'DELETE',
                        }),
                      );
                    } catch (err) {
                      if (err instanceof ApiError) setMsg({ tone: 'error', text: err.message });
                    }
                  }}
                >
                  Retirer cet article
                </Button>
              )}
            />
          </Card>
          <SendForm draft={draft} onSent={(id) => router.push(`/demandes/${id}`)} />
        </>
      )}
    </main>
  );
}

function AddItem({ onAdded }: { onAdded: (d: RequestDetail) => void }) {
  const [url, setUrl] = useState('');
  const [lookup, setLookup] = useState<ProductLookup>();
  const [manual, setManual] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function read(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    setLookup(undefined);
    try {
      const r = await api<ProductLookup>('/catalog/lookup', { body: { url } });
      setLookup(r);
      setManual(r.status !== 'ok');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Lecture impossible.');
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setUrl('');
    setLookup(undefined);
    setManual(false);
  }

  return (
    <Card>
      <h2 className="font-display text-lg font-bold">Ajouter un article</h2>
      <form onSubmit={read} className="flex flex-col gap-3">
        <Field
          id="url"
          label="Lien du produit"
          // Texte libre : un partage depuis une application contient souvent du texte autour du lien.
          type="text"
          inputMode="url"
          autoComplete="off"
          placeholder="https://…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          hint="Copiez le lien depuis SHEIN, AliExpress, Alibaba, Amazon, Temu…"
        />
        <Button type="submit" busy={busy} disabled={!url.trim()}>
          Lire le lien
        </Button>
      </form>
      {error && <Notice tone="error">{error}</Notice>}
      {!lookup && !manual && (
        <button
          type="button"
          className="text-left text-sm font-semibold text-primary underline"
          onClick={() => setManual(true)}
        >
          Pas de lien ? Décrire l’article à la main
        </button>
      )}
      {(lookup || manual) && (
        <ItemDetails
          key={lookup?.fetchedAt ?? 'manuel'}
          lookup={lookup}
          manual={manual}
          onAdded={(d) => {
            reset();
            onAdded(d);
          }}
        />
      )}
    </Card>
  );
}

function ItemDetails({
  lookup,
  onAdded,
}: {
  lookup?: ProductLookup;
  manual: boolean;
  onAdded: (d: RequestDetail) => void;
}) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [screenshot, setScreenshot] = useState<{ id: string; name: string }>();

  async function upload(file: File | undefined) {
    if (!file) return;
    const fd = new FormData();
    fd.set('file', file);
    try {
      const r = await apiUpload<{ fileId: string }>('/catalog/screenshots', fd);
      setScreenshot({ id: r.fileId, name: file.name });
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Envoi impossible.');
    }
  }

  async function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const text = (k: string) => String(f.get(k) ?? '').trim();
    const read = lookup?.status === 'ok';
    const parsed = RequestItemSchema.safeParse({
      source: read ? 'lookup' : 'manual',
      sourceUrl: lookup?.url ?? null,
      marketplace: lookup?.marketplace ?? null,
      title: read ? lookup.title : text('title'),
      size: text('size'),
      color: text('color'),
      variant: text('variant'),
      quantity: Number(text('quantity') || '1'),
      notes: text('notes'),
      imageUrl: read ? lookup.imageUrl : null,
      indicativePrice: read ? lookup.price : null,
      priceFetchedAt: read && lookup.price ? lookup.fetchedAt : null,
      screenshotFileId: screenshot?.id ?? null,
    });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error.issues));
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      onAdded(await api<RequestDetail>('/requests/draft/items', { body: parsed.data }));
    } catch (err) {
      if (err instanceof ApiError) setFormError(err.message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={add} noValidate className="flex flex-col gap-3 border-t border-line pt-4">
      {lookup?.status === 'ok' ? (
        <div className="grid grid-cols-[4rem_minmax(0,1fr)] gap-3">
          <div className="grid size-16 place-items-center overflow-hidden rounded-lg border border-line bg-canvas text-[10px] text-muted">
            {lookup.imageUrl ? (
              <img
                src={lookup.imageUrl}
                alt=""
                className="size-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              'image'
            )}
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-xs font-semibold text-ok">
              {lookup.marketplace ? MARKETPLACES[lookup.marketplace] : 'Site'} reconnu
            </span>
            <strong className="break-words">{lookup.title}</strong>
            {lookup.price && (
              <span className="text-sm">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Prix indicatif
                </span>{' '}
                {fmtAmount(lookup.price.amount, lookup.price.currency)}
              </span>
            )}
            <span className="text-xs text-muted">
              Lu le {fmtDate(lookup.fetchedAt)}. Le commissionnaire vérifiera le prix et la
              disponibilité.
            </span>
          </div>
        </div>
      ) : (
        <>
          {lookup && <Notice>{lookup.message}</Notice>}
          <Field id="title" label="Nom de l’article" error={errors.title} />
          <label className="flex min-h-11 cursor-pointer items-center justify-center rounded-lg border border-line px-4 text-sm font-semibold focus-within:ring-2 focus-within:ring-primary">
            {screenshot
              ? `Capture : ${screenshot.name} (changer)`
              : 'Joindre une capture d’écran (facultatif)'}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              aria-label="Joindre une capture d’écran"
              onChange={(e) => upload(e.target.files?.[0])}
            />
          </label>
        </>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field id="size" label="Taille" error={errors.size} />
        <Field id="color" label="Couleur" error={errors.color} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field id="variant" label="Variante (facultatif)" error={errors.variant} />
        <Field
          id="quantity"
          label="Quantité"
          type="number"
          inputMode="numeric"
          min={1}
          defaultValue={1}
          error={errors.quantity}
        />
      </div>
      <Field
        id="notes"
        label="Note pour le commissionnaire (facultatif)"
        placeholder="Ex. : si M manque, prendre L"
        error={errors.notes}
      />
      {formError && <Notice tone="error">{formError}</Notice>}
      <Button type="submit" busy={busy}>
        Ajouter à ma demande
      </Button>
    </form>
  );
}

function SendForm({ draft, onSent }: { draft: RequestDetail; onSent: (id: string) => void }) {
  const [commissioners, setCommissioners] = useState<PublicCommissioner[]>();
  const [addresses, setAddresses] = useState<AddressInfo[]>([]);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [addressId, setAddressId] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<PublicCommissioner[]>('/commissioners').then(setCommissioners, () => setCommissioners([]));
    api<AddressInfo[]>('/me/addresses').then(
      (a) => {
        setAddresses(a);
        setAddressId(a.find((x) => x.isDefault)?.id ?? '');
      },
      () => undefined,
    );
  }, []);

  async function send(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const note = String(new FormData(e.currentTarget).get('note') ?? '').trim();
    setBusy(true);
    setError(undefined);
    try {
      await api(`/requests/${draft.id}/send`, {
        body: { commissioners: [...chosen], addressId: addressId || null, note },
      });
      onSent(draft.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Envoi impossible.');
      setBusy(false);
    }
  }

  return (
    <Card>
      <h2 className="font-display text-lg font-bold">À qui envoyer la demande ?</h2>
      <form onSubmit={send} className="flex flex-col gap-3">
        {!commissioners && <Loading />}
        {commissioners?.length === 0 && (
          <Notice>Aucun commissionnaire vérifié pour l’instant.</Notice>
        )}
        {commissioners?.map((c) => (
          <label
            key={c.slug}
            className="flex cursor-pointer items-start gap-3 rounded-lg border border-line p-3 has-[:checked]:border-primary has-[:checked]:bg-primary-soft"
          >
            <input
              type="checkbox"
              className="mt-1 size-5 accent-primary"
              checked={chosen.has(c.slug)}
              disabled={!chosen.has(c.slug) && chosen.size >= 5}
              onChange={() =>
                setChosen((prev) => {
                  const next = new Set(prev);
                  if (next.has(c.slug)) next.delete(c.slug);
                  else next.add(c.slug);
                  return next;
                })
              }
            />
            <span className="min-w-0">
              <strong>{c.name}</strong>
              {c.isPlatformOperated && (
                <span className="ml-2 text-xs font-semibold">Service opéré par Konzia</span>
              )}
              <span className="block text-sm text-muted">
                {[
                  [...new Set(c.zones.map((z) => z.cityName))].join(', '),
                  c.marketplaces.map((m) => MARKETPLACES[m]).join(', '),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </span>
          </label>
        ))}
        <div className="flex flex-col gap-1">
          <label htmlFor="address" className="text-sm font-semibold">
            Adresse de livraison
          </label>
          <select
            id="address"
            value={addressId}
            onChange={(e) => setAddressId(e.target.value)}
            className="min-h-11 rounded-lg border border-line bg-surface px-3"
          >
            <option value="">Ma ville du profil (je préciserai plus tard)</option>
            {addresses.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label} — {a.zoneName ? `${a.zoneName}, ` : ''}
                {a.cityName}
              </option>
            ))}
          </select>
          <Link href="/compte/profil" className="text-sm text-primary underline">
            Gérer mes adresses
          </Link>
        </div>
        <Field id="note" label="Message pour les commissionnaires (facultatif)" />
        {error && <Notice tone="error">{error}</Notice>}
        <Button type="submit" busy={busy} disabled={chosen.size === 0}>
          {chosen.size <= 1 ? 'Envoyer la demande' : `Envoyer à ${chosen.size} commissionnaires`}
        </Button>
        <p className="text-sm text-muted">
          Chaque commissionnaire vous répond séparément. Vous ne payez rien à cette étape.
        </p>
      </form>
    </Card>
  );
}
