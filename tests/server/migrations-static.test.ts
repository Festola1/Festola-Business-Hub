// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const supabaseDir = resolve(process.cwd(), 'supabase');
const migrationsDir = resolve(supabaseDir, 'migrations');
const testsDir = resolve(supabaseDir, 'tests');
const rollbackDir = resolve(supabaseDir, 'rollback');

function readMigration(filename: string): string {
  return readFileSync(resolve(migrationsDir, filename), 'utf8');
}

const m0000 = readMigration('0000_foundation_extensions.sql');
const m0001 = readMigration('0001_identity_and_tenants.sql');
const m0002 = readMigration('0002_identity_rls_and_helpers.sql');
const m0003 = readMigration('0003_rbac_roles_permissions_and_settings.sql');
const m0004 = readMigration('0004_catalog_and_inventory.sql');
const m0005 = readMigration('0005_customers_and_sales.sql');
const m0006 = readMigration('0006_returns_refunds_and_debt_allocations.sql');
const m0007 = readMigration('0007_operating_expenses.sql');
const m0008 = readMigration('0008_subscriptions_and_billing.sql');
const m0009 = readMigration('0009_sync_idempotency_and_conflicts.sql');
const m0010 = readMigration('0010_notifications_attachments_and_audit_indexes.sql');
const m0011 = readMigration('0011_domain_rls_immutability_and_triggers.sql');
const m0012 = readMigration('0012_release2_reserved_tables.sql');
const m0013 = readMigration('0013_auth_rls_storage_and_platform_admin.sql');

