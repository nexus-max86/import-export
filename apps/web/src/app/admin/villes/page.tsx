'use client';

import type { CityInfo } from '@konzia/shared';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Button, Card, Field, Logo, Notice } from '@/components/ui';
import { api, ApiError } from '@/lib/api';

export default function AdminCitiesPage() {
  const router = useRouter();
  const [cities, setCities] = useState<CityInfo[]>();
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string }>();
  const [busy, setBusy] = useState<string>();

  const load = useCallback(async () => {
    try {
      setCities(await api<CityInfo[]>('/admin/cities'));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) router.replace('/connexion');
      else if (err instanceof ApiError) setNotice({ tone: 'error', text: err.message });
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(key: string, action: () => Promise<unknown>, success: string) {
    setBusy(key);
    setNotice(undefined);
    try {
      await action();
      await load();
      setNotice({ tone: 'ok', text: success });
      return true;
    } catch (err) {
      if (err instanceof ApiError) setNotice({ tone: 'error', text: err.message });
      return false;
    } finally {
      setBusy(undefined);
    }
  }

  async function addCity(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const name = String(new FormData(form).get('cityName') ?? '').trim();
    if (
      await run('city', () => api('/admin/cities', { body: { name } }), `${name} ajoutée (fermée).`)
    )
      form.reset();
  }

  async function addZone(e: FormEvent<HTMLFormElement>, city: CityInfo) {
    e.preventDefault();
    const form = e.currentTarget;
    const name = String(new FormData(form).get(`zone-${city.id}`) ?? '').trim();
    if (
      await run(
        `zone-${city.id}`,
        () => api(`/admin/cities/${city.id}/zones`, { body: { name } }),
        `${name} ajoutée à ${city.name}.`,
      )
    ) {
      form.reset();
    }
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-5 px-4 py-10">
      <Logo />
      <h1 className="font-display text-2xl font-bold">Villes et zones</h1>
      <p className="text-muted">
        Une ville fermée n’apparaît ni aux clients ni aux commissionnaires. Ouvrez-la quand ses
        zones et ses commissionnaires sont prêts.
      </p>
      {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
      {!cities && <p className="text-muted">Chargement…</p>}
      {cities?.map((city) => (
        <Card key={city.id}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-lg font-bold">
              {city.name}{' '}
              <span
                className={`ml-1 rounded-full px-2 py-0.5 text-xs font-semibold ${city.isActive ? 'bg-ok-soft text-ok' : 'bg-copper-soft text-ink'}`}
              >
                {city.isActive ? 'Ouverte' : 'Fermée'}
              </span>
            </h2>
            <Button
              variant="ghost"
              busy={busy === city.id}
              onClick={() =>
                run(
                  city.id,
                  () =>
                    api(`/admin/cities/${city.id}`, {
                      method: 'PATCH',
                      body: { isActive: !city.isActive },
                    }),
                  `${city.name} ${city.isActive ? 'fermée' : 'ouverte'}.`,
                )
              }
            >
              {city.isActive ? `Fermer ${city.name}` : `Ouvrir ${city.name}`}
            </Button>
          </div>
          <ul className="flex flex-wrap gap-2">
            {city.zones.map((z) => (
              <li key={z.id}>
                <button
                  type="button"
                  title={z.isActive ? 'Fermer cette zone' : 'Rouvrir cette zone'}
                  onClick={() =>
                    run(
                      z.id,
                      () =>
                        api(`/admin/zones/${z.id}`, {
                          method: 'PATCH',
                          body: { isActive: !z.isActive },
                        }),
                      `${z.name} ${z.isActive ? 'fermée' : 'rouverte'}.`,
                    )
                  }
                  className={`min-h-9 rounded-full border px-3 text-sm ${z.isActive ? 'border-line' : 'border-dashed border-line text-muted line-through'}`}
                >
                  {z.name}
                </button>
              </li>
            ))}
            {city.zones.length === 0 && (
              <li className="text-sm text-muted">Aucune zone pour l’instant.</li>
            )}
          </ul>
          <form onSubmit={(e) => addZone(e, city)} className="flex items-end gap-2">
            <div className="flex-1">
              <Field id={`zone-${city.id}`} label="Ajouter une commune ou un quartier" />
            </div>
            <Button type="submit" variant="ghost" busy={busy === `zone-${city.id}`}>
              Ajouter
            </Button>
          </form>
        </Card>
      ))}
      <Card>
        <form onSubmit={addCity} className="flex items-end gap-2">
          <div className="flex-1">
            <Field id="cityName" label="Nouvelle ville" />
          </div>
          <Button type="submit" busy={busy === 'city'}>
            Ajouter la ville
          </Button>
        </form>
      </Card>
    </main>
  );
}
