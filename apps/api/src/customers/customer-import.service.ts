import { BadRequestException, Injectable, PayloadTooLargeException } from '@nestjs/common';
import {
  IMPORT_FIELD_LABELS,
  MAX_IMPORT_BYTES,
  MAX_IMPORT_ROWS,
  OrgCustomerSchema,
  type ImportField,
  type ImportPreview,
  type ImportReport,
  type ImportRow,
} from '@konzia/shared';
import { AuditService } from '../audit/audit.service';
import type { UploadedBlob } from '../files/files.service';
import type { OrgContext } from '../tenancy/org-context';
import { TenantDb, type TenantTx } from '../tenancy/tenant-db.service';
import { mapColumns, normalizeLabel, readSheet } from './spreadsheet';

interface ParsedRow extends ImportRow {
  data: {
    fullName: string;
    phoneWhatsapp: string | null;
    email: string | null;
    cityId: string | null;
    serviceZoneId: string | null;
    addressLine: string | null;
    landmark: string | null;
    notesPrivate: string | null;
  } | null;
}

@Injectable()
export class CustomerImportService {
  constructor(
    private readonly db: TenantDb,
    private readonly audit: AuditService,
  ) {}

  /** Aperçu : rien n'est enregistré. */
  async preview(userId: string, org: OrgContext, upload: UploadedBlob): Promise<ImportPreview> {
    return this.db.run(userId, async (tx) => {
      const { columns, rows } = await this.parse(tx, org, upload);
      return {
        fileName: upload.originalname,
        columns,
        rows: rows.map(({ data: _d, ...r }) => r),
        counts: count(rows),
      };
    });
  }

  /** Import des seules lignes valides ; doublons et erreurs ignorés et résumés. */
  async commit(userId: string, org: OrgContext, upload: UploadedBlob): Promise<ImportReport> {
    return this.db.run(userId, async (tx) => {
      const { rows } = await this.parse(tx, org, upload);
      const valid = rows.filter((r) => r.status === 'ok' && r.data);
      if (valid.length > 0) {
        await tx.orgCustomer.createMany({
          data: valid.map((r) => ({
            ...r.data!,
            organizationId: org.organizationId,
            source: 'import' as const,
            createdBy: userId,
          })),
        });
      }
      const skipped = rows.filter((r) => r.status !== 'ok');
      await tx.customerImport.create({
        data: {
          organizationId: org.organizationId,
          importedBy: userId,
          fileName: upload.originalname.slice(0, 200),
          rowsTotal: rows.length,
          rowsImported: valid.length,
          rowsSkipped: skipped.length,
          // Numéros de ligne et motifs seulement : pas de données personnelles dans l'historique.
          issues: skipped.map((r) => ({ line: r.line, reason: r.message })),
        },
        select: { id: true },
      });
      await this.audit.record(tx, {
        actorUserId: userId,
        actorRole: org.role,
        organizationId: org.organizationId,
        action: 'customer.imported',
        entityType: 'organization',
        entityId: org.organizationId,
        after: {
          file: upload.originalname.slice(0, 200),
          imported: valid.length,
          skipped: skipped.length,
        },
      });
      return { imported: valid.length, skipped: skipped.length };
    });
  }

