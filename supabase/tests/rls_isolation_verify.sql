-- ============================================================================
-- Verification Script: supabase/tests/rls_isolation_verify.sql
-- Gate: G-01 Multi-Tenant Isolation & Fail-Closed RLS Proof
-- Usage: Run inside a non-production dev/staging PostgreSQL database AFTER
--        applying migrations 0000..0002. Wrapped in BEGIN..ROLLBACK so no
--        synthetic test data persists.
-- ============================================================================

BEGIN;

-- Create two isolated synthetic users & tenants under explicit context
DO $$
DECLARE
  user_a uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  user_b uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  biz_a  uuid := '11111111-1111-4111-8111-111111111111';
  biz_b  uuid := '22222222-2222-4222-8222-222222222222';
  trial_plan_id uuid;
  visible_count integer;
  mutation_blocked boolean := false;
BEGIN
  SELECT id INTO trial_plan_id
  FROM public.subscription_plans
  WHERE code = 'free_trial_14d';

  IF trial_plan_id IS NULL THEN
    RAISE EXCEPTION 'Expected free_trial_14d seed plan to exist.';
  END IF;

  -- Seed User A & Business A
  PERFORM set_config('app.current_user_id', user_a::text, true);
  PERFORM set_config('app.current_business_id', biz_a::text, true);

  INSERT INTO public.user_profiles (id, email, full_name, accepted_terms_at)
  VALUES (user_a, 'owner-a@example.test', 'Owner A', now());

  INSERT INTO public.businesses (id, name, slug, created_by)
  VALUES (biz_a, 'Tenant A Shop', 'tenant-a-shop', user_a);

  INSERT INTO public.business_locations (business_id, name)
  VALUES (biz_a, 'Main Store A');

  INSERT INTO public.business_subscriptions (business_id, plan_id, status, trial_ends_at, current_period_end)
  VALUES (biz_a, trial_plan_id, 'trialing', now() + interval '14 days', now() + interval '14 days');

  INSERT INTO public.business_memberships (business_id, user_id, role, status)
  VALUES (biz_a, user_a, 'owner', 'active');

  INSERT INTO public.audit_logs (business_id, actor_user_id, actor_role, action, entity_type, entity_id)
  VALUES (biz_a, user_a, 'owner', 'business.created', 'business', biz_a);

  -- Seed User B & Business B
  PERFORM set_config('app.current_user_id', user_b::text, true);
  PERFORM set_config('app.current_business_id', biz_b::text, true);

  INSERT INTO public.user_profiles (id, email, full_name, accepted_terms_at)
  VALUES (user_b, 'owner-b@example.test', 'Owner B', now());

  INSERT INTO public.businesses (id, name, slug, created_by)
  VALUES (biz_b, 'Tenant B Shop', 'tenant-b-shop', user_b);

  INSERT INTO public.business_locations (business_id, name)
  VALUES (biz_b, 'Main Store B');

  INSERT INTO public.business_subscriptions (business_id, plan_id, status, trial_ends_at, current_period_end)
  VALUES (biz_b, trial_plan_id, 'trialing', now() + interval '14 days', now() + interval '14 days');

  INSERT INTO public.business_memberships (business_id, user_id, role, status)
  VALUES (biz_b, user_b, 'owner', 'active');

  -- ASSERT 1: Unset tenant context MUST return 0 rows (fail-closed)
  PERFORM set_config('app.current_business_id', '', true);
  SELECT count(*) INTO visible_count FROM public.businesses;
  IF visible_count <> 0 THEN
    RAISE EXCEPTION 'FAIL-CLOSED VIOLATION: businesses returned % rows with empty context', visible_count;
  END IF;

  -- ASSERT 2: Tenant A context MUST see ONLY Tenant A (never Tenant B)
  PERFORM set_config('app.current_user_id', user_a::text, true);
  PERFORM set_config('app.current_business_id', biz_a::text, true);

  SELECT count(*) INTO visible_count FROM public.businesses;
  IF visible_count <> 1 THEN
    RAISE EXCEPTION 'TENANT ISOLATION VIOLATION: Tenant A saw % businesses', visible_count;
  END IF;

  SELECT count(*) INTO visible_count FROM public.business_locations WHERE business_id = biz_b;
  IF visible_count <> 0 THEN
    RAISE EXCEPTION 'CROSS-TENANT LEAK: Tenant A saw Tenant B locations';
  END IF;

  -- ASSERT 3: D-02 Single active location constraint blocks 2nd active location in MVP
  BEGIN
    INSERT INTO public.business_locations (business_id, name, is_active)
    VALUES (biz_a, 'Second Branch', true);
    RAISE EXCEPTION 'D-02 VIOLATION: second active location was allowed in MVP';
  EXCEPTION
    WHEN unique_violation THEN
      -- Expected
      NULL;
  END;

  -- ASSERT 4: D-08 audit_logs immutability trigger blocks DELETE/UPDATE
  BEGIN
    DELETE FROM public.audit_logs WHERE business_id = biz_a;
  EXCEPTION
    WHEN insufficient_privilege THEN
      mutation_blocked := true;
  END;

  IF NOT mutation_blocked THEN
    RAISE EXCEPTION 'D-08 VIOLATION: DELETE on audit_logs was not blocked';
  END IF;

  RAISE NOTICE 'G-01 RLS & INVARIANT VERIFICATION PASSED';
END $$;

ROLLBACK;
