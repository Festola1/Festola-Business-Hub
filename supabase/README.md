# Supabase & PostgreSQL Migrations

All schema changes for **Festola Business Hub** are managed strictly as version-controlled, forward-only, transactional SQL migrations in `supabase/migrations/`.

## Governance Rules

1. **Sequential Naming**: `NNNN_<descriptive_name>.sql` (e.g., `0000_foundation_extensions.sql`).
2. **Never Edit Applied Migrations**: Always author a new migration file for schema changes.
3. **Mandatory Tenant Isolation**: Every business-owned table MUST include `business_id UUID NOT NULL`, `ENABLE ROW LEVEL SECURITY`, `FORCE ROW LEVEL SECURITY`, fail-closed policies anchored to `public.current_business_id()`, and composite `(business_id, id)` foreign keys for parent/child tenant safety.
4. **Financial Standards (`Arch §4.1`, `D-03`, `D-04`, `D-08`, `D-14`, `D-15`)**:
   - `UUID` primary keys (`gen_random_uuid()`), `TIMESTAMPTZ` timestamps, `NUMERIC(18, 2)` money (never floats), `NUMERIC(18, 3)` quantities, `NUMERIC(8, 4)` percentages/tax rates.
   - Immutable append-only financial/stock ledgers (`stock_movements`, `restock_batches`, `restock_batch_items`, `sale_items`, `sale_payments`, `sale_returns`, `sale_return_items`, `sale_refunds`, `customer_debt_allocations`, `audit_logs`).
   - Non-destructive financial corrections only (hard `DELETE` blocked via trigger; immutable tax/COGS/receipt snapshots locked).
5. **Promotion & Rollback Order**:
   - Apply and verify migrations strictly in **Development -> Staging -> Production** after taking a `pg_dump` snapshot and confirming Supabase PITR (`D-08`: RPO `<= 15 min`, RTO `<= 4 hrs`).
   - Production rollbacks use forward-fix migrations or PITR restore (never destructive `DROP TABLE`).
   - Development/Staging-only rollback for Stage 06 (`0012` down to `0003`) is provided in `supabase/rollback/stage06_down_dev_only.sql` (guarded against running on production DBs).

## Migration Inventory

| Migration                                              | Stage      | Purpose                                                                                                                                                                                                                                                                         |
| :----------------------------------------------------- | :--------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `0000_foundation_extensions.sql`                       | `P-02a`    | `pgcrypto` extension + `current_business_id()` / `current_actor_user_id()` fail-closed helpers                                                                                                                                                                                  |
| `0001_identity_and_tenants.sql`                        | `P-02b`    | `user_profiles`, `platform_admins`, `subscription_plans` (14-day trial seed only), `businesses`, `business_locations` (`D-02` single active location index), `business_subscriptions`, `business_memberships` (`D-09`), `staff_invitations`, `registered_devices`, `audit_logs` |
| `0002_identity_rls_and_helpers.sql`                    | `P-02b`    | `ENABLE` + `FORCE RLS`, fail-closed tenant policies, `set_updated_at()` triggers, and append-only `audit_logs` immutability trigger (`D-08`)                                                                                                                                    |
| `0003_rbac_roles_permissions_and_settings.sql`         | `Stage 06` | Canonical `roles` (`owner`, `manager`, `cashier`), `permissions`, `role_permissions` (aligned 1:1 with `server/lib/rbac.ts`), role FKs, and `business_settings`                                                                                                                 |
| `0004_catalog_and_inventory.sql`                       | `Stage 06` | `product_categories`, `products` (`D-03` tax-exempt flag, `D-04` WAC), `stock_balances` (`last_positive_wac`), `restock_batches`, `restock_batch_items` (`D-11`), append-only `stock_movements`                                                                                 |
| `0005_customers_and_sales.sql`                         | `Stage 06` | `receipt_sequences`, `customers`, `sales` (tax/COGS snapshots & `client_sale_uuid` idempotency), `sale_items`, `sale_payments` (`D-13` split tenders), `receipts` (`D-14`)                                                                                                      |
| `0006_returns_refunds_and_debt_allocations.sql`        | `Stage 06` | `sale_returns` (`D-15`), `sale_return_items` (`restock`/`damaged`), `sale_refunds`, `customer_debt_payments`, `customer_debt_allocations` (debt-first credit reduction), `receipts` target FKs                                                                                  |
| `0007_operating_expenses.sql`                          | `Stage 06` | `expense_categories`, `expenses` (non-destructive `posted` -> `reversed` lifecycle)                                                                                                                                                                                             |
| `0008_subscriptions_and_billing.sql`                   | `Stage 06` | `subscription_invoices`, `payment_webhook_events` (`D-07` Paystack primary + provider-agnostic adapter; paid plan names/prices remain `TBD` until `P-07`)                                                                                                                       |
| `0009_sync_idempotency_and_conflicts.sql`              | `Stage 06` | `idempotency_records`, `sync_batches`, `sync_conflicts` (`D-05` oversells/stale edits & `D-09` revoked-device sales)                                                                                                                                                            |
| `0010_notifications_attachments_and_audit_indexes.sql` | `Stage 06` | `notifications` (`D-12` In-App + Transactional Email only), `attachments` (10 MB cap + SHA-256), operational `audit_logs` indexes                                                                                                                                               |
| `0011_domain_rls_immutability_and_triggers.sql`        | `Stage 06` | `ENABLE` + `FORCE RLS` across all Stage 06 tables, `set_updated_at()` triggers, append-only ledger immutability, hard-delete prevention, and snapshot locks                                                                                                                     |
| `0012_release2_reserved_tables.sql`                    | `Stage 06` | Reserved Release 2 tables (`R2-01` `suppliers`/`local_purchases`, `R2-04` `stock_transfers`, `C-02` `stock_counts`, `R2-05` `cash_register_sessions`) strictly locked behind default-deny RLS (`USING (false) WITH CHECK (false)`) — unexposed in MVP                           |
| `0013_auth_rls_storage_and_platform_admin.sql`         | `Stage 07` | Membership-aware fail-closed tenant RLS (`has_active_tenant_access`), `attachments.manage` RBAC seed, immutable `platform_admin_audit_logs` (`FORCE RLS` default-deny for tenants), and conditional `storage.objects` `<business_id>/...` bucket isolation policies             |

## Verification Scripts (Isolated Tests Only — Never Real Customer Data)

Once a Development or Staging PostgreSQL/Supabase `DATABASE_URL` is configured, apply `0000`–`0013` in order and run:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_isolation_verify.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/stage06_integrity_and_rls_verify.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/stage07_auth_rls_storage_verify.sql
```

All three scripts execute inside a rolled-back `BEGIN; ... ROLLBACK;` transaction using synthetic RFC-2606 `.example` fixtures (`supabase/tests/seed_isolated_test_tenants.sql`) and leave zero test rows behind.
