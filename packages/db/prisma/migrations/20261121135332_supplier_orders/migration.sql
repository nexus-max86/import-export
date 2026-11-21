-- CreateEnum
CREATE TYPE "PurchaseRule" AS ENUM ('full_payment', 'deposit', 'own_funds');

-- CreateEnum
CREATE TYPE "SupplierOrderStatus" AS ENUM ('placed', 'shipped_by_seller', 'partially_received', 'received', 'refunded', 'cancelled');

-- AlterEnum
ALTER TYPE "FilePurpose" ADD VALUE 'purchase_proof';

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "deposit_bps" INTEGER,
ADD COLUMN     "purchase_rule" "PurchaseRule" NOT NULL DEFAULT 'full_payment';

-- CreateTable
CREATE TABLE "supplier_orders" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "marketplace" TEXT,
    "store_name" TEXT NOT NULL,
    "external_ref" TEXT,
    "purchased_at" TIMESTAMPTZ(3) NOT NULL,
    "amount" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "conversion_fee_amount" BIGINT NOT NULL DEFAULT 0,
    "seller_tracking_number" TEXT,
    "proof_file_id" UUID,
    "note" TEXT,
    "status" "SupplierOrderStatus" NOT NULL DEFAULT 'placed',
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "supplier_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_order_items" (
    "id" UUID NOT NULL,
    "supplier_order_id" UUID NOT NULL,
    "order_item_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "qty_purchased" INTEGER NOT NULL,
    "qty_received" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "supplier_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "supplier_orders_organization_id_status_idx" ON "supplier_orders"("organization_id", "status");

-- CreateIndex
CREATE INDEX "supplier_order_items_order_item_id_idx" ON "supplier_order_items"("order_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_order_items_supplier_order_id_order_item_id_key" ON "supplier_order_items"("supplier_order_id", "order_item_id");

-- AddForeignKey
ALTER TABLE "supplier_order_items" ADD CONSTRAINT "supplier_order_items_supplier_order_id_fkey" FOREIGN KEY ("supplier_order_id") REFERENCES "supplier_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_order_items" ADD CONSTRAINT "supplier_order_items_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE orders
  ADD CONSTRAINT order_deposit CHECK (
    (purchase_rule = 'deposit' AND deposit_bps BETWEEN 1 AND 10000) OR (purchase_rule <> 'deposit' AND deposit_bps IS NULL));
GRANT UPDATE (purchase_rule, deposit_bps) ON orders TO konzia_app;
GRANT UPDATE (qty_purchased, qty_received, updated_at) ON order_items TO konzia_app;
CREATE POLICY order_items_update ON order_items FOR UPDATE TO konzia_app
  USING (app_user_org_role(organization_id) IN ('owner', 'buyer'))
  WITH CHECK (app_user_org_role(organization_id) IN ('owner', 'buyer'));

ALTER TABLE supplier_orders
  ADD CONSTRAINT so_amount CHECK (amount > 0 AND conversion_fee_amount >= 0),
  ADD CONSTRAINT so_currency CHECK (currency IN ('USD', 'CNY', 'CDF'));
ALTER TABLE supplier_order_items
  ADD CONSTRAINT soi_qty CHECK (qty_purchased >= 1 AND qty_received BETWEEN 0 AND qty_purchased);

-- Règle d'achat vérifiée par la base : passage en « achat en cours » seulement si la règle est satisfaite.
CREATE OR REPLACE FUNCTION order_net_paid(o uuid) RETURNS bigint
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$
    SELECT coalesce(sum(CASE WHEN kind = 'refund' THEN -order_amount ELSE order_amount END), 0)::bigint
    FROM payments
    WHERE order_id = o AND status = 'confirmed'
      -- Réservé aux membres de l'organisation de la commande (la fonction contourne la RLS de payments).
      AND organization_id IN (SELECT app_user_org_ids())
  $$;
REVOKE ALL ON FUNCTION order_net_paid(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION order_net_paid(uuid) TO konzia_app;

CREATE OR REPLACE FUNCTION orders_app_transition() RETURNS trigger
  LANGUAGE plpgsql AS $$
  DECLARE paid bigint;
  BEGIN
    IF current_user = 'konzia_app' AND NEW.status IS DISTINCT FROM OLD.status THEN
      IF NOT (
        (OLD.status IN ('awaiting_payment', 'payment_to_verify', 'paid') AND NEW.status = 'purchasing')
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
      IF NEW.status = 'purchasing' AND OLD.status <> 'paid' THEN
        paid := order_net_paid(NEW.id);
        IF NEW.purchase_rule = 'full_payment'
           OR (NEW.purchase_rule = 'deposit' AND paid * 10000 < NEW.final_amount * NEW.deposit_bps) THEN
          RAISE EXCEPTION 'règle d''achat non satisfaite';
        END IF;
      END IF;
    END IF;
    IF NEW.status = 'cancelled' AND OLD.status <> 'cancelled' AND coalesce(trim(NEW.cancelled_reason), '') = '' THEN
      RAISE EXCEPTION 'une annulation exige un motif';
    END IF;
    RETURN NEW;
  END
  $$;

CREATE TRIGGER supplier_orders_no_delete BEFORE DELETE ON supplier_orders FOR EACH ROW EXECUTE FUNCTION forbid_delete();
CREATE TRIGGER supplier_order_items_no_delete BEFORE DELETE ON supplier_order_items FOR EACH ROW EXECUTE FUNCTION forbid_delete();

-- RLS : coûts réels réservés au commissionnaire (docs/04 : propriétaire et acheteur ; lecture comptable).
ALTER TABLE supplier_orders ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON supplier_orders TO konzia_app;
GRANT UPDATE (seller_tracking_number, status, note, updated_at) ON supplier_orders TO konzia_app;
CREATE POLICY so_select ON supplier_orders FOR SELECT TO konzia_app
  USING (app_user_org_role(organization_id) IN ('owner', 'buyer', 'accountant'));
CREATE POLICY so_insert ON supplier_orders FOR INSERT TO konzia_app
  WITH CHECK (app_user_org_role(organization_id) IN ('owner', 'buyer') AND created_by = app_current_user_id());
CREATE POLICY so_update ON supplier_orders FOR UPDATE TO konzia_app
  USING (app_user_org_role(organization_id) IN ('owner', 'buyer'))
  WITH CHECK (app_user_org_role(organization_id) IN ('owner', 'buyer'));

ALTER TABLE supplier_order_items ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON supplier_order_items TO konzia_app;
GRANT UPDATE (qty_received, updated_at) ON supplier_order_items TO konzia_app;
CREATE POLICY soi_select ON supplier_order_items FOR SELECT TO konzia_app
  USING (app_user_org_role(organization_id) IN ('owner', 'buyer', 'accountant'));
CREATE POLICY soi_insert ON supplier_order_items FOR INSERT TO konzia_app
  WITH CHECK (app_user_org_role(organization_id) IN ('owner', 'buyer')
              AND EXISTS (SELECT 1 FROM order_items oi WHERE oi.id = order_item_id AND oi.organization_id = supplier_order_items.organization_id));
CREATE POLICY soi_update ON supplier_order_items FOR UPDATE TO konzia_app
  USING (app_user_org_role(organization_id) IN ('owner', 'buyer'))
  WITH CHECK (app_user_org_role(organization_id) IN ('owner', 'buyer'));
