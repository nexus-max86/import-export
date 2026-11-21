'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Logo } from '@/components/ui';

const LINKS = [
  { href: '/pro/demandes', label: 'Demandes' },
  { href: '/pro/commandes', label: 'Commandes' },
  { href: '/pro/achats', label: 'Achats' },
  { href: '/pro/colis', label: 'Colis' },
  { href: '/pro/paiements', label: 'Paiements' },
  { href: '/pro/clients', label: 'Clients' },
  { href: '/pro/profil', label: 'Profil et vérification' },
];

/** En-tête de l'espace professionnel. */
export function ProNav() {
  const path = usePathname();
  return (
    <header className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <Logo />
        <Link href="/pro" className="text-sm font-semibold text-copper underline">
          Changer d’activité
        </Link>
      </div>
      <nav aria-label="Espace professionnel" className="flex gap-2 overflow-x-auto">
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            aria-current={path === l.href || path.startsWith(`${l.href}/`) ? 'page' : undefined}
            className="min-h-10 shrink-0 rounded-full border border-line px-4 py-2 text-sm font-semibold aria-[current=page]:border-copper aria-[current=page]:bg-copper-soft"
          >
            {l.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
