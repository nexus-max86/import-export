import Link from 'next/link';
import type { ReactNode } from 'react';

export type Column<T> = {
  label: string;
  cell: (row: T) => ReactNode;
  /** Montants et quantités : alignés à droite, chiffres alignés. */
  numeric?: boolean;
  /** Colonne secondaire, masquée entre 1024 et 1280 px. */
  wide?: boolean;
};

/**
 * Liste adaptée à l'écran : cartes empilées sur téléphone et tablette, tableau à partir de
 * 1024 px. Toute la ligne du tableau mène à la fiche (un seul lien par ligne, dans la première
 * colonne, étendu à la ligne).
 */
export function ResponsiveList<T extends { id: string }>({
  rows,
  columns,
  href,
  card,
  caption,
}: {
  rows: T[];
  columns: Column<T>[];
  href: (row: T) => string;
  card: (row: T) => ReactNode;
  caption: string;
}) {
  return (
    <>
      <ul className="flex flex-col gap-3 lg:hidden">
        {rows.map((r) => (
          <li key={r.id}>
            <Link
              href={href(r)}
              className="flex flex-col gap-1 rounded-2xl border border-line bg-surface p-4 outline-none transition-[border-color] duration-150 ease-out-quint hover:border-line-strong focus-visible:ring-2 focus-visible:ring-primary"
            >
              {card(r)}
            </Link>
          </li>
        ))}
      </ul>
      <div className="hidden overflow-hidden rounded-2xl border border-line bg-surface lg:block">
        <table aria-label={caption} className="w-full text-left text-sm">
          <thead className="bg-sunken">
            <tr>
              {columns.map((c) => (
                <th
                  key={c.label}
                  scope="col"
                  className={`px-4 py-2.5 ${c.numeric ? 'text-right' : ''} ${c.wide ? 'hidden xl:table-cell' : ''}`}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.id}
                className="relative border-t border-line transition-colors duration-150 ease-out-quint focus-within:bg-sunken hover:bg-sunken"
              >
                {columns.map((c, i) => (
                  <td
                    key={c.label}
                    className={`px-4 py-3 align-middle ${c.numeric ? 'text-right whitespace-nowrap' : ''} ${c.wide ? 'hidden xl:table-cell' : ''}`}
                  >
                    {i === 0 ? (
                      <Link
                        href={href(r)}
                        className="font-semibold outline-none after:absolute after:inset-0 after:content-[''] focus-visible:underline"
                      >
                        {c.cell(r)}
                      </Link>
                    ) : (
                      c.cell(r)
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
