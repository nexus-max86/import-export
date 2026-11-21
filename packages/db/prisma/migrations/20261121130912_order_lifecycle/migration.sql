-- CreateEnum
CREATE TYPE "AdjustmentStatus" AS ENUM ('proposed', 'accepted', 'rejected', 'cancelled');

-- CreateTable
CREATE TABLE "order_adjustments" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "customer_user_id" UUID,
    "amount_delta" BIGINT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "AdjustmentStatus" NOT NULL DEFAULT 'proposed',
    "proposed_by" UUID NOT NULL,
    "decided_by" UUID,
    "decided_at" TIMESTAMPTZ(3),
    "decision_note" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "order_adjustments_order_id_idx" ON "order_adjustments"("order_id");

-- AddForeignKey
ALTER TABLE "order_adjustments" ADD CONSTRAINT "order_adjustments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE order_adjustments
  ADD CONSTRAINT adj_nonzero CHECK (amount_delta <> 0);
CREATE UNIQUE INDEX adj_one_open ON order_adjustments (order_id) WHERE status = 'proposed';

-- --- Transitions de statut d'une commande --------------------------------------
-- Pour le rôle applicatif (commissionnaire), seules les étapes du schéma d'états sont permises.
-- Paiement, ajustements et actions du client passent par des chemins système audités.
CREATE OR REPLACE FUNCTION orders_app_transition() RETURNS trigger
  LANGUAGE plpgsql AS $$
  BEGIN
    IF current_user = 'konzia_app' AND NEW.status IS DISTINCT FROM OLD.status THEN
      IF NOT (
        (OLD.status = 'paid' AND NEW.status = 'purchasing')
        OR (OLD.status = 'purchasing' AND NEW.status IN ('partially_purchased', 'purchased'))
        OR (OLD.status = 'partially_purchased' AND NEW.status = 'purchased')
        OR (OLD.status = 'purchased' AND NEW.status = 'in_logistics')
        OR (OLD.status = 'in_logistics' AND NEW.status = 'in_transit')
        OR (OLD.status = 'in_transit' AND NEW.status = 'at_distribution_point')
        OR (OLD.status = 'at_distribution_point' AND NEW.status = 'ready_for_handover')
        OR (OLD.status = 'ready_for_handover' AND NEW.status = 'completed')
        OR (OLD.status IN ('awaiting_payment', 'payment_to_verify', 'paid') AND NEW.status = 'cancelled')
      ) THEN
        RAISE EXCEPTION 'transition de commande interdite : % → %', OLD.status, NEW.status;
      END IF;
    END IF;
    IF NEW.status = 'cancelled' AND OLD.status <> 'cancelled' AND coalesce(trim(NEW.cancelled_reason), '') = '' THEN
      RAISE EXCEPTION 'une annulation exige un motif';
    END IF;
    RETURN NEW;
  END
  $$;
CREATE TRIGGER orders_transition BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION orders_app_transition();

GRANT UPDATE (status, cancelled_reason, updated_at) ON orders TO konzia_app;
CREATE POLICY orders_update ON orders FOR UPDATE TO konzia_app
  USING (app_user_org_role(organization_id) IN ('owner', 'sales', 'buyer', 'logistics'))
  WITH CHECK (app_user_org_role(organization_id) IN ('owner', 'sales', 'buyer', 'logistics'));

GRANT INSERT ON order_events TO konzia_app;
CREATE POLICY order_events_insert ON order_events FOR INSERT TO konzia_app
  WITH CHECK (organization_id IN (SELECT app_user_org_ids()) AND actor_user_id = app_current_user_id());

ALTER TABLE order_adjustments ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON order_adjustments TO konzia_app;
CREATE POLICY adj_select ON order_adjustments FOR SELECT TO konzia_app
  USING (organization_id IN (SELECT app_user_org_ids()) OR customer_user_id = app_current_user_id());
CREATE POLICY adj_insert ON order_adjustments FOR INSERT TO konzia_app
  WITH CHECK (app_user_org_role(organization_id) IN ('owner', 'sales') AND status = 'proposed'
              AND proposed_by = app_current_user_id());
