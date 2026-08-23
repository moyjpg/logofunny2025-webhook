-- Capture the approved, read-only reconciliation result as server-only snapshots.
--
-- This migration intentionally does not:
--   * enable Credits v2 enforcement or Annual Pro checkout;
--   * insert credit grants, transactions, entitlements, or charges;
--   * repair the Auth account that has no user_profiles row;
--   * decide how to migrate the held 850-credit paid account.

DO $guard$
DECLARE
  v_profiles integer;
  v_computed_credits integer;
  v_auto_free integer;
  v_manual_anomaly integer;
  v_manual_paid integer;
  v_referral_review integer;
  v_auto_positive_accounts integer;
  v_auto_positive_credits integer;
BEGIN
  IF COALESCE((
    SELECT enabled
    FROM public.credit_system_settings
    WHERE setting_key = 'wallet_v2_enforcement'
  ), true) THEN
    RAISE EXCEPTION 'Credits v2 enforcement must remain disabled while snapshots are captured';
  END IF;

  IF COALESCE((
    SELECT enabled
    FROM public.credit_system_settings
    WHERE setting_key = 'annual_pro_checkout'
  ), true) THEN
    RAISE EXCEPTION 'Annual Pro checkout must remain disabled while snapshots are captured';
  END IF;

  IF EXISTS (SELECT 1 FROM public.credit_migration_snapshots) THEN
    RAISE EXCEPTION 'Expected an empty credit_migration_snapshots table';
  END IF;

  IF EXISTS (SELECT 1 FROM public.credit_grants)
     OR EXISTS (SELECT 1 FROM public.credit_transactions)
     OR EXISTS (SELECT 1 FROM public.billing_entitlements) THEN
    RAISE EXCEPTION 'Credits v2 financial tables changed after reconciliation; stop and review';
  END IF;

  WITH classified AS (
    SELECT
      p.*,
      GREATEST(
        p.generations_limit + COALESCE(p.referral_bonus_generations, 0) - p.generations_used,
        0
      ) AS remaining_generations,
      (
        p.plan <> 'free'
        OR p.is_pro
        OR p.dodo_customer_id IS NOT NULL
        OR p.stripe_customer_id IS NOT NULL
        OR p.stripe_subscription_id IS NOT NULL
        OR lower(COALESCE(p.subscription_status, '')) IN (
          'active', 'renewed', 'on_hold', 'past_due', 'trialing'
        )
      ) AS has_paid_signal,
      (
        p.generations_limit < 0
        OR p.generations_used < 0
        OR COALESCE(p.referral_bonus_generations, 0) < 0
        OR p.generations_used > p.generations_limit + COALESCE(p.referral_bonus_generations, 0)
        OR (p.plan = 'free' AND p.is_pro)
        OR (p.plan <> 'free' AND NOT p.is_pro)
      ) AS has_data_anomaly
    FROM public.user_profiles p
  ), cohorts AS (
    SELECT
      c.*,
      CASE
        WHEN c.has_data_anomaly THEN 'manual_data_anomaly'
        WHEN c.has_paid_signal THEN 'manual_paid_or_subscription'
        WHEN COALESCE(c.referral_bonus_generations, 0) > 0 THEN 'review_referral_source'
        ELSE 'auto_free_candidate'
      END AS classification
    FROM classified c
  )
  SELECT
    count(*)::integer,
    COALESCE(sum(remaining_generations * 10), 0)::integer,
    count(*) FILTER (WHERE classification = 'auto_free_candidate')::integer,
    count(*) FILTER (WHERE classification = 'manual_data_anomaly')::integer,
    count(*) FILTER (WHERE classification = 'manual_paid_or_subscription')::integer,
    count(*) FILTER (WHERE classification = 'review_referral_source')::integer,
    count(*) FILTER (
      WHERE classification = 'auto_free_candidate' AND remaining_generations > 0
    )::integer,
    COALESCE(sum(remaining_generations * 10) FILTER (
      WHERE classification = 'auto_free_candidate' AND remaining_generations > 0
    ), 0)::integer
  INTO
    v_profiles,
    v_computed_credits,
    v_auto_free,
    v_manual_anomaly,
    v_manual_paid,
    v_referral_review,
    v_auto_positive_accounts,
    v_auto_positive_credits
  FROM cohorts;

  IF v_profiles <> 11
     OR v_computed_credits <> 890
     OR v_auto_free <> 8
     OR v_manual_anomaly <> 1
     OR v_manual_paid <> 1
     OR v_referral_review <> 1
     OR v_auto_positive_accounts <> 3
     OR v_auto_positive_credits <> 40 THEN
    RAISE EXCEPTION
      'Reconciliation drift: profiles %, credits %, cohorts %/%/%/%, auto positive %/%',
      v_profiles,
      v_computed_credits,
      v_auto_free,
      v_manual_anomaly,
      v_manual_paid,
      v_referral_review,
      v_auto_positive_accounts,
      v_auto_positive_credits;
  END IF;
END
$guard$;

