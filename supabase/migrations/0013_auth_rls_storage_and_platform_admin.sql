-- ============================================================================
-- Migration: 0013_auth_rls_storage_and_platform_admin.sql
-- Stage:     Stage 07 — Supabase Auth, Multi-Tenant Authorization,
--            Membership-Aware Fail-Closed RLS, Storage Isolation &
--            Separated Privileged Platform-Admin Audit Logging
-- Decisions: D-01, D-02, D-08, D-09, C-03
-- Standards: UUID keys, TIMESTAMPTZ, ENABLE + FORCE RLS, append-only audit
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. APPROVED STAGE 07 PERMISSION MATRIX ADDITIONS (attachments.manage)
-- ============================================================================
INSERT INTO public.permissions (code, module, description)
VALUES (
  'attachments.manage',
  'storage',
  'Upload and manage tenant-scoped file attachments in private storage buckets'
)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.role_permissions (role_code, permission_code)
VALUES
  ('owner', 'attachments.manage'),
  ('manager', 'attachments.manage')
ON CONFLICT (role_code, permission_code) DO NOTHING;

-- ============================================================================
-- 2. MEMBERSHIP-AWARE FAIL-CLOSED TENANT ACCESS HELPERS
--    Supports both Express transaction-scoped SET LOCAL variables AND direct
--    Supabase PostgREST JWT claim sub (auth.uid()). Never trusts client headers
--    alone — verifies active business_memberships AND active businesses row.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.effective_actor_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    public.current_actor_user_id(),
    NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
  );
$$;

