-- ============================================================================
-- Migration: 0007_operating_expenses.sql
-- Stage:     Stage 06 — Full PostgreSQL Schema & Migrations
-- Scope:     M-10 / FR-010 Operating Expenses (non-destructive reversals only)
-- Standards: UUID keys, TIMESTAMPTZ, NUMERIC(18,2) money, composite tenant FKs.
-- ============================================================================

BEGIN;

-- 1. Expense Categories (business-scoped, soft-deletable via archived_at)
CREATE TABLE IF NOT EXISTS public.expense_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses (id) ON DELETE RESTRICT,
  name text NOT NULL,
  description text,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_expense_categories_tenant_id UNIQUE (business_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_expense_categories_active_name
  ON public.expense_categories (business_id, lower(name))
  WHERE archived_at IS NULL;

-- 2. Operating Expenses (immutable monetary record; corrections strictly via status='reversed')
CREATE TABLE IF NOT EXISTS public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses (id) ON DELETE RESTRICT,
  location_id uuid NOT NULL,
  category_id uuid NOT NULL,
  expense_number varchar(48) NOT NULL,
  client_expense_uuid uuid NOT NULL,
  title text NOT NULL,
  amount numeric(18, 2) NOT NULL CHECK (amount > 0),
  currency_code char(3) NOT NULL DEFAULT 'NGN',
  payment_method text NOT NULL CHECK (
    payment_method IN ('cash', 'bank_transfer', 'pos_card', 'other_digital')
  ),
  payment_reference varchar(128),
  expense_date date NOT NULL,
  incurred_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  status text NOT NULL DEFAULT 'posted' CHECK (status IN ('posted', 'reversed')),
  reversal_reason text,
  reversed_at timestamptz,
  reversed_by_user_id uuid REFERENCES public.user_profiles (id) ON DELETE RESTRICT,
  recorded_by_user_id uuid NOT NULL REFERENCES public.user_profiles (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_expenses_tenant_id UNIQUE (business_id, id),
  CONSTRAINT uq_expenses_tenant_number UNIQUE (business_id, expense_number),
  CONSTRAINT uq_expenses_tenant_client_uuid UNIQUE (business_id, client_expense_uuid),
  CONSTRAINT chk_expenses_reversal_metadata CHECK (
    (status = 'posted' AND reversed_at IS NULL AND reversed_by_user_id IS NULL)
    OR (status = 'reversed' AND reversed_at IS NOT NULL AND reversed_by_user_id IS NOT NULL AND reversal_reason IS NOT NULL)
  ),
  CONSTRAINT fk_expenses_location
    FOREIGN KEY (business_id, location_id)
    REFERENCES public.business_locations (business_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_expenses_category
    FOREIGN KEY (business_id, category_id)
    REFERENCES public.expense_categories (business_id, id)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_expenses_tenant_date
  ON public.expenses (business_id, expense_date DESC)
  WHERE status = 'posted';

COMMIT;
