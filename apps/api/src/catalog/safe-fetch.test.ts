import type { lookup as dnsLookup } from 'node:dns';
import { isPublicAddress } from './public-address';
import { safeFetch, SafeFetchError } from './safe-fetch';

/** Résolution DNS simulée : un nom public qui pointe vers une adresse interne (DNS rebinding). */
function fakeDns(address: string, family = 4): typeof dnsLookup {
  return ((_host: string, opts: unknown, cb: (e: null, a: unknown, f?: number) => void) => {
    const all = typeof opts === 'object' && opts !== null && (opts as { all?: boolean }).all;
    if (all) cb(null, [{ address, family }]);
    else cb(null, address, family);
  }) as unknown as typeof dnsLookup;
}

describe('isPublicAddress', () => {
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.20.0.5',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '::1',
    'fd00::1',
    'fe80::1',
    '::ffff:127.0.0.1',
    '::ffff:10.0.0.1',
  ])('refuse %s', (ip) => expect(isPublicAddress(ip)).toBe(false));
  it.each(['41.243.1.10', '8.8.8.8', '2606:4700::1111', '::ffff:8.8.8.8'])('accepte %s', (ip) =>
    expect(isPublicAddress(ip)).toBe(true),
  );
  it('refuse ce qui n’est pas une adresse IP', () =>
    expect(isPublicAddress('shein.com')).toBe(false));
});

describe('safeFetch', () => {
  const allowAll = () => true;

  it.each([
    ['127.0.0.1', 4],
    ['169.254.169.254', 4],
    ['10.0.0.7', 4],
    ['::1', 6],
  ])('refuse un domaine autorisé qui résout vers %s', async (ip, family) => {
    await expect(
      safeFetch('https://www.shein.com/p/1', {
        isAllowedHost: allowAll,
        lookup: fakeDns(ip, family),
      }),
    ).rejects.toThrow(/non publique/);
  });

  it('refuse un hôte hors liste blanche avant toute connexion', async () => {
    const spy = vi.fn(fakeDns('8.8.8.8'));
    const lookup = spy as unknown as typeof dnsLookup;
    await expect(
      safeFetch('https://pirate.example/p', { isAllowedHost: () => false, lookup }),
    ).rejects.toBeInstanceOf(SafeFetchError);
    expect(spy).not.toHaveBeenCalled();
  });

  it.each(['http://shein.com/p', 'https://user:pw@shein.com/p', 'https://shein.com:8443/p'])(
    'refuse %s',
    async (url) => {
      await expect(
        safeFetch(url, { isAllowedHost: allowAll, lookup: fakeDns('8.8.8.8') }),
      ).rejects.toBeInstanceOf(SafeFetchError);
    },
  );
});
