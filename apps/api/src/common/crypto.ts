import { createHash, createHmac, randomBytes } from 'node:crypto';

/** Jeton aléatoire de 256 bits, encodé pour une URL ou un cookie. */
export function randomToken(): string {
  return randomBytes(32).toString('base64url');
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Empreinte salée : permet de comparer des IP sans les stocker. */
export function saltedHash(value: string, salt: string): string {
  return createHmac('sha256', salt).update(value).digest('hex');
}
