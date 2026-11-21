/**
 * Toutes les tables métier soumises à la RLS, avec la colonne qui les rattache à une organisation.
 * RÈGLE : chaque nouvelle table métier est ajoutée ici ; le test inter-tenant la couvre alors.
 */
export const TENANT_TABLES: { table: string; orgColumn: string }[] = [
  { table: 'organizations', orgColumn: 'id' },
  { table: 'organization_members', orgColumn: 'organization_id' },
  { table: 'invitations', orgColumn: 'organization_id' },
  { table: 'audit_logs', orgColumn: 'organization_id' },
  { table: 'organization_service_zones', orgColumn: 'organization_id' },
  { table: 'org_customers', orgColumn: 'organization_id' },
  { table: 'files', orgColumn: 'organization_id' },
  { table: 'organization_verifications', orgColumn: 'organization_id' },
  { table: 'verification_documents', orgColumn: 'organization_id' },
  { table: 'customer_imports', orgColumn: 'organization_id' },
  { table: 'quote_request_recipients', orgColumn: 'organization_id' },
];

/** Données personnelles d'un utilisateur : seul leur propriétaire y accède. */
export const USER_TABLES: { table: string; userColumn: string }[] = [
  { table: 'customer_profiles', userColumn: 'user_id' },
  { table: 'addresses', userColumn: 'user_id' },
];

/** Tables jamais accessibles au rôle applicatif (chemins système uniquement). */
export const SYSTEM_ONLY_TABLES = ['sessions', 'email_tokens', 'consents', '_prisma_migrations'];