describe('P-02b PostgreSQL Migration Security & Scope Invariants', () => {
  const p02bTenantTables = [
    'businesses',
    'business_locations',
    'business_subscriptions',
    'business_memberships',
    'staff_invitations',
    'registered_devices',
    'audit_logs',
  ];

  it('defines fail-closed current_business_id() and current_actor_user_id() helpers', () => {
    expect(m0000).toContain('CREATE OR REPLACE FUNCTION public.current_business_id()');
    expect(m0000).toContain('CREATE OR REPLACE FUNCTION public.current_actor_user_id()');
  });

  it('enables and forces Row-Level Security on every P-02b tenant table and anchors policies to current_business_id()', () => {
    for (const table of p02bTenantTables) {
      expect(m0002).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`);
      expect(m0002).toContain(`ALTER TABLE public.${table} FORCE ROW LEVEL SECURITY;`);
    }
    expect(m0002).toContain('public.current_business_id()');
  });

  it('uses UUID keys, TIMESTAMPTZ, NUMERIC(18, 2) money, and enforces D-02 single active location & D-08 audit immutability', () => {
    expect(m0001).toContain('numeric(18, 2)');
    expect(m0001).toContain('timestamptz');
    expect(m0001).toContain('uq_business_locations_single_active_mvp');
    expect(m0002).toContain('prevent_audit_log_mutation');
    expect(m0002).toContain('BEFORE UPDATE OR DELETE ON public.audit_logs');
  });

  it('keeps P-02b migrations free of Release 2 tables and unapproved commercial plan names', () => {
    const combined = `${m0001}\n${m0002}`.toLowerCase();
    expect(combined).not.toContain('create table if not exists public.suppliers');
    expect(combined).not.toContain('create table if not exists public.stock_counts');
    expect(combined).not.toContain("'starter'");
    expect(combined).not.toContain("'growth'");
  });
});

describe('Stage 06 Full PostgreSQL Schema, RLS, Financial Immutability & Rollback Invariants', () => {
  const expectedMigrationFiles = [
    '0000_foundation_extensions.sql',
    '0001_identity_and_tenants.sql',
    '0002_identity_rls_and_helpers.sql',
    '0003_rbac_roles_permissions_and_settings.sql',
    '0004_catalog_and_inventory.sql',
    '0005_customers_and_sales.sql',
    '0006_returns_refunds_and_debt_allocations.sql',
    '0007_operating_expenses.sql',
    '0008_subscriptions_and_billing.sql',
    '0009_sync_idempotency_and_conflicts.sql',
    '0010_notifications_attachments_and_audit_indexes.sql',
    '0011_domain_rls_immutability_and_triggers.sql',
    '0012_release2_reserved_tables.sql',
    '0013_auth_rls_storage_and_platform_admin.sql',
  ];

  const stage06MvpTenantTables = [
    'business_settings',
    'product_categories',
    'products',
    'stock_balances',
    'restock_batches',
    'restock_batch_items',
    'stock_movements',
    'receipt_sequences',
    'customers',
    'sales',
    'sale_items',
    'sale_payments',
    'receipts',
    'sale_returns',
    'sale_return_items',
    'sale_refunds',
    'customer_debt_payments',
    'customer_debt_allocations',
    'expense_categories',
    'expenses',
    'subscription_invoices',
    'idempotency_records',
    'sync_batches',
    'sync_conflicts',
    'notifications',
    'attachments',
  ];

  const r2ReservedTables = [
    'suppliers',
    'local_purchases',
    'local_purchase_items',
    'stock_transfers',
    'stock_transfer_items',
    'stock_counts',
    'stock_count_items',
    'cash_register_sessions',
  ];

  it('maintains exact sequential migration order from 0000 through 0013 with transactional BEGIN/COMMIT blocks', () => {
    const actualFiles = readdirSync(migrationsDir)
      .filter((name) => name.endsWith('.sql'))
      .sort();
    expect(actualFiles).toEqual(expectedMigrationFiles);

    for (const sql of [
      m0003,
      m0004,
      m0005,
      m0006,
      m0007,
      m0008,
      m0009,
      m0010,
      m0011,
      m0012,
      m0013,
    ]) {
      expect(sql).toContain('BEGIN;');
      expect(sql).toContain('COMMIT;');
    }
  });

  it('enforces NUMERIC money/quantities, never uses FLOAT/DOUBLE PRECISION, and avoids ON DELETE CASCADE', () => {
    const allStage06 = [m0003, m0004, m0005, m0006, m0007, m0008, m0009, m0010, m0011, m0012]
      .join('\n')
      .toLowerCase();

    expect(allStage06).toContain('numeric(18, 2)');
    expect(allStage06).toContain('numeric(18, 3)');
    expect(allStage06).toContain('numeric(8, 4)');
    expect(allStage06).not.toMatch(/\b(float4|float8|double precision|real)\b/);
    expect(allStage06).not.toContain('on delete cascade');
  });

  it('enforces ENABLE + FORCE RLS across all 26 Stage 06 tenant tables, RBAC catalogs, and webhook events', () => {
    for (const table of stage06MvpTenantTables) {
      expect(m0011).toContain(`'${table}'`);
    }
    expect(m0011).toContain('ENABLE ROW LEVEL SECURITY');
    expect(m0011).toContain('FORCE ROW LEVEL SECURITY');
    expect(m0011).toContain('business_id = public.current_business_id()');
    expect(m0011).toContain('ALTER TABLE public.payment_webhook_events FORCE ROW LEVEL SECURITY;');
    expect(m0011).toContain('USING (false)');
  });

  it('enforces append-only immutability, hard-delete blocking, and cost/tax/receipt snapshot guards', () => {
    expect(m0004).toContain('last_positive_wac numeric(18, 2)');
    expect(m0005).toContain('tax_rate_snapshot numeric(8, 4)');
    expect(m0005).toContain('unit_cost_snapshot numeric(18, 2)');
    expect(m0005).toContain('uq_sales_tenant_sale_number UNIQUE (business_id, sale_number)');
    expect(m0005).toContain('uq_sales_tenant_client_uuid UNIQUE (business_id, client_sale_uuid)');
    expect(m0006).toContain(
      'chk_sale_returns_settlement CHECK (debt_reduced_amount + refund_amount = total_reversed)',
    );
    expect(m0011).toContain('prevent_financial_ledger_mutation');
    expect(m0011).toContain('prevent_hard_delete_auditable_record');
    expect(m0011).toContain('guard_sale_immutable_snapshots');
    expect(m0011).toContain('guard_receipt_snapshot_immutability');
    expect(m0011).toContain('guard_expense_non_destructive_update');
    expect(m0011).toContain('guard_debt_payment_non_destructive_update');
  });

  it('locks all reserved Release 2 tables behind fail-closed default-deny RLS and seeds no unapproved paid plan tiers', () => {
    for (const table of r2ReservedTables) {
      expect(m0012).toContain(`CREATE TABLE IF NOT EXISTS public.${table}`);
      expect(m0012).toContain(`'${table}'`);
    }
    expect(m0012).toContain('USING (false) WITH CHECK (false)');

    const billingSql = `${m0001}\n${m0008}`.toLowerCase();
    expect(billingSql).not.toContain("'starter'");
    expect(billingSql).not.toContain("'growth'");
    expect(billingSql).not.toContain("'pro'");
  });

  it('provides guarded synthetic-only test seed, transactional SQL integrity suite, and production-guarded dev rollback script', () => {
    const seedSql = readFileSync(resolve(testsDir, 'seed_isolated_test_tenants.sql'), 'utf8');
    const verifySql = readFileSync(
      resolve(testsDir, 'stage06_integrity_and_rls_verify.sql'),
      'utf8',
    );
    const rollbackSql = readFileSync(resolve(rollbackDir, 'stage06_down_dev_only.sql'), 'utf8');

    expect(seedSql).toContain('.example');
    expect(seedSql).toContain("LIKE '%prod%'");
    expect(verifySql).toContain('BEGIN;');
    expect(verifySql).toContain('ROLLBACK;');
    expect(verifySql).toContain('SET LOCAL ROLE festola_rls_test_role;');
    expect(rollbackSql).toContain("LIKE '%prod%'");
    expect(rollbackSql).toContain('DROP TABLE IF EXISTS public.business_settings;');
  });
});

describe('Stage 07 Membership-Aware RLS, Storage Isolation & Platform Admin Audit Invariants', () => {
  it('enforces active-membership RLS helpers and seeds attachments.manage permission', () => {
    expect(m0013).toContain('CREATE OR REPLACE FUNCTION public.effective_actor_user_id()');
    expect(m0013).toContain('CREATE OR REPLACE FUNCTION public.has_active_tenant_access(');
    expect(m0013).toContain('CREATE OR REPLACE FUNCTION public.is_business_onboarding_creator(');
    expect(m0013).toContain("'attachments.manage'");
    expect(m0013).toContain("bm.status = 'active'");
    expect(m0013).toContain("b.status = 'active'");
  });

  it('creates append-only platform_admin_audit_logs with FORCE RLS default-deny for tenants and storage.objects tenant isolation', () => {
    expect(m0013).toContain('CREATE TABLE IF NOT EXISTS public.platform_admin_audit_logs');
    expect(m0013).toContain(
      'ALTER TABLE public.platform_admin_audit_logs ENABLE ROW LEVEL SECURITY;',
    );
    expect(m0013).toContain(
      'ALTER TABLE public.platform_admin_audit_logs FORCE ROW LEVEL SECURITY;',
    );
    expect(m0013).toContain('BEFORE UPDATE OR DELETE ON public.platform_admin_audit_logs');
    expect(m0013).toContain('storage.objects');
    expect(m0013).toContain('festola-attachments');
    expect(m0013).toContain('festola-receipts');
    expect(m0013).toContain('festola-logos');
  });

  it('provides transactional rolled-back Stage 07 SQL verification harness', () => {
    const stage07VerifySql = readFileSync(
      resolve(testsDir, 'stage07_auth_rls_storage_verify.sql'),
      'utf8',
    );
    expect(stage07VerifySql).toContain('BEGIN;');
    expect(stage07VerifySql).toContain('ROLLBACK;');
    expect(stage07VerifySql).toContain('SET LOCAL ROLE festola_rls_test_role;');
    expect(stage07VerifySql).toContain('platform_admin_audit_logs');
    expect(stage07VerifySql).toContain('42501');
  });
});
