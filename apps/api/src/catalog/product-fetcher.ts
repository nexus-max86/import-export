import { marketplaceForHost, type ProductLookup, type UrlAnalysis } from '@konzia/shared';
import { parseProductHtml } from './product-html';
import { safeFetch, SafeFetchError } from './safe-fetch';

/** Interface interne : la lecture des pages pourra passer par des API officielles (V1). */
export interface ProductFetcher {
  lookup(analysis: Extract<UrlAnalysis, { ok: true }>): Promise<ProductLookup>;
}

export const PRODUCT_FETCHER = Symbol('PRODUCT_FETCHER');

const BLOCKED =
  'Ce site ne nous laisse pas lire la page. Indiquez le nom, la variante et le prix vus sur le site.';

function base(
  analysis: Extract<UrlAnalysis, { ok: true }>,
): Omit<ProductLookup, 'status' | 'message'> {
  return {
    url: analysis.url,
    marketplace: analysis.marketplace,
    title: null,
    imageUrl: null,
    price: null,
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * Lecture réelle des métadonnées PUBLIQUES de la page, via safeFetch.
 * Aucun contournement de protection : si le site refuse (captcha, 403…), saisie manuelle.
 * NON VÉRIFIÉ contre les vraies marketplaces à ce jour (beaucoup bloqueront les robots).
 */
export class HttpProductFetcher implements ProductFetcher {
  async lookup(analysis: Extract<UrlAnalysis, { ok: true }>): Promise<ProductLookup> {
    if (!analysis.marketplace) {
      return {
        ...base(analysis),
        status: 'not_supported',
        message:
          'Site non pris en charge pour la lecture automatique : saisissez l’article à la main.',
      };
    }
    try {
      const page = await safeFetch(analysis.url, {
        isAllowedHost: (h) => marketplaceForHost(h) !== null,
      });
      const parsed = parseProductHtml(page.body, page.finalUrl);
      if (!parsed.title) return { ...base(analysis), status: 'failed', message: BLOCKED };
      return { ...base(analysis), ...parsed, status: 'ok', message: null };
    } catch (err) {
      const message = err instanceof SafeFetchError ? `${err.message} ${BLOCKED}` : BLOCKED;
      return { ...base(analysis), status: 'failed', message };
    }
  }
}

/** FAUX lecteur pour le développement hors ligne et les tests. Refusé en production. */
export class FakeProductFetcher implements ProductFetcher {
  async lookup(analysis: Extract<UrlAnalysis, { ok: true }>): Promise<ProductLookup> {
    if (!analysis.marketplace) {
      return {
        ...base(analysis),
        status: 'not_supported',
        message:
          'Site non pris en charge pour la lecture automatique : saisissez l’article à la main.',
      };
    }
    if (analysis.url.includes('bloque'))
      return { ...base(analysis), status: 'failed', message: BLOCKED };
    return {
      ...base(analysis),
      status: 'ok',
      message: null,
      title: 'Robe midi plissée à col montant (exemple)',
      imageUrl: null,
      price: { amount: 1499, currency: 'USD' },
    };
  }
}
