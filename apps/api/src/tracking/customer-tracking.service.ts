import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@konzia/db';
import { ANOMALY_LABELS, type AnomalyType, type CustomerParcelTracking } from '@konzia/shared';
import { TenantDb } from '../tenancy/tenant-db.service';

interface ItemRow {
  parcel_id: string;
  parcel_code: string;
  parcel_status: CustomerParcelTracking['status'];
  order_number: string;
  description: string;
  quantity: number;
}
interface EventRow {
  parcel_id: string;
  kind: CustomerParcelTracking['events'][number]['kind'];
  anomaly_type: AnomalyType | null;
  label: string;
  occurred_at: Date;
  location: string | null;
}

/**
 * Suivi côté client (ticket #22, EF-84) : lu uniquement à travers les vues filtrées
 * customer_parcel_tracking / customer_parcel_events (ses articles, étapes visibles, sans notes).
 */
@Injectable()
export class CustomerTrackingService {
  constructor(private readonly db: TenantDb) {}

  forOrder(userId: string, orderId: string): Promise<CustomerParcelTracking[]> {
    return this.db.run(userId, async (tx) => {
      const order = await tx.order.findFirst({
        where: { id: orderId, customerUserId: userId },
        select: { id: true },
      });
      if (!order) throw new NotFoundException('Commande introuvable.');
      const items = await tx.$queryRaw<ItemRow[]>`
        SELECT parcel_id, parcel_code, parcel_status, order_number, description, quantity
        FROM customer_parcel_tracking WHERE order_id = ${orderId}::uuid
        ORDER BY parcel_code, description`;
      if (items.length === 0) return [];
      const parcelIds = [...new Set(items.map((i) => i.parcel_id))];
      const events = await tx.$queryRaw<EventRow[]>`
        SELECT parcel_id, kind, anomaly_type, label, occurred_at, location
        FROM customer_parcel_events
        WHERE parcel_id IN (${Prisma.join(parcelIds.map((id) => Prisma.sql`${id}::uuid`))})
        ORDER BY occurred_at, id`;
      return parcelIds.map((pid) => {
        const own = items.filter((i) => i.parcel_id === pid);
        const evs = events
          .filter((e) => e.parcel_id === pid)
          .map((e) => ({
            kind: e.kind,
            label:
              e.kind === 'anomaly' && e.anomaly_type
                ? `Anomalie : ${ANOMALY_LABELS[e.anomaly_type]}`
                : e.label,
            occurredAt: e.occurred_at.toISOString(),
            location: e.location,
          }));
        const current = [...evs].reverse().find((e) => e.kind !== 'anomaly');
        return {
          parcelCode: own[0]!.parcel_code,
          status: own[0]!.parcel_status,
          currentLabel: current?.label ?? null,
          items: own.map((i) => ({
            orderNumber: i.order_number,
            description: i.description,
            quantity: i.quantity,
          })),
          events: evs,
        };
      });
    });
  }
}
