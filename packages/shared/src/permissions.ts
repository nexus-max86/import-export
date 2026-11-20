import type { OrgRole } from './roles';

/**
 * Permissions internes à une organisation (docs/04-roles-permissions.md, §2).
 * La frontière ENTRE organisations est garantie par la RLS PostgreSQL, pas par cette table.
 */
export const PERMISSIONS = [
  'org.settings.edit',
  'org.members.manage',
  'org.verification.submit',
  'customer.view',
  'customer.edit',
  'customer.import',
  'customer.invite_claim',
  'request.view',
  'request.create_for_managed',
  'request.decline',
  'quote.edit',
  'quote.send',
  'quote.withdraw',
  'order.view',
  'order.status.update',
  'order.adjustment.propose',
  'order.cancel',
  'supplier_order.manage',
  'parcel.manage',
  'shipment.manage',
  'tracking.record',
  'parcel.deliver',
  'payment.view',
  'payment.confirm',
  'payment.reject',
  'payment.record_offline',
  'payment.refund',
  'finance.margins.view',
  'export.csv',
  'dispute.respond',
  'audit.view_own_org',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const SALES: Permission[] = [
  'customer.view',
  'customer.edit',
  'customer.import',
  'customer.invite_claim',
  'request.view',
  'request.create_for_managed',
  'request.decline',
  'quote.edit',
  'quote.send',
  'quote.withdraw',
  'order.view',
  'order.status.update',
  'order.adjustment.propose',
  'payment.view',
  'dispute.respond',
];

export const ROLE_PERMISSIONS: Record<OrgRole, ReadonlySet<Permission>> = {
  owner: new Set(PERMISSIONS),
  sales: new Set(SALES),
  buyer: new Set<Permission>([
    'customer.view',
    'request.view',
    'order.view',
    'order.status.update',
    'supplier_order.manage',
  ]),
  logistics: new Set<Permission>([
    'customer.view',
    'order.view',
    'order.status.update',
    'parcel.manage',
    'shipment.manage',
    'tracking.record',
    'parcel.deliver',
  ]),
  accountant: new Set<Permission>([
    'customer.view',
    'order.view',
    'payment.view',
    'payment.confirm',
    'payment.reject',
    'payment.record_offline',
    'payment.refund',
    'finance.margins.view',
    'export.csv',
  ]),
  courier: new Set<Permission>(['customer.view', 'order.view', 'parcel.deliver']),
};

export function can(role: OrgRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].has(permission);
}
