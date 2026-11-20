-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_user_id" UUID,
    "actor_role" TEXT NOT NULL,
    "organization_id" UUID,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "before" JSONB,
    "after" JSONB,
    "reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_logs_organization_id_created_at_idx" ON "audit_logs"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- Immuable pour TOUS les rôles, propriétaire compris : une correction = une nouvelle entrée.
CREATE OR REPLACE FUNCTION audit_logs_immutable() RETURNS trigger
  LANGUAGE plpgsql AS $$
  BEGIN
    RAISE EXCEPTION 'audit_logs est en insertion seule';
  END
  $$;

CREATE TRIGGER audit_logs_no_update_delete
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION audit_logs_immutable();

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON audit_logs TO konzia_app;

-- On n'écrit qu'en son propre nom, et seulement pour une organisation dont on est membre.
CREATE POLICY audit_insert ON audit_logs FOR INSERT TO konzia_app
  WITH CHECK (
    actor_user_id = app_current_user_id()
    AND (organization_id IS NULL OR organization_id IN (SELECT app_user_org_ids()))
  );

-- Lecture : les propriétaires, pour leur organisation (permission audit.view_own_org).
CREATE POLICY audit_select ON audit_logs FOR SELECT TO konzia_app
  USING (organization_id IS NOT NULL AND app_user_org_role(organization_id) = 'owner');
