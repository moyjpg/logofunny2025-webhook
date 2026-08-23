-- Preserve the owner-confirmed internal test account and close the two
-- unchanged zero-credit reconciliation holds.
--
-- Approved on 2026-08-23:
--   * preserve the test account's legacy Pro access and 100-generation limit;
--   * classify it as internal testing in the migration audit record;
--   * review the zero-balance data-anomaly and consumed-referral snapshots;
--   * create no credits, entitlements, refunds, or profile changes;
--   * keep Credits v2 enforcement and Annual Pro checkout disabled.

DO $guard$
DECLARE
  v_test_accounts integer;
  v_zero_balance_targets integer;
  v_hash_mismatches integer;
  v_reviewed integer;
  v_migrated integer;
  v_pending integer;
  v_migration_grants integer;
  v_migration_credits integer;
  v_migration_transactions integer;
  v_transaction_credits integer;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('credits-v2-reconciliation-2026-08-23', 0)
  );

  IF COALESCE((
    SELECT enabled
    FROM public.credit_system_settings
    WHERE setting_key = 'wallet_v2_enforcement'
  ), true) OR COALESCE((
    SELECT enabled
    FROM public.credit_system_settings
    WHERE setting_key = 'annual_pro_checkout'
  ), true) THEN
    RAISE EXCEPTION 'Credits v2 rollout settings must remain disabled';
  END IF;

  SELECT
    count(*) FILTER (WHERE review_status = 'reviewed')::integer,
    count(*) FILTER (WHERE review_status = 'migrated')::integer,
    count(*) FILTER (WHERE review_status = 'pending')::integer
  INTO v_reviewed, v_migrated, v_pending
  FROM public.credit_migration_snapshots;

  SELECT count(*)::integer
  INTO v_test_accounts
  FROM public.credit_migration_snapshots s
  JOIN public.user_profiles p ON p.id = s.user_id
  WHERE s.review_status = 'reviewed'
    AND s.computed_remaining_credits = 850
    AND s.legacy_generations_limit = 100
    AND s.legacy_generations_used = 15
    AND s.source_snapshot->>'classification' = 'manual_paid_or_subscription'
    AND s.source_snapshot->'external_entitlement_review'->>'decision' = 'no_migration_grant'
    AND p.plan = 'pro'
    AND p.is_pro = true
    AND lower(coalesce(p.subscription_status, '')) = 'cancelled'
    AND p.generations_limit = 100
    AND p.generations_used = 15
    AND p.dodo_customer_id IS NOT NULL
    AND NOT (s.source_snapshot ? 'internal_test_review');

  WITH zero_targets AS (
    SELECT
      s.user_id,
      s.source_snapshot->>'source_hash' AS source_hash,
      md5(concat_ws(
        '|',
        p.id::text,
        p.plan,
        p.is_pro::text,
        COALESCE(p.subscription_status, '(null)'),
        p.generations_limit::text,
        p.generations_used::text,
        COALESCE(p.referral_bonus_generations, 0)::text,
        p.updated_at::text
      )) AS current_source_hash
    FROM public.credit_migration_snapshots s
    JOIN public.user_profiles p ON p.id = s.user_id
    WHERE s.review_status = 'pending'
      AND s.computed_remaining_credits = 0
      AND s.source_snapshot->>'classification' IN (
        'manual_data_anomaly',
        'review_referral_source'
      )
  )
  SELECT
    count(*)::integer,
    count(*) FILTER (WHERE source_hash IS DISTINCT FROM current_source_hash)::integer
  INTO v_zero_balance_targets, v_hash_mismatches
  FROM zero_targets;

  SELECT count(*)::integer, COALESCE(sum(credits), 0)::integer
  INTO v_migration_grants, v_migration_credits
  FROM public.credit_grants
  WHERE grant_type = 'migration' AND revoked_at IS NULL;

  SELECT count(*)::integer, COALESCE(sum(credits_delta), 0)::integer
  INTO v_migration_transactions, v_transaction_credits
  FROM public.credit_transactions
  WHERE transaction_type = 'migration';

  IF v_reviewed <> 6
     OR v_migrated <> 3
     OR v_pending <> 2
     OR v_test_accounts <> 1
     OR v_zero_balance_targets <> 2
     OR v_hash_mismatches <> 0
     OR v_migration_grants <> 3
     OR v_migration_credits <> 40
     OR v_migration_transactions <> 3
     OR v_transaction_credits <> 40
     OR EXISTS (SELECT 1 FROM public.billing_entitlements)
     OR EXISTS (SELECT 1 FROM public.credit_grants WHERE grant_type <> 'migration')
     OR EXISTS (SELECT 1 FROM public.credit_transactions WHERE transaction_type <> 'migration') THEN
    RAISE EXCEPTION
      'Internal test review preflight drift: snapshots %/%/%, test %, zero/hash %/%, grants %/%, transactions %/%',
      v_reviewed,
      v_migrated,
      v_pending,
      v_test_accounts,
      v_zero_balance_targets,
      v_hash_mismatches,
      v_migration_grants,
      v_migration_credits,
      v_migration_transactions,
      v_transaction_credits;
  END IF;
END
$guard$;

DO $review$
DECLARE
  v_test_updated integer;
  v_zero_updated integer;
