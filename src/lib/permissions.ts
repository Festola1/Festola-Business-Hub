export type ClientBusinessRole = 'owner' | 'manager' | 'cashier';

export type ClientPermission =
  | 'pos.sell'
  | 'receipts.view'
  | 'customers.manage'
  | 'debts.collect'
  | 'products.view_selling'
  | 'products.view_cost'
  | 'products.manage'
  | 'sales.apply_discount'
  | 'sales.authorize_credit_override'
  | 'sales.void_or_return'
  | 'inventory.receive_and_adjust'
  | 'expenses.manage'
  | 'sync_conflicts.resolve'
  | 'reports.view_basic'
  | 'staff.view'
  | 'staff.manage'
  | 'devices.view'
  | 'devices.register'
  | 'devices.revoke'
  | 'settings.manage'
  | 'billing.manage'
  | 'audit_logs.view';

const CLIENT_ROLE_PERMISSIONS: Record<ClientBusinessRole, ReadonlySet<ClientPermission>> = {
  owner: new Set<ClientPermission>([
    'pos.sell',
    'receipts.view',
    'customers.manage',
    'debts.collect',
    'products.view_selling',
    'products.view_cost',
    'products.manage',
    'sales.apply_discount',
    'sales.authorize_credit_override',
    'sales.void_or_return',
    'inventory.receive_and_adjust',
    'expenses.manage',
    'sync_conflicts.resolve',
    'reports.view_basic',
    'staff.view',
    'staff.manage',
    'devices.view',
    'devices.register',
    'devices.revoke',
    'settings.manage',
    'billing.manage',
    'audit_logs.view',
  ]),
  manager: new Set<ClientPermission>([
    'pos.sell',
    'receipts.view',
    'customers.manage',
    'debts.collect',
    'products.view_selling',
    'products.view_cost',
    'products.manage',
    'sales.apply_discount',
    'sales.authorize_credit_override',
    'sales.void_or_return',
    'inventory.receive_and_adjust',
    'expenses.manage',
    'sync_conflicts.resolve',
    'reports.view_basic',
    'staff.view',
    'devices.view',
    'devices.register',
  ]),
  cashier: new Set<ClientPermission>([
    'pos.sell',
    'receipts.view',
    'customers.manage',
    'debts.collect',
    'products.view_selling',
    'devices.register',
  ]),
};

/**
 * UI display convenience helper mirroring the authoritative backend D-09 RBAC matrix.
 * All enforcement happens on /api/v1/* and PostgreSQL RLS.
 */
export function canRoleAccess(role: ClientBusinessRole, permission: ClientPermission): boolean {
  return CLIENT_ROLE_PERMISSIONS[role].has(permission);
}

export type NavIconKey =
  | 'dashboard'
  | 'pos'
  | 'sales'
  | 'inventory'
  | 'products'
  | 'purchases'
  | 'customers'
  | 'suppliers'
  | 'expenses'
  | 'debts'
  | 'reports'
  | 'staff'
  | 'notifications'
  | 'settings'
  | 'subscription'
  | 'sync'
  | 'devices'
  | 'audit';

export interface NavItemDefinition {
  path: string;
  label: string;
  shortLabel: string;
  icon: NavIconKey;
  section?: 'primary' | 'system';
  release?: 1 | 2;
  requiredPermission?: ClientPermission;
  mobilePrimary?: boolean;
  stageBadge?: string;
}

