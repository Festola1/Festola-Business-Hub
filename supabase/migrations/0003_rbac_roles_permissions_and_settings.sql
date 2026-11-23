-- ============================================================================
-- Migration: 0003_rbac_roles_permissions_and_settings.sql
-- Stage:     Stage 06 — Full PostgreSQL Schema & Migrations
-- Decisions: D-03, D-04, D-09 (3 fixed MVP roles), D-12, D-14
-- Standards: UUID keys, TIMESTAMPTZ, NUMERIC(18,3), forward-only transactional DDL
-- ============================================================================

BEGIN;

-- 1. Canonical Fixed MVP Roles (D-09: owner, manager, cashier)
CREATE TABLE IF NOT EXISTS public.roles (
  code text PRIMARY KEY CHECK (code IN ('owner', 'manager', 'cashier')),
  display_name text NOT NULL,
  description text NOT NULL,
  is_system boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Canonical MVP Permission Catalog (mirrors server/lib/rbac.ts)
CREATE TABLE IF NOT EXISTS public.permissions (
  code text PRIMARY KEY,
  module text NOT NULL,
  description text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Role-to-Permission Join Table
CREATE TABLE IF NOT EXISTS public.role_permissions (
  role_code text NOT NULL REFERENCES public.roles (code) ON DELETE RESTRICT,
  permission_code text NOT NULL REFERENCES public.permissions (code) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (role_code, permission_code)
);

-- Seed the 3 fixed MVP roles
INSERT INTO public.roles (code, display_name, description, is_system)
VALUES
  ('owner', 'Owner', 'Full business administration, billing, settings, audit logs, and overrides.', true),
  ('manager', 'Manager', 'Operations, catalog, inventory, expenses, voids/returns, conflict review, and basic reports.', true),
  ('cashier', 'Cashier', 'POS checkout, receipt issuance, customer lookup, debt collection, and device registration.', true)
ON CONFLICT (code) DO NOTHING;

-- Seed canonical MVP permissions aligned 1:1 with server/lib/rbac.ts
INSERT INTO public.permissions (code, module, description)
VALUES
  ('pos.sell', 'pos', 'Create POS sales and issue customer receipts'),
  ('receipts.view', 'receipts', 'View and reprint sales and debt receipts'),
  ('customers.manage', 'customers', 'Create and update customer records'),
  ('debts.collect', 'debts', 'Record customer debt repayments and allocations'),
  ('products.view_selling', 'products', 'View product catalog and selling prices'),
  ('products.view_cost', 'products', 'View product WAC cost prices and margin data'),
  ('products.manage', 'products', 'Create, update, and archive products and categories'),
  ('inventory.receive_and_adjust', 'inventory', 'Perform multi-item restock batches and stock adjustments'),
  ('expenses.manage', 'expenses', 'Record and reverse operating expenses'),
  ('sync_conflicts.resolve', 'sync', 'Review and resolve offline sync conflicts'),
  ('sales.void_or_return', 'sales', 'Execute online full voids and full/partial item returns'),
  ('reports.view_basic', 'reports', 'View basic financial dashboard and MVP reports'),
  ('staff.view', 'staff', 'View business staff members and pending invitations'),
  ('staff.manage', 'staff', 'Invite, change role, suspend, or revoke business staff'),
  ('devices.view', 'devices', 'View registered offline devices for the business'),
  ('devices.register', 'devices', 'Register an authenticated browser/device for offline POS'),
  ('devices.revoke', 'devices', 'Immediately revoke a registered offline device'),
  ('settings.manage', 'settings', 'Update business profile, tax configuration, and inventory policies'),
  ('billing.manage', 'billing', 'Manage SaaS subscription plan upgrades and renewals'),
  ('audit_logs.view', 'audit', 'View immutable tenant security and financial audit logs')
ON CONFLICT (code) DO NOTHING;

-- Seed Role-Permission mappings matching D-09 and server/lib/rbac.ts
INSERT INTO public.role_permissions (role_code, permission_code)
VALUES
  -- Owner (all 20 MVP permissions)
  ('owner', 'pos.sell'),
  ('owner', 'receipts.view'),
  ('owner', 'customers.manage'),
  ('owner', 'debts.collect'),
  ('owner', 'products.view_selling'),
  ('owner', 'products.view_cost'),
  ('owner', 'products.manage'),
  ('owner', 'inventory.receive_and_adjust'),
  ('owner', 'expenses.manage'),
  ('owner', 'sync_conflicts.resolve'),
  ('owner', 'sales.void_or_return'),
  ('owner', 'reports.view_basic'),
  ('owner', 'staff.view'),
  ('owner', 'staff.manage'),
  ('owner', 'devices.view'),
  ('owner', 'devices.register'),
  ('owner', 'devices.revoke'),
  ('owner', 'settings.manage'),
  ('owner', 'billing.manage'),
  ('owner', 'audit_logs.view'),
  -- Manager (15 operational permissions; no staff.manage, devices.revoke, settings.manage, billing.manage, audit_logs.view)
  ('manager', 'pos.sell'),
  ('manager', 'receipts.view'),
  ('manager', 'customers.manage'),
  ('manager', 'debts.collect'),
  ('manager', 'products.view_selling'),
  ('manager', 'products.view_cost'),
  ('manager', 'products.manage'),
  ('manager', 'inventory.receive_and_adjust'),
  ('manager', 'expenses.manage'),
  ('manager', 'sync_conflicts.resolve'),
  ('manager', 'sales.void_or_return'),
  ('manager', 'reports.view_basic'),
  ('manager', 'staff.view'),
  ('manager', 'devices.view'),
  ('manager', 'devices.register'),
  -- Cashier (6 front-counter permissions; cost prices, reports, returns, settings strictly excluded)
  ('cashier', 'pos.sell'),
  ('cashier', 'receipts.view'),
  ('cashier', 'customers.manage'),
  ('cashier', 'debts.collect'),
  ('cashier', 'products.view_selling'),
  ('cashier', 'devices.register')
ON CONFLICT (role_code, permission_code) DO NOTHING;

-- 4. Link existing business_memberships.role and staff_invitations.role to public.roles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_business_memberships_role'
  ) THEN
    ALTER TABLE public.business_memberships
      ADD CONSTRAINT fk_business_memberships_role
      FOREIGN KEY (role) REFERENCES public.roles (code) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_staff_invitations_role'
  ) THEN
    ALTER TABLE public.staff_invitations
      ADD CONSTRAINT fk_staff_invitations_role
      FOREIGN KEY (role) REFERENCES public.roles (code) ON DELETE RESTRICT;
  END IF;
