-- CreateEnum
CREATE TYPE "QuoteRequestStatus" AS ENUM ('draft', 'sent', 'partially_quoted', 'quoted', 'expired', 'cancelled', 'converted');

-- CreateEnum
CREATE TYPE "RecipientStatus" AS ENUM ('sent', 'viewed', 'evaluating', 'quoted', 'declined', 'expired');

-- CreateEnum
CREATE TYPE "ItemSource" AS ENUM ('lookup', 'manual');

-- CreateTable
CREATE TABLE "quote_requests" (
    "id" UUID NOT NULL,
    "customer_user_id" UUID,
    "created_by_organization_id" UUID,
    "created_by_user_id" UUID NOT NULL,
    "city_id" UUID,
    "delivery_address" JSONB,
    "note" TEXT,
    "status" "QuoteRequestStatus" NOT NULL DEFAULT 'draft',
    "deadline_at" TIMESTAMPTZ(3),
    "sent_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "quote_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_request_items" (
    "id" UUID NOT NULL,
    "quote_request_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "source" "ItemSource" NOT NULL,
    "source_url" TEXT,
    "marketplace" TEXT,
    "title" TEXT NOT NULL,
    "variant" TEXT,
    "size" TEXT,
    "color" TEXT,
    "quantity" INTEGER NOT NULL,
    "notes" TEXT,
    "image_url" TEXT,
    "indicative_price_amount" BIGINT,
    "indicative_price_currency" CHAR(3),
    "price_fetched_at" TIMESTAMPTZ(3),
    "screenshot_file_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "quote_request_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_request_recipients" (
    "id" UUID NOT NULL,
    "quote_request_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "org_customer_id" UUID NOT NULL,
    "status" "RecipientStatus" NOT NULL DEFAULT 'sent',
    "viewed_at" TIMESTAMPTZ(3),
    "decline_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "quote_request_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "quote_requests_customer_user_id_status_idx" ON "quote_requests"("customer_user_id", "status");

-- CreateIndex
CREATE INDEX "quote_requests_created_by_organization_id_idx" ON "quote_requests"("created_by_organization_id");

-- CreateIndex
CREATE INDEX "quote_request_items_quote_request_id_idx" ON "quote_request_items"("quote_request_id");

-- CreateIndex
CREATE INDEX "quote_request_recipients_organization_id_status_idx" ON "quote_request_recipients"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "quote_request_recipients_quote_request_id_organization_id_key" ON "quote_request_recipients"("quote_request_id", "organization_id");

-- AddForeignKey
ALTER TABLE "quote_requests" ADD CONSTRAINT "quote_requests_city_id_fkey" FOREIGN KEY ("city_id") REFERENCES "cities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_request_items" ADD CONSTRAINT "quote_request_items_quote_request_id_fkey" FOREIGN KEY ("quote_request_id") REFERENCES "quote_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_request_recipients" ADD CONSTRAINT "quote_request_recipients_quote_request_id_fkey" FOREIGN KEY ("quote_request_id") REFERENCES "quote_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_request_recipients" ADD CONSTRAINT "quote_request_recipients_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_request_recipients" ADD CONSTRAINT "quote_request_recipients_org_customer_id_fkey" FOREIGN KEY ("org_customer_id") REFERENCES "org_customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE quote_request_items
  ADD CONSTRAINT qri_quantity CHECK (quantity BETWEEN 1 AND 10000),
  ADD CONSTRAINT qri_price CHECK (
    (indicative_price_amount IS NULL AND indicative_price_currency IS NULL)
    OR (indicative_price_amount >= 0 AND indicative_price_currency ~ '^[A-Z]{3}$' AND price_fetched_at IS NOT NULL)
  );
ALTER TABLE quote_requests
  ADD CONSTRAINT qr_owner CHECK (customer_user_id IS NOT NULL OR created_by_organization_id IS NOT NULL);

-- Fonctions SECURITY DEFINER : évitent la récursion entre politiques des demandes et des destinataires.
CREATE OR REPLACE FUNCTION app_request_org_ids(req uuid) RETURNS SETOF uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$
    SELECT organization_id FROM quote_request_recipients WHERE quote_request_id = req
    UNION
    SELECT created_by_organization_id FROM quote_requests WHERE id = req AND created_by_organization_id IS NOT NULL
  $$;

-- Vrai si l'utilisateur courant voit la demande : son auteur client, ou membre d'une organisation concernée.
CREATE OR REPLACE FUNCTION app_can_see_request(req uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$
    SELECT EXISTS (SELECT 1 FROM quote_requests r WHERE r.id = req AND r.customer_user_id = app_current_user_id())
        OR EXISTS (SELECT 1 FROM app_request_org_ids(req) o WHERE o IN (SELECT app_user_org_ids()))
  $$;

-- Vrai si l'utilisateur courant peut modifier le brouillon (client auteur, ou commerciaux de l'organisation créatrice).
CREATE OR REPLACE FUNCTION app_can_edit_request(req uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$
    SELECT EXISTS (
      SELECT 1 FROM quote_requests r
      WHERE r.id = req AND r.status = 'draft'
        AND (r.customer_user_id = app_current_user_id()
             OR (r.created_by_organization_id IS NOT NULL
                 AND app_user_org_role(r.created_by_organization_id) IN ('owner', 'sales')))
    )
  $$;

REVOKE ALL ON FUNCTION app_request_org_ids(uuid), app_can_see_request(uuid), app_can_edit_request(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_request_org_ids(uuid), app_can_see_request(uuid), app_can_edit_request(uuid) TO konzia_app;

-- --- quote_requests ----------------------------------------------------------
-- L'envoi (création des destinataires et des fiches clients chez les commissionnaires)
-- est un chemin système audité ; le rôle applicatif crée et modifie les brouillons.
ALTER TABLE quote_requests ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON quote_requests TO konzia_app;
GRANT UPDATE (city_id, delivery_address, note, deadline_at, status, updated_at) ON quote_requests TO konzia_app;
CREATE POLICY qr_select ON quote_requests FOR SELECT TO konzia_app USING (app_can_see_request(id));
CREATE POLICY qr_insert ON quote_requests FOR INSERT TO konzia_app
  WITH CHECK (
    status = 'draft' AND created_by_user_id = app_current_user_id()
    AND (
      (customer_user_id = app_current_user_id() AND created_by_organization_id IS NULL)
      OR (customer_user_id IS NULL AND app_user_org_role(created_by_organization_id) IN ('owner', 'sales'))
    )
  );
-- Brouillon modifiable ; seule transition permise au rôle applicatif : annulation.
CREATE POLICY qr_update ON quote_requests FOR UPDATE TO konzia_app
  USING (app_can_see_request(id)
         AND (customer_user_id = app_current_user_id()
              OR app_user_org_role(created_by_organization_id) IN ('owner', 'sales')))
  WITH CHECK (status IN ('draft', 'cancelled'));

-- --- quote_request_items -------------------------------------------------------
ALTER TABLE quote_request_items ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, DELETE ON quote_request_items TO konzia_app;
GRANT UPDATE (variant, size, color, quantity, notes, title, updated_at) ON quote_request_items TO konzia_app;
CREATE POLICY qri_select ON quote_request_items FOR SELECT TO konzia_app USING (app_can_see_request(quote_request_id));
CREATE POLICY qri_insert ON quote_request_items FOR INSERT TO konzia_app WITH CHECK (app_can_edit_request(quote_request_id));
CREATE POLICY qri_update ON quote_request_items FOR UPDATE TO konzia_app
  USING (app_can_edit_request(quote_request_id)) WITH CHECK (app_can_edit_request(quote_request_id));
CREATE POLICY qri_delete ON quote_request_items FOR DELETE TO konzia_app USING (app_can_edit_request(quote_request_id));

-- --- quote_request_recipients --------------------------------------------------
-- Le client voit à qui il a écrit ; une organisation ne voit QUE sa propre ligne
-- (jamais quels concurrents ont reçu la même demande).
ALTER TABLE quote_request_recipients ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON quote_request_recipients TO konzia_app;
GRANT UPDATE (status, viewed_at, decline_reason, updated_at) ON quote_request_recipients TO konzia_app;
CREATE POLICY qrr_select ON quote_request_recipients FOR SELECT TO konzia_app
  USING (organization_id IN (SELECT app_user_org_ids())
         OR EXISTS (SELECT 1 FROM quote_requests r WHERE r.id = quote_request_id AND r.customer_user_id = app_current_user_id()));
CREATE POLICY qrr_update ON quote_request_recipients FOR UPDATE TO konzia_app
  USING (app_user_org_role(organization_id) IN ('owner', 'sales'))
  WITH CHECK (app_user_org_role(organization_id) IN ('owner', 'sales')
              AND status IN ('viewed', 'evaluating', 'declined'));

-- Captures d'écran : visibles des commissionnaires destinataires de la demande.
CREATE POLICY files_select_request ON files FOR SELECT TO konzia_app
  USING (purpose = 'product_screenshot'
         AND EXISTS (SELECT 1 FROM quote_request_items i
                     WHERE i.screenshot_file_id = files.id AND app_can_see_request(i.quote_request_id)));
