import Link from 'next/link';
import { Logo } from '@/components/ui';

export default function HomePage() {
  return (
    <main className="mx-auto flex max-w-md flex-col gap-5 px-4 py-12">
      <Logo />
      <h1 className="font-display text-3xl font-bold text-balance">
        Achetez à l’international, sans mauvaise surprise.
      </h1>
      <p className="text-muted">
        Collez le lien d’un article vu sur SHEIN, Alibaba ou Temu. Des commissionnaires vérifiés de
        Lubumbashi vous envoient leur prix détaillé.
      </p>
      <div className="flex flex-col gap-2">
        <Link
          href="/inscription"
          className="flex min-h-11 items-center justify-center rounded-lg bg-copper px-4 font-semibold text-white"
        >
          Créer un compte
        </Link>
        <Link
          href="/commissionnaires"
          className="flex min-h-11 items-center justify-center rounded-lg border border-line px-4 font-semibold"
        >
          Voir les commissionnaires vérifiés
        </Link>
        <Link
          href="/connexion"
          className="flex min-h-11 items-center justify-center rounded-lg border border-line px-4 font-semibold"
        >
          Se connecter
        </Link>
      </div>
      <footer className="flex flex-wrap gap-4 text-sm text-muted">
        <Link href="/conditions" className="underline">
          Conditions d’utilisation
        </Link>
        <Link href="/confidentialite" className="underline">
          Confidentialité
        </Link>
      </footer>
    </main>
  );
}
