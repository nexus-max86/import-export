-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('awaiting_payment', 'payment_to_verify', 'paid', 'purchasing', 'partially_purchased', 'purchased', 'in_logistics', 'in_transit', 'at_distribution_point', 'ready_for_handover', 'completed', 'cancelled', 'in_dispute');

-- CreateEnum
CREATE TYPE "OrderPaymentStatus" AS ENUM ('unpaid', 'partially_paid', 'paid', 'partially_refunded', 'refunded');

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "organization_id" UUID NOT NULL,
    "org_customer_id" UUID NOT NULL,
    "customer_user_id" UUID,
    "quote_id" UUID NOT NULL,
    "quote_version_id" UUID NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "agreed_total_amount" BIGINT NOT NULL,
    "final_amount" BIGINT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'awaiting_payment',
    "payment_status" "OrderPaymentStatus" NOT NULL DEFAULT 'unpaid',
    "cancelled_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "customer_user_id" UUID,
    "quote_line_id" UUID NOT NULL,
    "quote_request_item_id" UUID,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_amount" BIGINT NOT NULL,
    "amount" BIGINT NOT NULL,
    "qty_purchased" INTEGER NOT NULL DEFAULT 0,
    "qty_received" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_events" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "from_status" "OrderStatus",
    "to_status" "OrderStatus",
    "actor_user_id" UUID,
    "note" TEXT,
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "orders_number_key" ON "orders"("number");

-- CreateIndex
CREATE UNIQUE INDEX "orders_quote_version_id_key" ON "orders"("quote_version_id");

-- CreateIndex
CREATE INDEX "orders_organization_id_status_idx" ON "orders"("organization_id", "status");

-- CreateIndex
CREATE INDEX "orders_customer_user_id_idx" ON "orders"("customer_user_id");

-- CreateIndex
CREATE INDEX "order_items_order_id_idx" ON "order_items"("order_id");

-- CreateIndex
CREATE INDEX "order_events_order_id_at_idx" ON "order_events"("order_id", "at");

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE SEQUENCE order_number_seq;
GRANT USAGE ON SEQUENCE order_number_seq TO konzia_app;

ALTER TABLE order_items
  ADD CONSTRAINT oi_qty CHECK (quantity >= 1 AND qty_purchased BETWEEN 0 AND quantity AND qty_received BETWEEN 0 AND quantity);

-- Historique immuable.
CREATE TRIGGER order_events_no_update_delete BEFORE UPDATE OR DELETE ON order_events
  FOR EACH ROW EXECUTE FUNCTION audit_logs_immutable();

-- Une commande n'est jamais supprimée (annulation = statut).
CREATE OR REPLACE FUNCTION forbid_delete() RETURNS trigger LANGUAGE plpgsql AS $$
  BEGIN RAISE EXCEPTION 'suppression interdite : utilisez un statut d''annulation'; END $$;
CREATE TRIGGER orders_no_delete BEFORE DELETE ON orders FOR EACH ROW EXECUTE FUNCTION forbid_delete();
CREATE TRIGGER order_items_no_delete BEFORE DELETE ON order_items FOR EACH ROW EXECUTE FUNCTION forbid_delete();

-- RLS : commissionnaire responsable et client de la commande. La création passe par
-- l'acceptation du devis (chemin système) ; les changements d'état arrivent au ticket #17.
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON orders TO konzia_app;
CREATE POLICY orders_select ON orders FOR SELECT TO konzia_app
  USING (organization_id IN (SELECT app_user_org_ids()) OR customer_user_id = app_current_user_id());

ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON order_items TO konzia_app;
CREATE POLICY order_items_select ON order_items FOR SELECT TO konzia_app
  USING (organization_id IN (SELECT app_user_org_ids()) OR customer_user_id = app_current_user_id());

ALTER TABLE order_events ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON order_events TO konzia_app;
CREATE POLICY order_events_select ON order_events FOR SELECT TO konzia_app
  USING (organization_id IN (SELECT app_user_org_ids())
         OR EXISTS (SELECT 1 FROM orders o WHERE o.id = order_id AND o.customer_user_id = app_current_user_id()));

-- Le client agit sur les devis reçus (acceptation, refus, correction) par chemin système audité.
