-- ============================================================================
-- Migration: 0012_release2_reserved_tables.sql
-- Stage:     Stage 06 — Reserved Release 2 Schema Placeholders (STRICTLY UNEXPOSED IN MVP)
-- Scope:     R2-01 (suppliers, local_purchases, local_purchase_items),
--            R2-04 (stock_transfers, stock_transfer_items),
--            C-02  (stock_counts, stock_count_items),
--            R2-05 (cash_register_sessions).
-- Security:  EVERY table in this migration enforces ENABLE + FORCE ROW LEVEL SECURITY
--            with a fail-closed default-deny policy (USING (false) WITH CHECK (false))
--            so ZERO Release 2 features or data can be accessed during MVP.
--            Do NOT add API endpoints or UI screens for these tables until Release 2.
-- ============================================================================

BEGIN;

-- R2-01 Reserved: Suppliers & Local Purchases
CREATE TABLE IF NOT EXISTS public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses (id) ON DELETE RESTRICT,
  name text NOT NULL,
  phone varchar(32),
  email text,
  address text,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_suppliers_tenant_id UNIQUE (business_id, id)
);

CREATE TABLE IF NOT EXISTS public.local_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses (id) ON DELETE RESTRICT,
  location_id uuid NOT NULL,
  supplier_id uuid NOT NULL,
  purchase_number varchar(48) NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'received', 'cancelled')),
  total_amount numeric(18, 2) NOT NULL DEFAULT 0.00 CHECK (total_amount >= 0),
  purchased_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL REFERENCES public.user_profiles (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_local_purchases_tenant_id UNIQUE (business_id, id),
  CONSTRAINT uq_local_purchases_tenant_number UNIQUE (business_id, purchase_number),
  CONSTRAINT fk_local_purchases_location
    FOREIGN KEY (business_id, location_id)
    REFERENCES public.business_locations (business_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_local_purchases_supplier
    FOREIGN KEY (business_id, supplier_id)
    REFERENCES public.suppliers (business_id, id)
    ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS public.local_purchase_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses (id) ON DELETE RESTRICT,
  local_purchase_id uuid NOT NULL,
  product_id uuid NOT NULL,
  quantity numeric(18, 3) NOT NULL CHECK (quantity > 0),
  unit_cost numeric(18, 2) NOT NULL CHECK (unit_cost >= 0),
  line_total numeric(18, 2) NOT NULL CHECK (line_total >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_local_purchase_items_header
    FOREIGN KEY (business_id, local_purchase_id)
    REFERENCES public.local_purchases (business_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_local_purchase_items_product
    FOREIGN KEY (business_id, product_id)
    REFERENCES public.products (business_id, id)
    ON DELETE RESTRICT
);

-- R2-04 Reserved: Inter-Branch Stock Transfers
CREATE TABLE IF NOT EXISTS public.stock_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses (id) ON DELETE RESTRICT,
  source_location_id uuid NOT NULL,
  destination_location_id uuid NOT NULL,
  transfer_number varchar(48) NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'in_transit', 'completed', 'cancelled')),
  created_by uuid NOT NULL REFERENCES public.user_profiles (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_stock_transfers_tenant_id UNIQUE (business_id, id),
  CONSTRAINT uq_stock_transfers_tenant_number UNIQUE (business_id, transfer_number),
  CONSTRAINT chk_stock_transfers_distinct_locations CHECK (source_location_id <> destination_location_id),
  CONSTRAINT fk_stock_transfers_source
    FOREIGN KEY (business_id, source_location_id)
    REFERENCES public.business_locations (business_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_stock_transfers_destination
    FOREIGN KEY (business_id, destination_location_id)
    REFERENCES public.business_locations (business_id, id)
    ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS public.stock_transfer_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses (id) ON DELETE RESTRICT,
  stock_transfer_id uuid NOT NULL,
  product_id uuid NOT NULL,
  quantity numeric(18, 3) NOT NULL CHECK (quantity > 0),
  unit_cost_snapshot numeric(18, 2) NOT NULL CHECK (unit_cost_snapshot >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_stock_transfer_items_header
    FOREIGN KEY (business_id, stock_transfer_id)
    REFERENCES public.stock_transfers (business_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_stock_transfer_items_product
    FOREIGN KEY (business_id, product_id)
    REFERENCES public.products (business_id, id)
    ON DELETE RESTRICT
);

-- C-02 Reserved: Physical Stocktake Sessions (explicitly deferred from MVP)
CREATE TABLE IF NOT EXISTS public.stock_counts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses (id) ON DELETE RESTRICT,
  location_id uuid NOT NULL,
  count_number varchar(48) NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reconciled', 'cancelled')),
  started_by uuid NOT NULL REFERENCES public.user_profiles (id) ON DELETE RESTRICT,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_stock_counts_tenant_id UNIQUE (business_id, id),
  CONSTRAINT uq_stock_counts_tenant_number UNIQUE (business_id, count_number),
  CONSTRAINT fk_stock_counts_location
    FOREIGN KEY (business_id, location_id)
    REFERENCES public.business_locations (business_id, id)
    ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS public.stock_count_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses (id) ON DELETE RESTRICT,
  stock_count_id uuid NOT NULL,
  product_id uuid NOT NULL,
  expected_quantity numeric(18, 3) NOT NULL,
  counted_quantity numeric(18, 3) NOT NULL CHECK (counted_quantity >= 0),
  variance_quantity numeric(18, 3) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_stock_count_items_header
    FOREIGN KEY (business_id, stock_count_id)
    REFERENCES public.stock_counts (business_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_stock_count_items_product
    FOREIGN KEY (business_id, product_id)
    REFERENCES public.products (business_id, id)
    ON DELETE RESTRICT
);

-- R2-05 Reserved: Advanced Cash Register Sessions
CREATE TABLE IF NOT EXISTS public.cash_register_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses (id) ON DELETE RESTRICT,
  location_id uuid NOT NULL,
  opened_by_user_id uuid NOT NULL REFERENCES public.user_profiles (id) ON DELETE RESTRICT,
  closed_by_user_id uuid REFERENCES public.user_profiles (id) ON DELETE RESTRICT,
  opening_float numeric(18, 2) NOT NULL DEFAULT 0.00 CHECK (opening_float >= 0),
  expected_closing_cash numeric(18, 2),
  counted_closing_cash numeric(18, 2),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_cash_register_sessions_tenant_id UNIQUE (business_id, id),
  CONSTRAINT fk_cash_register_sessions_location
    FOREIGN KEY (business_id, location_id)
    REFERENCES public.business_locations (business_id, id)
    ON DELETE RESTRICT
);

-- Enforce strict MVP fail-closed lock on ALL reserved Release 2 tables
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'suppliers',
    'local_purchases',
    'local_purchase_items',
    'stock_transfers',
    'stock_transfer_items',
    'stock_counts',
    'stock_count_items',
    'cash_register_sessions'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY;', tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I_r2_mvp_locked_policy ON public.%I;', tbl, tbl);
    EXECUTE format(
      'CREATE POLICY %I_r2_mvp_locked_policy ON public.%I FOR ALL USING (false) WITH CHECK (false);',
      tbl,
      tbl
    );
  END LOOP;
END $$;

COMMIT;