CREATE OR REPLACE FUNCTION public.has_active_tenant_access(target_business_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT target_business_id IS NOT NULL
     AND target_business_id = public.current_business_id()
     AND EXISTS (
       SELECT 1
       FROM public.business_memberships bm
       INNER JOIN public.businesses b ON b.id = bm.business_id
       WHERE bm.business_id = target_business_id
         AND bm.user_id = public.effective_actor_user_id()
         AND bm.status = 'active'
         AND b.status = 'active'
     );
$$;

CREATE OR REPLACE FUNCTION public.is_business_onboarding_creator(target_business_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT target_business_id IS NOT NULL
     AND target_business_id = public.current_business_id()
     AND EXISTS (
       SELECT 1
       FROM public.businesses b
       WHERE b.id = target_business_id
         AND b.created_by = public.effective_actor_user_id()
     );
$$;

-- ============================================================================
-- 3. UPGRADE TENANT RLS POLICIES TO REQUIRE ACTIVE MEMBERSHIP (INSTANT CUTOFF
--    FOR SUSPENDED OR REVOKED STAFF EVEN WITH AN UNEXPIRED JWT)
-- ============================================================================

-- businesses: onboarding INSERT requires created_by = actor; SELECT/UPDATE requires active membership
DROP POLICY IF EXISTS businesses_tenant_isolation_policy ON public.businesses;
DROP POLICY IF EXISTS businesses_select_policy ON public.businesses;
DROP POLICY IF EXISTS businesses_insert_policy ON public.businesses;
DROP POLICY IF EXISTS businesses_update_policy ON public.businesses;

CREATE POLICY businesses_select_policy
  ON public.businesses
  FOR SELECT
  USING (
    public.has_active_tenant_access(id)
    OR (id = public.current_business_id() AND created_by = public.effective_actor_user_id())
  );

CREATE POLICY businesses_insert_policy
  ON public.businesses
  FOR INSERT
  WITH CHECK (
    id = public.current_business_id()
    AND created_by = public.effective_actor_user_id()
  );

CREATE POLICY businesses_update_policy
  ON public.businesses
  FOR UPDATE
  USING (public.has_active_tenant_access(id))
  WITH CHECK (public.has_active_tenant_access(id));

-- business_memberships: self active list when no business_id set, or active tenant access;
-- onboarding owner insertion and verified invitation acceptance permitted cleanly.
DROP POLICY IF EXISTS business_memberships_select_policy ON public.business_memberships;
DROP POLICY IF EXISTS business_memberships_mutate_policy ON public.business_memberships;
DROP POLICY IF EXISTS business_memberships_insert_policy ON public.business_memberships;
DROP POLICY IF EXISTS business_memberships_update_policy ON public.business_memberships;

CREATE POLICY business_memberships_select_policy
  ON public.business_memberships
  FOR SELECT
  USING (
    public.has_active_tenant_access(business_id)
    OR (
      public.current_business_id() IS NULL
      AND user_id = public.effective_actor_user_id()
      AND status = 'active'
    )
  );

CREATE POLICY business_memberships_insert_policy
  ON public.business_memberships
  FOR INSERT
  WITH CHECK (
    public.has_active_tenant_access(business_id)
    OR (
      business_id = public.current_business_id()
      AND user_id = public.effective_actor_user_id()
      AND (
        public.is_business_onboarding_creator(business_id)
        OR EXISTS (
          SELECT 1
          FROM public.staff_invitations si
          INNER JOIN public.user_profiles up ON up.id = public.effective_actor_user_id()
          WHERE si.business_id = business_memberships.business_id
            AND lower(si.email) = lower(up.email)
            AND si.status IN ('pending', 'accepted')
        )
      )
    )
  );

CREATE POLICY business_memberships_update_policy
  ON public.business_memberships
  FOR UPDATE
  USING (public.has_active_tenant_access(business_id))
  WITH CHECK (public.has_active_tenant_access(business_id));

-- audit_logs: INSERT & SELECT anchored strictly to active tenant access
DROP POLICY IF EXISTS audit_logs_select_policy ON public.audit_logs;
DROP POLICY IF EXISTS audit_logs_insert_policy ON public.audit_logs;

CREATE POLICY audit_logs_select_policy
  ON public.audit_logs
  FOR SELECT
  USING (public.has_active_tenant_access(business_id));

CREATE POLICY audit_logs_insert_policy
  ON public.audit_logs
  FOR INSERT
  WITH CHECK (public.has_active_tenant_access(business_id));

-- Upgrade all remaining P-02b & Stage 06 tenant-owned tables
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'business_locations',
    'business_subscriptions',
    'staff_invitations',
    'registered_devices',
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
    'attachments'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY;', tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I_tenant_isolation_policy ON public.%I;', tbl, tbl);
    EXECUTE format(
      'CREATE POLICY %I_tenant_isolation_policy ON public.%I FOR ALL USING (public.has_active_tenant_access(business_id)) WITH CHECK (public.has_active_tenant_access(business_id));',
      tbl,
      tbl
    );
  END LOOP;
END $$;

-- ============================================================================
-- 4. SEPARATED PRIVILEGED PLATFORM-ADMIN AUDIT LOGS (C-03)
--    Strictly isolated from tenant audit_logs; append-only; fail-closed RLS
--    denying all tenant sessions.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.platform_admin_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL REFERENCES public.platform_admins (user_id) ON DELETE RESTRICT,
  admin_role text NOT NULL CHECK (admin_role IN ('super_admin', 'support_readonly')),
  action text NOT NULL,
  target_business_id uuid REFERENCES public.businesses (id) ON DELETE RESTRICT,
  target_entity_type text NOT NULL,
  target_entity_id uuid,
  support_ticket_ref varchar(64),
  reason text NOT NULL CHECK (length(trim(reason)) >= 5),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_address inet,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_admin_audit_created
  ON public.platform_admin_audit_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_platform_admin_audit_target_biz
  ON public.platform_admin_audit_logs (target_business_id, created_at DESC)
  WHERE target_business_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_platform_admin_audit_logs_immutable ON public.platform_admin_audit_logs;
CREATE TRIGGER trg_platform_admin_audit_logs_immutable
  BEFORE UPDATE OR DELETE ON public.platform_admin_audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_audit_log_mutation();

ALTER TABLE public.platform_admin_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_admin_audit_logs FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS platform_admin_audit_logs_deny_tenant_policy ON public.platform_admin_audit_logs;
CREATE POLICY platform_admin_audit_logs_deny_tenant_policy
  ON public.platform_admin_audit_logs
  FOR ALL
  USING (false)
  WITH CHECK (false);

-- ============================================================================
-- 5. SUPABASE STORAGE BUCKET TENANT ISOLATION RLS (storage.objects)
--    Enforces strict <business_id>/... object prefix anchored to
--    public.has_active_tenant_access() when Supabase storage schema exists.
-- ============================================================================
DO $$
BEGIN
  IF to_regclass('storage.objects') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS festola_storage_tenant_select ON storage.objects';
    EXECUTE $policy$
      CREATE POLICY festola_storage_tenant_select
        ON storage.objects
        FOR SELECT
        TO authenticated
        USING (
          bucket_id IN ('festola-attachments', 'festola-receipts', 'festola-logos')
          AND split_part(name, '/', 1) ~ '^[0-9a-fA-F-]{36}$'
          AND public.has_active_tenant_access(split_part(name, '/', 1)::uuid)
        )
    $policy$;

    EXECUTE 'DROP POLICY IF EXISTS festola_storage_tenant_insert ON storage.objects';
    EXECUTE $policy$
      CREATE POLICY festola_storage_tenant_insert
        ON storage.objects
        FOR INSERT
        TO authenticated
        WITH CHECK (
          bucket_id IN ('festola-attachments', 'festola-receipts', 'festola-logos')
          AND split_part(name, '/', 1) ~ '^[0-9a-fA-F-]{36}$'
          AND name NOT LIKE '%..%'
          AND public.has_active_tenant_access(split_part(name, '/', 1)::uuid)
        )
    $policy$;

    EXECUTE 'DROP POLICY IF EXISTS festola_storage_tenant_update_deny ON storage.objects';
    EXECUTE $policy$
      CREATE POLICY festola_storage_tenant_update_deny
        ON storage.objects
        FOR UPDATE
        TO authenticated
        USING (false)
        WITH CHECK (false)
    $policy$;

    EXECUTE 'DROP POLICY IF EXISTS festola_storage_tenant_delete_deny ON storage.objects';
    EXECUTE $policy$
      CREATE POLICY festola_storage_tenant_delete_deny
        ON storage.objects
        FOR DELETE
        TO authenticated
        USING (false)
    $policy$;
  END IF;
END $$;

COMMIT;
