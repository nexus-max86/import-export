export const MAX_IMPORT_ROWS = 2000;
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

export type ImportField = 'fullName' | 'phone' | 'email' | 'zone' | 'address' | 'landmark' | 'notes';

export const IMPORT_FIELD_LABELS: Record<ImportField, string> = {
  fullName: 'Nom',
  phone: 'Téléphone / WhatsApp',
  email: 'E-mail',
  zone: 'Commune',
  address: 'Adresse',
  landmark: 'Point de repère',
  notes: 'Note',
};

export interface ImportRow {
  /** Numéro de ligne dans le fichier (en-tête = 1). */
  line: number;
  fullName: string;
  phoneWhatsapp: string | null;
  email: string | null;
  zoneName: string | null;
  status: 'ok' | 'duplicate' | 'error';
  message: string | null;
}

export interface ImportPreview {
  fileName: string;
  /** Colonne du fichier reconnue pour chaque champ Konzia. */
  columns: Partial<Record<ImportField, string>>;
  rows: ImportRow[];
  counts: { ok: number; duplicate: number; error: number };
}

export interface ImportReport {
  imported: number;
  skipped: number;
}
