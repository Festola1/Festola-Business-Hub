-- ============================================================================
-- Migration: 0009_sync_idempotency_and_conflicts.sql
-- Stage:     Stage 06 — Full PostgreSQL Schema & Migrations
-- Decisions: D-05 (per-tenant UUID idempotency, offline sales preserved, oversells
--            & stale edits flagged in sync_conflicts), D-09 (revoked device sales
--            routed to sync_conflicts before forced logout & local IndexedDB wipe)
-- Standards: UUID keys, TIMESTAMPTZ, composite (business_id, id) FKs.
-- ============================================================================

BEGIN;

-- 1. General-Purpose Tenant-Scoped Idempotency Records (online retries & offline replay protection)
CREATE TABLE IF NOT EXISTS public.idempotency_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses (id) ON DELETE RESTRICT,
  operation_type varchar(64) NOT NULL,
  idempotency_key varchar(128) NOT NULL,
  request_hash char(64) NOT NULL,
  status text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'failed')),
  response_status integer,
  response_body jsonb,
  resource_type varchar(64),
  resource_id uuid,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_idempotency_tenant_id UNIQUE (business_id, id),
  CONSTRAINT uq_idempotency_tenant_op_key UNIQUE (business_id, operation_type, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_idempotency_expires
  ON public.idempotency_records (expires_at);

-- 2. Offline Sync Batch Telemetry & Audit Header
CREATE TABLE IF NOT EXISTS public.sync_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses (id) ON DELETE RESTRICT,
  registered_device_id uuid NOT NULL,
  actor_user_id uuid NOT NULL REFERENCES public.user_profiles (id) ON DELETE RESTRICT,
  client_batch_uuid uuid NOT NULL,
  received_count integer NOT NULL DEFAULT 0 CHECK (received_count >= 0),
  applied_count integer NOT NULL DEFAULT 0 CHECK (applied_count >= 0),
  conflict_count integer NOT NULL DEFAULT 0 CHECK (conflict_count >= 0),
  rejected_count integer NOT NULL DEFAULT 0 CHECK (rejected_count >= 0),
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_sync_batches_tenant_id UNIQUE (business_id, id),
  CONSTRAINT uq_sync_batches_tenant_client_uuid UNIQUE (business_id, client_batch_uuid),
  CONSTRAINT fk_sync_batches_device
    FOREIGN KEY (business_id, registered_device_id)
    REFERENCES public.registered_devices (business_id, id)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_sync_batches_tenant_synced
  ON public.sync_batches (business_id, synced_at DESC);

-- 3. Offline Sync Conflicts Queue (D-05 & D-09: Owner/Manager resolution queue)
CREATE TABLE IF NOT EXISTS public.sync_conflicts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses (id) ON DELETE RESTRICT,
  sync_batch_id uuid,
  registered_device_id uuid,
  conflict_type text NOT NULL CHECK (
    conflict_type IN (
      'oversell',
      'stale_product_edit',
      'revoked_device_sale',
      'price_mismatch',
      'customer_credit_limit'
    )
  ),
  entity_type varchar(64) NOT NULL,
  entity_id uuid,
  client_event_id uuid NOT NULL,
  client_payload jsonb NOT NULL,
  server_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
  resolution_action varchar(64),
  resolution_notes text,
  resolved_by_user_id uuid REFERENCES public.user_profiles (id) ON DELETE RESTRICT,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_sync_conflicts_tenant_id UNIQUE (business_id, id),
  CONSTRAINT uq_sync_conflicts_tenant_event UNIQUE (business_id, conflict_type, client_event_id),
  CONSTRAINT chk_sync_conflicts_resolution CHECK (
    (status = 'open' AND resolved_at IS NULL AND resolved_by_user_id IS NULL)
    OR (status IN ('resolved', 'dismissed') AND resolved_at IS NOT NULL AND resolved_by_user_id IS NOT NULL)
  ),
  CONSTRAINT fk_sync_conflicts_batch
    FOREIGN KEY (business_id, sync_batch_id)
    REFERENCES public.sync_batches (business_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_sync_conflicts_device
    FOREIGN KEY (business_id, registered_device_id)
    REFERENCES public.registered_devices (business_id, id)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_sync_conflicts_tenant_open
  ON public.sync_conflicts (business_id, status, created_at DESC);

COMMIT;
