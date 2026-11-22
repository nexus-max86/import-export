import { base32Decode, base32Encode, otpauthUrl, stepOf, totpAt, verifyTotp } from './totp';

// RFC 6238, annexe B (SHA-1, secret ASCII « 12345678901234567890 »), 8 chiffres.
const RFC_SECRET = Buffer.from('12345678901234567890');

describe('TOTP (RFC 6238)', () => {
  it.each([
    [59, '94287082'],
    [1111111109, '07081804'],
    [1234567890, '89005924'],
    [2000000000, '69279037'],
  ])('vecteur de référence à T=%i', (t, code) => {
    expect(totpAt(RFC_SECRET, stepOf(t * 1000), 8)).toBe(code);
  });

  it('base32 aller-retour', () => {
    const b = base32Encode(RFC_SECRET);
    expect(b).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    expect(base32Decode(b).equals(RFC_SECRET)).toBe(true);
  });

  it('accepte ±30 s de décalage, refuse au-delà et refuse le rejeu', () => {
    const secret = base32Encode(RFC_SECRET);
    const now = 1_700_000_000_000;
    const code = totpAt(RFC_SECRET, stepOf(now));
    expect(verifyTotp(secret, code, now)).toBe(stepOf(now));
    expect(verifyTotp(secret, code, now + 30_000)).toBe(stepOf(now));
    expect(verifyTotp(secret, code, now + 90_000)).toBeNull();
    expect(verifyTotp(secret, code, now, BigInt(stepOf(now)))).toBeNull();
    expect(verifyTotp(secret, '12345', now)).toBeNull();
  });

  it('lien otpauth pour l’application d’authentification', () => {
    expect(otpauthUrl('ABC', 'admin@konzia.app')).toBe(
      'otpauth://totp/Konzia%3Aadmin%40konzia.app?secret=ABC&issuer=Konzia&algorithm=SHA1&digits=6&period=30',
    );
  });
});
