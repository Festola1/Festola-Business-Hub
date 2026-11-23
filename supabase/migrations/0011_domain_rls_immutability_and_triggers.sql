-- ============================================================================
-- Migration: 0011_domain_rls_immutability_and_triggers.sql
-- Stage:     Stage 06 — Full PostgreSQL Schema & Migrations
-- Security:  1) ENABLE + FORCE ROW LEVEL SECURITY on EVERY Stage 06 table
--               anchored to public.current_business_id() (fails closed to NULL).
--            2) Append-only immutability triggers (ERRCODE 42501) on financial,
--               stock, return, refund, and debt allocation ledgers.
--            3) Non-destructive hard-delete guards and snapshot lock triggers on
--               sales, receipts, expenses, customer_debt_payments, and masters.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. IMMUTABILITY & NON-DESTRUCTIVE FINANCIAL CORRECTION TRIGGERS
-- ============================================================================

-- A. Strictly append-only ledgers (zero UPDATE, zero DELETE)
CREATE OR REPLACE FUNCTION public.prevent_financial_ledger_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Table %.% is an append-only financial/stock ledger; UPDATE and DELETE are prohibited.',
    TG_TABLE_SCHEMA, TG_TABLE_NAME
    USING ERRCODE = '42501';
END;
$$;

-- B. Block hard DELETE on auditable financial headers & master records (use reversals or archived_at)
CREATE OR REPLACE FUNCTION public.prevent_hard_delete_auditable_record()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Hard DELETE on %.% is prohibited; use non-destructive reversals or archived_at soft delete.',
    TG_TABLE_SCHEMA, TG_TABLE_NAME
    USING ERRCODE = '42501';
END;
$$;

-- C. Protect immutable financial, tax, and COGS snapshots on public.sales
CREATE OR REPLACE FUNCTION public.guard_sale_immutable_snapshots()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.business_id <> OLD.business_id
     OR NEW.location_id <> OLD.location_id
     OR NEW.sale_number <> OLD.sale_number
     OR NEW.client_sale_uuid <> OLD.client_sale_uuid
     OR NEW.channel <> OLD.channel
     OR NEW.currency_code <> OLD.currency_code
     OR NEW.subtotal_amount <> OLD.subtotal_amount
     OR NEW.discount_amount <> OLD.discount_amount
     OR NEW.tax_enabled_snapshot <> OLD.tax_enabled_snapshot
     OR NEW.tax_mode_snapshot <> OLD.tax_mode_snapshot
     OR NEW.tax_rate_snapshot <> OLD.tax_rate_snapshot
     OR NEW.tax_amount <> OLD.tax_amount
     OR NEW.total_amount <> OLD.total_amount
     OR NEW.amount_paid <> OLD.amount_paid
     OR NEW.credit_amount <> OLD.credit_amount
     OR NEW.total_cogs_snapshot <> OLD.total_cogs_snapshot
     OR NEW.sold_at <> OLD.sold_at
     OR NEW.cashier_user_id <> OLD.cashier_user_id THEN
    RAISE EXCEPTION 'Immutable financial/tax/COGS snapshot fields on public.sales cannot be modified; use D-15 sale_returns.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

-- D. Protect immutable receipt snapshot payload (D-14); allow only reprint_count increment & ORIGINAL->VOIDED/RETURNED stamp
CREATE OR REPLACE FUNCTION public.guard_receipt_snapshot_immutability()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.business_id <> OLD.business_id
     OR NEW.receipt_type <> OLD.receipt_type
     OR NEW.receipt_number <> OLD.receipt_number
     OR NEW.sale_id IS DISTINCT FROM OLD.sale_id
     OR NEW.debt_payment_id IS DISTINCT FROM OLD.debt_payment_id
     OR NEW.sale_return_id IS DISTINCT FROM OLD.sale_return_id
     OR NEW.payload_snapshot <> OLD.payload_snapshot
     OR NEW.issued_by_user_id <> OLD.issued_by_user_id
     OR NEW.issued_at <> OLD.issued_at THEN
    RAISE EXCEPTION 'Receipt snapshot fields on public.receipts are immutable once issued.'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.reprint_count < OLD.reprint_count THEN
    RAISE EXCEPTION 'reprint_count on public.receipts cannot decrease.'
      USING ERRCODE = '42501';
  END IF;

  IF OLD.stamp_status <> 'ORIGINAL' AND NEW.stamp_status <> OLD.stamp_status THEN
    RAISE EXCEPTION 'Receipt stamp_status cannot revert once marked %.', OLD.stamp_status
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

-- E. Protect immutable amount/identity fields on public.expenses (only posted -> reversed transition permitted)
CREATE OR REPLACE FUNCTION public.guard_expense_non_destructive_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.business_id <> OLD.business_id
     OR NEW.location_id <> OLD.location_id
     OR NEW.expense_number <> OLD.expense_number
     OR NEW.client_expense_uuid <> OLD.client_expense_uuid
     OR NEW.amount <> OLD.amount
     OR NEW.currency_code <> OLD.currency_code
     OR NEW.expense_date <> OLD.expense_date
     OR NEW.recorded_by_user_id <> OLD.recorded_by_user_id THEN
    RAISE EXCEPTION 'Monetary fields on public.expenses are immutable; reverse the expense instead.'
      USING ERRCODE = '42501';
  END IF;

  IF OLD.status = 'reversed' AND NEW.status <> 'reversed' THEN
    RAISE EXCEPTION 'Reversed expenses cannot be un-reversed.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

