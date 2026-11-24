'use client';

import { ArrowDown, ArrowUp, ArrowUpDown, Columns3, RotateCw } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';

/**
 * Tableau de gestion KONZIA (DESIGN_SYSTEM.md § 6) : tri, colonnes masquables, sélection,
 * ouverture d'un aperçu latéral. Cartes empilées sous 1024 px. Les données arrivent paginées du
 * serveur : ce composant n'affiche que la page courante.
 */
export type Column<T> = {
  key: string;
  label: string;
  cell: (row: T) => ReactNode;
  /** Clé de tri envoyée au serveur ; absente = colonne non triable. */
  sortKey?: string;
  numeric?: boolean;
  /** Masquable par l'utilisateur (préférence gardée dans le navigateur). */
  hideable?: boolean;
};

export type Sort = { key: string; dir: 'asc' | 'desc' };

function useHiddenColumns(storageKey: string) {
  const [hidden, setHidden] = useState<string[]>([]);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(`kz-cols:${storageKey}`);
      if (raw) setHidden(JSON.parse(raw) as string[]);
    } catch {
      /* stockage indisponible : toutes les colonnes restent visibles */
    }
  }, [storageKey]);
  const toggle = (key: string) =>
    setHidden((h) => {
      const next = h.includes(key) ? h.filter((k) => k !== key) : [...h, key];
      try {
        localStorage.setItem(`kz-cols:${storageKey}`, JSON.stringify(next));
      } catch {
        /* préférence non mémorisée */
      }
      return next;
    });
  return { hidden, toggle };
}

