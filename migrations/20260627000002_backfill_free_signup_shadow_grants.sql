-- Migration: 20260627000002_backfill_free_signup_shadow_grants
-- Purpose:   Backfill shadow credit_grants rows for existing free users who
--            registered before the shadow ledger was deployed.
--
-- Background:
--   The shadow ledger (20260627000000) was deployed on 2026-06-27. New user
--   registrations after that date will receive a 'free_signup' credit_grants row
--   via the account creation path. Users who registered before that date have no
--   credit_grants row, which causes shadowAllocateCharge to log a warning and skip
--   allocation (correct shadow-mode behavior, but prevents full reconciliation).
--
--   Preflight results (run 2026-06-28 in Supabase SQL Editor):
--     users_to_backfill    = 9
--     duplicate free_signup = 0  (safe to add unique index)
--     credit_grants rows    = 0  (table was empty at baseline)
--     unique index          = not yet present
--
-- Safe to run:
--   - All statements are idempotent (IF NOT EXISTS, ON CONFLICT DO NOTHING).
--   - Does NOT alter user_profiles, generations_limit, or generations_used.
--   - Does NOT affect live billing in any way.
--   - Rollback: DELETE FROM credit_grants WHERE source_id = 'backfill_20260628';
--               DROP INDEX IF EXISTS credit_grants_user_free_signup_unique;
--
-- Credit value:
--   20 credits = 2 free generations × 10 credits per generation (CREDIT_MULTIPLIER).
--   Mirrors current live free plan cap (generations_limit = 2).
--   Update if live free plan limit changes.

-- ---------------------------------------------------------------------------
-- Step 1: Add partial unique index — enforces at-most-one free_signup per user.
--         Must run before the INSERT so ON CONFLICT DO NOTHING has a target.
--         Safe to run if already present (IF NOT EXISTS).
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS credit_grants_user_free_signup_unique
  ON credit_grants (user_id)
  WHERE grant_type = 'free_signup';

-- ---------------------------------------------------------------------------
-- Step 2: Insert free_signup shadow grants for all existing free users who
--         do not yet have one.
--
--   NOT EXISTS guard    — primary idempotency: skips users already covered.
--   ON CONFLICT DO NOTHING — secondary idempotency: handles any race condition
--                            and makes re-runs fully silent.
--   metadata snapshot   — records live billing values at time of backfill for
--                         audit purposes only; does not change those values.
-- ---------------------------------------------------------------------------
INSERT INTO credit_grants (user_id, grant_type, credits, source_id, expires_at, metadata)
SELECT
  up.id,
  'free_signup',
  20,
  'backfill_20260628',
  NULL,
  jsonb_build_object(
    'reason',                   'shadow_ledger_backfill',
    'source',                   'migration_20260627000002',
    'backfill',                 true,
    'live_generations_limit',   up.generations_limit,
    'live_generations_used',    up.generations_used
  )
FROM user_profiles up
WHERE up.is_pro = false
  AND NOT EXISTS (
    SELECT 1
    FROM credit_grants cg
    WHERE cg.user_id  = up.id
      AND cg.grant_type = 'free_signup'
  )
ON CONFLICT DO NOTHING;
