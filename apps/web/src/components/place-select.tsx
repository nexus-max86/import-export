'use client';

import type { CityInfo } from '@konzia/shared';

const selectClass =
  'min-h-11 rounded-lg border border-line bg-surface px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-copper';

/** Choix ville + commune, à partir des villes ouvertes. */
export function PlaceSelect({
  idPrefix,
  cities,
  cityId,
  zoneId,
  onChange,
  error,
}: {
  idPrefix: string;
  cities: CityInfo[];
  cityId: string;
  zoneId: string;
  onChange: (cityId: string, zoneId: string) => void;
  error?: string;
}) {
  const zones = cities.find((c) => c.id === cityId)?.zones ?? [];
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="flex min-w-0 flex-col gap-1">
        <label htmlFor={`${idPrefix}-city`} className="text-sm font-semibold">
          Ville
        </label>
        <select
          id={`${idPrefix}-city`}
          value={cityId}
          onChange={(e) => onChange(e.target.value, '')}
          className={selectClass}
        >
          <option value="">Choisir…</option>
          {cities.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        <label htmlFor={`${idPrefix}-zone`} className="text-sm font-semibold">
          Commune
        </label>
        <select
          id={`${idPrefix}-zone`}
          value={zoneId}
          disabled={!cityId}
          onChange={(e) => onChange(cityId, e.target.value)}
          className={selectClass}
        >
          <option value="">{cityId ? 'Choisir…' : '—'}</option>
          {zones.map((z) => (
            <option key={z.id} value={z.id}>
              {z.name}
            </option>
          ))}
        </select>
      </div>
      {error && <p className="col-span-2 text-sm text-danger">{error}</p>}
    </div>
  );
}
