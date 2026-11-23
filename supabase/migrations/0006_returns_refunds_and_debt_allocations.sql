-- ============================================================================
-- Migration: 0006_returns_refunds_and_debt_allocations.sql
-- Stage:     Stage 06 — Full PostgreSQL Schema & Migrations
-- Decisions: D-14 (VOIDED/RETURNED receipts), D-15 (Owner/Manager online-only
--            full voids & full/partial returns, restock vs. damaged, debt-first)
-- Standards: UUID keys, TIMESTAMPTZ, NUMERIC(18,2) money, NUMERIC(18,3) qty,
--            non-destructive reversals, append-only debt allocation ledger.
-- ============================================================================

BEGIN;

-- 1. Immutable Sale Returns & Full Voids (D-15)
CREATE TABLE IF NOT EXISTS public.sale_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses (id) ON DELETE RESTRICT,
  sale_id uuid NOT NULL,
  return_number varchar(48) NOT NULL,
  client_return_uuid uuid NOT NULL,
  return_type text NOT NULL CHECK (return_type IN ('full_void', 'partial_return', 'full_return')),
  reason text NOT NULL,
  subtotal_reversed numeric(18, 2) NOT NULL CHECK (subtotal_reversed >= 0),
  tax_reversed numeric(18, 2) NOT NULL DEFAULT 0.00 CHECK (tax_reversed >= 0),
  total_reversed numeric(18, 2) NOT NULL CHECK (total_reversed > 0),
  -- D-15: Debt-first reduction before cash/transfer refund payout
  debt_reduced_amount numeric(18, 2) NOT NULL DEFAULT 0.00 CHECK (debt_reduced_amount >= 0),
  refund_amount numeric(18, 2) NOT NULL DEFAULT 0.00 CHECK (refund_amount >= 0),
  total_cogs_reversed numeric(18, 2) NOT NULL DEFAULT 0.00 CHECK (total_cogs_reversed >= 0),
  approved_by_user_id uuid NOT NULL REFERENCES public.user_profiles (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_sale_returns_tenant_id UNIQUE (business_id, id),
  CONSTRAINT uq_sale_returns_tenant_number UNIQUE (business_id, return_number),
  CONSTRAINT uq_sale_returns_tenant_client_uuid UNIQUE (business_id, client_return_uuid),
  CONSTRAINT chk_sale_returns_settlement CHECK (debt_reduced_amount + refund_amount = total_reversed),
  CONSTRAINT fk_sale_returns_sale
    FOREIGN KEY (business_id, sale_id)
    REFERENCES public.sales (business_id, id)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_sale_returns_tenant_sale
  ON public.sale_returns (business_id, sale_id, created_at DESC);

-- 2. Immutable Sale Return Items (per-item restock vs. damaged choice per D-15)
CREATE TABLE IF NOT EXISTS public.sale_return_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses (id) ON DELETE RESTRICT,
  sale_return_id uuid NOT NULL,
  sale_item_id uuid NOT NULL,
  product_id uuid NOT NULL,
  quantity_returned numeric(18, 3) NOT NULL CHECK (quantity_returned > 0),
  unit_price_snapshot numeric(18, 2) NOT NULL CHECK (unit_price_snapshot >= 0),
  tax_reversed numeric(18, 2) NOT NULL DEFAULT 0.00 CHECK (tax_reversed >= 0),
  line_total_reversed numeric(18, 2) NOT NULL CHECK (line_total_reversed >= 0),
  unit_cost_snapshot numeric(18, 2) NOT NULL CHECK (unit_cost_snapshot >= 0),
  stock_disposition text NOT NULL CHECK (stock_disposition IN ('restock', 'damaged')),
  stock_movement_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_sale_return_items_tenant_id UNIQUE (business_id, id),
  CONSTRAINT fk_sale_return_items_return
    FOREIGN KEY (business_id, sale_return_id)
    REFERENCES public.sale_returns (business_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_sale_return_items_sale_item
    FOREIGN KEY (business_id, sale_item_id)
    REFERENCES public.sale_items (business_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_sale_return_items_product
    FOREIGN KEY (business_id, product_id)
    REFERENCES public.products (business_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_sale_return_items_movement
    FOREIGN KEY (business_id, stock_movement_id)
    REFERENCES public.stock_movements (business_id, id)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_sale_return_items_sale_item
  ON public.sale_return_items (business_id, sale_item_id);

-- 3. Immutable Refund Payouts Linked to Sale Returns
CREATE TABLE IF NOT EXISTS public.sale_refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses (id) ON DELETE RESTRICT,
  sale_return_id uuid NOT NULL,
  refund_method text NOT NULL CHECK (
    refund_method IN ('cash', 'bank_transfer', 'pos_card', 'other_digital')
  ),
  amount numeric(18, 2) NOT NULL CHECK (amount > 0),
  external_reference varchar(128),
  processed_by_user_id uuid NOT NULL REFERENCES public.user_profiles (id) ON DELETE RESTRICT,
  processed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_sale_refunds_tenant_id UNIQUE (business_id, id),
  CONSTRAINT fk_sale_refunds_return
    FOREIGN KEY (business_id, sale_return_id)
    REFERENCES public.sale_returns (business_id, id)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_sale_refunds_return
  ON public.sale_refunds (business_id, sale_return_id);

-- 4. Customer Debt Payments (non-destructive reversals; never hard-deleted)
CREATE TABLE IF NOT EXISTS public.customer_debt_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses (id) ON DELETE RESTRICT,
  customer_id uuid NOT NULL,
  payment_number varchar(48) NOT NULL,
  client_payment_uuid uuid NOT NULL,
  amount_paid numeric(18, 2) NOT NULL CHECK (amount_paid > 0),
  payment_method text NOT NULL CHECK (
    payment_method IN ('cash', 'bank_transfer', 'pos_card', 'other_digital')
  ),
  payment_reference varchar(128),
  status text NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'reversed')),
  reversal_reason text,
  reversed_at timestamptz,
  reversed_by_user_id uuid REFERENCES public.user_profiles (id) ON DELETE RESTRICT,
  recorded_by_user_id uuid NOT NULL REFERENCES public.user_profiles (id) ON DELETE RESTRICT,
  paid_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_debt_payments_tenant_id UNIQUE (business_id, id),
  CONSTRAINT uq_debt_payments_tenant_number UNIQUE (business_id, payment_number),
  CONSTRAINT uq_debt_payments_tenant_client_uuid UNIQUE (business_id, client_payment_uuid),
  CONSTRAINT fk_debt_payments_customer
    FOREIGN KEY (business_id, customer_id)
    REFERENCES public.customers (business_id, id)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_debt_payments_tenant_customer
  ON public.customer_debt_payments (business_id, customer_id, paid_at DESC);

-- 5. Append-Only Customer Debt Allocation Ledger (payments, payment reversals & D-15 return credit)
CREATE TABLE IF NOT EXISTS public.customer_debt_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses (id) ON DELETE RESTRICT,
  customer_id uuid NOT NULL,
  sale_id uuid NOT NULL,
  debt_payment_id uuid,
  sale_return_id uuid,
  allocation_type text NOT NULL CHECK (
    allocation_type IN ('payment', 'payment_reversal', 'sale_return_credit')
  ),
  -- Positive reduces sales.balance_due; negative (payment_reversal) restores sales.balance_due
  allocated_amount numeric(18, 2) NOT NULL CHECK (allocated_amount <> 0),
  created_by uuid NOT NULL REFERENCES public.user_profiles (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_debt_allocations_tenant_id UNIQUE (business_id, id),
  CONSTRAINT chk_debt_alloc_source CHECK (
    (
      allocation_type IN ('payment', 'payment_reversal')
      AND debt_payment_id IS NOT NULL
      AND sale_return_id IS NULL
    )
    OR (
      allocation_type = 'sale_return_credit'
      AND sale_return_id IS NOT NULL
      AND debt_payment_id IS NULL
    )
  ),
  CONSTRAINT chk_debt_alloc_sign CHECK (
    (allocation_type IN ('payment', 'sale_return_credit') AND allocated_amount > 0)
    OR (allocation_type = 'payment_reversal' AND allocated_amount < 0)
  ),
  CONSTRAINT fk_debt_alloc_customer
    FOREIGN KEY (business_id, customer_id)
    REFERENCES public.customers (business_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_debt_alloc_sale
    FOREIGN KEY (business_id, sale_id)
    REFERENCES public.sales (business_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_debt_alloc_payment
    FOREIGN KEY (business_id, debt_payment_id)
    REFERENCES public.customer_debt_payments (business_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_debt_alloc_return
    FOREIGN KEY (business_id, sale_return_id)
    REFERENCES public.sale_returns (business_id, id)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_debt_alloc_tenant_sale
  ON public.customer_debt_allocations (business_id, sale_id);

CREATE INDEX IF NOT EXISTS idx_debt_alloc_tenant_customer
  ON public.customer_debt_allocations (business_id, customer_id, created_at DESC);

-- 6. Complete receipts foreign keys & target integrity check
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_receipts_debt_payment'
  ) THEN
    ALTER TABLE public.receipts
      ADD CONSTRAINT fk_receipts_debt_payment
      FOREIGN KEY (business_id, debt_payment_id)
      REFERENCES public.customer_debt_payments (business_id, id)
      ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_receipts_sale_return'
  ) THEN
    ALTER TABLE public.receipts
      ADD CONSTRAINT fk_receipts_sale_return
      FOREIGN KEY (business_id, sale_return_id)
      REFERENCES public.sale_returns (business_id, id)
      ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_receipts_single_target'
  ) THEN
    ALTER TABLE public.receipts
      ADD CONSTRAINT chk_receipts_single_target CHECK (
        (receipt_type = 'sale' AND sale_id IS NOT NULL AND debt_payment_id IS NULL AND sale_return_id IS NULL)
        OR (receipt_type = 'debt_payment' AND debt_payment_id IS NOT NULL AND sale_id IS NULL AND sale_return_id IS NULL)
        OR (receipt_type IN ('sale_return', 'sale_void') AND sale_return_id IS NOT NULL AND debt_payment_id IS NULL)
      );
  END IF;
END $$;

COMMIT;
