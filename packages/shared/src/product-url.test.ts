import { describe, expect, it } from 'vitest';
import { analyzeProductUrl, marketplaceForHost } from './product-url';

describe('analyzeProductUrl', () => {
  it('reconnaît SHEIN et retire les paramètres de pistage', () => {
    const r = analyzeProductUrl(
      'https://fr.shein.com/Robe-Midi-p-2814455.html?src_identifier=x&utm_source=wa&spm=1.2#avis',
    );
    expect(r).toEqual({
      ok: true,
      url: 'https://fr.shein.com/Robe-Midi-p-2814455.html?src_identifier=x',
      marketplace: 'shein',
      host: 'fr.shein.com',
    });
  });

  it('extrait le lien d’un texte partagé depuis une application', () => {
    const r = analyzeProductUrl('Regarde ça ! https://a.aliexpress.com/_mKx9 Prix incroyable');
    expect(r).toMatchObject({
      ok: true,
      marketplace: 'aliexpress',
      url: 'https://a.aliexpress.com/_mKx9',
    });
  });

  it('passe un lien http connu en https', () => {
    expect(analyzeProductUrl('http://www.amazon.fr/dp/B0C1234567')).toMatchObject({
      ok: true,
      url: 'https://www.amazon.fr/dp/B0C1234567',
    });
  });

  it('accepte un site inconnu sans marketplace (saisie manuelle)', () => {
    expect(analyzeProductUrl('https://boutique-inconnue.example.com/p/1')).toMatchObject({
      ok: true,
      marketplace: null,
    });
  });

  it.each([
    ['file:///etc/passwd', /https/],
    ['javascript:alert(1)', /https/],
    ['http://exemple-inconnu.com/x', /https/],
    ['https://127.0.0.1/admin', /adresse IP/],
    ['https://[::1]/', /adresse IP/],
    ['https://169.254.169.254/latest/meta-data', /adresse IP/],
    ['https://localhost/x', /non public/],
    ['https://serveur.internal/x', /non public/],
    ['https://user:pass@shein.com/x', /identifiants/],
    ['https://shein.com:8443/x', /port/],
    ['pas un lien', /valide/],
  ])('refuse %s', (input, reason) => {
    const r = analyzeProductUrl(input);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(reason);
  });

  it('ne se laisse pas tromper par un domaine qui contient le nom d’une marketplace', () => {
    expect(marketplaceForHost('shein.com.pirate.example')).toBeNull();
    expect(marketplaceForHost('faux-shein.com')).toBeNull();
    expect(marketplaceForHost('m.shein.com')).toBe('shein');
  });
});
