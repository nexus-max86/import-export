'use client';

import { formatPhone, whatsappLink, type PublicCommissioner } from '@konzia/shared';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Badges, Summary, ZonesList } from '@/components/commissioner-bits';
import { Card, Logo, Notice, buttonClass, Loading } from '@/components/ui';
import { api, ApiError } from '@/lib/api';

export default function CommissionerPage() {
  const { slug } = useParams<{ slug: string }>();
  const [c, setC] = useState<PublicCommissioner>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    api<PublicCommissioner>(`/commissioners/${encodeURIComponent(slug)}`).then(
      setC,
      (err: unknown) => setError(err instanceof ApiError ? err.message : 'Chargement impossible.'),
    );
  }, [slug]);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-5 px-4 py-10">
      <Logo />
      <Link href="/commissionnaires" className="text-sm font-semibold text-primary underline">
        ← Tous les commissionnaires
      </Link>
      {error && <Notice tone="error">{error}</Notice>}
      {!c && !error && <Loading />}
      {c && (
        <>
          <div className="flex flex-col gap-2">
            <h1 className="font-display text-2xl font-bold">{c.name}</h1>
            <Badges c={c} />
            <Summary c={c} />
          </div>
          {c.description && <p>{c.description}</p>}
          {c.pricingPolicy && (
            <Card>
              <h2 className="font-display text-lg font-bold">Ses tarifs</h2>
              <p>{c.pricingPolicy}</p>
              <p className="text-sm text-muted">
                Le prix exact vous est donné dans un devis détaillé, avant tout paiement.
              </p>
            </Card>
          )}
          <Card>
            <h2 className="font-display text-lg font-bold">Communes desservies</h2>
            <ZonesList c={c} />
          </Card>
          {c.phoneWhatsapp && (
            <Card>
              <h2 className="font-display text-lg font-bold">Contact</h2>
              <p>
                WhatsApp :{' '}
                <span className="font-semibold select-all">{formatPhone(c.phoneWhatsapp)}</span>
              </p>
              <a
                href={whatsappLink(
                  c.phoneWhatsapp,
                  `Bonjour ${c.name}, je vous ai trouvé sur Konzia.`,
                )}
                target="_blank"
                rel="noreferrer"
                className={buttonClass()}
              >
                Écrire sur WhatsApp
              </a>
            </Card>
          )}
        </>
      )}
    </main>
  );
}
