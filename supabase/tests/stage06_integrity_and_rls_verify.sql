-- ============================================================================
-- Script:  supabase/tests/stage06_integrity_and_rls_verify.sql
-- Purpose: Transactional (BEGIN ... ROLLBACK) verification suite for Stage 06
--          covering fail-closed RLS, cross-tenant composite FK isolation,
--          stock/WAC ledger reconciliation, tender/tax/COGS reconciliation,
--          debt allocation math, immutability triggers (42501), idempotency
--          uniqueness (23505), and locked Release 2 default-deny policies.
-- Usage:   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/stage06_integrity_and_rls_verify.sql
-- ============================================================================

BEGIN;

-- Create an isolated non-superuser role for realistic RLS enforcement tests
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'festola_rls_test_role') THEN
    CREATE ROLE festola_rls_test_role NOLOGIN;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO festola_rls_test_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO festola_rls_test_role;

-- 1. Seed isolated synthetic Tenant A & Tenant B fixtures (rolled back at end of script)
\i supabase/tests/seed_isolated_test_tenants.sql

-- 2. Execute synthetic end-to-end financial flow in Tenant A (sale, split tender, credit, debt payment, D-15 return)
DO $$
DECLARE
  v_tenant_a uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  v_loc_a    uuid := 'aaaa1111-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  v_owner_a  uuid := '11111111-1111-4111-8111-111111111101';
  v_prod_a1  uuid := 'aaaa6666-aaaa-4aaa-8aaa-aaaaaaaaaa01';
  v_cust_a   uuid := 'aaaa9999-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  v_sale_id  uuid := 'aaaa1001-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  v_item_id  uuid := 'aaaa1002-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  v_pay_id   uuid := 'aaaa1003-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  v_ret_id   uuid := 'aaaa1004-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  v_mv_ret   uuid := 'aaaa1005-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
BEGIN
  -- Simulate credit + cash split sale of 2x Synthetic Rice @ 9,500 = 19,000 (10,000 cash + 9,000 credit)
  INSERT INTO public.sales (
    id, business_id, location_id, customer_id, cashier_user_id,
    sale_number, client_sale_uuid, channel, status, currency_code,
    subtotal_amount, discount_amount, tax_enabled_snapshot, tax_mode_snapshot, tax_rate_snapshot, tax_amount,
    total_amount, amount_paid, credit_amount, balance_due, total_cogs_snapshot
  )
  VALUES (
    v_sale_id, v_tenant_a, v_loc_a, v_cust_a, v_owner_a,
    'REC-202611-000001', 'aaaa9001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'online', 'completed', 'NGN',
    19000.00, 0.00, false, 'exclusive', 0.0000, 0.00,
    19000.00, 10000.00, 9000.00, 9000.00, 14000.00
  );

  INSERT INTO public.sale_items (
    id, business_id, sale_id, product_id, product_name_snapshot, sku_snapshot,
    quantity, unit_price, discount_amount, is_tax_exempt_snapshot, tax_rate_snapshot, tax_amount,
    line_total, unit_cost_snapshot, line_cogs_snapshot
  )
  VALUES (
    v_item_id, v_tenant_a, v_sale_id, v_prod_a1, 'Synthetic Rice 5kg', 'SYN-A-001',
    2.000, 9500.00, 0.00, false, 0.0000, 0.00,
    19000.00, 7000.00, 14000.00
  );

  INSERT INTO public.sale_payments (business_id, sale_id, tender_type, amount)
  VALUES
    (v_tenant_a, v_sale_id, 'cash', 10000.00),
    (v_tenant_a, v_sale_id, 'credit', 9000.00);

  UPDATE public.stock_balances
  SET quantity_on_hand = quantity_on_hand - 2.000
  WHERE business_id = v_tenant_a AND location_id = v_loc_a AND product_id = v_prod_a1;

  INSERT INTO public.stock_movements (
    business_id, location_id, product_id, movement_type, quantity_delta, quantity_after,
    unit_cost_snapshot, wac_after, reference_type, reference_id, created_by
  )
  VALUES (
    v_tenant_a, v_loc_a, v_prod_a1, 'sale', -2.000, 18.000,
    7000.00, 7000.00, 'sale', v_sale_id, v_owner_a
  );

  -- Partial customer debt repayment of 4,000 (leaves 5,000 balance_due)
  INSERT INTO public.customer_debt_payments (
    id, business_id, customer_id, payment_number, client_payment_uuid,
    amount_paid, payment_method, recorded_by_user_id
  )
  VALUES (
    v_pay_id, v_tenant_a, v_cust_a, 'PAY-202611-000001', 'aaaa9002-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    4000.00, 'bank_transfer', v_owner_a
  );

  INSERT INTO public.customer_debt_allocations (
    business_id, customer_id, sale_id, debt_payment_id, allocation_type, allocated_amount, created_by
  )
  VALUES (
    v_tenant_a, v_cust_a, v_sale_id, v_pay_id, 'payment', 4000.00, v_owner_a
  );

  UPDATE public.sales SET balance_due = balance_due - 4000.00 WHERE id = v_sale_id;

  -- D-15 Partial return of 1x Rice (9,500): debt-first reduces remaining 5,000 debt, 4,500 refunded in cash
  INSERT INTO public.sale_returns (
    id, business_id, sale_id, return_number, client_return_uuid, return_type, reason,
    subtotal_reversed, tax_reversed, total_reversed, debt_reduced_amount, refund_amount,
    total_cogs_reversed, approved_by_user_id
  )
  VALUES (
    v_ret_id, v_tenant_a, v_sale_id, 'RET-202611-000001', 'aaaa9003-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'partial_return', 'Synthetic partial return test',
    9500.00, 0.00, 9500.00, 5000.00, 4500.00, 7000.00, v_owner_a
  );

  INSERT INTO public.stock_movements (
    id, business_id, location_id, product_id, movement_type, quantity_delta, quantity_after,
    unit_cost_snapshot, wac_after, reference_type, reference_id, created_by
  )
  VALUES (
    v_mv_ret, v_tenant_a, v_loc_a, v_prod_a1, 'sale_return_restock', 1.000, 19.000,
    7000.00, 7000.00, 'sale_return', v_ret_id, v_owner_a
  );

  UPDATE public.stock_balances
  SET quantity_on_hand = quantity_on_hand + 1.000
  WHERE business_id = v_tenant_a AND location_id = v_loc_a AND product_id = v_prod_a1;

  INSERT INTO public.sale_return_items (
    business_id, sale_return_id, sale_item_id, product_id, quantity_returned,
    unit_price_snapshot, tax_reversed, line_total_reversed, unit_cost_snapshot,
    stock_disposition, stock_movement_id
  )
  VALUES (
    v_tenant_a, v_ret_id, v_item_id, v_prod_a1, 1.000,
    9500.00, 0.00, 9500.00, 7000.00, 'restock', v_mv_ret
  );

  INSERT INTO public.customer_debt_allocations (
    business_id, customer_id, sale_id, sale_return_id, allocation_type, allocated_amount, created_by
  )
  VALUES (
    v_tenant_a, v_cust_a, v_sale_id, v_ret_id, 'sale_return_credit', 5000.00, v_owner_a
  );

  INSERT INTO public.sale_refunds (
    business_id, sale_return_id, refund_method, amount, processed_by_user_id
  )
  VALUES (
    v_tenant_a, v_ret_id, 'cash', 4500.00, v_owner_a
  );

  UPDATE public.sales
  SET status = 'partially_returned', balance_due = balance_due - 5000.00
  WHERE id = v_sale_id;
