import { hash, verify } from '@node-rs/argon2';

// Paramètres Argon2id recommandés par l'OWASP (19 Mio, 2 itérations).
const OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

let dummyHash: Promise<string> | undefined;
/** Vérification factice pour qu'un e-mail inconnu prenne le même temps qu'un mauvais mot de passe. */
export async function burnPasswordCheck(password: string): Promise<void> {
  dummyHash ??= hashPassword('konzia-dummy-password');
  await verifyPassword(await dummyHash, password);
}
