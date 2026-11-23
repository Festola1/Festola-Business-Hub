-- ============================================================================
-- Migration: 0004_catalog_and_inventory.sql
-- Stage:     Stage 06 — Full PostgreSQL Schema & Migrations
-- Decisions: D-02 (single location FK ready for R2), D-03 (per-product tax exempt),
--            D-04 (Moving WAC & freeze on qty <= 0), D-11 (lightweight Restock + Adjustments)
-- Standards: UUID keys, TIMESTAMPTZ, NUMERIC(18,2) money, NUMERIC(18,3) quantities,
--            composite (business_id, id) FKs, append-only stock_movements ledger.
-- ============================================================================

BEGIN;

-- 1. Product Categories (business-scoped, soft-deletable via archived_at)
CREATE TABLE IF NOT EXISTS public.product_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses (id) ON DELETE RESTRICT,
  name text NOT NULL,
  description text,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_product_categories_tenant_id UNIQUE (business_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_product_categories_active_name
  ON public.product_categories (business_id, lower(name))
  WHERE archived_at IS NULL;

-- 2. Products Catalog
CREATE TABLE IF NOT EXISTS public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses (id) ON DELETE RESTRICT,
  category_id uuid,
  sku varchar(64) NOT NULL,
  barcode varchar(128),
  name text NOT NULL,
  description text,
  unit varchar(32) NOT NULL DEFAULT 'pcs',
  selling_price numeric(18, 2) NOT NULL CHECK (selling_price >= 0),
  -- D-04: Current Moving Weighted Average Cost mirrored from primary location stock_balances
  cost_price numeric(18, 2) NOT NULL DEFAULT 0.00 CHECK (cost_price >= 0),
  -- D-03: Per-product tax-exempt override
  is_tax_exempt boolean NOT NULL DEFAULT false,
  track_inventory boolean NOT NULL DEFAULT true,
  reorder_level numeric(18, 3) NOT NULL DEFAULT 0.000 CHECK (reorder_level >= 0),
  is_active boolean NOT NULL DEFAULT true,
  archived_at timestamptz,
  -- D-05: Optimistic concurrency version for stale offline edit detection
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_by uuid NOT NULL REFERENCES public.user_profiles (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_products_tenant_id UNIQUE (business_id, id),
  CONSTRAINT fk_products_category
    FOREIGN KEY (business_id, category_id)
    REFERENCES public.product_categories (business_id, id)
    ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_products_tenant_sku_active
  ON public.products (business_id, lower(sku))
  WHERE archived_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_products_tenant_barcode_active
  ON public.products (business_id, barcode)
  WHERE barcode IS NOT NULL AND archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_products_tenant_search
  ON public.products (business_id, is_active, lower(name))
  WHERE archived_at IS NULL;

-- 3. Stock Balances per Location & Product (D-02 location-aware, D-04 WAC freeze)
CREATE TABLE IF NOT EXISTS public.stock_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses (id) ON DELETE RESTRICT,
  location_id uuid NOT NULL,
  product_id uuid NOT NULL,
  quantity_on_hand numeric(18, 3) NOT NULL DEFAULT 0.000,
  wac_unit_cost numeric(18, 2) NOT NULL DEFAULT 0.00 CHECK (wac_unit_cost >= 0),
  -- D-04: Frozen WAC retained when quantity_on_hand <= 0 under Owner negative-stock override
  last_positive_wac numeric(18, 2) NOT NULL DEFAULT 0.00 CHECK (last_positive_wac >= 0),
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_stock_balances_tenant_id UNIQUE (business_id, id),
  CONSTRAINT uq_stock_balances_tenant_loc_prod UNIQUE (business_id, location_id, product_id),
  CONSTRAINT fk_stock_balances_location
    FOREIGN KEY (business_id, location_id)
    REFERENCES public.business_locations (business_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_stock_balances_product
    FOREIGN KEY (business_id, product_id)
    REFERENCES public.products (business_id, id)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_stock_balances_low_stock
  ON public.stock_balances (business_id, location_id, quantity_on_hand);

-- 4. Lightweight Multi-Item Receive Stock (Restock) Batches (D-11; strictly NOT R2-01 Supplier PO/AP)
CREATE TABLE IF NOT EXISTS public.restock_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses (id) ON DELETE RESTRICT,
  location_id uuid NOT NULL,
  batch_number varchar(48) NOT NULL,
  client_batch_uuid uuid NOT NULL,
  source_note text,
  total_cost numeric(18, 2) NOT NULL DEFAULT 0.00 CHECK (total_cost >= 0),
  received_by_user_id uuid NOT NULL REFERENCES public.user_profiles (id) ON DELETE RESTRICT,
  received_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_restock_batches_tenant_id UNIQUE (business_id, id),
  CONSTRAINT uq_restock_batches_tenant_number UNIQUE (business_id, batch_number),
  CONSTRAINT uq_restock_batches_tenant_client_uuid UNIQUE (business_id, client_batch_uuid),
  CONSTRAINT fk_restock_batches_location
    FOREIGN KEY (business_id, location_id)
    REFERENCES public.business_locations (business_id, id)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_restock_batches_tenant_received
  ON public.restock_batches (business_id, received_at DESC);

-- 5. Restock Batch Items (immutable line-level cost & WAC audit)
CREATE TABLE IF NOT EXISTS public.restock_batch_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses (id) ON DELETE RESTRICT,
  restock_batch_id uuid NOT NULL,
  product_id uuid NOT NULL,
  quantity_received numeric(18, 3) NOT NULL CHECK (quantity_received > 0),
  unit_cost numeric(18, 2) NOT NULL CHECK (unit_cost >= 0),
  line_total_cost numeric(18, 2) NOT NULL CHECK (line_total_cost >= 0),
  wac_before numeric(18, 2) NOT NULL CHECK (wac_before >= 0),
  wac_after numeric(18, 2) NOT NULL CHECK (wac_after >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_restock_batch_items_tenant_id UNIQUE (business_id, id),
  CONSTRAINT fk_restock_batch_items_batch
    FOREIGN KEY (business_id, restock_batch_id)
    REFERENCES public.restock_batches (business_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_restock_batch_items_product
    FOREIGN KEY (business_id, product_id)
    REFERENCES public.products (business_id, id)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_restock_batch_items_batch
  ON public.restock_batch_items (business_id, restock_batch_id);

-- 6. Immutable Append-Only Stock Movements Ledger (D-04, D-11, D-15)
CREATE TABLE IF NOT EXISTS public.stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses (id) ON DELETE RESTRICT,
  location_id uuid NOT NULL,
  product_id uuid NOT NULL,
  movement_type text NOT NULL CHECK (
    movement_type IN (
      'initial_stock',
      'restock',
      'sale',
      'sale_return_restock',
      'sale_void_restock',
      'adjustment_in',
      'adjustment_out',
      'damaged_return'
    )
  ),
  quantity_delta numeric(18, 3) NOT NULL,
  quantity_after numeric(18, 3) NOT NULL,
  unit_cost_snapshot numeric(18, 2) NOT NULL CHECK (unit_cost_snapshot >= 0),
  wac_after numeric(18, 2) NOT NULL CHECK (wac_after >= 0),
  reference_type text NOT NULL CHECK (
    reference_type IN ('product', 'restock_batch', 'sale', 'sale_return', 'manual_adjustment')
  ),
  reference_id uuid NOT NULL,
  reason text,
  client_event_id uuid,
  created_by uuid NOT NULL REFERENCES public.user_profiles (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_stock_movements_tenant_id UNIQUE (business_id, id),
  CONSTRAINT chk_stock_movement_direction CHECK (
    (
      movement_type IN ('initial_stock', 'restock', 'sale_return_restock', 'sale_void_restock', 'adjustment_in')
      AND quantity_delta > 0
    )
    OR (
      movement_type IN ('sale', 'adjustment_out')
      AND quantity_delta < 0
    )
    OR (
      movement_type = 'damaged_return'
      AND quantity_delta = 0
    )
  ),
  CONSTRAINT fk_stock_movements_location
    FOREIGN KEY (business_id, location_id)
    REFERENCES public.business_locations (business_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_stock_movements_product
    FOREIGN KEY (business_id, product_id)
    REFERENCES public.products (business_id, id)
    ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_stock_movements_client_event
  ON public.stock_movements (business_id, client_event_id)
  WHERE client_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_stock_movements_product_time
  ON public.stock_movements (business_id, product_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_stock_movements_reference
  ON public.stock_movements (business_id, reference_type, reference_id);

COMMIT;