-- F. Protect immutable amount/identity fields on public.customer_debt_payments (only completed -> reversed transition)
CREATE OR REPLACE FUNCTION public.guard_debt_payment_non_destructive_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.business_id <> OLD.business_id
     OR NEW.customer_id <> OLD.customer_id
     OR NEW.payment_number <> OLD.payment_number
     OR NEW.client_payment_uuid <> OLD.client_payment_uuid
     OR NEW.amount_paid <> OLD.amount_paid
     OR NEW.payment_method <> OLD.payment_method
     OR NEW.recorded_by_user_id <> OLD.recorded_by_user_id
     OR NEW.paid_at <> OLD.paid_at THEN
    RAISE EXCEPTION 'Monetary fields on public.customer_debt_payments are immutable; reverse the payment instead.'
      USING ERRCODE = '42501';
  END IF;

  IF OLD.status = 'reversed' AND NEW.status <> 'reversed' THEN
    RAISE EXCEPTION 'Reversed customer debt payments cannot be un-reversed.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

-- Attach append-only ledger triggers
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'restock_batches',
    'restock_batch_items',
    'stock_movements',
    'sale_items',
    'sale_payments',
    'sale_returns',
    'sale_return_items',
    'sale_refunds',
    'customer_debt_allocations'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_immutable ON public.%I;', tbl, tbl);
    EXECUTE format(
      'CREATE TRIGGER trg_%I_immutable BEFORE UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.prevent_financial_ledger_mutation();',
      tbl,
      tbl
    );
  END LOOP;
END $$;

-- Attach hard-delete prevention triggers
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'sales',
    'receipts',
    'customer_debt_payments',
    'expenses',
    'subscription_invoices',
    'products',
    'customers',
    'product_categories',
    'expense_categories'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_no_hard_delete ON public.%I;', tbl, tbl);
    EXECUTE format(
      'CREATE TRIGGER trg_%I_no_hard_delete BEFORE DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.prevent_hard_delete_auditable_record();',
      tbl,
      tbl
    );
  END LOOP;
END $$;

-- Attach controlled-update snapshot guards
DROP TRIGGER IF EXISTS trg_sales_snapshot_guard ON public.sales;
CREATE TRIGGER trg_sales_snapshot_guard
  BEFORE UPDATE ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.guard_sale_immutable_snapshots();

DROP TRIGGER IF EXISTS trg_receipts_snapshot_guard ON public.receipts;
CREATE TRIGGER trg_receipts_snapshot_guard
  BEFORE UPDATE ON public.receipts
  FOR EACH ROW EXECUTE FUNCTION public.guard_receipt_snapshot_immutability();

DROP TRIGGER IF EXISTS trg_expenses_non_destructive_guard ON public.expenses;
CREATE TRIGGER trg_expenses_non_destructive_guard
  BEFORE UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.guard_expense_non_destructive_update();

DROP TRIGGER IF EXISTS trg_debt_payments_non_destructive_guard ON public.customer_debt_payments;
CREATE TRIGGER trg_debt_payments_non_destructive_guard
  BEFORE UPDATE ON public.customer_debt_payments
  FOR EACH ROW EXECUTE FUNCTION public.guard_debt_payment_non_destructive_update();

-- ============================================================================
-- 2. UPDATED_AT TRIGGERS ON MUTABLE STAGE 06 TABLES
-- ============================================================================
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'business_settings',
    'product_categories',
    'products',
    'stock_balances',
    'receipt_sequences',
    'customers',
    'sales',
    'customer_debt_payments',
    'expense_categories',
    'expenses',
    'subscription_invoices',
    'idempotency_records',
    'sync_conflicts'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_updated_at ON public.%I;', tbl, tbl);
    EXECUTE format(
      'CREATE TRIGGER trg_%I_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();',
      tbl,
      tbl
    );
  END LOOP;
END $$;

-- ============================================================================
-- 3. ENABLE + FORCE ROW LEVEL SECURITY ON EVERY STAGE 06 TABLE
-- ============================================================================

-- A. Read-only RBAC reference catalogs (mutations restricted strictly to DB migrations)
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS roles_read_policy ON public.roles;
CREATE POLICY roles_read_policy ON public.roles FOR SELECT USING (true);

ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS permissions_read_policy ON public.permissions;
CREATE POLICY permissions_read_policy ON public.permissions FOR SELECT USING (true);

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS role_permissions_read_policy ON public.role_permissions;
CREATE POLICY role_permissions_read_policy ON public.role_permissions FOR SELECT USING (true);

-- B. Payment Webhook Events: fail-closed deny for tenant sessions (server webhook worker only)
ALTER TABLE public.payment_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_webhook_events FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payment_webhook_events_deny_tenant_policy ON public.payment_webhook_events;
CREATE POLICY payment_webhook_events_deny_tenant_policy
  ON public.payment_webhook_events
  FOR ALL
  USING (false)
  WITH CHECK (false);

-- C. All Tenant-Scoped Domain Tables: strictly anchored to public.current_business_id()
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
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
      'CREATE POLICY %I_tenant_isolation_policy ON public.%I FOR ALL USING (business_id = public.current_business_id()) WITH CHECK (business_id = public.current_business_id());',
      tbl,
      tbl
    );
  END LOOP;
END $$;

COMMIT;
