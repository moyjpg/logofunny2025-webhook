-- Approve the reconciled ordinary Free cohort and preserve the three positive
-- legacy balances as Credits v2 migration grants.
--
-- Scope approved on 2026-08-23:
--   * review 8 auto_free_candidate snapshots;
--   * migrate 3 positive balances totalling 40 credits;
--   * leave all paid, anomaly, referral-review, and missing-profile accounts held;
--   * keep Credits v2 enforcement and Annual Pro checkout disabled.

DO $guard$
DECLARE
  v_snapshots integer;
  v_pending integer;
  v_hash_mismatches integer;
  v_auto_free integer;
  v_auto_positive_accounts integer;
  v_auto_positive_credits integer;
  v_held_paid_accounts integer;
  v_held_paid_credits integer;
BEGIN
  IF COALESCE((
    SELECT enabled
    FROM public.credit_system_settings
    WHERE setting_key = 'wallet_v2_enforcement'
  ), true) THEN
    RAISE EXCEPTION 'Credits v2 enforcement must remain disabled during Free balance migration';
  END IF;

  IF COALESCE((
    SELECT enabled
    FROM public.credit_system_settings
    WHERE setting_key = 'annual_pro_checkout'
  ), true) THEN
    RAISE EXCEPTION 'Annual Pro checkout must remain disabled during Free balance migration';
  END IF;

  IF EXISTS (SELECT 1 FROM public.credit_grants)
     OR EXISTS (SELECT 1 FROM public.credit_transactions)
     OR EXISTS (SELECT 1 FROM public.billing_entitlements) THEN
    RAISE EXCEPTION 'Financial tables changed after snapshot approval; stop and review';
  END IF;

  WITH snapshot_check AS (
    SELECT
      s.*,
      p.id IS NOT NULL AS has_profile,
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
    LEFT JOIN public.user_profiles p ON p.id = s.user_id
  )
  SELECT
    count(*)::integer,
    count(*) FILTER (WHERE review_status = 'pending')::integer,
    count(*) FILTER (
      WHERE NOT has_profile
         OR source_snapshot->>'source_hash' IS DISTINCT FROM current_source_hash
    )::integer,
    count(*) FILTER (
      WHERE source_snapshot->>'classification' = 'auto_free_candidate'
    )::integer,
    count(*) FILTER (
      WHERE source_snapshot->>'auto_grant_eligible' = 'true'
    )::integer,
    COALESCE(sum((source_snapshot->>'proposed_grant_credits')::integer) FILTER (
      WHERE source_snapshot->>'auto_grant_eligible' = 'true'
    ), 0)::integer,
    count(*) FILTER (
      WHERE source_snapshot->>'classification' = 'manual_paid_or_subscription'
    )::integer,
    COALESCE(sum(computed_remaining_credits) FILTER (
      WHERE source_snapshot->>'classification' = 'manual_paid_or_subscription'
    ), 0)::integer
  INTO
    v_snapshots,
    v_pending,
    v_hash_mismatches,
    v_auto_free,
    v_auto_positive_accounts,
    v_auto_positive_credits,
    v_held_paid_accounts,
    v_held_paid_credits
  FROM snapshot_check;

  IF v_snapshots <> 11
     OR v_pending <> 11
     OR v_hash_mismatches <> 0
     OR v_auto_free <> 8
     OR v_auto_positive_accounts <> 3
     OR v_auto_positive_credits <> 40
     OR v_held_paid_accounts <> 1
     OR v_held_paid_credits <> 850 THEN
    RAISE EXCEPTION
      'Free migration preflight drift: snapshots/pending/hash %, %, %; auto %/%/%; held %/%',
      v_snapshots,
      v_pending,
      v_hash_mismatches,
      v_auto_free,
      v_auto_positive_accounts,
      v_auto_positive_credits,
      v_held_paid_accounts,
      v_held_paid_credits;
  END IF;
END
$guard$;

DO $migrate$
DECLARE
  v_snapshot record;
  v_granted boolean;
