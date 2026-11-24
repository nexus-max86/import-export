'use client';

import type { ClaimResult } from '@konzia/shared';
import Link from 'next/link';
import { Suspense } from 'react';
import { TokenAction } from '@/components/token-action';
import { Notice } from '@/components/ui';

export default function ClaimPage() {
  return (
    <Suspense>
      <TokenAction<ClaimResult>
        title="Suivre vos commandes sur Konzia"
        intro={
          <p>
            Votre commissionnaire vous a envoyé ce lien. En l’acceptant, vous verrez vos devis,
            commandes et colis dans votre compte Konzia.
          </p>
        }
        action="Relier ma fiche à mon compte"
        endpoint="/customers/claim"
        success={(r) => (
          <>
            <Notice tone="ok">
              C’est fait : votre fiche chez {r.organizationName} est reliée à votre compte.
            </Notice>
            <Link href="/compte" className="font-semibold text-primary underline">
              Aller à mon compte
            </Link>
          </>
        )}
      />
    </Suspense>
  );
}
