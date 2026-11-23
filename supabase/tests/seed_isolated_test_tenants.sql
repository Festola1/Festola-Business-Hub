-- ============================================================================
-- Script:  supabase/tests/seed_isolated_test_tenants.sql
-- Purpose: Synthetic isolated test fixtures ONLY (RFC-2606 .example domain).
-- Safety:  NEVER run in production; NEVER insert real customer or business data.
--          Intended strictly for ephemeral CI/test databases or inside a
--          BEGIN; ... ROLLBACK; verification transaction.
-- ============================================================================

DO $$
BEGIN
  IF lower(current_database()) LIKE '%prod%' THEN
    RAISE EXCEPTION 'Refusing to seed isolated synthetic test data into production database: %', current_database();
  END IF;
END $$;

-- Fixed deterministic UUIDs for isolated automated tests (Synthetic Tenant A & B)
-- User Profiles (synthetic RFC-2606 .example emails only)
INSERT INTO public.user_profiles (id, email, full_name, phone, accepted_terms_at)
VALUES
  ('11111111-1111-4111-8111-111111111101', 'owner-a@tenant-a.example', 'Synthetic Owner A', '+2348000000101', now()),
  ('11111111-1111-4111-8111-111111111102', 'cashier-a@tenant-a.example', 'Synthetic Cashier A', '+2348000000102', now()),
  ('22222222-2222-4222-8222-222222222201', 'owner-b@tenant-b.example', 'Synthetic Owner B', '+2348000000201', now())
ON CONFLICT (id) DO NOTHING;

-- Businesses (Tenant A: Tax OFF default per D-03; Tenant B: Tax 7.5% exclusive)
INSERT INTO public.businesses (
  id, name, slug, currency_code, timezone, tax_enabled, tax_mode, tax_rate, allow_negative_stock, created_by
)
VALUES
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'Synthetic Retail Fixture A',
    'synthetic-retail-fixture-a',
    'NGN',
    'Africa/Lagos',
    false,
    'exclusive',
    0.0000,
    false,
    '11111111-1111-4111-8111-111111111101'
  ),
  (
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'Synthetic Mart Fixture B',
    'synthetic-mart-fixture-b',
    'NGN',
    'Africa/Lagos',
    true,
    'exclusive',
    7.5000,
    false,
    '22222222-2222-4222-8222-222222222201'
  )
ON CONFLICT (id) DO NOTHING;

-- Business Settings
INSERT INTO public.business_settings (business_id)
VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')
ON CONFLICT (business_id) DO NOTHING;

-- Single Active Location per Tenant (D-02)
INSERT INTO public.business_locations (id, business_id, name, is_default, is_active)
VALUES
  ('aaaa1111-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Main Store A', true, true),
  ('bbbb1111-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Main Store B', true, true)
ON CONFLICT (id) DO NOTHING;

-- Active Trial Subscriptions (14-day Free Trial template from 0001)
INSERT INTO public.business_subscriptions (
  id, business_id, plan_id, status, trial_ends_at, current_period_start, current_period_end
)
SELECT
  'aaaa2222-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  sp.id,
  'trialing',
  now() + interval '14 days',
  now(),
  now() + interval '14 days'
FROM public.subscription_plans sp
WHERE sp.code = 'free_trial_14d'
ON CONFLICT (business_id) DO NOTHING;

INSERT INTO public.business_subscriptions (
  id, business_id, plan_id, status, trial_ends_at, current_period_start, current_period_end
)
SELECT
  'bbbb2222-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  sp.id,
  'trialing',
  now() + interval '14 days',
  now(),
  now() + interval '14 days'
FROM public.subscription_plans sp
WHERE sp.code = 'free_trial_14d'
ON CONFLICT (business_id) DO NOTHING;

