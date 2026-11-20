-- CreateEnum
CREATE TYPE "OrgCustomerSource" AS ENUM ('signup', 'manual', 'import');

-- CreateEnum
CREATE TYPE "OrgCustomerStatus" AS ENUM ('active', 'merged', 'archived');

-- CreateTable
CREATE TABLE "org_customers" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID,
    "full_name" TEXT NOT NULL,
    "phone_whatsapp" TEXT,
    "email" TEXT,
    "city_id" UUID,
    "service_zone_id" UUID,
    "address_line" TEXT,
    "landmark" TEXT,
    "notes_private" TEXT,
    "source" "OrgCustomerSource" NOT NULL,
    "status" "OrgCustomerStatus" NOT NULL DEFAULT 'active',
    "merged_into_id" UUID,
    "claim_token_hash" TEXT,
    "claim_token_expires_at" TIMESTAMPTZ(3),
    "claimed_at" TIMESTAMPTZ(3),
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "org_customers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "org_customers_claim_token_hash_key" ON "org_customers"("claim_token_hash");

-- CreateIndex
CREATE INDEX "org_customers_organization_id_status_idx" ON "org_customers"("organization_id", "status");

-- CreateIndex
CREATE INDEX "org_customers_user_id_idx" ON "org_customers"("user_id");

-- AddForeignKey
ALTER TABLE "org_customers" ADD CONSTRAINT "org_customers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_customers" ADD CONSTRAINT "org_customers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_customers" ADD CONSTRAINT "org_customers_city_id_fkey" FOREIGN KEY ("city_id") REFERENCES "cities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_customers" ADD CONSTRAINT "org_customers_service_zone_id_fkey" FOREIGN KEY ("service_zone_id") REFERENCES "service_zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Un compte = au plus une fiche active par commissionnaire.
CREATE UNIQUE INDEX org_customers_one_active_per_user
  ON org_customers (organization_id, user_id)
  WHERE user_id IS NOT NULL AND status = 'active';

ALTER TABLE org_customers
  ADD CONSTRAINT org_customers_merge_target CHECK ((status = 'merged') = (merged_into_id IS NOT NULL));

-- Membres : lecture (customer.view = tous les rôles). Écriture : propriétaire et commerciaux.
-- Le rattachement à un compte (user_id, claimed_at, fusion) passe par un chemin système audité.
ALTER TABLE org_customers ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON org_customers TO konzia_app;
GRANT UPDATE (full_name, phone_whatsapp, email, city_id, service_zone_id, address_line, landmark,
              notes_private, status, claim_token_hash, claim_token_expires_at, updated_at)
  ON org_customers TO konzia_app;
CREATE POLICY org_customers_select ON org_customers FOR SELECT TO konzia_app
  USING (organization_id IN (SELECT app_user_org_ids()));
CREATE POLICY org_customers_insert ON org_customers FOR INSERT TO konzia_app
  WITH CHECK (app_user_org_role(organization_id) IN ('owner', 'sales') AND user_id IS NULL);
CREATE POLICY org_customers_update ON org_customers FOR UPDATE TO konzia_app
  USING (app_user_org_role(organization_id) IN ('owner', 'sales'))
  WITH CHECK (app_user_org_role(organization_id) IN ('owner', 'sales') AND status <> 'merged');
