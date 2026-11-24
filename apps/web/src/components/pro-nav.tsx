'use client';

import Link from 'next/link';
import {
  BadgeCheck,
  LayoutDashboard,
  Boxes,
  Inbox,
  Package,
  Plane,
  Scale,
  ShoppingBag,
  UserCog,
  Users,
  Wallet,
} from 'lucide-react';
import { ScrollNav, SideNav, type NavGroup } from '@/components/nav';
import { NotificationBell } from '@/components/notifications';
import { Logo } from '@/components/ui';

const GROUPS: NavGroup[] = [
  {
    title: 'Activité',
    links: [
      { href: '/pro/vue-generale', label: 'Vue générale', icon: LayoutDashboard },
      { href: '/pro/demandes', label: 'Demandes', icon: Inbox },
      { href: '/pro/commandes', label: 'Commandes', icon: Package },
      { href: '/pro/achats', label: 'Achats', icon: ShoppingBag },
      { href: '/pro/colis', label: 'Colis', icon: Boxes },
      { href: '/pro/expeditions', label: 'Expéditions', icon: Plane },
    ],
  },
  {
    title: 'Argent et suivi',
    links: [
      { href: '/pro/paiements', label: 'Paiements', icon: Wallet },
      { href: '/pro/litiges', label: 'Litiges', icon: Scale },
    ],
  },
  {
    title: 'Mon activité',
    links: [
      { href: '/pro/clients', label: 'Clients', icon: Users },
      { href: '/pro/equipe', label: 'Équipe', icon: UserCog },
      { href: '/pro/profil', label: 'Profil et vérification', icon: BadgeCheck },
    ],
  },
];

const switchLink = (
  <Link
    href="/pro"
    className="rounded-md text-sm font-semibold text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-primary"
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
      badge="Business"
      top={<NotificationBell />}
      bottom={switchLink}
    />
  );
}