BEGIN
  UPDATE public.credit_migration_snapshots s
  SET source_snapshot = s.source_snapshot || jsonb_build_object(
    'hold_reason', 'owner_confirmed_internal_test_account',
    'internal_test_review', jsonb_build_object(
      'classification', 'internal_test',
      'decision', 'preserve_legacy_pro_test_access',
      'exclude_from_subscription_metrics', true,
      'exclude_from_credits_migration', true,
      'historical_test_usage_accepted', true,
      'user_confirmed_on', '2026-08-23',
      'reviewed_on', '2026-08-23'
    )
  )
  FROM public.user_profiles p
  WHERE p.id = s.user_id
    AND s.review_status = 'reviewed'
    AND s.computed_remaining_credits = 850
    AND s.legacy_generations_limit = 100
    AND s.legacy_generations_used = 15
    AND s.source_snapshot->>'classification' = 'manual_paid_or_subscription'
    AND s.source_snapshot->'external_entitlement_review'->>'decision' = 'no_migration_grant'
    AND p.plan = 'pro'
    AND p.is_pro = true
    AND lower(coalesce(p.subscription_status, '')) = 'cancelled'
    AND p.generations_limit = 100
    AND p.generations_used = 15
    AND p.dodo_customer_id IS NOT NULL
    AND NOT (s.source_snapshot ? 'internal_test_review');

  GET DIAGNOSTICS v_test_updated = ROW_COUNT;

  UPDATE public.credit_migration_snapshots
  SET
    review_status = 'reviewed',
    reviewed_at = now(),
    source_snapshot = source_snapshot || jsonb_build_object(
      'hold_reason', CASE source_snapshot->>'classification'
        WHEN 'manual_data_anomaly' THEN 'verified_former_paid_counter_zero_balance'
        WHEN 'review_referral_source' THEN 'verified_referral_balance_fully_consumed'
      END,
      'zero_balance_review', jsonb_build_object(
        'decision', 'no_migration_grant',
        'source_unchanged', true,
        'computed_remaining_credits', 0,
        'reviewed_on', '2026-08-23'
      )
    )
  WHERE review_status = 'pending'
    AND computed_remaining_credits = 0
    AND source_snapshot->>'classification' IN (
      'manual_data_anomaly',
      'review_referral_source'
    );

  GET DIAGNOSTICS v_zero_updated = ROW_COUNT;

  IF v_test_updated <> 1 OR v_zero_updated <> 2 THEN
    RAISE EXCEPTION
      'Expected one internal test classification and two zero-balance reviews, updated %/%',
      v_test_updated,
      v_zero_updated;
  END IF;
END
$review$;

DO $verify$
DECLARE
  v_reviewed integer;
  v_migrated integer;
  v_pending integer;
  v_test_accounts integer;
  v_zero_reviews integer;
  v_migration_grants integer;
  v_migration_credits integer;
  v_migration_transactions integer;
  v_transaction_credits integer;
BEGIN
  SELECT
    count(*) FILTER (WHERE review_status = 'reviewed')::integer,
    count(*) FILTER (WHERE review_status = 'migrated')::integer,
    count(*) FILTER (WHERE review_status = 'pending')::integer
  INTO v_reviewed, v_migrated, v_pending
  FROM public.credit_migration_snapshots;

  SELECT count(*)::integer
  INTO v_test_accounts
  FROM public.credit_migration_snapshots s
  JOIN public.user_profiles p ON p.id = s.user_id
  WHERE s.review_status = 'reviewed'
    AND s.source_snapshot->'internal_test_review'->>'classification' = 'internal_test'
    AND s.source_snapshot->'internal_test_review'->>'decision' = 'preserve_legacy_pro_test_access'
    AND s.source_snapshot->'internal_test_review'->>'exclude_from_credits_migration' = 'true'
    AND p.plan = 'pro'
    AND p.is_pro = true
    AND lower(coalesce(p.subscription_status, '')) = 'cancelled'
    AND p.generations_limit = 100
    AND p.generations_used = 15;

  SELECT count(*)::integer
  INTO v_zero_reviews
  FROM public.credit_migration_snapshots
  WHERE review_status = 'reviewed'
    AND computed_remaining_credits = 0
    AND source_snapshot->'zero_balance_review'->>'decision' = 'no_migration_grant'
    AND source_snapshot->'zero_balance_review'->>'source_unchanged' = 'true';

  SELECT count(*)::integer, COALESCE(sum(credits), 0)::integer
  INTO v_migration_grants, v_migration_credits
  FROM public.credit_grants
  WHERE grant_type = 'migration' AND revoked_at IS NULL;

  SELECT count(*)::integer, COALESCE(sum(credits_delta), 0)::integer
  INTO v_migration_transactions, v_transaction_credits
  FROM public.credit_transactions
  WHERE transaction_type = 'migration';

  IF v_reviewed <> 8
     OR v_migrated <> 3
     OR v_pending <> 0
     OR v_test_accounts <> 1
     OR v_zero_reviews <> 2
     OR v_migration_grants <> 3
     OR v_migration_credits <> 40
     OR v_migration_transactions <> 3
     OR v_transaction_credits <> 40
     OR EXISTS (SELECT 1 FROM public.billing_entitlements)
     OR COALESCE((
       SELECT enabled
       FROM public.credit_system_settings
       WHERE setting_key = 'wallet_v2_enforcement'
     ), true)
     OR COALESCE((
       SELECT enabled
       FROM public.credit_system_settings
       WHERE setting_key = 'annual_pro_checkout'
     ), true) THEN
    RAISE EXCEPTION
      'Internal test review verification failed: snapshots %/%/%, test %, zero %, grants %/%, transactions %/%',
      v_reviewed,
      v_migrated,
      v_pending,
      v_test_accounts,
      v_zero_reviews,
      v_migration_grants,
      v_migration_credits,
      v_migration_transactions,
      v_transaction_credits;
  END IF;
END
$verify$;
