-- CreateEnum
CREATE TYPE "FilePurpose" AS ENUM ('verification_document');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('draft', 'submitted', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "VerificationDocumentKind" AS ENUM ('rccm', 'identity');

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "marketplaces" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "pricing_policy" TEXT,
ADD COLUMN     "transport_modes" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "files" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "owner_user_id" UUID NOT NULL,
    "purpose" "FilePurpose" NOT NULL,
    "storage_key" TEXT NOT NULL,
    "original_name" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "key_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_verifications" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "status" "VerificationStatus" NOT NULL DEFAULT 'draft',
    "submitted_at" TIMESTAMPTZ(3),
    "submitted_by" UUID,
    "decided_at" TIMESTAMPTZ(3),
    "decided_by" UUID,
    "reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "organization_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_documents" (
    "id" UUID NOT NULL,
    "verification_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "kind" "VerificationDocumentKind" NOT NULL,
    "file_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "files_storage_key_key" ON "files"("storage_key");

-- CreateIndex
CREATE INDEX "files_organization_id_idx" ON "files"("organization_id");

-- CreateIndex
CREATE INDEX "organization_verifications_organization_id_idx" ON "organization_verifications"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "verification_documents_verification_id_kind_key" ON "verification_documents"("verification_id", "kind");

-- AddForeignKey
ALTER TABLE "organization_verifications" ADD CONSTRAINT "organization_verifications_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_documents" ADD CONSTRAINT "verification_documents_verification_id_fkey" FOREIGN KEY ("verification_id") REFERENCES "organization_verifications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_documents" ADD CONSTRAINT "verification_documents_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Nouveaux champs du profil : modifiables par le propriétaire.
GRANT UPDATE (marketplaces, transport_modes, pricing_policy) ON organizations TO konzia_app;

-- Une seule vérification « en cours » (brouillon ou soumise) par organisation.
CREATE UNIQUE INDEX org_verification_one_open
  ON organization_verifications (organization_id) WHERE status IN ('draft', 'submitted');

-- Fichiers : visibles de leur auteur et des propriétaires de l'organisation. Jamais modifiés.
ALTER TABLE files ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON files TO konzia_app;
CREATE POLICY files_select ON files FOR SELECT TO konzia_app
  USING (owner_user_id = app_current_user_id()
         OR (organization_id IS NOT NULL AND app_user_org_role(organization_id) = 'owner'));
CREATE POLICY files_insert ON files FOR INSERT TO konzia_app
  WITH CHECK (owner_user_id = app_current_user_id()
              AND (organization_id IS NULL OR organization_id IN (SELECT app_user_org_ids())));

-- Vérification : réservée au propriétaire. La décision (approbation/refus) passe par l'administration.
ALTER TABLE organization_verifications ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON organization_verifications TO konzia_app;
GRANT UPDATE (status, submitted_at, submitted_by, updated_at) ON organization_verifications TO konzia_app;
CREATE POLICY verif_select ON organization_verifications FOR SELECT TO konzia_app
  USING (app_user_org_role(organization_id) = 'owner');
CREATE POLICY verif_insert ON organization_verifications FOR INSERT TO konzia_app
  WITH CHECK (app_user_org_role(organization_id) = 'owner' AND status = 'draft');
-- Le propriétaire ne peut que soumettre (draft → submitted), jamais s'approuver.
CREATE POLICY verif_update ON organization_verifications FOR UPDATE TO konzia_app
  USING (app_user_org_role(organization_id) = 'owner' AND status = 'draft')
  WITH CHECK (app_user_org_role(organization_id) = 'owner' AND status IN ('draft', 'submitted'));

ALTER TABLE verification_documents ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, DELETE ON verification_documents TO konzia_app;
CREATE POLICY vdoc_select ON verification_documents FOR SELECT TO konzia_app
  USING (app_user_org_role(organization_id) = 'owner');
CREATE POLICY vdoc_write ON verification_documents FOR INSERT TO konzia_app
  WITH CHECK (app_user_org_role(organization_id) = 'owner'
              AND EXISTS (SELECT 1 FROM organization_verifications v
                          WHERE v.id = verification_id AND v.organization_id = verification_documents.organization_id
                            AND v.status = 'draft'));
CREATE POLICY vdoc_delete ON verification_documents FOR DELETE TO konzia_app
  USING (app_user_org_role(organization_id) = 'owner'
         AND EXISTS (SELECT 1 FROM organization_verifications v WHERE v.id = verification_id AND v.status = 'draft'));
