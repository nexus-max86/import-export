'use client';

import {
  MARKETPLACES,
  type CityInfo,
  type MarketplaceCode,
  type PublicCommissioner,
} from '@konzia/shared';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Badges, Summary } from '@/components/commissioner-bits';
import { Logo, Notice } from '@/components/ui';
import { api, ApiError } from '@/lib/api';

export default function DirectoryPage() {
  const [cities, setCities] = useState<CityInfo[]>([]);
  const [cityId, setCityId] = useState('');
  const [site, setSite] = useState<MarketplaceCode | ''>('');
  const [list, setList] = useState<PublicCommissioner[]>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    api<CityInfo[]>('/cities').then(setCities, () => undefined);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    if (cityId) params.set('ville', cityId);
    if (site) params.set('site', site);
    setList(undefined);
    api<PublicCommissioner[]>(`/commissioners${params.size ? `?${params}` : ''}`).then(
      (l) => {
        setList(l);
        setError(undefined);
      },
      (err: unknown) => setError(err instanceof ApiError ? err.message : 'Chargement impossible.'),
    );
  }, [cityId, site]);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-5 px-4 py-10">
      <Logo />
      <h1 className="font-display text-2xl font-bold">Commissionnaires vérifiés</h1>
      <p className="text-muted">
        Chaque commissionnaire a fourni son RCCM et une pièce d’identité, contrôlés par l’équipe
        Konzia. Comparez leurs services, puis envoyez votre demande à un ou plusieurs d’entre eux.
      </p>
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="ville" className="text-sm font-semibold">
            Ville
          </label>
          <select
            id="ville"
            value={cityId}
            onChange={(e) => setCityId(e.target.value)}
            className="min-h-11 rounded-lg border border-line bg-surface px-3"
          >
            <option value="">Toutes les villes</option>
            {cities.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <fieldset className="flex flex-col gap-1">
          <legend className="text-sm font-semibold">Site d’achat</legend>
          <div className="flex flex-wrap gap-2">
            {(['', ...Object.keys(MARKETPLACES)] as (MarketplaceCode | '')[]).map((code) => (
              <button
                key={code || 'tous'}
                type="button"
                aria-pressed={site === code}
                onClick={() => setSite(code)}
                className="min-h-10 rounded-full border border-line px-3 text-sm aria-pressed:border-copper aria-pressed:bg-copper-soft aria-pressed:font-semibold"
              >
                {code ? MARKETPLACES[code] : 'Tous'}
              </button>
            ))}
          </div>
        </fieldset>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      {!list && !error && <p className="text-muted">Chargement…</p>}
      {list?.length === 0 && (
        <Notice>
          Aucun commissionnaire vérifié ne correspond pour l’instant.{' '}
          {(cityId || site) && (
            <button
              type="button"
              className="font-semibold underline"
              onClick={() => {
                setCityId('');
                setSite('');
              }}
            >
              Voir tous les commissionnaires
            </button>
          )}
        </Notice>
      )}
      <ul className="flex flex-col gap-3">
        {list?.map((c) => (
          <li key={c.slug}>
            <Link
              href={`/commissionnaires/${c.slug}`}
              className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-4 outline-none focus-visible:ring-2 focus-visible:ring-copper"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong className="text-lg">{c.name}</strong>
                <Badges c={c} />
              </div>
              <Summary c={c} />
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
