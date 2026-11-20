-- CreateEnum
CREATE TYPE "HandoverMode" AS ENUM ('pickup', 'delivery', 'partner_point');

-- CreateTable
CREATE TABLE "cities" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'CD',
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "timezone" TEXT NOT NULL DEFAULT 'Africa/Lubumbashi',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "cities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_zones" (
    "id" UUID NOT NULL,
    "city_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "service_zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_service_zones" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "service_zone_id" UUID NOT NULL,
    "handover_modes" "HandoverMode"[],
    "local_fee_amount" BIGINT,
    "local_fee_currency" CHAR(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "organization_service_zones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cities_name_key" ON "cities"("name");

-- CreateIndex
CREATE UNIQUE INDEX "service_zones_city_id_name_key" ON "service_zones"("city_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "organization_service_zones_organization_id_service_zone_id_key" ON "organization_service_zones"("organization_id", "service_zone_id");

-- AddForeignKey
ALTER TABLE "service_zones" ADD CONSTRAINT "service_zones_city_id_fkey" FOREIGN KEY ("city_id") REFERENCES "cities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_service_zones" ADD CONSTRAINT "organization_service_zones_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_service_zones" ADD CONSTRAINT "organization_service_zones_service_zone_id_fkey" FOREIGN KEY ("service_zone_id") REFERENCES "service_zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Contrôles d'intégrité
ALTER TABLE organization_service_zones
  ADD CONSTRAINT osz_fee_currency CHECK (
    (local_fee_amount IS NULL AND local_fee_currency IS NULL)
    OR (local_fee_amount >= 0 AND local_fee_currency IN ('USD', 'CDF'))
  ),
  ADD CONSTRAINT osz_handover_not_empty CHECK (cardinality(handover_modes) > 0);

-- Référentiel : lecture pour tous, écriture par l'administration (chemin système audité).
ALTER TABLE cities ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_zones ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON cities, service_zones TO konzia_app;
CREATE POLICY cities_select ON cities FOR SELECT TO konzia_app USING (true);
CREATE POLICY zones_select ON service_zones FOR SELECT TO konzia_app USING (true);

-- Zones d'un commissionnaire : visibles des membres et publiques si l'organisation est approuvée.
ALTER TABLE organization_service_zones ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, DELETE ON organization_service_zones TO konzia_app;
GRANT UPDATE (handover_modes, local_fee_amount, local_fee_currency, updated_at) ON organization_service_zones TO konzia_app;
CREATE POLICY osz_select ON organization_service_zones FOR SELECT TO konzia_app
  USING (
    organization_id IN (SELECT app_user_org_ids())
    OR EXISTS (SELECT 1 FROM organizations o WHERE o.id = organization_id AND o.status = 'approved')
  );
CREATE POLICY osz_write ON organization_service_zones FOR INSERT TO konzia_app
  WITH CHECK (app_user_org_role(organization_id) = 'owner');
CREATE POLICY osz_update ON organization_service_zones FOR UPDATE TO konzia_app
  USING (app_user_org_role(organization_id) = 'owner')
  WITH CHECK (app_user_org_role(organization_id) = 'owner');
CREATE POLICY osz_delete ON organization_service_zones FOR DELETE TO konzia_app
  USING (app_user_org_role(organization_id) = 'owner');

-- Données de référence du pilote (cahier §8). Lubumbashi active ; les autres villes prêtes.
INSERT INTO cities (id, name, is_active, updated_at) VALUES
  (gen_random_uuid(), 'Lubumbashi', true, now()),
  (gen_random_uuid(), 'Likasi', false, now()),
  (gen_random_uuid(), 'Kasumbalesa', false, now()),
  (gen_random_uuid(), 'Kipushi', false, now())
ON CONFLICT (name) DO NOTHING;

-- Les 7 communes de Lubumbashi.
INSERT INTO service_zones (id, city_id, name, updated_at)
SELECT gen_random_uuid(), c.id, z.name, now()
FROM cities c
CROSS JOIN (VALUES ('Lubumbashi'), ('Kamalondo'), ('Kenya'), ('Katuba'), ('Kampemba'), ('Annexe'), ('Rwashi')) AS z(name)
WHERE c.name = 'Lubumbashi'
ON CONFLICT (city_id, name) DO NOTHING;
