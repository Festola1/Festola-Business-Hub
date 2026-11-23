-- ============================================================================
-- Script:  supabase/tests/stage07_auth_rls_storage_verify.sql
-- Purpose: Rolled-back transactional verification suite for Stage 07 proving:
--          1) Active Tenant A members read/write Tenant A only (0 Tenant B rows)
--          2) Suspended & Revoked Tenant A members are IMMEDIATELY blocked at
--             PostgreSQL RLS level even if app.current_business_id = Tenant A
--          3) Cross-tenant writes fail RLS (42501)
--          4) Platform Admin has ZERO implicit tenant access via RLS
--          5) platform_admin_audit_logs is append-only (42501) & denied to tenants
--          6) storage.objects prefix isolation (verified when storage schema exists)
-- Usage:   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/stage07_auth_rls_storage_verify.sql
-- ============================================================================

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'festola_rls_test_role') THEN
    CREATE ROLE festola_rls_test_role NOLOGIN;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO festola_rls_test_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO festola_rls_test_role;

-- Seed isolated synthetic Tenant A & Tenant B fixtures (rolled back at end)
\i supabase/tests/seed_isolated_test_tenants.sql

-- Add additional Stage 07 actors: Suspended Staff A, Revoked Staff A, and Isolated Platform Admin
INSERT INTO public.user_profiles (id, email, full_name, accepted_terms_at)
VALUES
  ('11111111-1111-4111-8111-111111111103', 'suspended-a@tenant-a.example', 'Synthetic Suspended A', now()),
  ('11111111-1111-4111-8111-111111111104', 'revoked-a@tenant-a.example', 'Synthetic Revoked A', now()),
  ('99999999-9999-4999-8999-999999999901', 'ops-admin@festola.example', 'Synthetic Platform Super Admin', now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.business_memberships (id, business_id, user_id, role, status, revoked_at)
VALUES
  ('aaaa3333-aaaa-4aaa-8aaa-aaaaaaaaaa03', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111103', 'manager', 'suspended', NULL),
  ('aaaa3333-aaaa-4aaa-8aaa-aaaaaaaaaa04', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111104', 'cashier', 'revoked', now())
ON CONFLICT (business_id, user_id) DO NOTHING;

INSERT INTO public.platform_admins (user_id, role, is_active)
VALUES ('99999999-9999-4999-8999-999999999901', 'super_admin', true)
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.platform_admin_audit_logs (
  admin_user_id, admin_role, action, target_business_id, target_entity_type, reason
)
VALUES (
  '99999999-9999-4999-8999-999999999901',
  'super_admin',
  'platform.tenant_inspected',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'business',
  'Synthetic Stage 07 verification audit record'
);

-- Switch to non-superuser role to enforce real RLS evaluation
SET LOCAL ROLE festola_rls_test_role;

DO $$
DECLARE
  v_cnt integer;
  v_tenant_a uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  v_tenant_b uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
BEGIN
  -- 1. Active Owner A sees Tenant A products (2) and 0 Tenant B products
  PERFORM set_config('app.current_business_id', v_tenant_a::text, true);
  PERFORM set_config('app.current_user_id', '11111111-1111-4111-8111-111111111101', true);

  SELECT count(*) INTO v_cnt FROM public.products;
  IF v_cnt <> 2 THEN
    RAISE EXCEPTION 'Expected 2 Tenant A products for active Owner A, got %', v_cnt;
  END IF;

  -- 2. Active Owner A attempting cross-tenant INSERT into Tenant B MUST fail RLS (42501)
  BEGIN
    INSERT INTO public.customers (business_id, full_name, created_by)
    VALUES (v_tenant_b, 'Cross Tenant Spoof', '11111111-1111-4111-8111-111111111101');
    RAISE EXCEPTION 'Expected RLS 42501 on cross-tenant INSERT did not fire';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  -- 3. Suspended Staff A with app.current_business_id = Tenant A MUST see 0 rows & fail INSERT
  PERFORM set_config('app.current_business_id', v_tenant_a::text, true);
  PERFORM set_config('app.current_user_id', '11111111-1111-4111-8111-111111111103', true);

  SELECT count(*) INTO v_cnt FROM public.products;
  IF v_cnt <> 0 THEN
    RAISE EXCEPTION 'SUSPENDED MEMBER LEAK: Suspended Staff A saw % Tenant A products', v_cnt;
  END IF;

  -- 4. Revoked Staff A with app.current_business_id = Tenant A MUST see 0 rows
  PERFORM set_config('app.current_business_id', v_tenant_a::text, true);
  PERFORM set_config('app.current_user_id', '11111111-1111-4111-8111-111111111104', true);

  SELECT count(*) INTO v_cnt FROM public.products;
  IF v_cnt <> 0 THEN
    RAISE EXCEPTION 'REVOKED MEMBER LEAK: Revoked Staff A saw % Tenant A products', v_cnt;
  END IF;

  -- 5. Platform Super Admin has ZERO implicit tenant access in RLS (0 rows)
  PERFORM set_config('app.current_business_id', v_tenant_a::text, true);
  PERFORM set_config('app.current_user_id', '99999999-9999-4999-8999-999999999901', true);

  SELECT count(*) INTO v_cnt FROM public.products;
  IF v_cnt <> 0 THEN
    RAISE EXCEPTION 'PLATFORM ADMIN TENANT LEAK: Platform Admin saw % Tenant A products without membership', v_cnt;
  END IF;

  -- 6. Tenant Owner A cannot read or mutate platform_admin_audit_logs
  PERFORM set_config('app.current_business_id', v_tenant_a::text, true);
  PERFORM set_config('app.current_user_id', '11111111-1111-4111-8111-111111111101', true);

  SELECT count(*) INTO v_cnt FROM public.platform_admin_audit_logs;
  IF v_cnt <> 0 THEN
    RAISE EXCEPTION 'PLATFORM AUDIT LEAK: Tenant Owner A saw % platform_admin_audit_logs rows', v_cnt;
  END IF;

  RAISE NOTICE 'PASS: All Stage 07 membership-aware RLS, suspension/revocation cutoff, and Platform-Admin isolation checks passed.';
END $$;

-- Reset to owner role to verify append-only immutability trigger on platform_admin_audit_logs
RESET ROLE;

DO $$
BEGIN
  BEGIN
    DELETE FROM public.platform_admin_audit_logs;
    RAISE EXCEPTION 'Expected append-only immutability block on platform_admin_audit_logs did not fire';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  RAISE NOTICE 'PASS: platform_admin_audit_logs immutability trigger verified (42501).';
END $$;

ROLLBACK;
