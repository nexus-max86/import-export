-- CreateTable
CREATE TABLE "customer_imports" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "imported_by" UUID NOT NULL,
    "file_name" TEXT NOT NULL,
    "rows_total" INTEGER NOT NULL,
    "rows_imported" INTEGER NOT NULL,
    "rows_skipped" INTEGER NOT NULL,
    "issues" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_imports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "customer_imports_organization_id_idx" ON "customer_imports"("organization_id");

ALTER TABLE customer_imports ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON customer_imports TO konzia_app;
CREATE POLICY customer_imports_select ON customer_imports FOR SELECT TO konzia_app
  USING (organization_id IN (SELECT app_user_org_ids()));
CREATE POLICY customer_imports_insert ON customer_imports FOR INSERT TO konzia_app
  WITH CHECK (imported_by = app_current_user_id() AND app_user_org_role(organization_id) IN ('owner', 'sales'));
