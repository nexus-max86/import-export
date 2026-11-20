-- CreateEnum
CREATE TYPE "OrganizationType" AS ENUM ('independent', 'company');

-- CreateEnum
CREATE TYPE "OrganizationStatus" AS ENUM ('pending', 'approved', 'rejected', 'suspended');

-- CreateEnum
CREATE TYPE "OrgRole" AS ENUM ('owner', 'sales', 'buyer', 'logistics', 'accountant', 'courier');

-- CreateEnum
CREATE TYPE "MemberStatus" AS ENUM ('active', 'removed');

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "type" "OrganizationType" NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "phone_whatsapp" TEXT,
    "is_platform_operated" BOOLEAN NOT NULL DEFAULT false,
    "status" "OrganizationStatus" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_members" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "OrgRole" NOT NULL,
    "status" "MemberStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "organization_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "role" "OrgRole" NOT NULL,
    "token_hash" TEXT NOT NULL,
    "invited_by" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "accepted_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE INDEX "organization_members_user_id_idx" ON "organization_members"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "organization_members_organization_id_user_id_key" ON "organization_members"("organization_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "invitations_token_hash_key" ON "invitations"("token_hash");

-- CreateIndex
CREATE INDEX "invitations_organization_id_idx" ON "invitations"("organization_id");

-- AddForeignKey
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ===========================================================================
-- Isolation multi-tenant (décision D1) : rôle applicatif + Row-Level Security
-- ===========================================================================
-- L'API métier se connecte avec konzia_app, sans BYPASSRLS. Le mot de passe et le
-- droit LOGIN sont donnés hors migration (script d'infrastructure), jamais ici.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'konzia_app') THEN
    CREATE ROLE konzia_app NOLOGIN NOBYPASSRLS;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO konzia_app;

-- Utilisateur courant, fixé par l'API dans chaque transaction : set_config('app.user_id', …, true).
CREATE OR REPLACE FUNCTION app_current_user_id() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('app.user_id', true), '')::uuid $$;

-- Fonctions SECURITY DEFINER : lisent les appartenances sans repasser par la RLS
-- (évite la récursion des politiques de organization_members).
CREATE OR REPLACE FUNCTION app_user_org_ids() RETURNS SETOF uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$
    SELECT organization_id FROM organization_members
    WHERE user_id = app_current_user_id() AND status = 'active'
  $$;

CREATE OR REPLACE FUNCTION app_user_org_role(org uuid) RETURNS "OrgRole"
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$
    SELECT role FROM organization_members
    WHERE organization_id = org AND user_id = app_current_user_id() AND status = 'active'
  $$;

-- Vrai si l'utilisateur `other` partage une organisation active avec l'utilisateur courant.
CREATE OR REPLACE FUNCTION app_shares_org_with(other uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$
    SELECT EXISTS (
      SELECT 1 FROM organization_members m
      WHERE m.user_id = other AND m.status = 'active'
        AND m.organization_id IN (SELECT app_user_org_ids())
    )
  $$;

REVOKE ALL ON FUNCTION app_user_org_ids(), app_user_org_role(uuid), app_shares_org_with(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_current_user_id(), app_user_org_ids(), app_user_org_role(uuid), app_shares_org_with(uuid) TO konzia_app;

-- --- users : seules quelques colonnes, pour soi-même et les collègues --------
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
GRANT SELECT (id, email, display_name) ON users TO konzia_app;
CREATE POLICY users_select ON users FOR SELECT TO konzia_app
  USING (id = app_current_user_id() OR app_shares_org_with(id));

-- --- organizations ------------------------------------------------------------
-- Création, statut et drapeau « opérée par la plateforme » : chemins système audités uniquement.
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON organizations TO konzia_app;
GRANT UPDATE (name, description, phone_whatsapp, updated_at) ON organizations TO konzia_app;
CREATE POLICY organizations_select ON organizations FOR SELECT TO konzia_app
  USING (status = 'approved' OR id IN (SELECT app_user_org_ids()));
CREATE POLICY organizations_update ON organizations FOR UPDATE TO konzia_app
  USING (app_user_org_role(id) = 'owner')
  WITH CHECK (app_user_org_role(id) = 'owner');

-- --- organization_members ------------------------------------------------------
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON organization_members TO konzia_app;
GRANT UPDATE (role, status, updated_at) ON organization_members TO konzia_app;
CREATE POLICY members_select ON organization_members FOR SELECT TO konzia_app
  USING (organization_id IN (SELECT app_user_org_ids()));
CREATE POLICY members_insert ON organization_members FOR INSERT TO konzia_app
  WITH CHECK (app_user_org_role(organization_id) = 'owner');
CREATE POLICY members_update ON organization_members FOR UPDATE TO konzia_app
  USING (app_user_org_role(organization_id) = 'owner')
  WITH CHECK (app_user_org_role(organization_id) = 'owner');

-- --- invitations ---------------------------------------------------------------
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON invitations TO konzia_app;
GRANT UPDATE (revoked_at) ON invitations TO konzia_app;
CREATE POLICY invitations_all ON invitations FOR ALL TO konzia_app
  USING (app_user_org_role(organization_id) = 'owner')
  WITH CHECK (app_user_org_role(organization_id) = 'owner');
