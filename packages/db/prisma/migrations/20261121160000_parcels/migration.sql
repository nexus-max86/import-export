-- AlterEnum (valeur utilisée par la migration suivante)
ALTER TYPE "FilePurpose" ADD VALUE 'parcel_photo';

-- CreateEnum
CREATE TYPE "ParcelStatus" AS ENUM ('open', 'closed', 'delivered', 'lost', 'cancelled');

-- CreateEnum
CREATE TYPE "ParcelCondition" AS ENUM ('ok', 'damaged', 'opened');

-- CreateTable
CREATE TABLE "parcels" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "location_label" TEXT,
    "weight_g" INTEGER,
    "length_mm" INTEGER,
    "width_mm" INTEGER,
    "height_mm" INTEGER,
    "volumetric_divisor" INTEGER NOT NULL DEFAULT 5000,
    "volumetric_weight_g" INTEGER,
    "condition" "ParcelCondition" NOT NULL DEFAULT 'ok',
    "status" "ParcelStatus" NOT NULL DEFAULT 'open',
    "photo_file_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "note" TEXT,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "parcels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parcel_items" (
    "id" UUID NOT NULL,
    "parcel_id" UUID NOT NULL,
    "order_item_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "org_customer_id" UUID NOT NULL,
    "customer_user_id" UUID,
    "quantity" INTEGER NOT NULL,
    "added_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "added_by" UUID NOT NULL,
    "removed_at" TIMESTAMPTZ(3),
    "removed_by" UUID,
    "removed_reason" TEXT,

    CONSTRAINT "parcel_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "parcels_code_key" ON "parcels"("code");

-- CreateIndex
CREATE INDEX "parcels_organization_id_status_idx" ON "parcels"("organization_id", "status");

-- CreateIndex
CREATE INDEX "parcel_items_parcel_id_idx" ON "parcel_items"("parcel_id");

-- CreateIndex
CREATE INDEX "parcel_items_order_item_id_idx" ON "parcel_items"("order_item_id");

-- AddForeignKey
ALTER TABLE "parcel_items" ADD CONSTRAINT "parcel_items_parcel_id_fkey" FOREIGN KEY ("parcel_id") REFERENCES "parcels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parcel_items" ADD CONSTRAINT "parcel_items_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Contrôles de cohérence.
ALTER TABLE parcels
  ADD CONSTRAINT parcel_code CHECK (code ~ '^KZ-P-[0-9A-HJ-NP-Z]{6}$'),
  ADD CONSTRAINT parcel_measures CHECK (
    coalesce(weight_g, 1) > 0 AND coalesce(length_mm, 1) > 0 AND coalesce(width_mm, 1) > 0
    AND coalesce(height_mm, 1) > 0 AND volumetric_divisor BETWEEN 1000 AND 10000);
ALTER TABLE parcel_items
  ADD CONSTRAINT parcel_item_qty CHECK (quantity >= 1),
  ADD CONSTRAINT parcel_item_removal CHECK (
    (removed_at IS NULL AND removed_by IS NULL AND removed_reason IS NULL)
    OR (removed_at IS NOT NULL AND removed_by IS NOT NULL AND coalesce(trim(removed_reason), '') <> ''));
-- Un article n'est présent qu'une fois (actif) dans un même colis.
CREATE UNIQUE INDEX parcel_items_active_key ON parcel_items (parcel_id, order_item_id) WHERE removed_at IS NULL;

-- Jamais plus d'articles en colis que d'articles reçus à l'entrepôt ; verrou par article
-- pour que deux ajouts simultanés (même dans deux colis différents) ne dépassent pas la limite.
CREATE OR REPLACE FUNCTION parcel_items_check_qty() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
  DECLARE received int; packed int;
  BEGIN
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW.order_item_id::text, 0));
    IF TG_OP = 'UPDATE' THEN
      IF NEW.parcel_id <> OLD.parcel_id OR NEW.order_item_id <> OLD.order_item_id
         OR NEW.quantity <> OLD.quantity OR NEW.added_at <> OLD.added_at OR NEW.added_by <> OLD.added_by
         OR NEW.org_customer_id <> OLD.org_customer_id
         OR (OLD.removed_at IS NOT NULL) THEN
        RAISE EXCEPTION 'un article de colis ne se modifie pas : retirez-le puis ajoutez-le à nouveau';
      END IF;
      RETURN NEW;
    END IF;
    SELECT qty_received INTO received FROM order_items WHERE id = NEW.order_item_id;
    SELECT coalesce(sum(quantity), 0) INTO packed FROM parcel_items
      WHERE order_item_id = NEW.order_item_id AND removed_at IS NULL;
    IF packed + NEW.quantity > received THEN
      RAISE EXCEPTION 'quantité en colis supérieure aux articles reçus';
    END IF;
    RETURN NEW;
  END
  $$;
CREATE TRIGGER parcel_items_qty BEFORE INSERT OR UPDATE ON parcel_items
  FOR EACH ROW EXECUTE FUNCTION parcel_items_check_qty();
CREATE TRIGGER parcels_no_delete BEFORE DELETE ON parcels FOR EACH ROW EXECUTE FUNCTION forbid_delete();
CREATE TRIGGER parcel_items_no_delete BEFORE DELETE ON parcel_items FOR EACH ROW EXECUTE FUNCTION forbid_delete();

-- RLS : colis visibles des membres de l'organisation (aucun coût dedans) ;
-- préparation réservée au propriétaire et à la logistique (docs/04).
ALTER TABLE parcels ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON parcels TO konzia_app;
GRANT UPDATE (location_label, weight_g, length_mm, width_mm, height_mm, volumetric_divisor,
              volumetric_weight_g, condition, status, photo_file_ids, note, updated_at) ON parcels TO konzia_app;
CREATE POLICY parcels_select ON parcels FOR SELECT TO konzia_app
  USING (organization_id IN (SELECT app_user_org_ids()));
CREATE POLICY parcels_insert ON parcels FOR INSERT TO konzia_app
  WITH CHECK (app_user_org_role(organization_id) IN ('owner', 'logistics') AND created_by = app_current_user_id()
              AND status = 'open');
CREATE POLICY parcels_update ON parcels FOR UPDATE TO konzia_app
  USING (app_user_org_role(organization_id) IN ('owner', 'logistics'))
  WITH CHECK (app_user_org_role(organization_id) IN ('owner', 'logistics'));

ALTER TABLE parcel_items ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON parcel_items TO konzia_app;
GRANT UPDATE (removed_at, removed_by, removed_reason) ON parcel_items TO konzia_app;
CREATE POLICY parcel_items_select ON parcel_items FOR SELECT TO konzia_app
  USING (organization_id IN (SELECT app_user_org_ids()));
CREATE POLICY parcel_items_insert ON parcel_items FOR INSERT TO konzia_app
  WITH CHECK (app_user_org_role(organization_id) IN ('owner', 'logistics') AND added_by = app_current_user_id()
              AND EXISTS (SELECT 1 FROM parcels p WHERE p.id = parcel_id
                          AND p.organization_id = parcel_items.organization_id AND p.status = 'open')
              AND EXISTS (SELECT 1 FROM order_items oi WHERE oi.id = order_item_id
                          AND oi.organization_id = parcel_items.organization_id));
CREATE POLICY parcel_items_update ON parcel_items FOR UPDATE TO konzia_app
  USING (app_user_org_role(organization_id) IN ('owner', 'logistics'))
  WITH CHECK (app_user_org_role(organization_id) IN ('owner', 'logistics') AND removed_by = app_current_user_id());
