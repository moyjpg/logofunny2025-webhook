-- Migration: 20260627000000_create_credit_ledger_shadow_tables
-- Purpose:   Schema-only shadow-mode credit ledger.
--            These tables are written to in parallel with the existing
--            generations_limit / generations_used billing gate but are NOT
--            read for any live billing decision during shadow mode.
--            Activating them as the billing source of truth is a separate
--            migration gated on reconciliation sign-off.
-- Safe to run: does not alter any existing table or column.

-- ---------------------------------------------------------------------------
-- 1. credit_grants
--    Records every credit allocation made to a user.
--
--    grant_type values:
--      free_signup              — 20 credits issued on account creation (2 free generations)
--      monthly_pro              — credits issued on each Dodo subscription renewal;
--                                 expires at the Dodo renewal_date, not now() + 30 days
--      one_time_pack            — credits from a Dodo one-time credit pack purchase;
--                                 does not expire; source_id = Dodo payment ID
--      referral_bonus           — bonus credits awarded via referral system (do not touch referral logic)
--      failed_generation_refund — credits returned when a generation fails;
--                                 only issued after a generation_charges row exists for the failure
--      admin_grant              — manual operational adjustment; metadata must record reason
--
--    Spend order:
--      monthly_pro (expiring) consumed first; then FIFO on created_at across non-expiring types.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS credit_grants (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  grant_type  TEXT        NOT NULL
                          CHECK (grant_type IN (
                            'free_signup',
                            'monthly_pro',
                            'one_time_pack',
                            'referral_bonus',
                            'failed_generation_refund',
                            'admin_grant'
                          )),
  credits     INTEGER     NOT NULL CHECK (credits > 0),
  -- dodo subscription ID, dodo payment ID, referral code, admin note, etc.
  source_id   TEXT,
  -- NULL means credits never expire.
  -- monthly_pro: set to the Dodo renewal_date from the webhook payload.
  -- one_time_pack / referral_bonus / refund / admin: leave NULL.
  expires_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata    JSONB
);

CREATE INDEX IF NOT EXISTS credit_grants_user_id_expires_at_idx
  ON credit_grants (user_id, expires_at);

CREATE INDEX IF NOT EXISTS credit_grants_grant_type_idx
  ON credit_grants (grant_type);

-- ---------------------------------------------------------------------------
-- 2. generation_charges
--    Records every generation attempt regardless of success or failure.
--    status='failed' rows are the prerequisite for issuing a
--    failed_generation_refund grant — never issue the refund grant first.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS generation_charges (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  -- e.g. '/generate-logo', '/generate-logo-hybrid-test'
  route            TEXT        NOT NULL,
  credits_charged  INTEGER     NOT NULL DEFAULT 10 CHECK (credits_charged > 0),
  status           TEXT        NOT NULL DEFAULT 'success'
                               CHECK (status IN ('success', 'failed', 'refunded')),
  -- backend requestId for correlation with server logs
  request_id       TEXT,
  brand_name       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata         JSONB
);

CREATE INDEX IF NOT EXISTS generation_charges_user_id_created_at_idx
  ON generation_charges (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS generation_charges_status_idx
  ON generation_charges (status);

-- ---------------------------------------------------------------------------
-- 3. generation_charge_allocations
--    Maps each charge across one or more grants.
--    Spend order: monthly_pro (expiring) first, then FIFO on created_at.
--    Sum of credits_used across all allocations for a charge == credits_charged.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS generation_charge_allocations (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  charge_id    UUID        NOT NULL REFERENCES generation_charges (id) ON DELETE CASCADE,
  grant_id     UUID        NOT NULL REFERENCES credit_grants (id) ON DELETE RESTRICT,
  credits_used INTEGER     NOT NULL CHECK (credits_used > 0),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS generation_charge_allocations_charge_id_idx
  ON generation_charge_allocations (charge_id);

CREATE INDEX IF NOT EXISTS generation_charge_allocations_grant_id_idx
  ON generation_charge_allocations (grant_id);

-- ---------------------------------------------------------------------------
-- 4. dodo_webhook_events
--    Idempotent log of every inbound Dodo Payments webhook event.
--    Written before any grant logic runs.
--    event_id is Dodo's own event identifier — UNIQUE enforces at-most-once processing.
--    Always insert with ON CONFLICT (event_id) DO NOTHING to handle re-deliveries.
--    processed_at is set only after downstream grant logic completes cleanly.
--    Covers both subscription events (monthly_pro grants) and
--    one-time payment events (one_time_pack grants).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dodo_webhook_events (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Dodo's own event identifier; treat as immutable once stored
  event_id     TEXT        NOT NULL,
  event_type   TEXT        NOT NULL,
  -- full raw payload stored for replay and audit
  payload      JSONB       NOT NULL,
  -- NULL until downstream grant logic has processed this event
  processed_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT dodo_webhook_events_event_id_unique UNIQUE (event_id)
);

CREATE INDEX IF NOT EXISTS dodo_webhook_events_event_type_idx
  ON dodo_webhook_events (event_type);

-- Partial index for fast unprocessed-event queue scans
CREATE INDEX IF NOT EXISTS dodo_webhook_events_unprocessed_idx
  ON dodo_webhook_events (created_at)
  WHERE processed_at IS NULL;

-- ---------------------------------------------------------------------------
-- 5. designer_orders
--    Future designer service tier. Schema defined now for clean FK references
--    when the designer service is scoped. credits_paid is nullable until a
--    credit-based pricing model for designer orders is confirmed.
--    Intentionally NOT linked to generation_charges — designer orders are a
--    separate spend type and must not be conflated with generation debits.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS designer_orders (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  order_type       TEXT        NOT NULL,
  status           TEXT        NOT NULL DEFAULT 'pending'
                               CHECK (status IN (
                                 'pending',
                                 'in_progress',
                                 'delivered',
                                 'cancelled'
                               )),
  credits_paid     INTEGER     CHECK (credits_paid IS NULL OR credits_paid >= 0),
  dodo_payment_id  TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivered_at     TIMESTAMPTZ,
  metadata         JSONB
);

CREATE INDEX IF NOT EXISTS designer_orders_user_id_idx
  ON designer_orders (user_id);

CREATE INDEX IF NOT EXISTS designer_orders_status_idx
  ON designer_orders (status);
