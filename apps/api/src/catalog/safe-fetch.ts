import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import { request } from 'node:https';
import type { LookupFunction } from 'node:net';
import { isPublicAddress } from './public-address';

export class SafeFetchError extends Error {}

export interface SafeFetchOptions {
  /** Un hôte de redirection doit aussi être autorisé (liste blanche des marketplaces). */
  isAllowedHost: (host: string) => boolean;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  /** Résolution DNS (remplaçable dans les tests). */
  lookup?: typeof dnsLookup;
}

export interface SafeFetchResult {
  finalUrl: string;
  contentType: string;
  body: string;
}

/**
 * Lecture d'une page publique protégée contre la SSRF :
 * - HTTPS seulement, hôte autorisé, à chaque redirection (3 maximum, suivies à la main) ;
 * - l'adresse IP est vérifiée DANS la fonction de résolution utilisée pour la connexion :
 *   on se connecte exactement à l'adresse contrôlée (pas de « DNS rebinding ») ;
 * - délai total et taille maximale ; seul le HTML est lu.
 */
export async function safeFetch(
  startUrl: string,
  options: SafeFetchOptions,
): Promise<SafeFetchResult> {
  const timeoutMs = options.timeoutMs ?? 5000;
  const maxBytes = options.maxBytes ?? 2 * 1024 * 1024;
  const maxRedirects = options.maxRedirects ?? 3;
  const deadline = Date.now() + timeoutMs;
  let current = startUrl;

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const url = new URL(current);
    if (url.protocol !== 'https:')
      throw new SafeFetchError('Redirection vers un lien non sécurisé.');
    if (url.username || url.password || (url.port && url.port !== '443'))
      throw new SafeFetchError('Lien refusé.');
    if (!options.isAllowedHost(url.hostname))
      throw new SafeFetchError('Redirection vers un site non pris en charge.');

    const res = await once(
      url,
      Math.max(1, deadline - Date.now()),
      maxBytes,
      options.lookup ?? dnsLookup,
    );
    if (res.status >= 300 && res.status < 400 && res.location) {
      current = new URL(res.location, url).toString();
      continue;
    }
    if (res.status !== 200) throw new SafeFetchError(`Le site a répondu ${res.status}.`);
    if (!/^text\/html|application\/xhtml\+xml/i.test(res.contentType)) {
      throw new SafeFetchError('La page n’est pas une page web.');
    }
    return { finalUrl: url.toString(), contentType: res.contentType, body: res.body };
  }
  throw new SafeFetchError('Trop de redirections.');
}

function guardedLookup(base: typeof dnsLookup): LookupFunction {
  return (hostname, options, callback) => {
    base(hostname, { ...options, all: true }, (err, addresses) => {
      if (err) return callback(err, '', 0);
      const list = addresses as unknown as LookupAddress[];
      const unsafe = list.find((a) => !isPublicAddress(a.address));
      if (list.length === 0 || unsafe) {
        return callback(new SafeFetchError('Adresse non publique refusée.'), '', 0);
      }
      const first = list[0]!;
      if ((options as { all?: boolean }).all)
        return (callback as unknown as (e: null, a: LookupAddress[]) => void)(null, list);
      return callback(null, first.address, first.family);
    });
  };
}

function once(url: URL, timeoutMs: number, maxBytes: number, lookup: typeof dnsLookup) {
  return new Promise<{ status: number; location?: string; contentType: string; body: string }>(
    (resolve, reject) => {
      const req = request(
        url,
        {
          method: 'GET',
          lookup: guardedLookup(lookup),
          // Pas de proxy, pas de cookies : une requête anonyme et directe.
          agent: false,
          headers: {
            'user-agent': 'Mozilla/5.0 (compatible; KonziaBot/1.0; +https://konzia.app)',
            accept: 'text/html,application/xhtml+xml',
            'accept-language': 'fr-FR,fr;q=0.9,en;q=0.8',
          },
          timeout: timeoutMs,
        },
        (res) => {
          const status = res.statusCode ?? 0;
          if (status >= 300 && status < 400) {
            res.resume();
            return resolve({ status, location: res.headers.location, contentType: '', body: '' });
          }
          let size = 0;
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => {
            size += chunk.length;
            if (size > maxBytes) {
              req.destroy(new SafeFetchError('Page trop lourde.'));
              return;
            }
            chunks.push(chunk);
          });
          res.on('end', () =>
            resolve({
              status,
              contentType: String(res.headers['content-type'] ?? ''),
              body: Buffer.concat(chunks).toString('utf8'),
            }),
          );
          res.on('error', reject);
        },
      );
      const timer = setTimeout(
        () => req.destroy(new SafeFetchError('Le site met trop de temps à répondre.')),
        timeoutMs,
      );
      req.on('timeout', () =>
        req.destroy(new SafeFetchError('Le site met trop de temps à répondre.')),
      );
      req.on('error', (err) => {
        clearTimeout(timer);
        reject(err instanceof SafeFetchError ? err : new SafeFetchError('Site injoignable.'));
      });
      req.on('close', () => clearTimeout(timer));
      req.end();
    },
  );
}
