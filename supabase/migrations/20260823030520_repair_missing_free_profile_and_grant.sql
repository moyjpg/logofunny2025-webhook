-- Repair the one confirmed Auth account without a profile and preserve the
-- 20-credit Free allowance that the legacy application currently promises.
--
-- Approved on 2026-08-23:
--   * require an email-confirmed account with no profile and no usage history;
--   * create the profile using current Free defaults;
--   * create an auditable reconciliation snapshot;
--   * create one idempotent 20-credit migration grant;
--   * keep Credits v2 enforcement and Annual Pro checkout disabled.

DO $repair$
DECLARE
  v_user_id uuid;
  v_missing_accounts integer;
  v_source_hash text;
  v_granted boolean;
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

  SELECT count(*)::integer, min(u.id::text)::uuid
  INTO v_missing_accounts, v_user_id
  FROM auth.users u
  LEFT JOIN public.user_profiles p ON p.id = u.id
  WHERE p.id IS NULL
    AND u.email_confirmed_at IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.generation_charges gc WHERE gc.user_id = u.id
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.user_creations uc WHERE uc.user_id = u.id
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.user_inspirations ui WHERE ui.user_id = u.id
    );

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
     OR v_missing_accounts <> 1
     OR v_user_id IS NULL
     OR v_migration_grants <> 3
     OR v_migration_credits <> 40
     OR v_migration_transactions <> 3
     OR v_transaction_credits <> 40
     OR EXISTS (SELECT 1 FROM public.billing_entitlements)
     OR EXISTS (SELECT 1 FROM public.credit_grants WHERE grant_type <> 'migration')
     OR EXISTS (SELECT 1 FROM public.credit_transactions WHERE transaction_type <> 'migration') THEN
    RAISE EXCEPTION
      'Missing profile preflight drift: snapshots %/%/%, missing %, grants %/%, transactions %/%',
      v_reviewed,
      v_migrated,
      v_pending,
      v_missing_accounts,
      v_migration_grants,
      v_migration_credits,
      v_migration_transactions,
      v_transaction_credits;
  END IF;

  INSERT INTO public.user_profiles (id)
  VALUES (v_user_id);

  SELECT md5(concat_ws(
    '|',
    p.id::text,
    p.plan,
    p.is_pro::text,
    COALESCE(p.subscription_status, '(null)'),
    p.generations_limit::text,
    p.generations_used::text,
    COALESCE(p.referral_bonus_generations, 0)::text,
    p.updated_at::text
  ))
  INTO v_source_hash
  FROM public.user_profiles p
  WHERE p.id = v_user_id
    AND p.plan = 'free'
    AND p.is_pro = false
    AND p.generations_limit = 2
    AND p.generations_used = 0
    AND COALESCE(p.referral_bonus_generations, 0) = 0
    AND p.subscription_status IS NULL;

  IF v_source_hash IS NULL THEN
    RAISE EXCEPTION 'Repaired profile did not receive the expected Free defaults';
  END IF;

  INSERT INTO public.credit_migration_snapshots (
    user_id,
    legacy_generations_limit,
    legacy_generations_used,
    legacy_referral_bonus,
    computed_remaining_credits,
    review_status,
    source_snapshot,
    reviewed_at
  ) VALUES (
    v_user_id,
    2,
    0,
    0,
    20,
    'pending',
    jsonb_build_object(
      'snapshot_version', 'credits-v2-reconciliation-2026-08-23-profile-repair',
      'captured_at', now(),
      'source_hash', v_source_hash,
      'classification', 'repaired_missing_free_profile',
      'legacy_plan', 'free',
      'legacy_is_pro', false,
      'legacy_subscription_status', NULL,
      'remaining_generations', 2,
      'has_dodo_customer', false,
      'has_stripe_customer', false,
      'has_stripe_subscription', false,
      'has_data_anomaly', false,
      'has_paid_signal', false,
      'auto_grant_eligible', true,
      'proposed_grant_credits', 20,
      'repair_reason', 'confirmed_auth_account_missing_profile',
      'usage_history_verified_empty', true,
      'approved_on', '2026-08-23'
    ),
    now()
  );

  SELECT g.granted
  INTO v_granted
  FROM public.record_credit_grant_v2(
    v_user_id,
    'migration',
    20,
    'migration-profile-repair:' || v_source_hash,
    'legacy-balance-v1:' || v_source_hash,
    NULL,
    jsonb_build_object(
      'snapshot_version', 'credits-v2-reconciliation-2026-08-23-profile-repair',
      'source_hash', v_source_hash,
      'source', 'legacy_free_profile_fallback',
      'credits_per_legacy_generation', 10,
      'repair_reason', 'confirmed_auth_account_missing_profile'
    )
  ) g;

  IF v_granted IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Expected a new idempotent 20-credit migration grant';
  END IF;

  UPDATE public.credit_migration_snapshots
  SET
    review_status = 'migrated',
    migrated_at = now()
  WHERE user_id = v_user_id
    AND review_status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Failed to mark the repaired profile snapshot as migrated';
  END IF;
