-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('draft', 'sent', 'accepted', 'rejected', 'changes_requested', 'expired', 'withdrawn');

-- CreateEnum
CREATE TYPE "QuoteVersionStatus" AS ENUM ('draft', 'sent', 'superseded', 'accepted', 'rejected', 'expired', 'withdrawn');

-- CreateEnum
CREATE TYPE "QuoteLineKind" AS ENUM ('product', 'seller_shipping', 'service_fee', 'international_shipping', 'handling', 'customs_estimate', 'local_delivery', 'insurance', 'discount');

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "commission_bps" INTEGER,
ADD COLUMN     "transport_per_kg_amount" BIGINT,
ADD COLUMN     "transport_per_kg_currency" CHAR(3);

-- CreateTable
CREATE TABLE "quotes" (
    "id" UUID NOT NULL,
    "recipient_id" UUID NOT NULL,
    "quote_request_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "org_customer_id" UUID NOT NULL,
    "customer_user_id" UUID,
    "status" "QuoteStatus" NOT NULL DEFAULT 'draft',
    "change_request" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_versions" (
    "id" UUID NOT NULL,
    "quote_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "version_no" INTEGER NOT NULL,
    "status" "QuoteVersionStatus" NOT NULL DEFAULT 'draft',
    "currency" CHAR(3) NOT NULL,
    "products_amount" BIGINT NOT NULL DEFAULT 0,
    "total_amount" BIGINT NOT NULL DEFAULT 0,
    "fx_usd_cdf" DECIMAL(18,8),
    "fx_usd_cny" DECIMAL(18,8),
    "fx_source" TEXT,
    "fx_at" TIMESTAMPTZ(3),
    "valid_until" TIMESTAMPTZ(3) NOT NULL,
    "lead_time_min_days" INTEGER NOT NULL,
    "lead_time_max_days" INTEGER NOT NULL,
    "weight_grams" INTEGER,
    "assumptions" TEXT,
    "cancellation_terms" TEXT,
    "sent_at" TIMESTAMPTZ(3),
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "quote_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_lines" (
    "id" UUID NOT NULL,
    "quote_version_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "kind" "QuoteLineKind" NOT NULL,
    "quote_request_item_id" UUID,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_amount" BIGINT NOT NULL,
    "amount" BIGINT NOT NULL,
    "is_estimate" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quote_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "quotes_recipient_id_key" ON "quotes"("recipient_id");

-- CreateIndex
CREATE INDEX "quotes_quote_request_id_idx" ON "quotes"("quote_request_id");

-- CreateIndex
CREATE INDEX "quotes_organization_id_status_idx" ON "quotes"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "quote_versions_quote_id_version_no_key" ON "quote_versions"("quote_id", "version_no");

-- CreateIndex
CREATE INDEX "quote_lines_quote_version_id_idx" ON "quote_lines"("quote_version_id");

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "quote_request_recipients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_versions" ADD CONSTRAINT "quote_versions_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "quotes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_lines" ADD CONSTRAINT "quote_lines_quote_version_id_fkey" FOREIGN KEY ("quote_version_id") REFERENCES "quote_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE organizations
  ADD CONSTRAINT org_commission CHECK (commission_bps IS NULL OR commission_bps BETWEEN 0 AND 10000),
  ADD CONSTRAINT org_transport CHECK (
    (transport_per_kg_amount IS NULL AND transport_per_kg_currency IS NULL)
    OR (transport_per_kg_amount >= 0 AND transport_per_kg_currency IN ('USD', 'CDF')));
GRANT UPDATE (commission_bps, transport_per_kg_amount, transport_per_kg_currency) ON organizations TO konzia_app;

ALTER TABLE quote_versions
  ADD CONSTRAINT qv_currency CHECK (currency IN ('USD', 'CDF')),
  ADD CONSTRAINT qv_lead CHECK (lead_time_min_days >= 1 AND lead_time_max_days >= lead_time_min_days);
ALTER TABLE quote_lines
  ADD CONSTRAINT ql_amount CHECK (
    (kind = 'discount' AND amount = -(quantity::bigint * unit_amount))
    OR (kind <> 'discount' AND amount = quantity::bigint * unit_amount)),
  ADD CONSTRAINT ql_qty CHECK (quantity >= 1 AND unit_amount >= 0);
-- Une seule version en préparation par devis.
CREATE UNIQUE INDEX qv_one_draft ON quote_versions (quote_id) WHERE status = 'draft';

-- Version figée dès l'envoi : seul le statut peut encore évoluer, pour TOUS les rôles.
CREATE OR REPLACE FUNCTION quote_versions_frozen() RETURNS trigger
  LANGUAGE plpgsql AS $$
  BEGIN
    IF TG_OP = 'DELETE' THEN
      IF OLD.status <> 'draft' THEN RAISE EXCEPTION 'version de devis figée'; END IF;
      RETURN OLD;
    END IF;
    IF OLD.status <> 'draft' AND (
      NEW.currency, NEW.products_amount, NEW.total_amount, NEW.fx_usd_cdf, NEW.fx_usd_cny, NEW.fx_source,
      NEW.fx_at, NEW.valid_until, NEW.lead_time_min_days, NEW.lead_time_max_days, NEW.weight_grams,
      NEW.assumptions, NEW.cancellation_terms, NEW.sent_at, NEW.version_no, NEW.quote_id
    ) IS DISTINCT FROM (
      OLD.currency, OLD.products_amount, OLD.total_amount, OLD.fx_usd_cdf, OLD.fx_usd_cny, OLD.fx_source,
      OLD.fx_at, OLD.valid_until, OLD.lead_time_min_days, OLD.lead_time_max_days, OLD.weight_grams,
      OLD.assumptions, OLD.cancellation_terms, OLD.sent_at, OLD.version_no, OLD.quote_id
    ) THEN
      RAISE EXCEPTION 'version de devis figée';
    END IF;
    RETURN NEW;
  END
  $$;
CREATE TRIGGER quote_versions_frozen BEFORE UPDATE OR DELETE ON quote_versions
  FOR EACH ROW EXECUTE FUNCTION quote_versions_frozen();

CREATE OR REPLACE FUNCTION quote_lines_frozen() RETURNS trigger
  LANGUAGE plpgsql AS $$
  DECLARE v_status "QuoteVersionStatus";
  BEGIN
    SELECT status INTO v_status FROM quote_versions
      WHERE id = COALESCE(NEW.quote_version_id, OLD.quote_version_id);
    IF v_status IS DISTINCT FROM 'draft' THEN RAISE EXCEPTION 'version de devis figée'; END IF;
    RETURN COALESCE(NEW, OLD);
  END
  $$;
CREATE TRIGGER quote_lines_frozen BEFORE INSERT OR UPDATE OR DELETE ON quote_lines
  FOR EACH ROW EXECUTE FUNCTION quote_lines_frozen();

-- --- RLS -------------------------------------------------------------------------
-- Commissionnaire : ses devis (écriture des brouillons par propriétaire et commerciaux).
-- Client : ses devis, versions et lignes déjà envoyées uniquement (jamais les brouillons).
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON quotes TO konzia_app;
GRANT UPDATE (status, change_request, updated_at) ON quotes TO konzia_app;
CREATE POLICY quotes_select ON quotes FOR SELECT TO konzia_app
  USING (organization_id IN (SELECT app_user_org_ids())
         OR (customer_user_id = app_current_user_id() AND status <> 'draft'));
CREATE POLICY quotes_insert ON quotes FOR INSERT TO konzia_app
  WITH CHECK (app_user_org_role(organization_id) IN ('owner', 'sales') AND status = 'draft');
CREATE POLICY quotes_update ON quotes FOR UPDATE TO konzia_app
  USING (app_user_org_role(organization_id) IN ('owner', 'sales'))
  WITH CHECK (app_user_org_role(organization_id) IN ('owner', 'sales') AND status IN ('draft', 'sent', 'withdrawn'));

ALTER TABLE quote_versions ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON quote_versions TO konzia_app;
GRANT UPDATE (currency, products_amount, total_amount, valid_until, lead_time_min_days, lead_time_max_days,
              weight_grams, assumptions, cancellation_terms, updated_at) ON quote_versions TO konzia_app;
CREATE POLICY qv_select ON quote_versions FOR SELECT TO konzia_app
  USING (organization_id IN (SELECT app_user_org_ids())
         OR (status <> 'draft' AND EXISTS (SELECT 1 FROM quotes q WHERE q.id = quote_id AND q.customer_user_id = app_current_user_id())));
CREATE POLICY qv_insert ON quote_versions FOR INSERT TO konzia_app
  WITH CHECK (app_user_org_role(organization_id) IN ('owner', 'sales') AND status = 'draft');
CREATE POLICY qv_update ON quote_versions FOR UPDATE TO konzia_app
  USING (app_user_org_role(organization_id) IN ('owner', 'sales') AND status = 'draft')
  WITH CHECK (app_user_org_role(organization_id) IN ('owner', 'sales') AND status = 'draft');

ALTER TABLE quote_lines ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, DELETE ON quote_lines TO konzia_app;
CREATE POLICY ql_select ON quote_lines FOR SELECT TO konzia_app
  USING (organization_id IN (SELECT app_user_org_ids())
         OR EXISTS (SELECT 1 FROM quote_versions v JOIN quotes q ON q.id = v.quote_id
                    WHERE v.id = quote_version_id AND v.status <> 'draft' AND q.customer_user_id = app_current_user_id()));
CREATE POLICY ql_write ON quote_lines FOR INSERT TO konzia_app
  WITH CHECK (app_user_org_role(organization_id) IN ('owner', 'sales'));
CREATE POLICY ql_delete ON quote_lines FOR DELETE TO konzia_app
  USING (app_user_org_role(organization_id) IN ('owner', 'sales'));
