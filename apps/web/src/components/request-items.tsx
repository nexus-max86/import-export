'use client';

import { MARKETPLACES, type RequestItemInfo } from '@konzia/shared';
import type { ReactNode } from 'react';
import { fmtAmount, fmtDate } from '@/lib/format';

/** Liste des articles d'une demande ; `actions` permet d'ajouter des boutons par article. */
export function RequestItems({
  items,
  actions,
}: {
  items: RequestItemInfo[];
  actions?: (item: RequestItemInfo) => ReactNode;
}) {
  return (
    <ul className="flex flex-col gap-3">
      {items.map((i) => (
        <li key={i.id} className="flex flex-col gap-2 rounded-lg border border-line p-3">
          <div className="grid grid-cols-[4rem_minmax(0,1fr)] gap-3">
            <div className="grid size-16 place-items-center overflow-hidden rounded-lg border border-line bg-canvas text-center text-[10px] text-muted">
              {i.imageUrl ? (
                <img
                  src={i.imageUrl}
                  alt=""
                  className="size-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : i.hasScreenshot ? (
                'capture jointe'
              ) : (
                'pas d’image'
              )}
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <strong className="break-words">{i.title}</strong>
              <span className="text-sm text-muted">
                {[
                  i.marketplace
                    ? MARKETPLACES[i.marketplace]
                    : i.source === 'manual'
                      ? 'Saisie manuelle'
                      : null,
                  i.size && `Taille ${i.size}`,
                  i.color,
                  i.variant,
                  `× ${i.quantity}`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
              {i.indicativePrice && (
                <span className="text-sm">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                    Prix indicatif
                  </span>{' '}
                  {fmtAmount(i.indicativePrice.amount, i.indicativePrice.currency)}{' '}
                  <span className="text-xs text-muted">lu le {fmtDate(i.priceFetchedAt)}</span>
                </span>
              )}
              {i.notes && <span className="text-sm">Note : {i.notes}</span>}
              {i.sourceUrl && (
                <a
                  href={i.sourceUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="truncate text-sm text-copper underline"
                >
                  Voir sur le site
                </a>
              )}
            </div>
          </div>
          {actions?.(i)}
        </li>
      ))}
    </ul>
  );
}