export function DataTable<T extends { id: string }>({
  label,
  columns,
  rows,
  storageKey,
  loading,
  error,
  onRetry,
  sort,
  onSort,
  selected,
  onSelectedChange,
  activeId,
  onOpen,
  openLabel,
  card,
  empty,
  toolbar,
}: {
  label: string;
  columns: Column<T>[];
  rows: T[] | undefined;
  storageKey: string;
  loading?: boolean;
  error?: string;
  onRetry?: () => void;
  sort?: Sort;
  onSort?: (s: Sort) => void;
  selected?: string[];
  onSelectedChange?: (ids: string[]) => void;
  activeId?: string;
  onOpen?: (row: T) => void;
  /** Libellé accessible du bouton d'ouverture d'une ligne. */
  openLabel?: (row: T) => string;
  card: (row: T) => ReactNode;
  empty: ReactNode;
  toolbar?: ReactNode;
}) {
  const { hidden, toggle } = useHiddenColumns(storageKey);
  const visible = columns.filter((c) => !hidden.includes(c.key));
  const selectable = Boolean(onSelectedChange);
  const pageIds = rows?.map((r) => r.id) ?? [];
  const allChecked = pageIds.length > 0 && pageIds.every((id) => selected?.includes(id));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {toolbar}
        <span className="flex-1" />
        {columns.some((c) => c.hideable) && (
          <details className="relative hidden lg:block">
            <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 text-sm font-semibold outline-none hover:border-muted focus-visible:ring-2 focus-visible:ring-primary">
              <Columns3 aria-hidden size={16} />
              Colonnes
            </summary>
            <div className="absolute right-0 z-20 mt-2 flex w-60 flex-col gap-1 rounded-xl border border-line bg-surface p-2 shadow-[0_12px_28px_rgba(23,32,51,0.14)]">
              {columns
                .filter((c) => c.hideable)
                .map((c) => (
                  <label
                    key={c.key}
                    className="flex min-h-9 cursor-pointer items-center gap-2 rounded-lg px-2 text-sm hover:bg-sunken"
                  >
                    <input
                      type="checkbox"
                      checked={!hidden.includes(c.key)}
                      onChange={() => toggle(c.key)}
                    />
                    {c.label}
                  </label>
                ))}
            </div>
          </details>
        )}
      </div>

      {error ? (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 rounded-2xl border border-danger-soft bg-danger-soft px-4 py-3 text-sm text-danger"
        >
          <span className="flex-1">{error}</span>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="flex min-h-9 items-center gap-2 rounded-lg bg-surface px-3 font-semibold text-ink outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <RotateCw aria-hidden size={15} />
              Réessayer
            </button>
          )}
        </div>
      ) : rows && rows.length === 0 && !loading ? (
        empty
      ) : (
        <>
          {/* Téléphone et tablette : cartes. */}
          <ul className="flex flex-col gap-3 lg:hidden" aria-busy={loading || undefined}>
            {(rows ?? []).map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => onOpen?.(r)}
                  className="flex w-full flex-col gap-1 rounded-2xl border border-line bg-surface p-4 text-left outline-none transition-[border-color] duration-150 ease-out-quint hover:border-line-strong focus-visible:ring-2 focus-visible:ring-primary"
                >
                  {card(r)}
                </button>
              </li>
            ))}
            {!rows &&
              [0, 1, 2].map((i) => (
                <li key={i} aria-hidden className="h-20 animate-shimmer rounded-2xl bg-line/70" />
              ))}
          </ul>

          {/* Ordinateur : tableau. */}
          <div className="hidden overflow-hidden rounded-2xl border border-line bg-surface lg:block">
            <div className="overflow-x-auto">
              <table
                aria-label={label}
                aria-busy={loading || undefined}
                className="w-full text-left text-sm"
              >
                <thead className="bg-sunken">
                  <tr>
                    {selectable && (
                      <th scope="col" className="w-10 px-4 py-2.5">
                        <input
                          type="checkbox"
                          aria-label="Tout sélectionner sur cette page"
                          checked={allChecked}
                          onChange={() =>
                            onSelectedChange?.(
                              allChecked
                                ? (selected ?? []).filter((id) => !pageIds.includes(id))
                                : [...new Set([...(selected ?? []), ...pageIds])],
                            )
                          }
                        />
                      </th>
                    )}
                    {visible.map((c) => {
                      const active = sort && c.sortKey === sort.key;
                      return (
                        <th
                          key={c.key}
                          scope="col"
                          aria-sort={
                            active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined
                          }
                          className={`px-4 py-2.5 whitespace-nowrap normal-case ${c.numeric ? 'text-right' : ''}`}
                        >
                          {c.sortKey && onSort ? (
                            <button
                              type="button"
                              onClick={() =>
                                onSort({
                                  key: c.sortKey!,
                                  dir: active && sort.dir === 'desc' ? 'asc' : 'desc',
                                })
                              }
                              className={`inline-flex items-center gap-1 rounded outline-none focus-visible:ring-2 focus-visible:ring-primary ${active ? 'text-ink' : ''}`}
                            >
                              {c.label}
                              {active ? (
                                sort.dir === 'asc' ? (
                                  <ArrowUp aria-hidden size={13} />
                                ) : (
                                  <ArrowDown aria-hidden size={13} />
                                )
                              ) : (
                                <ArrowUpDown aria-hidden size={13} className="opacity-50" />
                              )}
                            </button>
                          ) : (
                            c.label
                          )}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {(rows ?? []).map((r) => {
                    const isActive = r.id === activeId;
                    const isSelected = selected?.includes(r.id);
                    return (
                      <tr
                        key={r.id}
                        onClick={(e) => {
                          // Un clic sur la case ou sur un lien ne doit pas ouvrir l'aperçu.
                          if ((e.target as HTMLElement).closest('input,a,button')) return;
                          onOpen?.(r);
                        }}
                        className={`cursor-pointer border-t border-line transition-colors duration-150 ease-out-quint ${
                          isActive
                            ? 'bg-primary-soft shadow-[inset_3px_0_0_var(--color-primary)]'
                            : isSelected
                              ? 'bg-primary-soft/50'
                              : 'hover:bg-sunken/70'
                        }`}
                      >
                        {selectable && (
                          <td className="px-4 py-3">
                            <input
                              type="checkbox"
                              aria-label={`Sélectionner ${openLabel?.(r) ?? r.id}`}
                              checked={Boolean(isSelected)}
                              onChange={() =>
                                onSelectedChange?.(
                                  isSelected
                                    ? (selected ?? []).filter((id) => id !== r.id)
                                    : [...(selected ?? []), r.id],
                                )
                              }
                            />
                          </td>
                        )}
                        {visible.map((c, i) => (
                          <td
                            key={c.key}
                            className={`px-4 py-3 align-middle ${c.numeric ? 'text-right whitespace-nowrap tabular-nums' : ''}`}
                          >
                            {i === 0 && onOpen ? (
                              <button
                                type="button"
                                onClick={() => onOpen(r)}
                                aria-label={openLabel?.(r)}
                                className="rounded text-left font-semibold outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-primary"
                              >
                                {c.cell(r)}
                              </button>
                            ) : (
                              c.cell(r)
                            )}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                  {!rows &&
                    [0, 1, 2, 3].map((i) => (
                      <tr key={i} aria-hidden className="border-t border-line">
                        <td colSpan={visible.length + (selectable ? 1 : 0)} className="px-4 py-3">
                          <span className="block h-5 animate-shimmer rounded bg-line/70" />
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** Onglets de statut avec compteurs (filtre principal d'un tableau). */
export function TableTabs<K extends string>({
  label,
  tabs,
  value,
  onChange,
}: {
  label: string;
  tabs: { key: K; label: string; count?: number }[];
  value: K;
  onChange: (k: K) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className="-mx-4 flex gap-6 overflow-x-auto border-b border-line px-4 [scrollbar-width:none] lg:mx-0 lg:px-0"
    >
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          role="tab"
          aria-selected={t.key === value}
          onClick={() => onChange(t.key)}
          className="flex shrink-0 items-center gap-2 border-b-2 border-transparent py-3 text-sm font-semibold whitespace-nowrap text-muted outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-primary aria-selected:border-primary aria-selected:text-ink"
        >
          {t.label}
          {t.count !== undefined && (
            <span className="rounded-full bg-sunken px-2 text-xs leading-5 text-ink-2 tabular-nums">
              {t.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

/** Barre d'actions groupées : n'apparaît qu'avec une sélection, et n'offre que des actions réelles. */
export function BulkBar({
  count,
  onClear,
  children,
}: {
  count: number;
  onClear: () => void;
  children: ReactNode;
}) {
  if (count === 0) return null;
  return (
    <div
      role="region"
      aria-label="Actions sur la sélection"
      className="animate-enter flex flex-wrap items-center gap-3 rounded-xl bg-ink px-4 py-2.5 text-sm text-surface"
    >
      <strong>
        {count} sélectionnée{count > 1 ? 's' : ''}
      </strong>
      <span className="flex-1" />
      {children}
      <button
        type="button"
        onClick={onClear}
        className="min-h-9 rounded-lg border border-white/25 px-3 font-semibold outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        Désélectionner
      </button>
    </div>
  );
}

export function Pagination({
  page,
  pageSize,
  total,
  onPage,
  onPageSize,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (p: number) => void;
  onPageSize: (n: number) => void;
}) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const last = Math.max(1, Math.ceil(total / pageSize));
  return (
    <nav
      aria-label="Pagination"
      className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted"
    >
      <span>
        {from}–{to} sur {total}
      </span>
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-2">
          Lignes
          <select
            value={pageSize}
            onChange={(e) => onPageSize(Number(e.target.value))}
            className="min-h-9 rounded-lg border px-2 text-sm"
          >
            {[25, 50, 100].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          className="min-h-9 rounded-lg border border-line-strong bg-surface px-3 font-semibold text-ink outline-none hover:border-muted focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
        >
          Précédente
        </button>
        <button
          type="button"
          disabled={page >= last}
          onClick={() => onPage(page + 1)}
          className="min-h-9 rounded-lg border border-line-strong bg-surface px-3 font-semibold text-ink outline-none hover:border-muted focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
        >
          Suivante
        </button>
      </div>
    </nav>
  );
}
