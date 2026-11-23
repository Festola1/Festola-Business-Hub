-- ============================================================================
-- Migration: 0001_identity_and_tenants.sql
-- Stage:     P-02b Core Identity, Multi-Tenant Schema & Governance Primitives
-- Decisions: Locked D-01, D-02, D-03, D-04, D-08, D-09, D-14, C-01..C-04
-- Standards: UUID keys, TIMESTAMPTZ, NUMERIC(18,2) money, NUMERIC(8,4) rates,
--            composite tenant unique keys for cross-table FK safety.
-- ============================================================================

-- 1. User Profiles (1:1 mirror of Supabase auth.users identity metadata)
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id uuid PRIMARY KEY,
  email text NOT NULL UNIQUE,
  full_name text NOT NULL,
  phone text,
  accepted_terms_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Isolated Internal Platform Admins (C-03 / P-07 — never grants tenant access)
CREATE TABLE IF NOT EXISTS public.platform_admins (
  user_id uuid PRIMARY KEY REFERENCES public.user_profiles (id) ON DELETE RESTRICT,
  role text NOT NULL CHECK (role IN ('super_admin', 'support_readonly')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Subscription Plans (D-01: data-driven; exact paid plan names/NGN prices TBD before P-07)
CREATE TABLE IF NOT EXISTS public.subscription_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  display_name text NOT NULL,
  billing_cycle text NOT NULL CHECK (billing_cycle IN ('trial', 'monthly', 'annual')),
  currency_code char(3) NOT NULL DEFAULT 'NGN',
  price_ngn numeric(18, 2) NOT NULL DEFAULT 0.00 CHECK (price_ngn >= 0),
  max_staff integer NOT NULL CHECK (max_staff > 0),
  max_products integer NOT NULL CHECK (max_products > 0),
  max_offline_devices integer NOT NULL CHECK (max_offline_devices > 0),
  is_trial boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Seed only the D-01 14-day Free Trial template; paid tiers stay TBD until P-07 approval.
INSERT INTO public.subscription_plans (
  code,
  display_name,
  billing_cycle,
  currency_code,
  price_ngn,
  max_staff,
  max_products,
  max_offline_devices,
  is_trial,
  is_active
)
VALUES (
  'free_trial_14d',
  '14-Day Free Trial',
  'trial',
  'NGN',
  0.00,
  3,
  500,
  2,
  true,
  true
)
ON CONFLICT (code) DO NOTHING;

-- 4. Businesses (Multi-tenant root entity)
CREATE TABLE IF NOT EXISTS public.businesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  currency_code char(3) NOT NULL DEFAULT 'NGN',
  timezone text NOT NULL DEFAULT 'Africa/Lagos',
  phone text,
  address text,
  logo_url text,
  tax_id text,
  -- D-03: Configurable tax engine OFF by default in MVP
  tax_enabled boolean NOT NULL DEFAULT false,
  tax_mode text NOT NULL DEFAULT 'exclusive' CHECK (tax_mode IN ('exclusive', 'inclusive')),
  tax_rate numeric(8, 4) NOT NULL DEFAULT 0.0000 CHECK (tax_rate >= 0 AND tax_rate <= 100),
  -- D-04: Negative stock blocked by default; Owner-configurable override
  allow_negative_stock boolean NOT NULL DEFAULT false,
  -- D-14: Optional receipt footer text
  receipt_footer text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deletion_pending')),
  deletion_requested_at timestamptz,
  created_by uuid NOT NULL REFERENCES public.user_profiles (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 5. Business Locations (D-02: Single active location in MVP; schema ready for R2-03/R2-04)
CREATE TABLE IF NOT EXISTS public.business_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses (id) ON DELETE RESTRICT,
  name text NOT NULL DEFAULT 'Main Store',
  address text,
  phone text,
  is_default boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_business_locations_tenant_id UNIQUE (business_id, id)
);

-- Enforce D-02 Single Location in MVP (drop this partial unique index in Release 2 R2-03)
CREATE UNIQUE INDEX IF NOT EXISTS uq_business_locations_single_active_mvp
  ON public.business_locations (business_id)
  WHERE is_active = true;

-- 6. Business Subscriptions (D-01: 14-day trial, 7-day grace -> read_only, zero auto-delete)
CREATE TABLE IF NOT EXISTS public.business_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL UNIQUE REFERENCES public.businesses (id) ON DELETE RESTRICT,
  plan_id uuid NOT NULL REFERENCES public.subscription_plans (id) ON DELETE RESTRICT,
  status text NOT NULL CHECK (status IN ('trialing', 'active', 'grace_period', 'read_only', 'cancelled')),
  trial_ends_at timestamptz,
  current_period_start timestamptz NOT NULL DEFAULT now(),
  current_period_end timestamptz NOT NULL,
  grace_ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_business_subscriptions_tenant_id UNIQUE (business_id, id)
);

-- 7. Business Memberships (D-09: 3 fixed MVP roles + instant server-side revocation)
CREATE TABLE IF NOT EXISTS public.business_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses (id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES public.user_profiles (id) ON DELETE RESTRICT,
  role text NOT NULL CHECK (role IN ('owner', 'manager', 'cashier')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'revoked')),
  invited_by uuid REFERENCES public.user_profiles (id) ON DELETE RESTRICT,
  revoked_by uuid REFERENCES public.user_profiles (id) ON DELETE RESTRICT,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_business_memberships_tenant_user UNIQUE (business_id, user_id),
  CONSTRAINT uq_business_memberships_tenant_id UNIQUE (business_id, id)
);

