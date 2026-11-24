import {
  HANDOVER_LABELS,
  MARKETPLACES,
  TRANSPORT_MODES,
  type PublicCommissioner,
} from '@konzia/shared';

export function Badges({ c }: { c: PublicCommissioner }) {
  return (
    <div className="flex flex-wrap gap-2">
      <span className="rounded-full bg-ok-soft px-2 py-0.5 text-xs font-semibold text-ok">
        Vérifié
      </span>
      {c.isNew && (
        <span className="rounded-full bg-primary-soft px-2 py-0.5 text-xs font-semibold">
          Nouveau
        </span>
      )}
      {c.isPlatformOperated && (
        <span className="rounded-full border border-line px-2 py-0.5 text-xs font-semibold">
          Service opéré par Konzia
        </span>
      )}
    </div>
  );
}

export function Summary({ c }: { c: PublicCommissioner }) {
  const cities = [...new Set(c.zones.map((z) => z.cityName))];
  return (
    <p className="text-sm text-muted">
      {[
        cities.join(', '),
        c.transportModes.map((m) => TRANSPORT_MODES[m]).join(', '),
        c.marketplaces.map((m) => MARKETPLACES[m]).join(', '),
      ]
        .filter(Boolean)
        .join(' · ')}
    </p>
  );
}

export function ZonesList({ c }: { c: PublicCommissioner }) {
  if (c.zones.length === 0)
    return <p className="text-sm text-muted">Communes desservies non renseignées.</p>;
  return (
    <ul className="flex flex-col divide-y divide-line text-sm">
      {c.zones.map((z) => (
        <li
          key={`${z.cityName}-${z.zoneName}`}
          className="flex flex-wrap justify-between gap-2 py-2"
        >
          <span>
            {z.zoneName}, {z.cityName}
          </span>
          <span className="text-muted">
            {z.handoverModes.map((m) => HANDOVER_LABELS[m]).join(' · ')}
          </span>
        </li>
      ))}
    </ul>
  );
}
