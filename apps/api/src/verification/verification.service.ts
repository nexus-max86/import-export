import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  REQUIRED_DOCUMENTS,
  VERIFICATION_DOCUMENTS,
  type VerificationDocumentKind,
  type VerificationInfo,
} from '@konzia/shared';
import { AuditService } from '../audit/audit.service';
import { FilesService, type UploadedBlob } from '../files/files.service';
import type { OrgContext } from '../tenancy/org-context';
import { TenantDb, type TenantTx } from '../tenancy/tenant-db.service';

const DOC_SELECT = {
  id: true,
  kind: true,
  createdAt: true,
  file: { select: { originalName: true, sizeBytes: true } },
} as const;

@Injectable()
export class VerificationService {
  constructor(
    private readonly db: TenantDb,
    private readonly files: FilesService,
    private readonly audit: AuditService,
  ) {}

  get(userId: string, org: OrgContext): Promise<VerificationInfo> {
    return this.db.run(userId, (tx) => this.read(tx, org.organizationId));
  }

  async upload(
    userId: string,
    org: OrgContext,
    kind: VerificationDocumentKind,
    upload: UploadedBlob,
  ): Promise<VerificationInfo> {
    return this.db.run(userId, async (tx) => {
      const verification = await this.openDraft(tx, org.organizationId);
      const file = await this.files.store(
        tx,
        userId,
        org.organizationId,
        'verification_document',
        upload,
      );
      // Remplace le document de même type (le fichier précédent reste archivé, jamais modifié).
      await tx.verificationDocument.deleteMany({
        where: { verificationId: verification.id, kind },
      });
      await tx.verificationDocument.create({
        data: {
          verificationId: verification.id,
          organizationId: org.organizationId,
          kind,
          fileId: file.id,
        },
        select: { id: true },
      });
      await this.audit.record(tx, {
        actorUserId: userId,
        actorRole: org.role,
        organizationId: org.organizationId,
        action: 'verification.document_uploaded',
        entityType: 'organization_verification',
        entityId: verification.id,
        after: { kind, fileId: file.id, mime: file.mime },
      });
      return this.read(tx, org.organizationId);
    });
  }

  async removeDocument(
    userId: string,
    org: OrgContext,
    documentId: string,
  ): Promise<VerificationInfo> {
    return this.db.run(userId, async (tx) => {
      const { count } = await tx.verificationDocument.deleteMany({
        where: {
          id: documentId,
          organizationId: org.organizationId,
          verification: { status: 'draft' },
        },
      });
      if (count === 0) throw new NotFoundException('Document introuvable ou déjà soumis.');
      return this.read(tx, org.organizationId);
    });
  }

  async submit(userId: string, org: OrgContext): Promise<VerificationInfo> {
    return this.db.run(userId, async (tx) => {
      const draft = await tx.organizationVerification.findFirst({
        where: { organizationId: org.organizationId, status: 'draft' },
        select: { id: true, documents: { select: { kind: true } } },
      });
      if (!draft) throw new ConflictException('Aucun dossier en préparation à soumettre.');
      const present = new Set(draft.documents.map((d) => d.kind));
      const missing = REQUIRED_DOCUMENTS.filter((k) => !present.has(k));
      if (missing.length > 0) {
        throw new BadRequestException(
          `Document manquant : ${missing.map((k) => VERIFICATION_DOCUMENTS[k]).join(', ')}.`,
        );
      }
      await tx.organizationVerification.update({
        where: { id: draft.id },
        data: { status: 'submitted', submittedAt: new Date(), submittedBy: userId },
        select: { id: true },
      });
      await this.audit.record(tx, {
        actorUserId: userId,
        actorRole: org.role,
        organizationId: org.organizationId,
        action: 'verification.submitted',
        entityType: 'organization_verification',
        entityId: draft.id,
        after: { status: 'submitted', documents: [...present] },
      });
      return this.read(tx, org.organizationId);
    });
  }

  /** Contenu déchiffré d'un document, pour le propriétaire de l'organisation (RLS). */
  async download(userId: string, org: OrgContext, documentId: string) {
    const doc = await this.db.run(userId, (tx) =>
      tx.verificationDocument.findFirst({
        where: { id: documentId, organizationId: org.organizationId },
        select: { file: { select: { storageKey: true, mime: true, originalName: true } } },
      }),
    );
    if (!doc) throw new NotFoundException('Document introuvable.');
    return { ...doc.file, content: await this.files.read(doc.file.storageKey) };
  }

  /** Dossier en préparation ; créé au besoin. Refusé pendant l'examen d'un dossier soumis. */
  private async openDraft(tx: TenantTx, organizationId: string) {
    const open = await tx.organizationVerification.findFirst({
      where: { organizationId, status: { in: ['draft', 'submitted'] } },
      select: { id: true, status: true },
    });
    if (open?.status === 'submitted') {
      throw new ConflictException(
        'Votre dossier est en cours d’examen. Attendez la décision avant de le modifier.',
      );
    }
    return (
      open ??
      tx.organizationVerification.create({
        data: { organizationId },
        select: { id: true, status: true },
      })
    );
  }

  private async read(tx: TenantTx, organizationId: string): Promise<VerificationInfo> {
    const v = await tx.organizationVerification.findFirst({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        status: true,
        submittedAt: true,
        decidedAt: true,
        reason: true,
        documents: { select: DOC_SELECT, orderBy: { kind: 'asc' } },
      },
    });
    if (!v)
      return {
        id: null,
        status: null,
        submittedAt: null,
        decidedAt: null,
        reason: null,
        documents: [],
      };
    return {
      id: v.id,
      status: v.status,
      submittedAt: v.submittedAt?.toISOString() ?? null,
      decidedAt: v.decidedAt?.toISOString() ?? null,
      reason: v.reason,
      documents: v.documents.map((d) => ({
        id: d.id,
        kind: d.kind,
        originalName: d.file.originalName,
        sizeBytes: d.file.sizeBytes,
        uploadedAt: d.createdAt.toISOString(),
      })),
    };
  }
}
