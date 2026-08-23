-- Resolve the single held Dodo monthly subscription snapshot after an
-- external, read-only entitlement review.
--
-- Approved outcome on 2026-08-23:
--   * the product was LogoFunny Pro billed monthly at USD 9;
--   * the last paid period ended on 2026-07-23;
--   * monthly Pro allowance does not roll over;
--   * preserve the legacy 850-credit computation for audit only;
--   * create no grant, transaction, entitlement, or profile change;
--   * keep Credits v2 enforcement and Annual Pro checkout disabled.

DO $guard$
DECLARE
  v_target_rows integer;
  v_migration_grants integer;
  v_migration_credits integer;
  v_migration_transactions integer;
  v_transaction_credits integer;
BEGIN
  IF COALESCE((
    SELECT enabled
    FROM public.credit_system_settings
    WHERE setting_key = 'wallet_v2_enforcement'
  ), true) THEN
    RAISE EXCEPTION 'Credits v2 enforcement must remain disabled during Dodo entitlement review';
  END IF;

  IF COALESCE((
    SELECT enabled
    FROM public.credit_system_settings
    WHERE setting_key = 'annual_pro_checkout'
  ), true) THEN
    RAISE EXCEPTION 'Annual Pro checkout must remain disabled during Dodo entitlement review';
  END IF;

  SELECT count(*)::integer
  INTO v_target_rows
  FROM public.credit_migration_snapshots
  WHERE review_status = 'pending'
    AND computed_remaining_credits = 850
    AND legacy_generations_limit = 100
    AND legacy_generations_used = 15
    AND source_snapshot->>'classification' = 'manual_paid_or_subscription'
    AND source_snapshot->>'hold_reason' = 'paid_entitlement_needs_external_verification'
    AND source_snapshot->>'legacy_plan' = 'pro'
    AND source_snapshot->>'legacy_subscription_status' = 'cancelled'
    AND source_snapshot->>'has_dodo_customer' = 'true'
    AND NOT (source_snapshot ? 'external_entitlement_review');

  SELECT count(*)::integer, COALESCE(sum(credits), 0)::integer
  INTO v_migration_grants, v_migration_credits
  FROM public.credit_grants
  WHERE grant_type = 'migration'
    AND revoked_at IS NULL;

  SELECT count(*)::integer, COALESCE(sum(credits_delta), 0)::integer
  INTO v_migration_transactions, v_transaction_credits
  FROM public.credit_transactions
  WHERE transaction_type = 'migration';

  IF v_target_rows <> 1
     OR v_migration_grants <> 3
     OR v_migration_credits <> 40
     OR v_migration_transactions <> 3
     OR v_transaction_credits <> 40
     OR EXISTS (SELECT 1 FROM public.billing_entitlements)
     OR EXISTS (SELECT 1 FROM public.credit_grants WHERE grant_type <> 'migration')
     OR EXISTS (SELECT 1 FROM public.credit_transactions WHERE transaction_type <> 'migration') THEN
    RAISE EXCEPTION
      'Dodo review preflight drift: target %, grants %/%, transactions %/%',
      v_target_rows,
      v_migration_grants,
      v_migration_credits,
      v_migration_transactions,
      v_transaction_credits;
  END IF;
END
$guard$;

DO $review$
DECLARE
  v_updated integer;
BEGIN
  UPDATE public.credit_migration_snapshots
  SET
    review_status = 'reviewed',
    reviewed_at = now(),
    source_snapshot = source_snapshot || jsonb_build_object(
      'hold_reason', 'expired_monthly_allowance_verified_dodo_2026_07_23',
      'external_entitlement_review', jsonb_build_object(
        'provider', 'dodo',
        'product', 'LogoFunny Pro',
        'billing_interval', 'month',
        'successful_monthly_payments', 2,
        'last_successful_payment_date', '2026-06-23',
        'paid_through_date', '2026-07-23',
        'cancellation_date', '2026-07-23',
        'refund_or_dispute_observed', false,
        'next_billing_date_observed', false,
        'decision', 'no_migration_grant',
        'decision_rule', 'monthly_pro_allowance_does_not_roll_over',
        'reviewed_on', '2026-08-23'
      )
    )
  WHERE review_status = 'pending'
    AND computed_remaining_credits = 850
    AND legacy_generations_limit = 100
    AND legacy_generations_used = 15
    AND source_snapshot->>'classification' = 'manual_paid_or_subscription'
    AND source_snapshot->>'hold_reason' = 'paid_entitlement_needs_external_verification'
    AND source_snapshot->>'legacy_plan' = 'pro'
    AND source_snapshot->>'legacy_subscription_status' = 'cancelled'
    AND source_snapshot->>'has_dodo_customer' = 'true'
    AND NOT (source_snapshot ? 'external_entitlement_review');

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated <> 1 THEN
    RAISE EXCEPTION 'Expected to review exactly one held Dodo snapshot, updated %', v_updated;
  END IF;
END
$review$;

DO $verify$
DECLARE
  v_reviewed integer;
  v_migrated integer;
  v_pending integer;
  v_reviewed_target integer;
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
  INTO v_reviewed_target
  FROM public.credit_migration_snapshots
  WHERE review_status = 'reviewed'
    AND computed_remaining_credits = 850
    AND source_snapshot->>'classification' = 'manual_paid_or_subscription'
    AND source_snapshot->>'hold_reason' = 'expired_monthly_allowance_verified_dodo_2026_07_23'
    AND source_snapshot->'external_entitlement_review'->>'paid_through_date' = '2026-07-23'
    AND source_snapshot->'external_entitlement_review'->>'decision' = 'no_migration_grant'
    AND migrated_at IS NULL;

  SELECT count(*)::integer, COALESCE(sum(credits), 0)::integer
  INTO v_migration_grants, v_migration_credits
  FROM public.credit_grants
  WHERE grant_type = 'migration'
    AND revoked_at IS NULL;

  SELECT count(*)::integer, COALESCE(sum(credits_delta), 0)::integer
  INTO v_migration_transactions, v_transaction_credits
  FROM public.credit_transactions
  WHERE transaction_type = 'migration';

  IF v_reviewed <> 6
     OR v_migrated <> 3
     OR v_pending <> 2
     OR v_reviewed_target <> 1
     OR v_migration_grants <> 3
     OR v_migration_credits <> 40
     OR v_migration_transactions <> 3
     OR v_transaction_credits <> 40
     OR EXISTS (SELECT 1 FROM public.billing_entitlements)
     OR EXISTS (SELECT 1 FROM public.credit_grants WHERE grant_type <> 'migration')
     OR EXISTS (SELECT 1 FROM public.credit_transactions WHERE transaction_type <> 'migration')
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
      'Dodo review verification failed: snapshots %/%/%, target %, grants %/%, transactions %/%',
      v_reviewed,
      v_migrated,
      v_pending,
      v_reviewed_target,
      v_migration_grants,
      v_migration_credits,
      v_migration_transactions,
      v_transaction_credits;
  END IF;
END
$verify$;
