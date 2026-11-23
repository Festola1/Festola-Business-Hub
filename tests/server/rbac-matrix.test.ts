// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { hasPermission, isSubscriptionWritable } from '../../server/lib/rbac.ts';

describe('D-09 MVP RBAC Permission Matrix & D-01 Subscription Write Guard', () => {
  it('grants Owner full business, staff, settings, billing, device-revoke, and audit permissions', () => {
    expect(hasPermission('owner', 'pos.sell')).toBe(true);
    expect(hasPermission('owner', 'products.view_cost')).toBe(true);
    expect(hasPermission('owner', 'sales.void_or_return')).toBe(true);
    expect(hasPermission('owner', 'sync_conflicts.resolve')).toBe(true);
    expect(hasPermission('owner', 'staff.manage')).toBe(true);
    expect(hasPermission('owner', 'devices.revoke')).toBe(true);
    expect(hasPermission('owner', 'settings.manage')).toBe(true);
    expect(hasPermission('owner', 'billing.manage')).toBe(true);
    expect(hasPermission('owner', 'audit_logs.view')).toBe(true);
    expect(hasPermission('owner', 'attachments.manage')).toBe(true);
  });

  it('grants Manager store operations while blocking settings, billing, staff mutations, and audit logs', () => {
    expect(hasPermission('manager', 'pos.sell')).toBe(true);
    expect(hasPermission('manager', 'products.view_cost')).toBe(true);
    expect(hasPermission('manager', 'products.manage')).toBe(true);
    expect(hasPermission('manager', 'inventory.receive_and_adjust')).toBe(true);
    expect(hasPermission('manager', 'expenses.manage')).toBe(true);
    expect(hasPermission('manager', 'sync_conflicts.resolve')).toBe(true);
    expect(hasPermission('manager', 'sales.void_or_return')).toBe(true);
    expect(hasPermission('manager', 'reports.view_basic')).toBe(true);
    expect(hasPermission('manager', 'staff.view')).toBe(true);
    expect(hasPermission('manager', 'attachments.manage')).toBe(true);

    // Strictly Owner-only under D-09
    expect(hasPermission('manager', 'staff.manage')).toBe(false);
    expect(hasPermission('manager', 'devices.revoke')).toBe(false);
    expect(hasPermission('manager', 'settings.manage')).toBe(false);
    expect(hasPermission('manager', 'billing.manage')).toBe(false);
    expect(hasPermission('manager', 'audit_logs.view')).toBe(false);
  });

  it('restricts Cashier strictly to front-counter execution and blocks cost, reports, voids, and management', () => {
    expect(hasPermission('cashier', 'pos.sell')).toBe(true);
    expect(hasPermission('cashier', 'receipts.view')).toBe(true);
    expect(hasPermission('cashier', 'customers.manage')).toBe(true);
    expect(hasPermission('cashier', 'debts.collect')).toBe(true);
    expect(hasPermission('cashier', 'products.view_selling')).toBe(true);
    expect(hasPermission('cashier', 'devices.register')).toBe(true);

    // Strictly blocked for Cashier under D-09 & D-15
    expect(hasPermission('cashier', 'products.view_cost')).toBe(false);
    expect(hasPermission('cashier', 'products.manage')).toBe(false);
    expect(hasPermission('cashier', 'inventory.receive_and_adjust')).toBe(false);
    expect(hasPermission('cashier', 'expenses.manage')).toBe(false);
    expect(hasPermission('cashier', 'sync_conflicts.resolve')).toBe(false);
    expect(hasPermission('cashier', 'sales.void_or_return')).toBe(false);
    expect(hasPermission('cashier', 'reports.view_basic')).toBe(false);
    expect(hasPermission('cashier', 'staff.view')).toBe(false);
    expect(hasPermission('cashier', 'staff.manage')).toBe(false);
    expect(hasPermission('cashier', 'settings.manage')).toBe(false);
    expect(hasPermission('cashier', 'billing.manage')).toBe(false);
    expect(hasPermission('cashier', 'audit_logs.view')).toBe(false);
    expect(hasPermission('cashier', 'attachments.manage')).toBe(false);
  });

  it('allows writes during trialing, active, and grace_period and blocks writes in read_only/cancelled (D-01)', () => {
    expect(isSubscriptionWritable('trialing')).toBe(true);
    expect(isSubscriptionWritable('active')).toBe(true);
    expect(isSubscriptionWritable('grace_period')).toBe(true);
    expect(isSubscriptionWritable('read_only')).toBe(false);
    expect(isSubscriptionWritable('cancelled')).toBe(false);
  });
});
