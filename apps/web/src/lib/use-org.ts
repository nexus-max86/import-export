'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getActiveOrg } from '@/lib/active-org';

/** Organisation active de l'espace professionnel ; renvoie vers /pro si aucune n'est choisie. */
export function useActiveOrg(): string | null {
  const router = useRouter();
  const [org, setOrg] = useState<string | null>(null);
  useEffect(() => {
    const id = getActiveOrg();
    if (!id) router.replace('/pro');
    else setOrg(id);
  }, [router]);
  return org;
}