export const APP_NAV_ITEMS: NavItemDefinition[] = [
  {
    path: '/app/dashboard',
    label: 'Dashboard',
    shortLabel: 'Home',
    icon: 'dashboard',
    section: 'primary',
    mobilePrimary: true,
  },
  {
    path: '/app/pos',
    label: 'POS',
    shortLabel: 'POS',
    icon: 'pos',
    section: 'primary',
    requiredPermission: 'pos.sell',
    mobilePrimary: true,
  },
  {
    path: '/app/sales',
    label: 'Sales',
    shortLabel: 'Sales',
    icon: 'sales',
    section: 'primary',
    requiredPermission: 'receipts.view',
    mobilePrimary: true,
  },
  {
    path: '/app/inventory',
    label: 'Inventory',
    shortLabel: 'Stock',
    icon: 'inventory',
    section: 'primary',
    requiredPermission: 'inventory.receive_and_adjust',
  },
  {
    path: '/app/products',
    label: 'Products',
    shortLabel: 'Products',
    icon: 'products',
    section: 'primary',
    requiredPermission: 'products.view_selling',
  },
  {
    path: '/app/purchases',
    label: 'Purchases',
    shortLabel: 'Purchases',
    icon: 'purchases',
    section: 'primary',
    release: 2,
    requiredPermission: 'inventory.receive_and_adjust',
  },
  {
    path: '/app/customers',
    label: 'Customers',
    shortLabel: 'Customers',
    icon: 'customers',
    section: 'primary',
    release: 1,
    requiredPermission: 'customers.manage',
  },
  {
    path: '/app/suppliers',
    label: 'Suppliers',
    shortLabel: 'Suppliers',
    icon: 'suppliers',
    section: 'primary',
    release: 2,
    requiredPermission: 'inventory.receive_and_adjust',
  },
  {
    path: '/app/expenses',
    label: 'Expenses',
    shortLabel: 'Expenses',
    icon: 'expenses',
    section: 'primary',
    requiredPermission: 'expenses.manage',
  },
  {
    path: '/app/debts',
    label: 'Debts & Credit',
    shortLabel: 'Debts',
    icon: 'debts',
    section: 'primary',
    requiredPermission: 'debts.collect',
  },
  {
    path: '/app/reports',
    label: 'Reports & Analytics',
    shortLabel: 'Reports',
    icon: 'reports',
    section: 'primary',
    requiredPermission: 'reports.view_basic',
  },
  {
    path: '/app/staff',
    label: 'Staff Management',
    shortLabel: 'Staff',
    icon: 'staff',
    section: 'primary',
    requiredPermission: 'staff.view',
  },
  {
    path: '/app/notifications',
    label: 'Notifications',
    shortLabel: 'Alerts',
    icon: 'notifications',
    section: 'primary',
  },
  {
    path: '/app/settings',
    label: 'Settings',
    shortLabel: 'Settings',
    icon: 'settings',
    section: 'primary',
    requiredPermission: 'settings.manage',
    mobilePrimary: true,
  },
  {
    path: '/app/subscription',
    label: 'Subscription & Billing',
    shortLabel: 'Plan',
    icon: 'subscription',
    section: 'primary',
    requiredPermission: 'billing.manage',
  },
  {
    path: '/app/sync',
    label: 'Offline Sync',
    shortLabel: 'Sync',
    icon: 'sync',
    section: 'system',
    requiredPermission: 'pos.sell',
  },
  {
    path: '/app/devices',
    label: 'Offline Devices',
    shortLabel: 'Devices',
    icon: 'devices',
    section: 'system',
    requiredPermission: 'devices.register',
  },
  {
    path: '/app/audit-logs',
    label: 'Audit Logs',
    shortLabel: 'Audit',
    icon: 'audit',
    section: 'system',
    requiredPermission: 'audit_logs.view',
  },
];

export function isRelease2NavEnabled(): boolean {
  return import.meta.env.VITE_ENABLE_RELEASE_2 === 'true';
}

export function getVisibleNavItems(
  role: ClientBusinessRole,
  options?: { includeRelease2?: boolean },
): NavItemDefinition[] {
  const allowRelease2 = options?.includeRelease2 ?? isRelease2NavEnabled();
  return APP_NAV_ITEMS.filter((item) => {
    if (item.release === 2 && !allowRelease2) {
      return false;
    }
    return !item.requiredPermission || canRoleAccess(role, item.requiredPermission);
  });
}
