import { Controller, Get, Header, Res, StreamableFile } from '@nestjs/common';
import {
  csvAmount,
  ORDER_STATUS_LABELS,
  PARCEL_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  STEP_LABELS,
  toCsv,
  type TrackingStepCode,
} from '@konzia/shared';
import type { Response } from 'express';
import { AuditService } from '../audit/audit.service';
import type { AuthContext } from '../auth/auth.types';
import { Auth } from '../auth/decorators';
import { ForOrg, Org, type OrgContext } from '../tenancy/org-context';
import { TenantDb, type TenantTx } from '../tenancy/tenant-db.service';

const day = (d: Date) => d.toISOString().slice(0, 10);
/** Numéro congolais au format national (« 081 234 5678 ») : lisible et jamais pris pour une formule. */
const phone = (p: string | null | undefined) => {
  const m = p?.match(/^\+243(\d{2})(\d{3})(\d{4})$/);
  return m ? `0${m[1]} ${m[2]} ${m[3]}` : p;
};
const kg = (g: number | null) => (g == null ? '' : (g / 1000).toFixed(1).replace('.', ','));

/** Exports CSV du commissionnaire (ticket #22) : ouverts dans Excel, journalisés dans l'audit. */
@Controller('org/exports')
export class ExportsController {
  constructor(
    private readonly db: TenantDb,
    private readonly audit: AuditService,
  ) {}

  @Get('orders.csv')
  @ForOrg('export.csv')
  @Header('Cache-Control', 'private, no-store')
  async orders(
    @Auth() auth: AuthContext,
    @Org() org: OrgContext,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const csv = await this.db.run(auth.userId, async (tx) => {
      const orders = await tx.order.findMany({
        where: { organizationId: org.organizationId },
        select: {
          id: true,
          number: true,
          status: true,
          paymentStatus: true,
          currency: true,
          finalAmount: true,
          createdAt: true,
          orgCustomerId: true,
        },
        orderBy: { createdAt: 'asc' },
      });
      const payments = await tx.payment.findMany({
        where: { organizationId: org.organizationId, status: 'confirmed' },
        select: { orderId: true, kind: true, orderAmount: true },
      });
      const paid = new Map<string, bigint>();
      for (const p of payments)
        paid.set(
          p.orderId,
          (paid.get(p.orderId) ?? 0n) + (p.kind === 'refund' ? -p.orderAmount : p.orderAmount),
        );
      const names = await this.customers(
        tx,
        orders.map((o) => o.orgCustomerId),
      );
      await this.trace(tx, auth, org, 'export.orders_csv', orders.length);
      return toCsv([
        [
          'Commande',
          'Client',
          'Téléphone',
          'Statut',
          'Paiement',
          'Devise',
          'Montant',
          'Payé',
          'Reste',
          'Créée le',
        ],
        ...orders.map((o) => {
          const net = paid.get(o.id) ?? 0n;
          const c = names.get(o.orgCustomerId);
          return [
            o.number,
            c?.fullName,
            phone(c?.phoneWhatsapp),
            ORDER_STATUS_LABELS[o.status],
            PAYMENT_STATUS_LABELS[o.paymentStatus],
            o.currency,
            csvAmount(Number(o.finalAmount)),
            csvAmount(Number(net)),
            csvAmount(Number(o.finalAmount - net)),
            day(o.createdAt),
          ];
        }),
      ]);
    });
    return this.file(res, csv, 'commandes');
  }

  @Get('parcels.csv')
  @ForOrg('export.csv')
  @Header('Cache-Control', 'private, no-store')
  async parcels(
    @Auth() auth: AuthContext,
    @Org() org: OrgContext,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const csv = await this.db.run(auth.userId, async (tx) => {
      const items = await tx.parcelItem.findMany({
        where: { organizationId: org.organizationId, removedAt: null },
        select: {
          quantity: true,
          orgCustomerId: true,
          parcel: {
            select: {
              code: true,
              status: true,
              currentStepCode: true,
              weightG: true,
              volumetricWeightG: true,
            },
          },
          orderItem: { select: { description: true, order: { select: { number: true } } } },
        },
        orderBy: [{ parcel: { createdAt: 'asc' } }, { addedAt: 'asc' }],
      });
      const names = await this.customers(
        tx,
        items.map((i) => i.orgCustomerId),
      );
      await this.trace(tx, auth, org, 'export.parcels_csv', items.length);
      return toCsv([
        [
          'Colis',
          'État',
          'Étape',
          'Commande',
          'Client',
          'Article',
          'Quantité',
          'Poids (kg)',
          'Poids volumétrique (kg)',
        ],
        ...items.map((i) => [
          i.parcel.code,
          PARCEL_STATUS_LABELS[i.parcel.status],
          i.parcel.currentStepCode
            ? (STEP_LABELS[i.parcel.currentStepCode as TrackingStepCode] ??
              i.parcel.currentStepCode)
            : '',
          i.orderItem.order.number,
          names.get(i.orgCustomerId)?.fullName,
          i.orderItem.description,
          i.quantity,
          kg(i.parcel.weightG),
          kg(i.parcel.volumetricWeightG),
        ]),
      ]);
    });
    return this.file(res, csv, 'colis');
  }

  private async customers(tx: TenantTx, ids: string[]) {
    const rows = await tx.orgCustomer.findMany({
      where: { id: { in: [...new Set(ids)] } },
      select: { id: true, fullName: true, phoneWhatsapp: true },
    });
    return new Map(rows.map((c) => [c.id, c]));
  }

  private trace(tx: TenantTx, auth: AuthContext, org: OrgContext, action: string, rows: number) {
    return this.audit.record(tx, {
      actorUserId: auth.userId,
      actorRole: org.role,
      organizationId: org.organizationId,
      action,
      entityType: 'organization',
      entityId: org.organizationId,
      after: { rows },
    });
  }

  private file(res: Response, csv: string, name: string) {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    return new StreamableFile(Buffer.from(csv, 'utf8'), {
      type: 'text/csv; charset=utf-8',
      disposition: `attachment; filename="konzia-${name}-${day(new Date())}.csv"`,
    });
  }
}
