-- Migration: 20260627000001_shadow_tables_rls_grants
-- Purpose:   Grant service_role access to shadow ledger tables and enable RLS.
--            Applied manually in Supabase SQL Editor on 2026-06-27 after
--            20260627000000_create_credit_ledger_shadow_tables.sql was confirmed present.
--            This file captures that manual state so it is reproducible.
--
-- Safe to run: idempotent — GRANT is additive; ENABLE ROW LEVEL SECURITY is
--              a no-op if RLS is already enabled on a table.
--
-- Context:
--   Shadow writes use the SUPABASE_SERVICE_ROLE_KEY which authenticates as the
--   service_role Postgres role. Without explicit GRANTs on public schema tables,
--   service_role writes are rejected even though the key bypasses RLS by default.
--   RLS is enabled on each table as a forward-compatibility measure — no policies
--   are defined yet, so only service_role (which bypasses RLS) can read/write.
--   This prevents accidental anon/authenticated access before policies are written.

-- ---------------------------------------------------------------------------
-- Schema usage
-- ---------------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO service_role;

-- ---------------------------------------------------------------------------
-- credit_grants
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON credit_grants TO service_role;
ALTER TABLE credit_grants ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- generation_charges
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON generation_charges TO service_role;
ALTER TABLE generation_charges ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- generation_charge_allocations
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON generation_charge_allocations TO service_role;
ALTER TABLE generation_charge_allocations ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- dodo_webhook_events
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON dodo_webhook_events TO service_role;
ALTER TABLE dodo_webhook_events ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- designer_orders
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON designer_orders TO service_role;
ALTER TABLE designer_orders ENABLE ROW LEVEL SECURITY;
