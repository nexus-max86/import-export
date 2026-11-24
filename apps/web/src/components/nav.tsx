'use client';

import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, type ReactNode } from 'react';
import { Logo } from '@/components/ui';

export type NavLink = { href: string; label: string; icon?: LucideIcon };
export type NavGroup = { title: string; links: NavLink[] };

/** Lien actif : la page elle-même ou une de ses sous-pages (sauf pour une racine « exacte »). */
function isCurrent(path: string, href: string, exact: string[]): boolean {
  if (exact.includes(href)) return path === href;
  return path === href || path.startsWith(`${href}/`);
}

/**
 * Onglets défilants (téléphone, tablette). Un fondu sur les bords signale qu'il y a d'autres
 * onglets, et l'onglet de la page courante est ramené à l'écran.
 */
export function ScrollNav({
  label,
  groups,
  exact = [],
}: {
  label: string;
  groups: NavGroup[];
  exact?: string[];
}) {
  const path = usePathname();
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const current = ref.current?.querySelector<HTMLElement>('[aria-current="page"]');
    current?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [path]);
  return (
    <nav
      ref={ref}
      aria-label={label}
      className="-mx-4 flex snap-x scroll-px-4 gap-2 overflow-x-auto px-4 pb-1 [mask-image:linear-gradient(to_right,transparent,black_1rem,black_calc(100%-2rem),transparent)] [scrollbar-width:none]"
    >
      {groups
        .flatMap((g) => g.links)
        .map((l) => (
          <Link
            key={l.href}
            href={l.href}
            aria-current={isCurrent(path, l.href, exact) ? 'page' : undefined}
            className="flex min-h-10 shrink-0 snap-start items-center rounded-full border border-line bg-surface px-4 text-sm font-semibold text-muted outline-none transition-[background-color,border-color,color] duration-150 ease-out-quint hover:text-ink focus-visible:ring-2 focus-visible:ring-primary aria-[current=page]:border-primary aria-[current=page]:bg-primary-soft aria-[current=page]:text-ink"
          >
            {l.label}
          </Link>
        ))}
    </nav>
  );
}

/** Barre latérale (ordinateur, à partir de 1024 px) : toutes les rubriques visibles, groupées. */
export function SideNav({
  label,
  groups,
  exact = [],
  top,
  bottom,
  badge,
  tone = 'light',
}: {
  label: string;
  groups: NavGroup[];
  exact?: string[];
  top?: ReactNode;
  bottom?: ReactNode;
  /** Nom de l'espace affiché à côté du logo (« Business », « Admin »). */
  badge?: string;
  /** Admin : barre encre, pour reconnaître l'espace d'un coup d'œil. */
  tone?: 'light' | 'admin';
}) {
  const path = usePathname();
  const admin = tone === 'admin';
  return (
    <aside
      className={`sticky top-0 hidden h-dvh flex-col gap-6 overflow-y-auto px-4 py-6 lg:flex ${
        admin ? 'bg-admin text-white' : 'border-r border-line bg-surface'
      }`}
    >
      <div className="flex flex-col items-start gap-4 px-2">
        <div className="flex items-center gap-2">
          <Logo inverse={admin} />
          {badge && (
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                admin ? 'bg-primary text-white' : 'bg-ink text-surface'
              }`}
            >
              {badge}
            </span>
          )}
        </div>
        {top}
      </div>
      <nav aria-label={label} className="flex flex-col gap-5">
        {groups.map((g) => (
          <div key={g.title} className="flex flex-col gap-1">
            <p
              className={`px-3 text-xs font-semibold tracking-wide uppercase ${
                admin ? 'text-[#8f9ab3]' : 'text-muted'
              }`}
            >
              {g.title}
            </p>
            {g.links.map((l) => {
              const Icon = l.icon;
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  aria-current={isCurrent(path, l.href, exact) ? 'page' : undefined}
                  className={`relative flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm font-semibold outline-none transition-[background-color,color] duration-150 ease-out-quint before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:scale-y-0 before:rounded-full before:bg-primary before:transition-transform before:duration-200 before:ease-out-quint focus-visible:ring-2 focus-visible:ring-primary aria-[current=page]:before:scale-y-100 ${
                    admin
                      ? 'text-[#c3cbdb] hover:bg-white/10 hover:text-white aria-[current=page]:bg-white/12 aria-[current=page]:text-white'
                      : 'text-ink-2 hover:bg-sunken hover:text-ink aria-[current=page]:bg-primary-soft aria-[current=page]:text-primary-strong'
                  }`}
                >
                  {Icon && <Icon aria-hidden size={18} strokeWidth={1.8} className="shrink-0" />}
                  {l.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      {bottom && <div className="mt-auto flex flex-col gap-2 px-2">{bottom}</div>}
    </aside>
  );
}

/** Gabarit d'un espace avec barre latérale : une colonne sur téléphone, deux sur ordinateur. */
export function SidebarLayout({ sidebar, children }: { sidebar: ReactNode; children: ReactNode }) {
  return (
    <div className="lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]">
      {sidebar}
      <div className="min-w-0">{children}</div>
    </div>
  );
}