END
$repair$;

DO $verify$
DECLARE
  v_reviewed integer;
  v_migrated integer;
  v_pending integer;
  v_repaired_profiles integer;
  v_missing_profiles integer;
  v_migration_grants integer;
  v_migration_credits integer;
  v_migration_transactions integer;
  v_transaction_credits integer;
  v_repaired_balance integer;
BEGIN
  SELECT
    count(*) FILTER (WHERE review_status = 'reviewed')::integer,
    count(*) FILTER (WHERE review_status = 'migrated')::integer,
    count(*) FILTER (WHERE review_status = 'pending')::integer
  INTO v_reviewed, v_migrated, v_pending
  FROM public.credit_migration_snapshots;

  SELECT count(*)::integer
  INTO v_repaired_profiles
  FROM public.credit_migration_snapshots s
  JOIN public.user_profiles p ON p.id = s.user_id
  WHERE s.review_status = 'migrated'
    AND s.computed_remaining_credits = 20
    AND s.source_snapshot->>'classification' = 'repaired_missing_free_profile'
    AND s.source_snapshot->>'usage_history_verified_empty' = 'true'
    AND p.plan = 'free'
    AND p.is_pro = false
    AND p.generations_limit = 2
    AND p.generations_used = 0
    AND COALESCE(p.referral_bonus_generations, 0) = 0;

  SELECT count(*)::integer
  INTO v_missing_profiles
  FROM auth.users u
  LEFT JOIN public.user_profiles p ON p.id = u.id
  WHERE p.id IS NULL;

  SELECT count(*)::integer, COALESCE(sum(credits), 0)::integer
  INTO v_migration_grants, v_migration_credits
  FROM public.credit_grants
  WHERE grant_type = 'migration' AND revoked_at IS NULL;

  SELECT count(*)::integer, COALESCE(sum(credits_delta), 0)::integer
  INTO v_migration_transactions, v_transaction_credits
  FROM public.credit_transactions
  WHERE transaction_type = 'migration';

  SELECT COALESCE(sum(public.credit_available_balance_v2(s.user_id, now())), 0)::integer
  INTO v_repaired_balance
  FROM public.credit_migration_snapshots s
  WHERE s.source_snapshot->>'classification' = 'repaired_missing_free_profile';

  IF v_reviewed <> 8
     OR v_migrated <> 4
     OR v_pending <> 0
     OR v_repaired_profiles <> 1
     OR v_missing_profiles <> 0
     OR v_migration_grants <> 4
     OR v_migration_credits <> 60
     OR v_migration_transactions <> 4
     OR v_transaction_credits <> 60
     OR v_repaired_balance <> 20
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
      'Missing profile verification failed: snapshots %/%/%, repaired %, missing %, grants %/%, transactions %/%, balance %',
      v_reviewed,
      v_migrated,
      v_pending,
      v_repaired_profiles,
      v_missing_profiles,
      v_migration_grants,
      v_migration_credits,
      v_migration_transactions,
      v_transaction_credits,
      v_repaired_balance;
  END IF;
END
$verify$;
