-- ============================================================================
-- Migration: 0010_notifications_attachments_and_audit_indexes.sql
-- Stage:     Stage 06 — Full PostgreSQL Schema & Migrations
-- Decisions: D-12 (In-App Notification Center + Essential Transactional Email ONLY;
--            SMS and R2-06 WhatsApp automation strictly excluded), D-08 audit indexes.
-- Standards: UUID keys, TIMESTAMPTZ, strict MIME/size bounds on attachments.
-- ============================================================================

BEGIN;

-- 1. In-App & Transactional Email Notifications (D-12)
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses (id) ON DELETE RESTRICT,
  recipient_user_id uuid REFERENCES public.user_profiles (id) ON DELETE RESTRICT,
  channel text NOT NULL CHECK (channel IN ('in_app', 'email')),
  category text NOT NULL CHECK (
    category IN (
      'low_stock',
      'sync_conflict',
      'subscription',
      'device_expiry',
      'staff_invite',
      'system'
    )
  ),
  title text NOT NULL,
  body text NOT NULL,
  action_url text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz,
  email_status text NOT NULL DEFAULT 'not_applicable' CHECK (
    email_status IN ('not_applicable', 'queued', 'sent', 'failed')
  ),
  provider_message_id varchar(160),
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_notifications_tenant_id UNIQUE (business_id, id),
  CONSTRAINT chk_notifications_channel_email_status CHECK (
    (channel = 'in_app' AND email_status = 'not_applicable')
    OR (channel = 'email' AND email_status IN ('queued', 'sent', 'failed'))
  )
);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_unread
  ON public.notifications (business_id, recipient_user_id, created_at DESC)
  WHERE read_at IS NULL;

-- 2. Tenant-Scoped File Attachments Metadata (Object Storage pointers; 10 MB cap)
CREATE TABLE IF NOT EXISTS public.attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses (id) ON DELETE RESTRICT,
  entity_type text NOT NULL CHECK (
    entity_type IN ('expense', 'product', 'business_logo', 'receipt_pdf', 'restock_batch')
  ),
  entity_id uuid NOT NULL,
  storage_bucket varchar(64) NOT NULL,
  storage_path text NOT NULL UNIQUE,
  file_name text NOT NULL,
  mime_type varchar(128) NOT NULL,
  byte_size bigint NOT NULL CHECK (byte_size > 0 AND byte_size <= 10485760),
  sha256_checksum char(64) NOT NULL,
  uploaded_by_user_id uuid NOT NULL REFERENCES public.user_profiles (id) ON DELETE RESTRICT,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_attachments_tenant_id UNIQUE (business_id, id)
);

CREATE INDEX IF NOT EXISTS idx_attachments_tenant_entity
  ON public.attachments (business_id, entity_type, entity_id)
  WHERE archived_at IS NULL;

-- 3. Operational Audit Log Indexes (table created in 0001; append-only trigger in 0002)
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_entity
  ON public.audit_logs (business_id, entity_type, entity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_action
  ON public.audit_logs (business_id, action, created_at DESC);

COMMIT;
