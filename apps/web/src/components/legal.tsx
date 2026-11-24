import Link from 'next/link';
import type { ReactNode } from 'react';
import { Logo } from '@/components/ui';

/** Gabarit des pages légales : lisibles sur téléphone, version datée, statut de validation visible. */
export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-10">
      <Logo />
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-3xl font-bold">{title}</h1>
        <p className="text-sm text-muted">Version du {updated}</p>
      </div>
      <p className="rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">
        Version de travail du pilote de Lubumbashi, à faire valider par un juriste avant l’ouverture
        au public. Les éléments entre crochets sont à compléter.
      </p>
      <div className="legal flex flex-col gap-5 text-[15px] leading-relaxed">{children}</div>
      <nav className="flex flex-wrap gap-4 border-t border-line pt-4 text-sm">
        <Link href="/conditions" className="text-primary underline">
          Conditions d’utilisation
        </Link>
        <Link href="/confidentialite" className="text-primary underline">
          Politique de confidentialité
        </Link>
        <Link href="/" className="text-primary underline">
          Accueil
        </Link>
      </nav>
    </main>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-display text-lg font-bold">{title}</h2>
      {children}
    </section>
  );
}

/** Contact affiché dans les deux textes. */
export const KONZIA_CONTACT = {
  whatsapp: '090 195 1088',
  whatsappIntl: '+243 90 195 1088',
};
