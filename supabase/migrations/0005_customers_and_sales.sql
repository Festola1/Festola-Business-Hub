-- ============================================================================
-- Migration: 0005_customers_and_sales.sql
-- Stage:     Stage 06 — Full PostgreSQL Schema & Migrations
-- Decisions: D-03 (immutable tax snapshots), D-04 (immutable COGS snapshots),
--            D-05 (per-tenant UUID idempotency), D-13 (split/partial tenders),
--            D-14 (immutable receipts, REC-... / OFF-<DEV4>-<SEQ>)
-- Standards: UUID keys, TIMESTAMPTZ, NUMERIC(18,2) money, NUMERIC(18,3) qty,
--            NUMERIC(8,4) rates, composite (business_id, id) FKs.
-- ============================================================================

BEGIN;

-- 1. Atomic Per-Business Document Sequence Counters (D-14 collision-free numbering)
CREATE TABLE IF NOT EXISTS public.receipt_sequences (
  business_id uuid NOT NULL REFERENCES public.businesses (id) ON DELETE RESTRICT,
  sequence_type text NOT NULL CHECK (
    sequence_type IN ('sale', 'return', 'debt_payment', 'expense', 'restock', 'subscription_invoice')
  ),
  period_key varchar(16) NOT NULL, -- e.g. '202611'
  last_value bigint NOT NULL DEFAULT 0 CHECK (last_value >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (business_id, sequence_type, period_key)
);

-- 2. Customers (business-scoped, soft-deletable via archived_at)
CREATE TABLE IF NOT EXISTS public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses (id) ON DELETE RESTRICT,
  customer_code varchar(32),
  full_name text NOT NULL,
  phone varchar(32),
  email text,
  address text,
  credit_limit numeric(18, 2) CHECK (credit_limit IS NULL OR credit_limit >= 0),
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  archived_at timestamptz,
  created_by uuid NOT NULL REFERENCES public.user_profiles (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_customers_tenant_id UNIQUE (business_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_customers_tenant_phone_active
  ON public.customers (business_id, phone)
  WHERE phone IS NOT NULL AND archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_customers_tenant_name
  ON public.customers (business_id, lower(full_name))
  WHERE archived_at IS NULL;

-- 3. Sales Header (immutable financial, tax, and COGS snapshots)
CREATE TABLE IF NOT EXISTS public.sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses (id) ON DELETE RESTRICT,
  location_id uuid NOT NULL,
  customer_id uuid,
  cashier_user_id uuid NOT NULL REFERENCES public.user_profiles (id) ON DELETE RESTRICT,
  registered_device_id uuid,
  -- D-14: Online REC-YYYYMMDD-NNNNNN or Offline OFF-<DEV4>-<SEQ>
  sale_number varchar(48) NOT NULL,
  -- D-05: Per-tenant client idempotency UUID
  client_sale_uuid uuid NOT NULL,
  channel text NOT NULL DEFAULT 'online' CHECK (channel IN ('online', 'offline_sync')),
  status text NOT NULL DEFAULT 'completed' CHECK (
    status IN ('completed', 'partially_returned', 'returned', 'voided')
  ),
  currency_code char(3) NOT NULL DEFAULT 'NGN',
  subtotal_amount numeric(18, 2) NOT NULL CHECK (subtotal_amount >= 0),
  discount_amount numeric(18, 2) NOT NULL DEFAULT 0.00 CHECK (discount_amount >= 0),
  -- D-03: Immutable tax snapshot tracked separately from net revenue
  tax_enabled_snapshot boolean NOT NULL DEFAULT false,
  tax_mode_snapshot text NOT NULL DEFAULT 'exclusive' CHECK (tax_mode_snapshot IN ('exclusive', 'inclusive')),
  tax_rate_snapshot numeric(8, 4) NOT NULL DEFAULT 0.0000 CHECK (tax_rate_snapshot >= 0 AND tax_rate_snapshot <= 100),
  tax_amount numeric(18, 2) NOT NULL DEFAULT 0.00 CHECK (tax_amount >= 0),
  total_amount numeric(18, 2) NOT NULL CHECK (total_amount >= 0),
  amount_paid numeric(18, 2) NOT NULL DEFAULT 0.00 CHECK (amount_paid >= 0),
  credit_amount numeric(18, 2) NOT NULL DEFAULT 0.00 CHECK (credit_amount >= 0),
  balance_due numeric(18, 2) NOT NULL DEFAULT 0.00 CHECK (balance_due >= 0),
  -- D-04: Immutable COGS snapshot sum across sale_items
  total_cogs_snapshot numeric(18, 2) NOT NULL DEFAULT 0.00 CHECK (total_cogs_snapshot >= 0),
  is_oversell_flagged boolean NOT NULL DEFAULT false,
  notes text,
  sold_at timestamptz NOT NULL DEFAULT now(),
  voided_at timestamptz,
  void_reason text,
  voided_by_user_id uuid REFERENCES public.user_profiles (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_sales_tenant_id UNIQUE (business_id, id),
  CONSTRAINT uq_sales_tenant_sale_number UNIQUE (business_id, sale_number),
  CONSTRAINT uq_sales_tenant_client_uuid UNIQUE (business_id, client_sale_uuid),
  CONSTRAINT chk_sales_tender_balance CHECK (amount_paid + credit_amount = total_amount),
  CONSTRAINT chk_sales_balance_due_bounds CHECK (balance_due <= credit_amount),
  CONSTRAINT chk_sales_credit_requires_customer CHECK (credit_amount = 0 OR customer_id IS NOT NULL),
  CONSTRAINT fk_sales_location
    FOREIGN KEY (business_id, location_id)
    REFERENCES public.business_locations (business_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_sales_customer
    FOREIGN KEY (business_id, customer_id)
    REFERENCES public.customers (business_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_sales_device
    FOREIGN KEY (business_id, registered_device_id)
    REFERENCES public.registered_devices (business_id, id)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_sales_tenant_sold_at
  ON public.sales (business_id, sold_at DESC);

CREATE INDEX IF NOT EXISTS idx_sales_tenant_customer_debt
  ON public.sales (business_id, customer_id, balance_due)
  WHERE balance_due > 0;

-- 4. Immutable Sale Line Items (D-03 tax + D-04 WAC cost snapshots)
CREATE TABLE IF NOT EXISTS public.sale_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses (id) ON DELETE RESTRICT,
  sale_id uuid NOT NULL,
  product_id uuid NOT NULL,
  product_name_snapshot text NOT NULL,
  sku_snapshot varchar(64) NOT NULL,
  quantity numeric(18, 3) NOT NULL CHECK (quantity > 0),
  unit_price numeric(18, 2) NOT NULL CHECK (unit_price >= 0),
  discount_amount numeric(18, 2) NOT NULL DEFAULT 0.00 CHECK (discount_amount >= 0),
  is_tax_exempt_snapshot boolean NOT NULL DEFAULT false,
  tax_rate_snapshot numeric(8, 4) NOT NULL DEFAULT 0.0000 CHECK (tax_rate_snapshot >= 0 AND tax_rate_snapshot <= 100),
  tax_amount numeric(18, 2) NOT NULL DEFAULT 0.00 CHECK (tax_amount >= 0),
  line_total numeric(18, 2) NOT NULL CHECK (line_total >= 0),
  unit_cost_snapshot numeric(18, 2) NOT NULL CHECK (unit_cost_snapshot >= 0),
  line_cogs_snapshot numeric(18, 2) NOT NULL CHECK (line_cogs_snapshot >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_sale_items_tenant_id UNIQUE (business_id, id),
  CONSTRAINT fk_sale_items_sale
    FOREIGN KEY (business_id, sale_id)
    REFERENCES public.sales (business_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_sale_items_product
    FOREIGN KEY (business_id, product_id)
    REFERENCES public.products (business_id, id)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_sale_items_tenant_sale
  ON public.sale_items (business_id, sale_id);

CREATE INDEX IF NOT EXISTS idx_sale_items_tenant_product
  ON public.sale_items (business_id, product_id);

-- 5. Immutable Sale Payments / Split Tenders (D-13 tender-recording only)
CREATE TABLE IF NOT EXISTS public.sale_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses (id) ON DELETE RESTRICT,
  sale_id uuid NOT NULL,
  tender_type text NOT NULL CHECK (
    tender_type IN ('cash', 'bank_transfer', 'pos_card', 'other_digital', 'credit')
  ),
  amount numeric(18, 2) NOT NULL CHECK (amount > 0),
  external_reference varchar(128),
  received_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_sale_payments_tenant_id UNIQUE (business_id, id),
  CONSTRAINT fk_sale_payments_sale
    FOREIGN KEY (business_id, sale_id)
    REFERENCES public.sales (business_id, id)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_sale_payments_tenant_sale
  ON public.sale_payments (business_id, sale_id);

-- 6. Immutable Sales & Debt Receipts (D-14; no standalone draft invoices/quotes)
CREATE TABLE IF NOT EXISTS public.receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses (id) ON DELETE RESTRICT,
  receipt_type text NOT NULL CHECK (
    receipt_type IN ('sale', 'debt_payment', 'sale_return', 'sale_void')
  ),
  receipt_number varchar(48) NOT NULL,
  sale_id uuid,
  debt_payment_id uuid, -- FK attached in 0006_returns_refunds_and_debt_allocations.sql
  sale_return_id uuid,  -- FK attached in 0006_returns_refunds_and_debt_allocations.sql
  stamp_status text NOT NULL DEFAULT 'ORIGINAL' CHECK (
    stamp_status IN ('ORIGINAL', 'VOIDED', 'RETURNED')
  ),
  payload_snapshot jsonb NOT NULL,
  reprint_count integer NOT NULL DEFAULT 0 CHECK (reprint_count >= 0),
  issued_by_user_id uuid NOT NULL REFERENCES public.user_profiles (id) ON DELETE RESTRICT,
  issued_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_receipts_tenant_id UNIQUE (business_id, id),
  CONSTRAINT uq_receipts_tenant_number UNIQUE (business_id, receipt_number),
  CONSTRAINT fk_receipts_sale
    FOREIGN KEY (business_id, sale_id)
    REFERENCES public.sales (business_id, id)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_receipts_tenant_issued
  ON public.receipts (business_id, issued_at DESC);

COMMIT;