BEGIN
  UPDATE public.credit_migration_snapshots
  SET
    review_status = 'reviewed',
    reviewed_at = now()
  WHERE review_status = 'pending'
    AND source_snapshot->>'classification' = 'auto_free_candidate'
    AND computed_remaining_credits = 0;

  FOR v_snapshot IN
    SELECT
      s.user_id,
      s.computed_remaining_credits,
      s.source_snapshot->>'source_hash' AS source_hash,
      s.source_snapshot->>'snapshot_version' AS snapshot_version
    FROM public.credit_migration_snapshots s
    WHERE s.review_status = 'pending'
      AND s.source_snapshot->>'classification' = 'auto_free_candidate'
      AND s.source_snapshot->>'auto_grant_eligible' = 'true'
      AND s.computed_remaining_credits > 0
    ORDER BY s.user_id
    FOR UPDATE
  LOOP
    SELECT g.granted
      INTO v_granted
    FROM public.record_credit_grant_v2(
      v_snapshot.user_id,
      'migration',
      v_snapshot.computed_remaining_credits,
      'migration-snapshot:' || v_snapshot.source_hash,
      'legacy-balance-v1:' || v_snapshot.source_hash,
      NULL,
      jsonb_build_object(
        'snapshot_version', v_snapshot.snapshot_version,
        'source_hash', v_snapshot.source_hash,
        'source', 'legacy_generation_counter',
        'credits_per_legacy_generation', 10
      )
    ) g;

    IF v_granted IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'Expected a new idempotent migration grant';
    END IF;

    UPDATE public.credit_migration_snapshots
    SET
      review_status = 'migrated',
      reviewed_at = now(),
      migrated_at = now()
    WHERE user_id = v_snapshot.user_id
      AND review_status = 'pending';

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Failed to mark the granted snapshot as migrated';
    END IF;
  END LOOP;
END
$migrate$;

DO $verify$
DECLARE
  v_reviewed integer;
  v_migrated integer;
  v_pending integer;
  v_migration_grants integer;
  v_granted_credits integer;
  v_migration_transactions integer;
  v_transaction_credits integer;
  v_migrated_balance integer;
  v_held_paid_pending integer;
  v_held_paid_credits integer;
BEGIN
  SELECT
    count(*) FILTER (WHERE review_status = 'reviewed')::integer,
    count(*) FILTER (WHERE review_status = 'migrated')::integer,
    count(*) FILTER (WHERE review_status = 'pending')::integer
  INTO v_reviewed, v_migrated, v_pending
  FROM public.credit_migration_snapshots;

  SELECT count(*)::integer, COALESCE(sum(credits), 0)::integer
  INTO v_migration_grants, v_granted_credits
  FROM public.credit_grants
  WHERE grant_type = 'migration'
    AND revoked_at IS NULL;

  SELECT count(*)::integer, COALESCE(sum(credits_delta), 0)::integer
  INTO v_migration_transactions, v_transaction_credits
  FROM public.credit_transactions
  WHERE transaction_type = 'migration';

  SELECT COALESCE(sum(public.credit_available_balance_v2(s.user_id, now())), 0)::integer
  INTO v_migrated_balance
  FROM public.credit_migration_snapshots s
  WHERE s.review_status = 'migrated';

  SELECT count(*)::integer, COALESCE(sum(computed_remaining_credits), 0)::integer
  INTO v_held_paid_pending, v_held_paid_credits
  FROM public.credit_migration_snapshots
  WHERE review_status = 'pending'
    AND source_snapshot->>'classification' = 'manual_paid_or_subscription';

  IF v_reviewed <> 5
     OR v_migrated <> 3
     OR v_pending <> 3
     OR v_migration_grants <> 3
     OR v_granted_credits <> 40
     OR v_migration_transactions <> 3
     OR v_transaction_credits <> 40
     OR v_migrated_balance <> 40
     OR v_held_paid_pending <> 1
     OR v_held_paid_credits <> 850 THEN
    RAISE EXCEPTION
      'Free migration verification failed: snapshot %/%/%, grants %/%, transactions %/%, balance %, held %/%',
      v_reviewed,
      v_migrated,
      v_pending,
      v_migration_grants,
      v_granted_credits,
      v_migration_transactions,
      v_transaction_credits,
      v_migrated_balance,
      v_held_paid_pending,
      v_held_paid_credits;
  END IF;

  IF EXISTS (SELECT 1 FROM public.billing_entitlements)
     OR EXISTS (SELECT 1 FROM public.credit_grants WHERE grant_type <> 'migration')
     OR EXISTS (SELECT 1 FROM public.credit_transactions WHERE transaction_type <> 'migration') THEN
    RAISE EXCEPTION 'Free migration created an out-of-scope financial record';
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
    RAISE EXCEPTION 'Free migration must leave rollout settings disabled';
  END IF;
END
$verify$;