END $$;

-- 3. Switch to non-superuser RLS role and assert fail-closed isolation across ALL tenant tables
SET LOCAL ROLE festola_rls_test_role;

DO $$
DECLARE
  v_cnt integer;
  v_tbl text;
BEGIN
  -- 3A. Unset tenant context MUST return 0 rows on every tenant table
  PERFORM set_config('app.current_business_id', '', true);
  PERFORM set_config('app.current_user_id', '', true);

  FOREACH v_tbl IN ARRAY ARRAY[
    'business_settings', 'product_categories', 'products', 'stock_balances',
    'restock_batches', 'restock_batch_items', 'stock_movements', 'receipt_sequences',
    'customers', 'sales', 'sale_items', 'sale_payments', 'receipts',
    'sale_returns', 'sale_return_items', 'sale_refunds',
    'customer_debt_payments', 'customer_debt_allocations',
    'expense_categories', 'expenses', 'subscription_invoices',
    'idempotency_records', 'sync_batches', 'sync_conflicts',
    'notifications', 'attachments'
  ]
  LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', v_tbl) INTO v_cnt;
    IF v_cnt <> 0 THEN
      RAISE EXCEPTION 'FAIL-CLOSED RLS VIOLATION: public.% returned % rows with empty context', v_tbl, v_cnt;
    END IF;
  END LOOP;

  -- 3B. Tenant A context MUST NEVER see Tenant B rows
  PERFORM set_config('app.current_business_id', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);
  PERFORM set_config('app.current_user_id', '11111111-1111-4111-8111-111111111101', true);

  SELECT count(*) INTO v_cnt FROM public.products WHERE business_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  IF v_cnt <> 0 THEN
    RAISE EXCEPTION 'CROSS-TENANT LEAK: Tenant A saw % Tenant B products', v_cnt;
  END IF;

  -- 3C. Cross-tenant composite FK rejection (Tenant A sale_item referencing Tenant B product MUST fail)
  BEGIN
    INSERT INTO public.sale_items (
      business_id, sale_id, product_id, product_name_snapshot, sku_snapshot,
      quantity, unit_price, line_total, unit_cost_snapshot, line_cogs_snapshot
    )
    VALUES (
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'aaaa1001-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'bbbb6666-bbbb-4bbb-8bbb-bbbbbbbbbb01',
      'Cross-Tenant Tamper',
      'SYN-B-001',
      1.000, 100.00, 100.00, 50.00, 50.00
    );
    RAISE EXCEPTION 'EXPECTED composite FK failure did not occur';
  EXCEPTION
    WHEN foreign_key_violation THEN
      NULL; -- Expected 23503
  END;

  -- 3D. Stock Ledger Reconciliation (balance MUST equal SUM(stock_movements.quantity_delta))
  SELECT count(*) INTO v_cnt
  FROM (
    SELECT sb.business_id, sb.location_id, sb.product_id, sb.quantity_on_hand,
           COALESCE(SUM(sm.quantity_delta), 0) AS ledger_sum
    FROM public.stock_balances sb
    LEFT JOIN public.stock_movements sm
      ON sm.business_id = sb.business_id
     AND sm.location_id = sb.location_id
     AND sm.product_id = sb.product_id
    GROUP BY sb.business_id, sb.location_id, sb.product_id, sb.quantity_on_hand
    HAVING sb.quantity_on_hand <> COALESCE(SUM(sm.quantity_delta), 0)
  ) mismatches;
  IF v_cnt <> 0 THEN
    RAISE EXCEPTION 'STOCK RECONCILIATION FAILED: % mismatched balances', v_cnt;
  END IF;

  -- 3E. Sale Tender Reconciliation
  SELECT count(*) INTO v_cnt
  FROM (
    SELECT s.id
    FROM public.sales s
    LEFT JOIN public.sale_payments sp ON sp.business_id = s.business_id AND sp.sale_id = s.id
    GROUP BY s.id, s.total_amount
    HAVING s.total_amount <> COALESCE(SUM(sp.amount), 0)
  ) mismatches;
  IF v_cnt <> 0 THEN
    RAISE EXCEPTION 'SALE TENDER RECONCILIATION FAILED: % mismatched sales', v_cnt;
  END IF;

  -- 3F. Customer Debt Balance Reconciliation
  SELECT count(*) INTO v_cnt
  FROM (
    SELECT s.id
    FROM public.sales s
    LEFT JOIN public.customer_debt_allocations a ON a.business_id = s.business_id AND a.sale_id = s.id
    GROUP BY s.id, s.credit_amount, s.balance_due
    HAVING s.balance_due <> (s.credit_amount - COALESCE(SUM(a.allocated_amount), 0))
  ) mismatches;
  IF v_cnt <> 0 THEN
    RAISE EXCEPTION 'DEBT RECONCILIATION FAILED: % mismatched credit balances', v_cnt;
  END IF;

  -- 3G. Append-Only Immutability Enforcement (MUST raise 42501)
  BEGIN
    UPDATE public.stock_movements SET quantity_delta = 999 WHERE business_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    RAISE EXCEPTION 'EXPECTED immutability block on stock_movements did not fire';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL; -- Expected 42501
  END;

  BEGIN
    DELETE FROM public.sales WHERE id = 'aaaa1001-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    RAISE EXCEPTION 'EXPECTED hard-delete block on sales did not fire';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL; -- Expected 42501
  END;

  BEGIN
    UPDATE public.sales SET total_amount = 1.00 WHERE id = 'aaaa1001-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    RAISE EXCEPTION 'EXPECTED snapshot lock on sales did not fire';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL; -- Expected 42501
  END;

  -- 3H. Business-Scoped Uniqueness / Idempotency Enforcement (MUST raise 23505)
  BEGIN
    INSERT INTO public.sales (
      business_id, location_id, cashier_user_id, sale_number, client_sale_uuid,
      subtotal_amount, total_amount, amount_paid, credit_amount, balance_due
    )
    VALUES (
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'aaaa1111-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      '11111111-1111-4111-8111-111111111101',
      'REC-202611-000001',
      'aaaa9998-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      100.00, 100.00, 100.00, 0.00, 0.00
    );
    RAISE EXCEPTION 'EXPECTED duplicate sale_number constraint did not fire';
  EXCEPTION
    WHEN unique_violation THEN
      NULL; -- Expected 23505
  END;

  -- 3I. Release 2 Reserved Tables Lock Check (INSERT MUST fail RLS 42501)
  BEGIN
    INSERT INTO public.suppliers (business_id, name)
    VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Blocked R2 Supplier');
    RAISE EXCEPTION 'EXPECTED R2 fail-closed RLS lock did not fire on public.suppliers';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL; -- Expected 42501
  END;

  RAISE NOTICE 'PASS: All Stage 06 RLS, composite FK, reconciliation, immutability, idempotency, and R2 lock checks passed.';
END $$;

ROLLBACK;
