import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

/** Interface interne : le fournisseur de stockage peut changer sans toucher au métier. */
export interface FileStorage {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
}

export const FILE_STORAGE = Symbol('FILE_STORAGE');

/** Disque local : développement et tests uniquement (refusé en production par la configuration). */
export class LocalDiskFileStorage implements FileStorage {
  private readonly root: string;

  constructor(dir: string) {
    this.root = resolve(dir);
  }

  private path(key: string): string {
    if (!/^[a-z0-9/_-]+$/i.test(key)) throw new Error('Clé de stockage invalide.');
    return join(this.root, key);
  }

  async put(key: string, data: Buffer): Promise<void> {
    const path = this.path(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, data, { flag: 'wx' });
  }

  get(key: string): Promise<Buffer> {
    return readFile(this.path(key));
  }
}

/**
 * Stockage S3 compatible (Cloudflare R2 prévu en production).
 * NON VÉRIFIÉ contre un vrai seau R2 à ce jour : à tester avec les identifiants de production (ticket #29).
 */
export class S3FileStorage implements FileStorage {
  private readonly client: S3Client;

  constructor(
    private readonly bucket: string,
    config: { endpoint: string; region: string; accessKeyId: string; secretAccessKey: string },
  ) {
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    });
  }

  async put(key: string, data: Buffer): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: data,
        ContentType: 'application/octet-stream',
      }),
    );
  }

  async get(key: string): Promise<Buffer> {
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    if (!res.Body) throw new Error('Fichier introuvable dans le stockage.');
    return Buffer.from(await res.Body.transformToByteArray());
  }
}
