-- ============================================================================
-- Migration: 0002_identity_rls_and_helpers.sql
-- Stage:     P-02b Fail-Closed Row-Level Security, Triggers & Immutability
-- Security:  Every tenant table MUST enforce ENABLE + FORCE ROW LEVEL SECURITY
--            anchored to public.current_business_id() (fails closed to NULL -> 0 rows).
-- ============================================================================

-- 1. Shared updated_at trigger function
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- 2. Immutable audit_logs guard (D-08: prevent UPDATE or DELETE on audit_logs)
CREATE OR REPLACE FUNCTION public.prevent_audit_log_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only; UPDATE and DELETE operations are prohibited.'
    USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_logs_immutable ON public.audit_logs;
CREATE TRIGGER trg_audit_logs_immutable
  BEFORE UPDATE OR DELETE ON public.audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_audit_log_mutation();

-- Attach updated_at triggers to mutable identity & tenant tables
DROP TRIGGER IF EXISTS trg_user_profiles_updated_at ON public.user_profiles;
CREATE TRIGGER trg_user_profiles_updated_at
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_platform_admins_updated_at ON public.platform_admins;
CREATE TRIGGER trg_platform_admins_updated_at
  BEFORE UPDATE ON public.platform_admins
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_subscription_plans_updated_at ON public.subscription_plans;
CREATE TRIGGER trg_subscription_plans_updated_at
  BEFORE UPDATE ON public.subscription_plans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_businesses_updated_at ON public.businesses;
CREATE TRIGGER trg_businesses_updated_at
  BEFORE UPDATE ON public.businesses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_business_locations_updated_at ON public.business_locations;
CREATE TRIGGER trg_business_locations_updated_at
  BEFORE UPDATE ON public.business_locations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_business_subscriptions_updated_at ON public.business_subscriptions;
CREATE TRIGGER trg_business_subscriptions_updated_at
  BEFORE UPDATE ON public.business_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_business_memberships_updated_at ON public.business_memberships;
CREATE TRIGGER trg_business_memberships_updated_at
  BEFORE UPDATE ON public.business_memberships
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_staff_invitations_updated_at ON public.staff_invitations;
CREATE TRIGGER trg_staff_invitations_updated_at
  BEFORE UPDATE ON public.staff_invitations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_registered_devices_updated_at ON public.registered_devices;
CREATE TRIGGER trg_registered_devices_updated_at
  BEFORE UPDATE ON public.registered_devices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. Membership-check helper anchored to transaction-scoped actor & business
CREATE OR REPLACE FUNCTION public.has_active_business_membership(target_business_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.business_memberships bm
    WHERE bm.business_id = target_business_id
      AND bm.user_id = public.current_actor_user_id()
      AND bm.status = 'active'
  );
$$;

-- ============================================================================
-- 4. ENABLE + FORCE ROW LEVEL SECURITY ON ALL IDENTITY & TENANT TABLES
-- ============================================================================

-- user_profiles: user may access only their own profile
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_profiles_self_policy ON public.user_profiles;
CREATE POLICY user_profiles_self_policy
  ON public.user_profiles
  FOR ALL
  USING (id = public.current_actor_user_id())
  WITH CHECK (id = public.current_actor_user_id());

-- platform_admins: fail-closed default deny (only explicit active self lookup)
ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_admins FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS platform_admins_self_read_policy ON public.platform_admins;
CREATE POLICY platform_admins_self_read_policy
  ON public.platform_admins
  FOR SELECT
  USING (user_id = public.current_actor_user_id() AND is_active = true);

-- subscription_plans: read-only catalog for active plans (mutations restricted to DB migrations/ops)
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_plans FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS subscription_plans_read_policy ON public.subscription_plans;
CREATE POLICY subscription_plans_read_policy
  ON public.subscription_plans
  FOR SELECT
  USING (is_active = true);

-- businesses: strictly scoped to active current_business_id()
ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.businesses FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS businesses_tenant_isolation_policy ON public.businesses;
CREATE POLICY businesses_tenant_isolation_policy
  ON public.businesses
  FOR ALL
  USING (id = public.current_business_id())
  WITH CHECK (id = public.current_business_id());

-- business_locations: strictly scoped to current_business_id()
ALTER TABLE public.business_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_locations FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS business_locations_tenant_isolation_policy ON public.business_locations;
CREATE POLICY business_locations_tenant_isolation_policy
  ON public.business_locations
  FOR ALL
  USING (business_id = public.current_business_id())
  WITH CHECK (business_id = public.current_business_id());

-- business_subscriptions: strictly scoped to current_business_id()
ALTER TABLE public.business_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_subscriptions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS business_subscriptions_tenant_isolation_policy ON public.business_subscriptions;
CREATE POLICY business_subscriptions_tenant_isolation_policy
  ON public.business_subscriptions
  FOR ALL
  USING (business_id = public.current_business_id())
  WITH CHECK (business_id = public.current_business_id());

-- business_memberships: strictly scoped to current_business_id() OR actor's own active membership list
ALTER TABLE public.business_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_memberships FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS business_memberships_select_policy ON public.business_memberships;
CREATE POLICY business_memberships_select_policy
  ON public.business_memberships
  FOR SELECT
  USING (
    business_id = public.current_business_id()
    OR (
      public.current_business_id() IS NULL
      AND user_id = public.current_actor_user_id()
      AND status = 'active'
    )
  );

DROP POLICY IF EXISTS business_memberships_mutate_policy ON public.business_memberships;
CREATE POLICY business_memberships_mutate_policy
  ON public.business_memberships
  FOR ALL
  USING (business_id = public.current_business_id())
  WITH CHECK (business_id = public.current_business_id());

-- staff_invitations: strictly scoped to current_business_id()
ALTER TABLE public.staff_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_invitations FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS staff_invitations_tenant_isolation_policy ON public.staff_invitations;
CREATE POLICY staff_invitations_tenant_isolation_policy
  ON public.staff_invitations
  FOR ALL
  USING (business_id = public.current_business_id())
  WITH CHECK (business_id = public.current_business_id());

-- registered_devices: strictly scoped to current_business_id()
ALTER TABLE public.registered_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registered_devices FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS registered_devices_tenant_isolation_policy ON public.registered_devices;
CREATE POLICY registered_devices_tenant_isolation_policy
  ON public.registered_devices
  FOR ALL
  USING (business_id = public.current_business_id())
  WITH CHECK (business_id = public.current_business_id());

-- audit_logs: strictly scoped to current_business_id(); INSERT & SELECT only
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_logs_select_policy ON public.audit_logs;
CREATE POLICY audit_logs_select_policy
  ON public.audit_logs
  FOR SELECT
  USING (business_id = public.current_business_id());

DROP POLICY IF EXISTS audit_logs_insert_policy ON public.audit_logs;
CREATE POLICY audit_logs_insert_policy
  ON public.audit_logs
  FOR INSERT
  WITH CHECK (business_id = public.current_business_id());

-- 5. Tightly scoped invitation token lookup (returns minimal metadata only for matching SHA-256 hash)
CREATE OR REPLACE FUNCTION public.lookup_pending_invitation_by_hash(p_token_hash text)
RETURNS TABLE (
  id uuid,
  business_id uuid,
  email text,
  role text,
  status text,
  expires_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT si.id, si.business_id, si.email, si.role, si.status, si.expires_at
  FROM public.staff_invitations si
  WHERE si.token_hash = p_token_hash
  LIMIT 1;
$$;

