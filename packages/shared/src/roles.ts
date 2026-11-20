/** Rôles d'un membre au sein d'une organisation (voir docs/04-roles-permissions.md). */
export const ORG_ROLES = ['owner', 'sales', 'buyer', 'logistics', 'accountant', 'courier'] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

/** Rôles de la plateforme. */
export const PLATFORM_ROLES = ['admin', 'support'] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];
