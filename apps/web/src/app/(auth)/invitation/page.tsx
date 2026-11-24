'use client';

import { ORG_ROLE_LABELS, type MembershipSummary } from '@konzia/shared';
import Link from 'next/link';
import { Suspense } from 'react';
import { TokenAction } from '@/components/token-action';
import { Notice } from '@/components/ui';
import { setActiveOrg } from '@/lib/active-org';

export default function InvitationPage() {
  return (
    <Suspense>
      <TokenAction<MembershipSummary>
        title="Rejoindre une équipe"
        intro={<p>Vous avez été invité à rejoindre l’équipe d’un commissionnaire sur Konzia.</p>}
        action="Accepter l’invitation"
        endpoint="/invitations/accept"
        success={(m) => {
          setActiveOrg(m.organizationId);
          return (
            <>
              <Notice tone="ok">
                Bienvenue chez {m.name}. Votre rôle : {ORG_ROLE_LABELS[m.role]}.
              </Notice>
              <Link href="/pro/clients" className="font-semibold text-primary underline">
                Ouvrir l’espace professionnel
              </Link>
            </>
          );
        }}
      />
    </Suspense>
  );
}
