import { parsePriceToMinor, type IndicativePrice } from '@konzia/shared';

export interface ParsedProduct {
  title: string | null;
  imageUrl: string | null;
  price: IndicativePrice | null;
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  eacute: 'é',
  egrave: 'è',
  ecirc: 'ê',
  agrave: 'à',
  acirc: 'â',
  ccedil: 'ç',
  ocirc: 'ô',
  ucirc: 'û',
  icirc: 'î',
  euro: '€',
};

function decode(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n: string) => ENTITIES[n.toLowerCase()] ?? m)
    .replace(/\s+/g, ' ')
    .trim();
}

/** Balises <meta property|name="…" content="…"> (attributs dans n'importe quel ordre). */
function metaTags(html: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const key = tag
      .match(/\b(?:property|name|itemprop)\s*=\s*["']([^"']+)["']/i)?.[1]
      ?.toLowerCase();
    const content = tag.match(/\bcontent\s*=\s*"([^"]*)"|\bcontent\s*=\s*'([^']*)'/i);
    const value = content?.[1] ?? content?.[2];
    if (key && value !== undefined && !map.has(key)) map.set(key, decode(value));
  }
  return map;
}

/** Produit décrit en JSON-LD (schema.org/Product), s'il existe. */
function jsonLdProduct(
  html: string,
): { name?: string; image?: string; price?: string; currency?: string } | null {
  for (const m of html.matchAll(
    /<script[^>]+type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    let data: unknown;
    try {
      data = JSON.parse(m[1] ?? '');
    } catch {
      continue;
    }
    const nodes: unknown[] = Array.isArray(data)
      ? data
      : [data, ...((data as { '@graph'?: unknown[] })?.['@graph'] ?? [])];
    for (const node of nodes) {
      const n = node as Record<string, unknown>;
      const type = n?.['@type'];
      if (type !== 'Product' && !(Array.isArray(type) && type.includes('Product'))) continue;
      const offers = (Array.isArray(n.offers) ? n.offers[0] : n.offers) as
        | Record<string, unknown>
        | undefined;
      const image = Array.isArray(n.image) ? n.image[0] : n.image;
      return {
        name: typeof n.name === 'string' ? n.name : undefined,
        image:
          typeof image === 'string'
            ? image
            : typeof (image as { url?: unknown })?.url === 'string'
              ? (image as { url: string }).url
              : undefined,
        price:
          offers?.price !== undefined
            ? String(offers.price)
            : offers?.lowPrice !== undefined
              ? String(offers.lowPrice)
              : undefined,
        currency: typeof offers?.priceCurrency === 'string' ? offers.priceCurrency : undefined,
      };
    }
  }
  return null;
}

function safeImage(url: string | undefined, base: string): string | null {
  if (!url) return null;
  try {
    const u = new URL(url, base);
    return u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Extrait titre, image et prix indicatif des métadonnées publiques (Open Graph, JSON-LD, <title>). */
export function parseProductHtml(html: string, pageUrl: string): ParsedProduct {
  const meta = metaTags(html);
  const ld = jsonLdProduct(html);
  const title =
    ld?.name ??
    meta.get('og:title') ??
    meta.get('twitter:title') ??
    decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '');
  const priceText =
    ld?.price ??
    meta.get('product:price:amount') ??
    meta.get('og:price:amount') ??
    meta.get('price');
  const currency = (
    ld?.currency ??
    meta.get('product:price:currency') ??
    meta.get('og:price:currency') ??
    meta.get('pricecurrency')
  )?.toUpperCase();
  const minor = priceText ? parsePriceToMinor(priceText) : null;
  return {
    title: title ? decode(title).slice(0, 300) || null : null,
    imageUrl: safeImage(ld?.image ?? meta.get('og:image') ?? meta.get('twitter:image'), pageUrl),
    price:
      minor !== null &&
      minor > 0n &&
      currency &&
      /^[A-Z]{3}$/.test(currency) &&
      minor < 100_000_000n
        ? { amount: Number(minor), currency }
        : null,
  };
}
