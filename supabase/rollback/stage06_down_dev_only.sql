-- ============================================================================
-- Script:  supabase/rollback/stage06_down_dev_only.sql
-- Purpose: Controlled Development/Staging rollback of Stage 06 migrations
--          (0012 down to 0003) in strict reverse dependency order while
--          leaving P-02a/P-02b migrations (0000..0002) untouched.
-- Safety:  NEVER run in Production! Production uses forward-fix migrations or
--          Point-in-Time Recovery (PITR) per D-08.
-- ============================================================================

BEGIN;

DO $$
BEGIN
  IF lower(current_database()) LIKE '%prod%' THEN
    RAISE EXCEPTION 'Refusing destructive Stage 06 rollback on production database: %', current_database();
  END IF;
END $$;

-- 1. Reverse 0012: Release 2 Reserved Tables
DROP TABLE IF EXISTS public.cash_register_sessions;
DROP TABLE IF EXISTS public.stock_count_items;
DROP TABLE IF EXISTS public.stock_counts;
DROP TABLE IF EXISTS public.stock_transfer_items;
DROP TABLE IF EXISTS public.stock_transfers;
DROP TABLE IF EXISTS public.local_purchase_items;
DROP TABLE IF EXISTS public.local_purchases;
DROP TABLE IF EXISTS public.suppliers;

-- 2. Reverse 0011: Stage 06 Trigger Functions (tables dropped below remove attached triggers)
DROP FUNCTION IF EXISTS public.guard_debt_payment_non_destructive_update();
DROP FUNCTION IF EXISTS public.guard_expense_non_destructive_update();
DROP FUNCTION IF EXISTS public.guard_receipt_snapshot_immutability();
DROP FUNCTION IF EXISTS public.guard_sale_immutable_snapshots();
DROP FUNCTION IF EXISTS public.prevent_hard_delete_auditable_record();
DROP FUNCTION IF EXISTS public.prevent_financial_ledger_mutation();

-- 3. Reverse 0010: Notifications, Attachments & Operational Audit Indexes
DROP INDEX IF EXISTS public.idx_audit_logs_tenant_action;
DROP INDEX IF EXISTS public.idx_audit_logs_tenant_entity;
DROP TABLE IF EXISTS public.attachments;
DROP TABLE IF EXISTS public.notifications;

-- 4. Reverse 0009: Sync Conflicts, Sync Batches & Idempotency Records
DROP TABLE IF EXISTS public.sync_conflicts;
DROP TABLE IF EXISTS public.sync_batches;
DROP TABLE IF EXISTS public.idempotency_records;

-- 5. Reverse 0008: Subscriptions Billing & Webhooks
DROP TABLE IF EXISTS public.payment_webhook_events;
DROP TABLE IF EXISTS public.subscription_invoices;

-- 6. Reverse 0007: Operating Expenses
DROP TABLE IF EXISTS public.expenses;
DROP TABLE IF EXISTS public.expense_categories;

-- 7. Reverse 0006: Returns, Refunds, Debt Payments & Debt Allocations
ALTER TABLE IF EXISTS public.receipts DROP CONSTRAINT IF EXISTS chk_receipts_single_target;
ALTER TABLE IF EXISTS public.receipts DROP CONSTRAINT IF EXISTS fk_receipts_sale_return;
ALTER TABLE IF EXISTS public.receipts DROP CONSTRAINT IF EXISTS fk_receipts_debt_payment;
DROP TABLE IF EXISTS public.customer_debt_allocations;
DROP TABLE IF EXISTS public.customer_debt_payments;
DROP TABLE IF EXISTS public.sale_refunds;
DROP TABLE IF EXISTS public.sale_return_items;
DROP TABLE IF EXISTS public.sale_returns;

-- 8. Reverse 0005: Receipts, Sale Payments, Sale Items, Sales, Customers & Sequences
DROP TABLE IF EXISTS public.receipts;
DROP TABLE IF EXISTS public.sale_payments;
DROP TABLE IF EXISTS public.sale_items;
DROP TABLE IF EXISTS public.sales;
DROP TABLE IF EXISTS public.customers;
DROP TABLE IF EXISTS public.receipt_sequences;

-- 9. Reverse 0004: Stock Movements, Restock Batches, Stock Balances, Products & Categories
DROP TABLE IF EXISTS public.stock_movements;
DROP TABLE IF EXISTS public.restock_batch_items;
DROP TABLE IF EXISTS public.restock_batches;
DROP TABLE IF EXISTS public.stock_balances;
DROP TABLE IF EXISTS public.products;
DROP TABLE IF EXISTS public.product_categories;

-- 10. Reverse 0003: Business Settings & Normalized RBAC Role/Permission Tables
DROP TABLE IF EXISTS public.business_settings;
ALTER TABLE IF EXISTS public.staff_invitations DROP CONSTRAINT IF EXISTS fk_staff_invitations_role;
ALTER TABLE IF EXISTS public.business_memberships DROP CONSTRAINT IF EXISTS fk_business_memberships_role;
DROP TABLE IF EXISTS public.role_permissions;
DROP TABLE IF EXISTS public.permissions;
DROP TABLE IF EXISTS public.roles;

COMMIT;
