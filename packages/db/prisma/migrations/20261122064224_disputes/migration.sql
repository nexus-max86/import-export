-- CreateEnum
CREATE TYPE "DisputeStatus" AS ENUM ('awaiting_commissioner', 'under_review', 'resolved', 'closed');

-- AlterEnum
ALTER TYPE "FilePurpose" ADD VALUE 'dispute_evidence';

-- CreateTable
CREATE TABLE "disputes" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "customer_user_id" UUID NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "DisputeStatus" NOT NULL DEFAULT 'awaiting_commissioner',
    "resolution" TEXT,
    "resolved_by" UUID,
    "resolved_at" TIMESTAMPTZ(3),
    "closed_at" TIMESTAMPTZ(3),
    "reopened_at" TIMESTAMPTZ(3),
    "reopen_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "disputes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dispute_messages" (
    "id" UUID NOT NULL,
    "dispute_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "author_user_id" UUID NOT NULL,
    "author_role" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "file_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dispute_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "disputes_organization_id_status_idx" ON "disputes"("organization_id", "status");

-- CreateIndex
CREATE INDEX "disputes_customer_user_id_idx" ON "disputes"("customer_user_id");

-- CreateIndex
CREATE INDEX "dispute_messages_dispute_id_created_at_idx" ON "dispute_messages"("dispute_id", "created_at");

-- AddForeignKey
ALTER TABLE "dispute_messages" ADD CONSTRAINT "dispute_messages_dispute_id_fkey" FOREIGN KEY ("dispute_id") REFERENCES "disputes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE disputes
  ADD CONSTRAINT dispute_category CHECK (category IN ('not_received', 'damaged', 'wrong_item', 'missing_items', 'payment', 'delay', 'other')),
  ADD CONSTRAINT dispute_resolution CHECK (status NOT IN ('resolved', 'closed') OR coalesce(trim(resolution), '') <> '');
ALTER TABLE dispute_messages
  ADD CONSTRAINT dm_role CHECK (author_role IN ('customer', 'commissioner', 'support')),
  ADD CONSTRAINT dm_body CHECK (length(trim(body)) > 0);
-- Un seul litige non clos à la fois par commande.
CREATE UNIQUE INDEX disputes_one_open_per_order ON disputes (order_id) WHERE status <> 'closed';

-- Un litige clos est figé : seule une réouverture (motivée) le fait revenir à l'examen.
-- Aucun message ne s'ajoute à un litige clos.
CREATE OR REPLACE FUNCTION disputes_guard() RETURNS trigger LANGUAGE plpgsql AS $$
  BEGIN
    IF OLD.status = 'closed' THEN
      IF NOT (NEW.status = 'under_review' AND NEW.reopened_at IS DISTINCT FROM OLD.reopened_at
              AND coalesce(trim(NEW.reopen_reason), '') <> '') THEN
        RAISE EXCEPTION 'litige clos : seule une réouverture motivée par l''administration est possible';
      END IF;
    END IF;
    RETURN NEW;
  END
  $$;
CREATE TRIGGER disputes_guard BEFORE UPDATE ON disputes FOR EACH ROW EXECUTE FUNCTION disputes_guard();
CREATE OR REPLACE FUNCTION dispute_messages_open() RETURNS trigger LANGUAGE plpgsql AS $$
  BEGIN
    IF (SELECT status FROM disputes WHERE id = NEW.dispute_id) = 'closed' THEN
      RAISE EXCEPTION 'litige clos : aucun nouveau message';
    END IF;
    RETURN NEW;
  END
  $$;
CREATE TRIGGER dispute_messages_open BEFORE INSERT ON dispute_messages FOR EACH ROW EXECUTE FUNCTION dispute_messages_open();
CREATE TRIGGER disputes_no_delete BEFORE DELETE ON disputes FOR EACH ROW EXECUTE FUNCTION forbid_delete();
CREATE TRIGGER dispute_messages_no_delete BEFORE DELETE ON dispute_messages FOR EACH ROW EXECUTE FUNCTION forbid_delete();
CREATE TRIGGER dispute_messages_immutable BEFORE UPDATE ON dispute_messages FOR EACH ROW EXECUTE FUNCTION forbid_update();

-- RLS : le client du litige et le commissionnaire (propriétaire, commercial — dispute.respond).
-- Ouverture, changements d'état et messages du support passent par le chemin système.
ALTER TABLE disputes ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON disputes TO konzia_app;
CREATE POLICY disputes_select ON disputes FOR SELECT TO konzia_app
  USING (customer_user_id = app_current_user_id()
         OR app_user_org_role(organization_id) IN ('owner', 'sales'));

ALTER TABLE dispute_messages ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON dispute_messages TO konzia_app;
CREATE POLICY dm_select ON dispute_messages FOR SELECT TO konzia_app
  USING (EXISTS (SELECT 1 FROM disputes d WHERE d.id = dispute_id
                 AND (d.customer_user_id = app_current_user_id()
                      OR app_user_org_role(d.organization_id) IN ('owner', 'sales'))));