END $$;

-- 5. Normalized Per-Business Operational Settings (1:1 with public.businesses)
CREATE TABLE IF NOT EXISTS public.business_settings (
  business_id uuid PRIMARY KEY REFERENCES public.businesses (id) ON DELETE RESTRICT,
  receipt_prefix varchar(12) NOT NULL DEFAULT 'REC' CHECK (receipt_prefix ~ '^[A-Z0-9]{2,12}$'),
  return_prefix varchar(12) NOT NULL DEFAULT 'RET' CHECK (return_prefix ~ '^[A-Z0-9]{2,12}$'),
  debt_payment_prefix varchar(12) NOT NULL DEFAULT 'PAY' CHECK (debt_payment_prefix ~ '^[A-Z0-9]{2,12}$'),
  expense_prefix varchar(12) NOT NULL DEFAULT 'EXP' CHECK (expense_prefix ~ '^[A-Z0-9]{2,12}$'),
  restock_prefix varchar(12) NOT NULL DEFAULT 'RST' CHECK (restock_prefix ~ '^[A-Z0-9]{2,12}$'),
  default_low_stock_threshold numeric(18, 3) NOT NULL DEFAULT 5.000 CHECK (default_low_stock_threshold >= 0),
  notify_low_stock boolean NOT NULL DEFAULT true,
  notify_sync_conflicts boolean NOT NULL DEFAULT true,
  notify_subscription_email boolean NOT NULL DEFAULT true,
  show_tax_breakdown_on_receipt boolean NOT NULL DEFAULT true,
  offline_pin_required boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Backfill default settings for any pre-existing businesses
INSERT INTO public.business_settings (business_id)
SELECT b.id
FROM public.businesses b
ON CONFLICT (business_id) DO NOTHING;

COMMIT;
