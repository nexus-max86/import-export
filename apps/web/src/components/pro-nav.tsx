'use client';

import Link from 'next/link';
import { ScrollNav, SideNav, type NavGroup } from '@/components/nav';
import { NotificationBell } from '@/components/notifications';
import { Logo } from '@/components/ui';

const GROUPS: NavGroup[] = [
  {
    title: 'Activité',
    links: [
      { href: '/pro/demandes', label: 'Demandes' },
      { href: '/pro/commandes', label: 'Commandes' },
      { href: '/pro/achats', label: 'Achats' },
      { href: '/pro/colis', label: 'Colis' },
      { href: '/pro/expeditions', label: 'Expéditions' },
    ],
  },
  {
    title: 'Argent et suivi',
    links: [
      { href: '/pro/paiements', label: 'Paiements' },
      { href: '/pro/litiges', label: 'Litiges' },
    ],
  },
  {
    title: 'Mon activité',
    links: [
      { href: '/pro/clients', label: 'Clients' },
      { href: '/pro/equipe', label: 'Équipe' },
      { href: '/pro/profil', label: 'Profil et vérification' },
    ],
  },
];

const switchLink = (
  <Link
    href="/pro"
    className="rounded-md text-sm font-semibold text-copper underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-copper"
  >
    Changer d’activité
  </Link>
);

/** En-tête de l'espace professionnel sur téléphone et tablette (barre latérale au-delà). */
export function ProNav() {
  return (
    <header className="flex flex-col gap-3 lg:hidden">
      <div className="flex items-center justify-between gap-3">
        <Logo />
        <div className="flex items-center gap-3 whitespace-nowrap">
          <NotificationBell />
          {switchLink}
        </div>
      </div>
      <ScrollNav label="Espace professionnel" groups={GROUPS} />
    </header>
  );
}

/** Barre latérale de l'espace professionnel (ordinateur). */
export function ProSidebar() {
  return (
    <SideNav
      label="Espace professionnel"
      groups={GROUPS}
      top={<NotificationBell />}
      bottom={switchLink}
    />
  );
}
