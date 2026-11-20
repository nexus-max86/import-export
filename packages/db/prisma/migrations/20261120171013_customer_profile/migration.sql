-- CreateTable
CREATE TABLE "customer_profiles" (
    "user_id" UUID NOT NULL,
    "city_id" UUID,
    "service_zone_id" UUID,
    "delivery_instructions" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "customer_profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "addresses" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "city_id" UUID NOT NULL,
    "service_zone_id" UUID,
    "line" TEXT NOT NULL,
    "landmark" TEXT,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "addresses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "addresses_user_id_idx" ON "addresses"("user_id");

-- AddForeignKey
ALTER TABLE "customer_profiles" ADD CONSTRAINT "customer_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_profiles" ADD CONSTRAINT "customer_profiles_city_id_fkey" FOREIGN KEY ("city_id") REFERENCES "cities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_profiles" ADD CONSTRAINT "customer_profiles_service_zone_id_fkey" FOREIGN KEY ("service_zone_id") REFERENCES "service_zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_city_id_fkey" FOREIGN KEY ("city_id") REFERENCES "cities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_service_zone_id_fkey" FOREIGN KEY ("service_zone_id") REFERENCES "service_zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Une seule adresse par défaut par utilisateur.
CREATE UNIQUE INDEX addresses_one_default ON addresses (user_id) WHERE is_default;

-- Données personnelles : chacun ne voit et ne modifie que les siennes.
ALTER TABLE customer_profiles ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON customer_profiles TO konzia_app;
GRANT UPDATE (city_id, service_zone_id, delivery_instructions, updated_at) ON customer_profiles TO konzia_app;
CREATE POLICY profiles_own ON customer_profiles FOR ALL TO konzia_app
  USING (user_id = app_current_user_id())
  WITH CHECK (user_id = app_current_user_id());

ALTER TABLE addresses ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, DELETE ON addresses TO konzia_app;
GRANT UPDATE (label, city_id, service_zone_id, line, landmark, is_default, updated_at) ON addresses TO konzia_app;
CREATE POLICY addresses_own ON addresses FOR ALL TO konzia_app
  USING (user_id = app_current_user_id())
  WITH CHECK (user_id = app_current_user_id());
