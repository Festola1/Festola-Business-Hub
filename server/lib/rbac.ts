import type { NextFunction, Response } from 'express';
import { ApiError } from '../middleware/error-handler.ts';
import type { TenantContextRequest } from '../middleware/tenant-context.ts';
import type { BusinessRole, SubscriptionStatus } from '../modules/identity/identity.types.ts';

export type PlatformAdminRole = 'super_admin' | 'support_readonly';

/**
 * Approved Stage 07 / D-09 MVP Role-Permission Matrix.
 * Enforced strictly on the backend API (never UI-only) and mirrored in public.role_permissions.
 */
export type Permission =
  | 'pos.sell'
  | 'receipts.view'
  | 'customers.manage'
  | 'debts.collect'
  | 'products.view_selling'
  | 'products.view_cost'
  | 'products.manage'
  | 'inventory.receive_and_adjust'
  | 'expenses.manage'
  | 'sync_conflicts.resolve'
  | 'sales.void_or_return'
  | 'reports.view_basic'
  | 'attachments.manage'
  | 'staff.view'
  | 'staff.manage'
  | 'devices.view'
  | 'devices.register'
  | 'devices.revoke'
  | 'settings.manage'
  | 'billing.manage'
  | 'audit_logs.view';

const ROLE_PERMISSIONS: Record<BusinessRole, ReadonlySet<Permission>> = {
  owner: new Set<Permission>([
    'pos.sell',
    'receipts.view',
    'customers.manage',
    'debts.collect',
    'products.view_selling',
    'products.view_cost',
    'products.manage',
    'inventory.receive_and_adjust',
    'expenses.manage',
    'sync_conflicts.resolve',
    'sales.void_or_return',
    'reports.view_basic',
    'attachments.manage',
    'staff.view',
    'staff.manage',
    'devices.view',
    'devices.register',
    'devices.revoke',
    'settings.manage',
    'billing.manage',
    'audit_logs.view',
  ]),
  manager: new Set<Permission>([
    'pos.sell',
    'receipts.view',
    'customers.manage',
    'debts.collect',
    'products.view_selling',
    'products.view_cost',
    'products.manage',
    'inventory.receive_and_adjust',
    'expenses.manage',
    'sync_conflicts.resolve',
    'sales.void_or_return',
    'reports.view_basic',
    'attachments.manage',
    'staff.view',
    'devices.view',
    'devices.register',
  ]),
  cashier: new Set<Permission>([
    'pos.sell',
    'receipts.view',
    'customers.manage',
    'debts.collect',
    'products.view_selling',
    'devices.register',
  ]),
};

export function hasPermission(role: BusinessRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].has(permission);
}

export function isSubscriptionWritable(status: SubscriptionStatus): boolean {
  return status === 'trialing' || status === 'active' || status === 'grace_period';
}

export function requireRole(...allowedRoles: BusinessRole[]) {
  const allowed = new Set<BusinessRole>(allowedRoles);
  return (req: TenantContextRequest, _res: Response, next: NextFunction): void => {
    const role = req.tenantContext?.role;
    if (!role) {
      next(new ApiError(403, 'PERMISSION_DENIED', 'Active tenant membership is required.'));
      return;
    }

    if (!allowed.has(role)) {
      next(
        new ApiError(
          403,
          'PERMISSION_DENIED',
          'Your role does not have permission to perform this action.',
        ),
      );
      return;
    }

    next();
  };
}

export function requirePermission(permission: Permission) {
  return (req: TenantContextRequest, _res: Response, next: NextFunction): void => {
    const role = req.tenantContext?.role;
    if (!role || !hasPermission(role, permission)) {
      next(
        new ApiError(403, 'PERMISSION_DENIED', `Role lacks required permission: ${permission}.`),
      );
      return;
    }

    next();
  };
}

/**
 * Enforces D-01: expired subscriptions enter read_only mode (zero data deletion;
 * reads and exports remain available, while write mutations are blocked server-side).
 */
export function requireWritableSubscription(
  req: TenantContextRequest,
  _res: Response,
  next: NextFunction,
): void {
  const status = req.tenantContext?.subscriptionStatus;
  if (!status || !isSubscriptionWritable(status)) {
    next(
      new ApiError(
        403,
        'SUBSCRIPTION_LIMIT_REACHED',
        'Business subscription is currently read-only. Renew your plan to create or modify records.',
        { subscriptionStatus: status ?? 'unknown' },
      ),
    );
    return;
  }

  next();
}
