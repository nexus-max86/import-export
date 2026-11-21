import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const IV_BYTES = 12;
const TAG_BYTES = 16;

/** Chiffrement authentifié AES-256-GCM. Format stocké : iv (12) | tag (16) | données chiffrées. */
export class FileCrypto {
  readonly keyId: string;
  private readonly key: Buffer;

  constructor(base64Key: string) {
    this.key = Buffer.from(base64Key, 'base64');
    if (this.key.length !== 32) throw new Error('Clé de chiffrement invalide.');
    this.keyId = createHash('sha256').update(this.key).digest('hex').slice(0, 12);
  }

  encrypt(plain: Buffer): Buffer {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const data = Buffer.concat([cipher.update(plain), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), data]);
  }

  /** Lève une erreur si le contenu a été altéré ou si la clé ne correspond pas. */
  decrypt(blob: Buffer): Buffer {
    const iv = blob.subarray(0, IV_BYTES);
    const tag = blob.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(blob.subarray(IV_BYTES + TAG_BYTES)), decipher.final()]);
  }
}
