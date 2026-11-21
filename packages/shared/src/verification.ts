/** Documents exigés pour vérifier un commissionnaire (décision du 21/11/2026, retour terrain R5). */
export const VERIFICATION_DOCUMENTS = {
  rccm: 'RCCM (registre du commerce)',
  identity: 'Pièce d’identité du responsable (carte d’électeur, passeport…)',
} as const;
export type VerificationDocumentKind = keyof typeof VERIFICATION_DOCUMENTS;
export const REQUIRED_DOCUMENTS = Object.keys(VERIFICATION_DOCUMENTS) as VerificationDocumentKind[];

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const ALLOWED_UPLOAD_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export type VerificationStatus = 'draft' | 'submitted' | 'approved' | 'rejected';

export interface VerificationInfo {
  id: string | null;
  status: VerificationStatus | null;
  submittedAt: string | null;
  decidedAt: string | null;
  reason: string | null;
  documents: {
    id: string;
    kind: VerificationDocumentKind;
    originalName: string;
    sizeBytes: number;
    uploadedAt: string;
  }[];
}