  private async parse(tx: TenantTx, org: OrgContext, upload: UploadedBlob) {
    if (upload.size > MAX_IMPORT_BYTES)
      throw new PayloadTooLargeException('Fichier trop lourd (2 Mo maximum).');
    let sheet;
    try {
      sheet = await readSheet(upload.buffer);
    } catch {
      throw new BadRequestException(
        'Fichier illisible. Enregistrez-le en .xlsx ou en .csv depuis Excel.',
      );
    }
    const map = mapColumns(sheet.headers);
    if (map.fullName === undefined) {
      throw new BadRequestException(
        'Colonne « Nom » introuvable. La première ligne doit contenir les titres des colonnes.',
      );
    }
    if (map.phone === undefined && map.email === undefined) {
      throw new BadRequestException('Colonne « Téléphone » (ou « E-mail ») introuvable.');
    }
    if (sheet.rows.length > MAX_IMPORT_ROWS) {
      throw new BadRequestException(
        `Trop de lignes (${MAX_IMPORT_ROWS} maximum par fichier). Découpez le fichier.`,
      );
    }

    const columns: Partial<Record<ImportField, string>> = {};
    for (const field of Object.keys(IMPORT_FIELD_LABELS) as ImportField[]) {
      const idx = map[field];
      if (idx !== undefined) columns[field] = sheet.headers[idx] ?? '';
    }

    const zones = await tx.serviceZone.findMany({
      where: { isActive: true, city: { isActive: true } },
      select: { id: true, name: true, cityId: true },
    });
    const zoneByName = new Map(zones.map((z) => [normalizeLabel(z.name), z]));
    const existing = new Set(
      (
        await tx.orgCustomer.findMany({
          where: {
            organizationId: org.organizationId,
            status: 'active',
            phoneWhatsapp: { not: null },
          },
          select: { phoneWhatsapp: true },
        })
      ).map((c) => c.phoneWhatsapp),
    );
    const seen = new Set<string>();

    const rows: ParsedRow[] = sheet.rows.map(({ line, cells }) => {
      const get = (f: keyof typeof map) => {
        const i = map[f];
        return i === undefined ? '' : (cells[i] ?? '').trim();
      };
      const name = [get('firstName'), get('fullName')].filter(Boolean).join(' ');
      const zoneText = get('zone');
      const zone = zoneText ? zoneByName.get(normalizeLabel(zoneText)) : undefined;
      const address = [get('address'), zoneText && !zone ? zoneText : '']
        .filter(Boolean)
        .join(', ');
      const parsed = OrgCustomerSchema.safeParse({
        fullName: name,
        phoneWhatsapp: get('phone') || null,
        email: get('email') || null,
        cityId: zone?.cityId ?? null,
        serviceZoneId: zone?.id ?? null,
        addressLine: address,
        landmark: get('landmark'),
        notesPrivate: get('notes'),
      });
      const base = {
        line,
        fullName: name,
        phoneWhatsapp: null,
        email: get('email') || null,
        zoneName: zone?.name ?? (zoneText || null),
      };
      if (!parsed.success) {
        return {
          ...base,
          phoneWhatsapp: get('phone') || null,
          status: 'error',
          message: parsed.error.issues[0]?.message ?? 'Ligne invalide.',
          data: null,
        };
      }
      const data = {
        fullName: parsed.data.fullName,
        phoneWhatsapp: parsed.data.phoneWhatsapp ?? null,
        email: parsed.data.email ?? null,
        cityId: parsed.data.cityId ?? null,
        serviceZoneId: parsed.data.serviceZoneId ?? null,
        addressLine: parsed.data.addressLine ?? null,
        landmark: parsed.data.landmark ?? null,
        notesPrivate: parsed.data.notesPrivate ?? null,
      };
      const phone = data.phoneWhatsapp;
      if (phone && existing.has(phone)) {
        return {
          ...base,
          phoneWhatsapp: phone,
          status: 'duplicate',
          message: 'Déjà dans vos clients.',
          data: null,
        };
      }
      if (phone && seen.has(phone)) {
        return {
          ...base,
          phoneWhatsapp: phone,
          status: 'duplicate',
          message: 'Numéro en double dans le fichier.',
          data: null,
        };
      }
      if (phone) seen.add(phone);
      return {
        ...base,
        phoneWhatsapp: phone,
        status: 'ok',
        message: zoneText && !zone ? 'Commune non reconnue : gardée dans l’adresse.' : null,
        data,
      };
    });
    return { columns, rows };
  }
}

function count(rows: ImportRow[]) {
  return {
    ok: rows.filter((r) => r.status === 'ok').length,
    duplicate: rows.filter((r) => r.status === 'duplicate').length,
    error: rows.filter((r) => r.status === 'error').length,
  };
}
