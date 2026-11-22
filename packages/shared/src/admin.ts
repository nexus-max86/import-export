import { z } from 'zod';

/** Liste paginée de la console d'administration. */
export interface AdminPage<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export const AdminListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  q: z.string().trim().max(100).optional(),
  status: z.string().trim().max(40).optional(),
  organizationId: z.uuid().optional(),
});
export type AdminListQuery = z.infer<typeof AdminListQuerySchema>;

export interface AdminOverview {
  users: number;
  organizations: Record<'pending' | 'approved' | 'rejected' | 'suspended', number>;
  verificationsToReview: number;
  ordersActive: number;
  ordersCompleted: number;
  paymentsToVerify: number;
  parcelsInProgress: number;
  disputesOpen: number;
}

export interface AdminUserRow {
  id: string;
  email: string;
  displayName: string;
  platformRole: 'admin' | 'support' | null;
  status: 'active' | 'suspended';
  emailVerified: boolean;
  mfaEnabled: boolean;
  organizations: number;
  createdAt: string;
}

export interface AdminOrganizationRow {
  id: string;
  name: string;
  slug: string;
  type: 'independent' | 'company';
  status: 'pending' | 'approved' | 'rejected' | 'suspended';
  verificationStatus: 'draft' | 'submitted' | 'approved' | 'rejected' | null;
  members: number;
  orders: number;
  createdAt: string;
}

export interface AdminOrganizationDetail extends AdminOrganizationRow {
  description: string | null;
  phoneWhatsapp: string | null;
  verifiedAt: string | null;
  owners: { displayName: string; email: string }[];
  verification: {
    id: string;
    status: 'draft' | 'submitted' | 'approved' | 'rejected';
    submittedAt: string | null;
    decidedAt: string | null;
    reason: string | null;
    documents: { id: string; kind: string; originalName: string; sizeBytes: number }[];
  } | null;
}

export interface AdminOrderRow {
  id: string;
  number: string;
  organizationName: string;
  customerName: string;
  status: string;
  paymentStatus: string;
  currency: string;
  finalAmount: number;
  createdAt: string;
}

export interface AdminPaymentRow {
  id: string;
  orderNumber: string;
  organizationName: string;
  kind: 'payment' | 'refund';
  method: string;
  amount: number;
  currency: string;
  status: string;
  createdAt: string;
}

export interface AdminParcelRow {
  id: string;
  code: string;
  organizationName: string;
  status: string;
  currentStepCode: string | null;
  items: number;
  createdAt: string;
}

export interface AdminAuditRow {
  id: string;
  createdAt: string;
  actorEmail: string | null;
  actorRole: string;
  organizationName: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  before: unknown;
  after: unknown;
  reason: string | null;
}

/** Décision d'administration : toujours motivée (EF-104). */
export const AdminDecisionSchema = z.object({
  reason: z.string().trim().min(5, 'Expliquez la décision (5 caractères minimum).').max(1000),
});
