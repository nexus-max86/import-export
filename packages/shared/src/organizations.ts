import { z } from 'zod';
import { ORG_ROLES, type OrgRole } from './roles';

/** En-tête indiquant l'organisation au nom de laquelle agit l'utilisateur. */
export const ORG_HEADER = 'x-konzia-org';

export const CreateOrganizationSchema = z.object({
  name: z.string().trim().min(2, 'Indiquez le nom commercial.').max(80),
  type: z.enum(['independent', 'company'], { message: 'Choisissez un type.' }),
  description: z.string().trim().max(1000).optional(),
  phoneWhatsapp: z
    .string()
    .trim()
    .regex(/^\+?[0-9 ]{8,20}$/, 'Numéro WhatsApp invalide.')
    .optional(),
});
export type CreateOrganizationInput = z.infer<typeof CreateOrganizationSchema>;

export const UpdateOrganizationSchema = CreateOrganizationSchema.omit({ type: true }).partial();
export type UpdateOrganizationInput = z.infer<typeof UpdateOrganizationSchema>;

export const InviteMemberSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email({ message: 'Adresse e-mail invalide.' })),
  role: z.enum(ORG_ROLES.filter((r) => r !== 'owner') as [OrgRole, ...OrgRole[]], {
    message: 'Choisissez un rôle.',
  }),
});
export type InviteMemberInput = z.infer<typeof InviteMemberSchema>;

export const ChangeRoleSchema = z.object({ role: z.enum(ORG_ROLES) });

export const ORG_ROLE_LABELS: Record<OrgRole, string> = {
  owner: 'Propriétaire',
  sales: 'Commercial',
  buyer: 'Acheteur',
  logistics: 'Logistique',
  accountant: 'Comptable',
  courier: 'Livreur',
};

export interface MembershipSummary {
  organizationId: string;
  name: string;
  status: 'pending' | 'approved' | 'rejected' | 'suspended';
  role: OrgRole;
}

export interface MemberInfo {
  id: string;
  userId: string;
  displayName: string;
  email: string;
  role: OrgRole;
}
