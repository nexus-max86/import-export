import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/** Codes TOTP (RFC 6238 : HMAC-SHA1, 30 s, 6 chiffres), compatibles Google Authenticator, Aegis… */
export const TOTP_PERIOD = 30;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Buffer {
  const clean = text.toUpperCase().replace(/[\s=]/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = ALPHABET.indexOf(ch);
    if (idx < 0) throw new Error('Clé base32 invalide.');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function generateSecret(): string {
  return base32Encode(randomBytes(20));
}

export function totpAt(secret: Buffer, step: number, digits = 6): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = createHmac('sha1', secret).update(counter).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const bin = (hmac.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits;
  return String(bin).padStart(digits, '0');
}

export const stepOf = (ms: number) => Math.floor(ms / 1000 / TOTP_PERIOD);

/**
 * Vérifie un code dans une fenêtre de ±1 pas (décalage d'horloge du téléphone) et refuse un pas
 * déjà utilisé (rejeu). Renvoie le pas accepté, ou null.
 */
export function verifyTotp(
  base32Secret: string,
  code: string,
  now = Date.now(),
  lastStep: bigint | null = null,
): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const secret = base32Decode(base32Secret);
  const current = stepOf(now);
  for (const step of [current - 1, current, current + 1]) {
    if (lastStep !== null && BigInt(step) <= lastStep) continue;
    const expected = Buffer.from(totpAt(secret, step));
    if (timingSafeEqual(expected, Buffer.from(code))) return step;
  }
  return null;
}

export function otpauthUrl(base32Secret: string, account: string): string {
  const label = encodeURIComponent(`Konzia:${account}`);
  return `otpauth://totp/${label}?secret=${base32Secret}&issuer=Konzia&algorithm=SHA1&digits=6&period=${TOTP_PERIOD}`;
}
