import { BadRequestException, Inject, Injectable, PayloadTooLargeException } from '@nestjs/common';
import { MAX_UPLOAD_BYTES } from '@konzia/shared';
import { randomUUID } from 'node:crypto';
import { sha256 } from '../common/crypto';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import type { TenantTx } from '../tenancy/tenant-db.service';
import { FileCrypto } from './file-crypto';
import { FILE_STORAGE, type FileStorage } from './file-storage';
import { sniffMime } from './sniff';

export interface UploadedBlob {
  originalname: string;
  buffer: Buffer;
  size: number;
}

@Injectable()
export class FilesService {
  private readonly crypto: FileCrypto;

  constructor(
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
    @Inject(ENV) env: Env,
  ) {
    this.crypto = new FileCrypto(env.FILES_ENCRYPTION_KEY);
  }

  /** Vérifie, chiffre, stocke le contenu, puis enregistre la ligne `files` dans la transaction donnée. */
  async storeVerificationDocument(
    tx: TenantTx,
    userId: string,
    organizationId: string,
    upload: UploadedBlob,
  ) {
    if (upload.size > MAX_UPLOAD_BYTES)
      throw new PayloadTooLargeException('Fichier trop lourd (5 Mo maximum).');
    const mime = sniffMime(upload.buffer);
    if (!mime)
      throw new BadRequestException(
        'Format non accepté. Envoyez un PDF ou une photo (JPEG, PNG, WebP).',
      );

    const storageKey = `verification/${organizationId}/${randomUUID()}`;
    // Le contenu est écrit avant la ligne en base : un échec SQL laisse au pire un fichier orphelin chiffré.
    await this.storage.put(storageKey, this.crypto.encrypt(upload.buffer));
    return tx.storedFile.create({
      data: {
        organizationId,
        ownerUserId: userId,
        purpose: 'verification_document',
        storageKey,
        originalName: upload.originalname.slice(0, 200),
        mime,
        sizeBytes: upload.size,
        sha256: sha256(upload.buffer.toString('base64')),
        keyId: this.crypto.keyId,
      },
      select: { id: true, mime: true },
    });
  }

  async read(storageKey: string): Promise<Buffer> {
    return this.crypto.decrypt(await this.storage.get(storageKey));
  }
}