-- Memberships (D-09 fixed roles)
INSERT INTO public.business_memberships (id, business_id, user_id, role, status)
VALUES
  ('aaaa3333-aaaa-4aaa-8aaa-aaaaaaaaaa01', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111101', 'owner', 'active'),
  ('aaaa3333-aaaa-4aaa-8aaa-aaaaaaaaaa02', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111102', 'cashier', 'active'),
  ('bbbb3333-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '22222222-2222-4222-8222-222222222201', 'owner', 'active')
ON CONFLICT (business_id, user_id) DO NOTHING;

-- Registered Offline Devices (D-09 7-day offline window)
INSERT INTO public.registered_devices (
  id, business_id, user_id, device_code, device_fingerprint_hash, device_name, status, offline_expires_at
)
VALUES
  (
    'aaaa4444-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '11111111-1111-4111-8111-111111111101',
    'DEVA',
    'sha256-synthetic-device-a-fingerprint-000000000000000000000000000001',
    'Synthetic POS Terminal A',
    'active',
    now() + interval '7 days'
  ),
  (
    'bbbb4444-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    '22222222-2222-4222-8222-222222222201',
    'DEVB',
    'sha256-synthetic-device-b-fingerprint-000000000000000000000000000002',
    'Synthetic POS Terminal B',
    'active',
    now() + interval '7 days'
  )
ON CONFLICT (id) DO NOTHING;

-- Product Categories
INSERT INTO public.product_categories (id, business_id, name)
VALUES
  ('aaaa5555-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Synthetic Groceries A'),
  ('bbbb5555-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Synthetic Beverages B')
ON CONFLICT (id) DO NOTHING;

-- Products (Tenant A: 1 standard + 1 tax-exempt; Tenant B: 1 standard)
INSERT INTO public.products (
  id, business_id, category_id, sku, barcode, name, unit, selling_price, cost_price, is_tax_exempt, reorder_level, created_by
)
VALUES
  (
    'aaaa6666-aaaa-4aaa-8aaa-aaaaaaaaaa01',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'aaaa5555-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'SYN-A-001',
    '6000000000011',
    'Synthetic Rice 5kg',
    'bag',
    9500.00,
    7000.00,
    false,
    5.000,
    '11111111-1111-4111-8111-111111111101'
  ),
  (
    'aaaa6666-aaaa-4aaa-8aaa-aaaaaaaaaa02',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'aaaa5555-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'SYN-A-002',
    '6000000000028',
    'Synthetic Basic Bread (Tax Exempt)',
    'loaf',
    1200.00,
    850.00,
    true,
    10.000,
    '11111111-1111-4111-8111-111111111101'
  ),
  (
    'bbbb6666-bbbb-4bbb-8bbb-bbbbbbbbbb01',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'bbbb5555-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'SYN-B-001',
    '6000000000035',
    'Synthetic Bottled Water Pack',
    'pack',
    2500.00,
    1800.00,
    false,
    10.000,
    '22222222-2222-4222-8222-222222222201'
  )
ON CONFLICT (id) DO NOTHING;

-- Stock Balances + Matching Initial Stock Movements (balanced 1:1)
INSERT INTO public.stock_balances (
  id, business_id, location_id, product_id, quantity_on_hand, wac_unit_cost, last_positive_wac
)
VALUES
  ('aaaa7777-aaaa-4aaa-8aaa-aaaaaaaaaa01', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaa1111-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaa6666-aaaa-4aaa-8aaa-aaaaaaaaaa01', 20.000, 7000.00, 7000.00),
  ('aaaa7777-aaaa-4aaa-8aaa-aaaaaaaaaa02', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaa1111-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaa6666-aaaa-4aaa-8aaa-aaaaaaaaaa02', 30.000, 850.00, 850.00),
  ('bbbb7777-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'bbbb1111-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'bbbb6666-bbbb-4bbb-8bbb-bbbbbbbbbb01', 15.000, 1800.00, 1800.00)
ON CONFLICT (business_id, location_id, product_id) DO NOTHING;

INSERT INTO public.stock_movements (
  id, business_id, location_id, product_id, movement_type, quantity_delta, quantity_after, unit_cost_snapshot, wac_after, reference_type, reference_id, reason, created_by
)
VALUES
  ('aaaa8888-aaaa-4aaa-8aaa-aaaaaaaaaa01', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaa1111-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaa6666-aaaa-4aaa-8aaa-aaaaaaaaaa01', 'initial_stock', 20.000, 20.000, 7000.00, 7000.00, 'product', 'aaaa6666-aaaa-4aaa-8aaa-aaaaaaaaaa01', 'Synthetic test seed', '11111111-1111-4111-8111-111111111101'),
  ('aaaa8888-aaaa-4aaa-8aaa-aaaaaaaaaa02', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaa1111-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaa6666-aaaa-4aaa-8aaa-aaaaaaaaaa02', 'initial_stock', 30.000, 30.000, 850.00, 850.00, 'product', 'aaaa6666-aaaa-4aaa-8aaa-aaaaaaaaaa02', 'Synthetic test seed', '11111111-1111-4111-8111-111111111101'),
  ('bbbb8888-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'bbbb1111-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'bbbb6666-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'initial_stock', 15.000, 15.000, 1800.00, 1800.00, 'product', 'bbbb6666-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'Synthetic test seed', '22222222-2222-4222-8222-222222222201')
ON CONFLICT (id) DO NOTHING;

-- Synthetic Customers & Expense Categories
INSERT INTO public.customers (id, business_id, customer_code, full_name, phone, credit_limit, created_by)
VALUES
  ('aaaa9999-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'CUST-A-001', 'Synthetic Customer A', '+2348000000901', 50000.00, '11111111-1111-4111-8111-111111111101'),
  ('bbbb9999-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'CUST-B-001', 'Synthetic Customer B', '+2348000000902', 25000.00, '22222222-2222-4222-8222-222222222201')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.expense_categories (id, business_id, name)
VALUES
  ('aaaa0000-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Utilities & Power'),
  ('bbbb0000-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Utilities & Power')
ON CONFLICT (id) DO NOTHING;
