import { Injectable } from '@nestjs/common';
import { can, type MoneyByCurrency, type OrgOverview, type OverviewAlert } from '@konzia/shared';
import type { OrgContext } from '../tenancy/org-context';
import { TenantDb } from '../tenancy/tenant-db.service';

const ACTIVE = `status NOT IN ('completed', 'cancelled')`;
/** Seuils des alertes à règles (jours). */
const IDLE_PARCEL_DAYS = 3;
const PURCHASE_NOT_RECEIVED_DAYS = 10;

const money = (rows: { currency: string; amount: bigint | null }[]): MoneyByCurrency[] =>
  rows
    .filter((r) => r.amount && r.amount > 0n)
    .map((r) => ({ currency: r.currency, amount: Number(r.amount) }));

/**
 * Vue générale Business : lectures seules, avec le rôle applicatif (RLS) ; tout chiffre vient
 * d'une table de l'organisation. Les montants ne sont renvoyés qu'aux rôles qui voient les paiements.
 */
@Injectable()
export class OverviewService {
  constructor(private readonly db: TenantDb) {}

  get(userId: string, org: OrgContext): Promise<OrgOverview> {
    const orgId = org.organizationId;
    return this.db.run(userId, async (tx) => {
      const n = async (sql: string): Promise<number> => {
        const [r] = await tx.$queryRawUnsafe<{ n: bigint | null }[]>(sql, orgId);
        return Number(r?.n ?? 0);
      };
      const requestsToHandle = await n(
        `SELECT count(*) AS n FROM quote_request_recipients WHERE organization_id = $1::uuid AND status IN ('sent', 'viewed', 'evaluating')`,
      );
      const [oldest] = await tx.$queryRawUnsafe<{ h: number | null }[]>(
        `SELECT EXTRACT(EPOCH FROM now() - min(created_at)) / 3600 AS h FROM quote_request_recipients WHERE organization_id = $1::uuid AND status IN ('sent', 'viewed', 'evaluating')`,
        orgId,
      );
      const quotesAwaitingCustomer = await n(
        `SELECT count(*) AS n FROM quotes WHERE organization_id = $1::uuid AND status = 'sent'`,
      );
      const activeOrders = await n(
        `SELECT count(*) AS n FROM orders WHERE organization_id = $1::uuid AND ${ACTIVE}`,
      );
      const inTransitOrders = await n(
        `SELECT count(*) AS n FROM orders WHERE organization_id = $1::uuid AND status = 'in_transit'`,
      );
      // Retard : date d'acceptation + délai maximal annoncé dans la version de devis, dépassée.
      const late = await tx.$queryRawUnsafe<{ id: string; number: string; days: number }[]>(
        `SELECT o.id, o.number,
                EXTRACT(DAY FROM now() - (o.created_at + make_interval(days => qv.lead_time_max_days)))::int AS days
           FROM orders o JOIN quote_versions qv ON qv.id = o.quote_version_id
          WHERE o.organization_id = $1::uuid AND o.status NOT IN ('completed', 'cancelled')
            AND o.status NOT IN ('ready_for_handover')
            AND o.created_at + make_interval(days => qv.lead_time_max_days) < now()
          ORDER BY days DESC`,
        orgId,
      );
      const itemsToReceive = await n(
        `SELECT sum(i.qty_purchased - i.qty_received) AS n FROM order_items i JOIN orders o ON o.id = i.order_id
          WHERE o.organization_id = $1::uuid AND o.status NOT IN ('completed', 'cancelled') AND i.qty_purchased > i.qty_received`,
      );
      const idleParcels = await tx.$queryRawUnsafe<{ id: string; code: string; days: number }[]>(
        `SELECT p.id, p.code, EXTRACT(DAY FROM now() - p.updated_at)::int AS days FROM parcels p
          WHERE p.organization_id = $1::uuid AND p.status = 'closed'
            AND NOT EXISTS (SELECT 1 FROM shipment_parcels sp WHERE sp.parcel_id = p.id AND sp.removed_at IS NULL)
          ORDER BY p.updated_at`,
        orgId,
      );
      const shipmentsInProgress = await n(
        `SELECT count(*) AS n FROM shipments WHERE organization_id = $1::uuid AND status = 'in_transit'`,
      );
      const unreceived = await tx.$queryRawUnsafe<{ id: string; store: string; days: number }[]>(
        `SELECT id, store_name AS store, EXTRACT(DAY FROM now() - purchased_at)::int AS days FROM supplier_orders
          WHERE organization_id = $1::uuid AND status IN ('placed', 'shipped_by_seller')
            AND purchased_at < now() - make_interval(days => ${PURCHASE_NOT_RECEIVED_DAYS})
          ORDER BY purchased_at`,
        orgId,
      );
      const weeks = await tx.$queryRawUnsafe<{ week: Date; n: bigint }[]>(
        `SELECT w.week, count(o.id) AS n
           FROM generate_series(date_trunc('week', now()) - interval '7 weeks', date_trunc('week', now()), interval '1 week') AS w(week)
           LEFT JOIN orders o ON o.organization_id = $1::uuid AND date_trunc('week', o.created_at) = w.week
          GROUP BY w.week ORDER BY w.week`,
        orgId,
      );

      let finance: OrgOverview['finance'] = null;
      if (can(org.role, 'payment.view')) {
        finance = {
          paymentsToVerify: await n(
            `SELECT count(*) AS n FROM payments WHERE organization_id = $1::uuid AND status = 'pending_verification'`,
          ),
          owed: money(
            await tx.$queryRawUnsafe<{ currency: string; amount: bigint | null }[]>(
              `SELECT currency, sum(final_amount - order_net_paid(id))::bigint AS amount FROM orders
                WHERE organization_id = $1::uuid AND status <> 'cancelled' AND payment_status IN ('unpaid', 'partially_paid')
                GROUP BY currency`,
              orgId,
            ),
          ),
          confirmedLast7Days: money(
            await tx.$queryRawUnsafe<{ currency: string; amount: bigint | null }[]>(
              `SELECT o.currency, sum(CASE WHEN p.kind = 'refund' THEN -p.order_amount ELSE p.order_amount END)::bigint AS amount
                 FROM payments p JOIN orders o ON o.id = p.order_id
                WHERE p.organization_id = $1::uuid AND p.status = 'confirmed' AND p.confirmed_at > now() - interval '7 days'
                GROUP BY o.currency`,
              orgId,
            ),
          ),
        };
      }

      const alerts: OverviewAlert[] = [
        ...late.slice(0, 5).map((o) => ({
          kind: 'late_order' as const,
          title: `${o.number} : délai annoncé dépassé`,
          detail: `Dépassé de ${o.days} jour(s) par rapport au délai maximal du devis accepté.`,
          href: `/pro/commandes/${o.id}`,
        })),
        ...idleParcels
          .filter((p) => p.days >= IDLE_PARCEL_DAYS)
          .slice(0, 5)
          .map((p) => ({
            kind: 'idle_parcel' as const,
            title: `Colis ${p.code} fermé, pas expédié`,
            detail: `Fermé depuis ${p.days} jour(s), rattaché à aucune expédition.`,
            href: `/pro/colis/${p.id}`,
          })),
        ...unreceived.slice(0, 5).map((s) => ({
          kind: 'purchase_not_received' as const,
          title: `Achat ${s.store} non reçu`,
          detail: `Acheté il y a ${s.days} jours, aucune réception enregistrée.`,
          href: `/pro/achats`,
        })),
      ];

      return {
        requestsToHandle,
        oldestRequestHours: oldest?.h == null ? null : Math.floor(Number(oldest.h)),
        quotesAwaitingCustomer,
        activeOrders,
        inTransitOrders,
        lateOrders: late.length,
        itemsToReceive,
        parcelsToShip: idleParcels.length,
        shipmentsInProgress,
        finance,
        ordersPerWeek: weeks.map((w) => ({ weekStart: w.week.toISOString(), count: Number(w.n) })),
        alerts,
      };
    });
  }
}
