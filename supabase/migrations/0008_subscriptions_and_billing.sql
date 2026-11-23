-- ============================================================================
-- Migration: 0008_subscriptions_and_billing.sql
-- Stage:     Stage 06 — Full PostgreSQL Schema & Migrations
-- Decisions: D-01 (data-driven plans; paid names & NGN prices stay TBD until P-07),
--            D-07 (Paystack primary behind provider-agnostic adapter, HMAC-SHA512
--            raw-body webhooks + idempotency + Verify API re-check)
-- Standards: UUID keys, TIMESTAMPTZ, NUMERIC(18,2) money, composite tenant FKs.
-- ============================================================================

BEGIN;

-- 1. Business Subscription Invoices (server-owned pricing; never client-supplied amounts)
CREATE TABLE IF NOT EXISTS public.subscription_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses (id) ON DELETE RESTRICT,
  subscription_id uuid NOT NULL,
  plan_id uuid NOT NULL REFERENCES public.subscription_plans (id) ON DELETE RESTRICT,
  invoice_number varchar(48) NOT NULL,
  billing_cycle text NOT NULL CHECK (billing_cycle IN ('monthly', 'annual')),
  currency_code char(3) NOT NULL DEFAULT 'NGN',
  amount_ngn numeric(18, 2) NOT NULL CHECK (amount_ngn >= 0),
  provider text NOT NULL CHECK (provider IN ('paystack', 'flutterwave')),
  provider_reference varchar(128) NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed', 'expired')),
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  paid_at timestamptz,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_subscription_invoices_tenant_id UNIQUE (business_id, id),
  CONSTRAINT uq_subscription_invoices_tenant_number UNIQUE (business_id, invoice_number),
  CONSTRAINT chk_subscription_invoices_period CHECK (period_end > period_start),
  CONSTRAINT fk_subscription_invoices_sub
    FOREIGN KEY (business_id, subscription_id)
    REFERENCES public.business_subscriptions (business_id, id)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_subscription_invoices_tenant_created
  ON public.subscription_invoices (business_id, created_at DESC);

-- 2. Provider Webhook Idempotency & Verification Ledger (D-07)
--    Locked behind fail-closed default-deny RLS for tenant sessions; accessed strictly
--    by server-side webhook verification worker.
CREATE TABLE IF NOT EXISTS public.payment_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL CHECK (provider IN ('paystack', 'flutterwave')),
  provider_event_id varchar(160) NOT NULL,
  event_type text NOT NULL,
  signature_verified boolean NOT NULL DEFAULT false,
  payload_sha256 char(64) NOT NULL,
  raw_payload jsonb NOT NULL,
  business_id uuid REFERENCES public.businesses (id) ON DELETE RESTRICT,
  processing_status text NOT NULL DEFAULT 'received' CHECK (
    processing_status IN ('received', 'processed', 'ignored', 'failed')
  ),
  error_message text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  CONSTRAINT uq_payment_webhook_provider_event UNIQUE (provider, provider_event_id)
);

CREATE INDEX IF NOT EXISTS idx_payment_webhook_status_received
  ON public.payment_webhook_events (processing_status, received_at DESC);

COMMIT;