CREATE INDEX IF NOT EXISTS idx_business_memberships_user_active
  ON public.business_memberships (user_id, business_id)
  WHERE status = 'active';

-- 8. Staff Invitations (SHA-256 hashed tokens only — never plaintext)
CREATE TABLE IF NOT EXISTS public.staff_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses (id) ON DELETE RESTRICT,
  email text NOT NULL,
  role text NOT NULL CHECK (role IN ('manager', 'cashier')),
  token_hash text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  invited_by uuid NOT NULL REFERENCES public.user_profiles (id) ON DELETE RESTRICT,
  expires_at timestamptz NOT NULL,
  accepted_by uuid REFERENCES public.user_profiles (id) ON DELETE RESTRICT,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_staff_invitations_tenant_id UNIQUE (business_id, id)
);

CREATE INDEX IF NOT EXISTS idx_staff_invitations_business_status
  ON public.staff_invitations (business_id, status);

-- 9. Registered Offline Devices (D-01 limits, D-09 7-day offline window, D-14 OFF-<DEV4>-<SEQ>)
CREATE TABLE IF NOT EXISTS public.registered_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses (id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES public.user_profiles (id) ON DELETE RESTRICT,
  device_code varchar(8) NOT NULL,
  device_fingerprint_hash text NOT NULL,
  device_name text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  last_verified_at timestamptz NOT NULL DEFAULT now(),
  offline_expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  revoked_by uuid REFERENCES public.user_profiles (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_registered_devices_tenant_code UNIQUE (business_id, device_code),
  CONSTRAINT uq_registered_devices_tenant_id UNIQUE (business_id, id),
  CONSTRAINT fk_registered_devices_membership
    FOREIGN KEY (business_id, user_id)
    REFERENCES public.business_memberships (business_id, user_id)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_registered_devices_business_active
  ON public.registered_devices (business_id, status)
  WHERE status = 'active';

-- 10. Immutable Tenant Audit Logs (D-08: append-only financial & security ledger)
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses (id) ON DELETE RESTRICT,
  actor_user_id uuid REFERENCES public.user_profiles (id) ON DELETE RESTRICT,
  actor_role text CHECK (actor_role IN ('owner', 'manager', 'cashier', 'system')),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_address inet,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_business_created
  ON public.audit_logs (business_id, created_at DESC);
