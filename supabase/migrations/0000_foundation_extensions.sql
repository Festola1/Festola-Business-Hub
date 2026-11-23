-- ============================================================================
-- Migration: 0000_foundation_extensions.sql
-- Stage:     P-02a Project Foundation Scaffold
-- Scope:     Database extensions and RLS helper primitives ONLY.
--            No domain tables or unresolved D-01..D-15 structures are created
--            until explicitly approved in subsequent schema stages.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Helper function returning the transaction-scoped tenant business_id.
-- Fails closed (returns NULL -> 0 rows matched) when app.current_business_id is unset.
CREATE OR REPLACE FUNCTION public.current_business_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.current_business_id', true), '')::uuid;
$$;

-- Helper function returning the transaction-scoped authenticated user_id.
CREATE OR REPLACE FUNCTION public.current_actor_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.current_user_id', true), '')::uuid;
$$;