WITH classified AS (
  SELECT
    p.*,
    GREATEST(
      p.generations_limit + COALESCE(p.referral_bonus_generations, 0) - p.generations_used,
      0
    ) AS remaining_generations,
    (
      p.plan <> 'free'
      OR p.is_pro
      OR p.dodo_customer_id IS NOT NULL
      OR p.stripe_customer_id IS NOT NULL
      OR p.stripe_subscription_id IS NOT NULL
      OR lower(COALESCE(p.subscription_status, '')) IN (
        'active', 'renewed', 'on_hold', 'past_due', 'trialing'
      )
    ) AS has_paid_signal,
    (
      p.generations_limit < 0
      OR p.generations_used < 0
      OR COALESCE(p.referral_bonus_generations, 0) < 0
      OR p.generations_used > p.generations_limit + COALESCE(p.referral_bonus_generations, 0)
      OR (p.plan = 'free' AND p.is_pro)
      OR (p.plan <> 'free' AND NOT p.is_pro)
    ) AS has_data_anomaly
  FROM public.user_profiles p
), cohorts AS (
  SELECT
    c.*,
    CASE
      WHEN c.has_data_anomaly THEN 'manual_data_anomaly'
      WHEN c.has_paid_signal THEN 'manual_paid_or_subscription'
      WHEN COALESCE(c.referral_bonus_generations, 0) > 0 THEN 'review_referral_source'
      ELSE 'auto_free_candidate'
    END AS classification
  FROM classified c
)
INSERT INTO public.credit_migration_snapshots (
  user_id,
  legacy_generations_limit,
  legacy_generations_used,
  legacy_referral_bonus,
  computed_remaining_credits,
  review_status,
  source_snapshot
)
SELECT
  c.id,
  c.generations_limit,
  c.generations_used,
  COALESCE(c.referral_bonus_generations, 0),
  c.remaining_generations * 10,
  'pending',
  jsonb_build_object(
    'snapshot_version', 'credits-v2-reconciliation-2026-08-23',
    'captured_at', now(),
    'source_hash', md5(concat_ws(
      '|',
      c.id::text,
      c.plan,
      c.is_pro::text,
      COALESCE(c.subscription_status, '(null)'),
      c.generations_limit::text,
      c.generations_used::text,
      COALESCE(c.referral_bonus_generations, 0)::text,
      c.updated_at::text
    )),
    'classification', c.classification,
    'legacy_plan', c.plan,
    'legacy_is_pro', c.is_pro,
    'legacy_subscription_status', c.subscription_status,
    'remaining_generations', c.remaining_generations,
    'has_dodo_customer', c.dodo_customer_id IS NOT NULL,
    'has_stripe_customer', c.stripe_customer_id IS NOT NULL,
    'has_stripe_subscription', c.stripe_subscription_id IS NOT NULL,
    'has_data_anomaly', c.has_data_anomaly,
    'has_paid_signal', c.has_paid_signal,
    'auto_grant_eligible', (
      c.classification = 'auto_free_candidate' AND c.remaining_generations > 0
    ),
    'proposed_grant_credits', CASE
      WHEN c.classification = 'auto_free_candidate' AND c.remaining_generations > 0
        THEN c.remaining_generations * 10
      ELSE 0
    END,
    'hold_reason', CASE c.classification
      WHEN 'manual_data_anomaly' THEN 'legacy_counter_or_plan_anomaly'
      WHEN 'manual_paid_or_subscription' THEN 'paid_entitlement_needs_external_verification'
      WHEN 'review_referral_source' THEN 'legacy_referral_source_fully_consumed_or_ambiguous'
      ELSE NULL
    END
  )
FROM cohorts c
ON CONFLICT (user_id) DO NOTHING;

DO $verify$
DECLARE
  v_snapshot_count integer;
  v_snapshot_credits integer;
  v_auto_positive_accounts integer;
  v_auto_positive_credits integer;
BEGIN
  SELECT
    count(*)::integer,
    COALESCE(sum(computed_remaining_credits), 0)::integer,
    count(*) FILTER (
      WHERE source_snapshot->>'auto_grant_eligible' = 'true'
    )::integer,
    COALESCE(sum((source_snapshot->>'proposed_grant_credits')::integer) FILTER (
      WHERE source_snapshot->>'auto_grant_eligible' = 'true'
    ), 0)::integer
  INTO
    v_snapshot_count,
    v_snapshot_credits,
    v_auto_positive_accounts,
    v_auto_positive_credits
  FROM public.credit_migration_snapshots;

  IF v_snapshot_count <> 11
     OR v_snapshot_credits <> 890
     OR v_auto_positive_accounts <> 3
     OR v_auto_positive_credits <> 40 THEN
    RAISE EXCEPTION
      'Snapshot verification failed: rows %, credits %, auto positive %/%',
      v_snapshot_count,
      v_snapshot_credits,
      v_auto_positive_accounts,
      v_auto_positive_credits;
  END IF;

  IF EXISTS (SELECT 1 FROM public.credit_grants)
     OR EXISTS (SELECT 1 FROM public.credit_transactions)
     OR EXISTS (SELECT 1 FROM public.billing_entitlements) THEN
    RAISE EXCEPTION 'Snapshot migration must not create credits or entitlements';
  END IF;

  IF COALESCE((
    SELECT enabled
    FROM public.credit_system_settings
    WHERE setting_key = 'wallet_v2_enforcement'
  ), true) OR COALESCE((
    SELECT enabled
    FROM public.credit_system_settings
    WHERE setting_key = 'annual_pro_checkout'
  ), true) THEN
    RAISE EXCEPTION 'Snapshot migration must leave rollout settings disabled';
  END IF;
END
$verify$;
