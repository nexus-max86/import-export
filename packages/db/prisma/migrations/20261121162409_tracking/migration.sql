-- AlterTable
ALTER TABLE "parcels" ADD COLUMN     "current_step_code" TEXT,
ADD COLUMN     "route_template_id" UUID;

-- CreateTable
CREATE TABLE "route_templates" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "name" TEXT NOT NULL,
    "mode" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "route_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "route_template_steps" (
    "id" UUID NOT NULL,
    "route_template_id" UUID NOT NULL,
    "organization_id" UUID,
    "position" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "label_fr" TEXT NOT NULL,
    "visible_to_customer" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "route_template_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parcel_events" (
    "id" UUID NOT NULL,
    "parcel_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "step_code" TEXT NOT NULL,
    "anomaly_type" TEXT,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL,
    "recorded_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "location" TEXT,
    "note" TEXT,
    "photo_file_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "visible_to_customer" BOOLEAN NOT NULL DEFAULT true,
    "shipment_event_id" UUID,
    "recorded_by" UUID NOT NULL,

    CONSTRAINT "parcel_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipments" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "mode" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "carrier" TEXT,
    "reference" TEXT,
    "tracking_number" TEXT,
    "departure_est" TIMESTAMPTZ(3),
    "departure_at" TIMESTAMPTZ(3),
    "arrival_est" TIMESTAMPTZ(3),
    "arrival_at" TIMESTAMPTZ(3),
    "cost_amount" BIGINT,
    "currency" CHAR(3),
    "status" TEXT NOT NULL DEFAULT 'planned',
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "shipments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipment_parcels" (
    "id" UUID NOT NULL,
    "shipment_id" UUID NOT NULL,
    "parcel_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "added_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "added_by" UUID NOT NULL,
    "removed_at" TIMESTAMPTZ(3),
    "removed_by" UUID,
    "removed_reason" TEXT,

    CONSTRAINT "shipment_parcels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipment_events" (
    "id" UUID NOT NULL,
    "shipment_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "step_code" TEXT NOT NULL,
    "anomaly_type" TEXT,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL,
    "recorded_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "location" TEXT,
    "note" TEXT,
    "recorded_by" UUID NOT NULL,

    CONSTRAINT "shipment_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "route_templates_organization_id_idx" ON "route_templates"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "route_template_steps_route_template_id_position_key" ON "route_template_steps"("route_template_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "route_template_steps_route_template_id_code_key" ON "route_template_steps"("route_template_id", "code");

-- CreateIndex
CREATE INDEX "parcel_events_parcel_id_recorded_at_idx" ON "parcel_events"("parcel_id", "recorded_at");

-- CreateIndex
CREATE INDEX "shipments_organization_id_status_idx" ON "shipments"("organization_id", "status");

-- CreateIndex
CREATE INDEX "shipment_parcels_shipment_id_idx" ON "shipment_parcels"("shipment_id");

-- CreateIndex
CREATE INDEX "shipment_parcels_parcel_id_idx" ON "shipment_parcels"("parcel_id");

-- CreateIndex
CREATE INDEX "shipment_events_shipment_id_recorded_at_idx" ON "shipment_events"("shipment_id", "recorded_at");

-- AddForeignKey
ALTER TABLE "route_template_steps" ADD CONSTRAINT "route_template_steps_route_template_id_fkey" FOREIGN KEY ("route_template_id") REFERENCES "route_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parcel_events" ADD CONSTRAINT "parcel_events_parcel_id_fkey" FOREIGN KEY ("parcel_id") REFERENCES "parcels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipment_parcels" ADD CONSTRAINT "shipment_parcels_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "shipments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipment_parcels" ADD CONSTRAINT "shipment_parcels_parcel_id_fkey" FOREIGN KEY ("parcel_id") REFERENCES "parcels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipment_events" ADD CONSTRAINT "shipment_events_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "shipments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Modèle global (cahier §5.4) : étapes de colis, de la réception à l'entrepôt à la livraison.
INSERT INTO route_templates (id, organization_id, name, mode) VALUES
  ('00000000-0000-7000-8000-000000000001', NULL, 'Itinéraire standard (toutes les étapes)', NULL);
INSERT INTO route_template_steps (id, route_template_id, position, code, label_fr, visible_to_customer) VALUES
  (gen_random_uuid(), '00000000-0000-7000-8000-000000000001', 1, 'received_origin_warehouse', 'Reçu à l’entrepôt d’origine', true),
  (gen_random_uuid(), '00000000-0000-7000-8000-000000000001', 2, 'checked', 'Contrôlé', false),
  (gen_random_uuid(), '00000000-0000-7000-8000-000000000001', 3, 'weighed', 'Pesé et mesuré', true),
  (gen_random_uuid(), '00000000-0000-7000-8000-000000000001', 4, 'consolidated', 'Regroupé ou reconditionné', false),
  (gen_random_uuid(), '00000000-0000-7000-8000-000000000001', 5, 'ready_international', 'Prêt à l’expédition internationale', true),
  (gen_random_uuid(), '00000000-0000-7000-8000-000000000001', 6, 'shipped_to_drc', 'Expédié vers la RDC', true),
  (gen_random_uuid(), '00000000-0000-7000-8000-000000000001', 7, 'in_transit', 'En transit', true),
  (gen_random_uuid(), '00000000-0000-7000-8000-000000000001', 8, 'arrived_drc', 'Arrivé en RDC', true),
  (gen_random_uuid(), '00000000-0000-7000-8000-000000000001', 9, 'customs', 'En formalités douanières', true),
  (gen_random_uuid(), '00000000-0000-7000-8000-000000000001', 10, 'released', 'Libéré', true),
  (gen_random_uuid(), '00000000-0000-7000-8000-000000000001', 11, 'at_distribution_point', 'Arrivé au point de distribution', true),
  (gen_random_uuid(), '00000000-0000-7000-8000-000000000001', 12, 'ready_for_handover', 'Prêt pour retrait ou livraison', true),
  (gen_random_uuid(), '00000000-0000-7000-8000-000000000001', 13, 'out_for_delivery', 'En cours de livraison locale', true),
  (gen_random_uuid(), '00000000-0000-7000-8000-000000000001', 14, 'delivered', 'Livré', true);

ALTER TABLE route_template_steps ADD CONSTRAINT rts_position CHECK (position >= 1);
ALTER TABLE parcel_events
  ADD CONSTRAINT pe_kind CHECK (kind IN ('step', 'anomaly', 'correction')),
  ADD CONSTRAINT pe_anomaly CHECK ((kind = 'anomaly') = (anomaly_type IS NOT NULL)
                                   AND anomaly_type IS DISTINCT FROM '' ),
  ADD CONSTRAINT pe_anomaly_type CHECK (anomaly_type IS NULL OR anomaly_type IN ('blocked', 'lost', 'damaged')),
  ADD CONSTRAINT pe_correction_note CHECK (kind <> 'correction' OR coalesce(trim(note), '') <> '');
ALTER TABLE shipment_events
  ADD CONSTRAINT se_kind CHECK (kind IN ('step', 'anomaly', 'correction')),
  ADD CONSTRAINT se_anomaly_type CHECK (anomaly_type IS NULL OR anomaly_type IN ('blocked', 'lost', 'damaged'));
ALTER TABLE shipments
  ADD CONSTRAINT shipment_mode CHECK (mode IN ('air', 'sea', 'road', 'mixed', 'other')),
  ADD CONSTRAINT shipment_status CHECK (status IN ('planned', 'in_transit', 'arrived', 'cancelled')),
  ADD CONSTRAINT shipment_cost CHECK ((cost_amount IS NULL OR cost_amount >= 0)
                                      AND (cost_amount IS NULL OR currency IN ('USD', 'CNY', 'CDF')));
ALTER TABLE shipment_parcels
  ADD CONSTRAINT sp_removal CHECK (
    (removed_at IS NULL AND removed_by IS NULL AND removed_reason IS NULL)
    OR (removed_at IS NOT NULL AND removed_by IS NOT NULL AND coalesce(trim(removed_reason), '') <> ''));
-- Un colis n'appartient qu'à une expédition active à la fois.
CREATE UNIQUE INDEX shipment_parcels_active_key ON shipment_parcels (parcel_id) WHERE removed_at IS NULL;

-- Historique : jamais supprimé, les événements jamais modifiés.
CREATE TRIGGER route_templates_no_delete BEFORE DELETE ON route_templates FOR EACH ROW EXECUTE FUNCTION forbid_delete();
CREATE TRIGGER route_template_steps_no_delete BEFORE DELETE ON route_template_steps FOR EACH ROW EXECUTE FUNCTION forbid_delete();
CREATE TRIGGER parcel_events_no_delete BEFORE DELETE ON parcel_events FOR EACH ROW EXECUTE FUNCTION forbid_delete();
CREATE TRIGGER shipments_no_delete BEFORE DELETE ON shipments FOR EACH ROW EXECUTE FUNCTION forbid_delete();
CREATE TRIGGER shipment_parcels_no_delete BEFORE DELETE ON shipment_parcels FOR EACH ROW EXECUTE FUNCTION forbid_delete();
CREATE TRIGGER shipment_events_no_delete BEFORE DELETE ON shipment_events FOR EACH ROW EXECUTE FUNCTION forbid_delete();
CREATE OR REPLACE FUNCTION forbid_update() RETURNS trigger LANGUAGE plpgsql AS $$
  BEGIN
    RAISE EXCEPTION '% est en insertion seule : corrigez par un nouvel événement', TG_TABLE_NAME;
  END
  $$;
CREATE TRIGGER parcel_events_immutable BEFORE UPDATE ON parcel_events FOR EACH ROW EXECUTE FUNCTION forbid_update();
CREATE TRIGGER shipment_events_immutable BEFORE UPDATE ON shipment_events FOR EACH ROW EXECUTE FUNCTION forbid_update();
CREATE TRIGGER route_template_steps_immutable BEFORE UPDATE ON route_template_steps FOR EACH ROW EXECUTE FUNCTION forbid_update();

-- RLS. Itinéraires : modèle global lisible par tous les membres d'une organisation.
ALTER TABLE route_templates ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON route_templates TO konzia_app;
GRANT UPDATE (is_active) ON route_templates TO konzia_app;
CREATE POLICY rt_select ON route_templates FOR SELECT TO konzia_app
  USING (organization_id IS NULL OR organization_id IN (SELECT app_user_org_ids()));
CREATE POLICY rt_insert ON route_templates FOR INSERT TO konzia_app
  WITH CHECK (app_user_org_role(organization_id) IN ('owner', 'logistics'));
CREATE POLICY rt_update ON route_templates FOR UPDATE TO konzia_app
  USING (app_user_org_role(organization_id) IN ('owner', 'logistics'))
  WITH CHECK (app_user_org_role(organization_id) IN ('owner', 'logistics'));

ALTER TABLE route_template_steps ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON route_template_steps TO konzia_app;
CREATE POLICY rts_select ON route_template_steps FOR SELECT TO konzia_app
  USING (organization_id IS NULL OR organization_id IN (SELECT app_user_org_ids()));
CREATE POLICY rts_insert ON route_template_steps FOR INSERT TO konzia_app
  WITH CHECK (app_user_org_role(organization_id) IN ('owner', 'logistics')
              AND EXISTS (SELECT 1 FROM route_templates t WHERE t.id = route_template_id
                          AND t.organization_id = route_template_steps.organization_id));

GRANT UPDATE (route_template_id, current_step_code) ON parcels TO konzia_app;

ALTER TABLE parcel_events ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON parcel_events TO konzia_app;
CREATE POLICY pe_select ON parcel_events FOR SELECT TO konzia_app
  USING (organization_id IN (SELECT app_user_org_ids()));
CREATE POLICY pe_insert ON parcel_events FOR INSERT TO konzia_app
  WITH CHECK (app_user_org_role(organization_id) IN ('owner', 'logistics') AND recorded_by = app_current_user_id()
              AND EXISTS (SELECT 1 FROM parcels p WHERE p.id = parcel_id AND p.organization_id = parcel_events.organization_id));

ALTER TABLE shipments ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON shipments TO konzia_app;
GRANT UPDATE (carrier, reference, tracking_number, departure_est, departure_at, arrival_est, arrival_at,
              cost_amount, currency, status, mode, origin, destination, updated_at) ON shipments TO konzia_app;
CREATE POLICY sh_select ON shipments FOR SELECT TO konzia_app
  USING (organization_id IN (SELECT app_user_org_ids()));
CREATE POLICY sh_insert ON shipments FOR INSERT TO konzia_app
  WITH CHECK (app_user_org_role(organization_id) IN ('owner', 'logistics') AND created_by = app_current_user_id());
CREATE POLICY sh_update ON shipments FOR UPDATE TO konzia_app
  USING (app_user_org_role(organization_id) IN ('owner', 'logistics'))
  WITH CHECK (app_user_org_role(organization_id) IN ('owner', 'logistics'));

ALTER TABLE shipment_parcels ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON shipment_parcels TO konzia_app;
GRANT UPDATE (removed_at, removed_by, removed_reason) ON shipment_parcels TO konzia_app;
CREATE POLICY sp_select ON shipment_parcels FOR SELECT TO konzia_app
  USING (organization_id IN (SELECT app_user_org_ids()));
CREATE POLICY sp_insert ON shipment_parcels FOR INSERT TO konzia_app
  WITH CHECK (app_user_org_role(organization_id) IN ('owner', 'logistics') AND added_by = app_current_user_id()
              AND EXISTS (SELECT 1 FROM shipments s WHERE s.id = shipment_id AND s.organization_id = shipment_parcels.organization_id)
              AND EXISTS (SELECT 1 FROM parcels p WHERE p.id = parcel_id AND p.organization_id = shipment_parcels.organization_id));
CREATE POLICY sp_update ON shipment_parcels FOR UPDATE TO konzia_app
  USING (app_user_org_role(organization_id) IN ('owner', 'logistics'))
  WITH CHECK (app_user_org_role(organization_id) IN ('owner', 'logistics') AND removed_by = app_current_user_id());

ALTER TABLE shipment_events ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON shipment_events TO konzia_app;
CREATE POLICY se_select ON shipment_events FOR SELECT TO konzia_app
  USING (organization_id IN (SELECT app_user_org_ids()));
CREATE POLICY se_insert ON shipment_events FOR INSERT TO konzia_app
  WITH CHECK (app_user_org_role(organization_id) IN ('owner', 'logistics') AND recorded_by = app_current_user_id()
              AND EXISTS (SELECT 1 FROM shipments s WHERE s.id = shipment_id AND s.organization_id = shipment_events.organization_id));
