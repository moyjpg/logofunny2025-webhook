-- P0.5: separate internal testing from paid subscription state, centralize
-- legacy access checks, and provide an atomic Dodo subscription sync path.
-- Credits v2 enforcement and Annual Pro checkout remain disabled.

CREATE TABLE IF NOT EXISTS public.account_access_overrides (
  user_id      uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  access_kind  text NOT NULL CHECK (access_kind IN ('internal_test')),
  enabled      boolean NOT NULL DEFAULT true,
  expires_at   timestamptz,
  reason       text NOT NULL,
  metadata     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.account_access_overrides ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.account_access_overrides FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.account_access_overrides TO service_role;

DO $guard$
DECLARE
  v_test_targets integer;
  v_migration_grants integer;
  v_migration_credits integer;
  v_migration_transactions integer;
  v_transaction_credits integer;
BEGIN
  IF COALESCE((
    SELECT enabled
    FROM public.credit_system_settings
    WHERE setting_key = 'wallet_v2_enforcement'
  ), true) OR COALESCE((
    SELECT enabled
    FROM public.credit_system_settings
    WHERE setting_key = 'annual_pro_checkout'
  ), true) THEN
    RAISE EXCEPTION 'P0.5 requires Credits v2 rollout settings to remain disabled';
  END IF;

  SELECT count(*)::integer
  INTO v_test_targets
  FROM public.credit_migration_snapshots s
  JOIN public.user_profiles p ON p.id = s.user_id
  WHERE s.source_snapshot->'internal_test_review'->>'classification' = 'internal_test'
    AND s.source_snapshot->'internal_test_review'->>'decision' = 'preserve_legacy_pro_test_access'
    AND p.plan = 'pro'
    AND p.is_pro = true
    AND lower(coalesce(p.subscription_status, '')) = 'cancelled'
    AND p.generations_limit = 100
    AND p.generations_used = 15;

  SELECT count(*)::integer, COALESCE(sum(credits), 0)::integer
  INTO v_migration_grants, v_migration_credits
  FROM public.credit_grants
  WHERE grant_type = 'migration' AND revoked_at IS NULL;

  SELECT count(*)::integer, COALESCE(sum(credits_delta), 0)::integer
  INTO v_migration_transactions, v_transaction_credits
  FROM public.credit_transactions
  WHERE transaction_type = 'migration';

  IF v_test_targets <> 1
     OR EXISTS (SELECT 1 FROM public.account_access_overrides)
     OR v_migration_grants <> 4
     OR v_migration_credits <> 60
     OR v_migration_transactions <> 4
     OR v_transaction_credits <> 60
     OR EXISTS (SELECT 1 FROM public.billing_entitlements)
     OR EXISTS (SELECT 1 FROM public.credit_grants WHERE grant_type <> 'migration')
     OR EXISTS (SELECT 1 FROM public.credit_transactions WHERE transaction_type <> 'migration') THEN
    RAISE EXCEPTION
      'P0.5 access preflight drift: test %, grants %/%, transactions %/%',
      v_test_targets,
      v_migration_grants,
      v_migration_credits,
      v_migration_transactions,
      v_transaction_credits;
  END IF;
END
$guard$;

INSERT INTO public.account_access_overrides (
  user_id,
  access_kind,
  enabled,
  expires_at,
  reason,
  metadata
)
SELECT
  s.user_id,
  'internal_test',
  true,
  NULL,
  'LogoFunny owner-confirmed internal production test account',
  jsonb_build_object(
    'source', 'credits_v2_reconciliation',
    'exclude_from_subscription_metrics', true,
    'exclude_from_customer_credit_metrics', true,
    'approved_on', '2026-08-23'
  )
FROM public.credit_migration_snapshots s
WHERE s.source_snapshot->'internal_test_review'->>'classification' = 'internal_test'
  AND s.source_snapshot->'internal_test_review'->>'decision' = 'preserve_legacy_pro_test_access';

UPDATE public.credit_migration_snapshots s
SET source_snapshot = s.source_snapshot || jsonb_build_object(
  'access_override', jsonb_build_object(
    'kind', 'internal_test',
    'enabled', true,
    'created_on', '2026-08-23',
    'server_controlled', true
  )
)
WHERE s.source_snapshot->'internal_test_review'->>'classification' = 'internal_test'
  AND s.source_snapshot->'internal_test_review'->>'decision' = 'preserve_legacy_pro_test_access';

CREATE OR REPLACE FUNCTION public.check_and_increment_generation()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_uuid          uuid := auth.uid();
  v_generations_used   integer;
  v_generations_limit  integer;
  v_referral_bonus     integer;
  v_is_pro             boolean;
  v_plan               text;
  v_subscription_status text;
  v_internal_test      boolean := false;
BEGIN
  IF v_user_uuid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: no authenticated user';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.account_access_overrides o
    WHERE o.user_id = v_user_uuid
      AND o.access_kind = 'internal_test'
      AND o.enabled = true
      AND (o.expires_at IS NULL OR o.expires_at > now())
  ) INTO v_internal_test;

  SELECT
    generations_used,
    generations_limit,
    COALESCE(referral_bonus_generations, 0),
    is_pro,
    plan,
    subscription_status
  INTO
    v_generations_used,
    v_generations_limit,
    v_referral_bonus,
    v_is_pro,
    v_plan,
    v_subscription_status
  FROM public.user_profiles
  WHERE id = v_user_uuid
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.user_profiles (id)
    VALUES (v_user_uuid)
    ON CONFLICT (id) DO NOTHING;

    UPDATE public.user_profiles
    SET generations_used = 1, updated_at = now()
    WHERE id = v_user_uuid;

    RETURN true;
  END IF;

  IF v_internal_test OR (
    (v_is_pro OR v_plan <> 'free')
    AND lower(coalesce(v_subscription_status, '')) = 'active'
  ) THEN
    UPDATE public.user_profiles
    SET generations_used = generations_used + 1, updated_at = now()
    WHERE id = v_user_uuid;

    RETURN true;
  END IF;

  IF v_generations_used >= (v_generations_limit + v_referral_bonus) THEN
    RETURN false;
  END IF;

  UPDATE public.user_profiles
  SET generations_used = generations_used + 1, updated_at = now()
  WHERE id = v_user_uuid;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.check_and_increment_generation() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_and_increment_generation() TO authenticated, service_role;

-- One atomic operation owns Dodo subscription event idempotency, profile
-- synchronization, entitlement state, and the optional 150-credit cycle grant.
CREATE OR REPLACE FUNCTION public.process_dodo_subscription_event_v1(
  p_event_id text,
  p_event_type text,
  p_event_payload jsonb,
  p_user_id uuid,
  p_subscription_id text,
  p_customer_id text,
  p_subscription_status text,
  p_period_start timestamptz DEFAULT NULL,
  p_period_end timestamptz DEFAULT NULL,
  p_cycle_key text DEFAULT NULL,
  p_cancel_at_next_billing_date boolean DEFAULT false,
  p_grant_credits integer DEFAULT 0
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_event_inserted uuid;
  v_status text := lower(btrim(coalesce(p_subscription_status, '')));
  v_entitlement_status text;
  v_active_subscription boolean;
  v_internal_test boolean := false;
  v_granted boolean;
BEGIN
  IF btrim(coalesce(p_event_id, '')) = ''
     OR btrim(coalesce(p_event_type, '')) = ''
     OR p_user_id IS NULL
     OR btrim(coalesce(p_subscription_id, '')) = ''
     OR btrim(coalesce(p_customer_id, '')) = ''
     OR v_status = '' THEN
    RAISE EXCEPTION 'INVALID_DODO_SUBSCRIPTION_EVENT';
  END IF;

  IF p_event_type NOT IN (
    'subscription.active',
    'subscription.renewed',
    'subscription.updated',
    'subscription.on_hold',
    'subscription.cancelled',
    'subscription.expired',
    'subscription.failed'
  ) THEN
    RAISE EXCEPTION 'UNSUPPORTED_DODO_SUBSCRIPTION_EVENT';
  END IF;

  IF (
    p_event_type IN ('subscription.active', 'subscription.renewed')
    AND (p_grant_credits <> 150 OR btrim(coalesce(p_cycle_key, '')) = '' OR p_period_end IS NULL)
  ) OR (
    p_event_type NOT IN ('subscription.active', 'subscription.renewed')
    AND p_grant_credits <> 0
  ) THEN
    RAISE EXCEPTION 'INVALID_DODO_SUBSCRIPTION_GRANT';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('dodo-subscription:' || p_subscription_id, 0)
  );

  INSERT INTO public.dodo_webhook_events (event_id, event_type, payload, processed_at)
  VALUES (
    p_event_id,
    p_event_type,
    coalesce(p_event_payload, '{}'::jsonb),
    NULL
  )
  ON CONFLICT (event_id) DO NOTHING
  RETURNING id INTO v_event_inserted;

  IF v_event_inserted IS NULL THEN
    RETURN false;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.account_access_overrides o
    WHERE o.user_id = p_user_id
      AND o.access_kind = 'internal_test'
      AND o.enabled = true
      AND (o.expires_at IS NULL OR o.expires_at > now())
  ) INTO v_internal_test;

  v_active_subscription := v_status = 'active';
  v_entitlement_status := CASE v_status
    WHEN 'active' THEN 'active'
    WHEN 'cancelled' THEN 'cancelled'
    WHEN 'expired' THEN 'expired'
    WHEN 'failed' THEN 'failed'
    ELSE 'on_hold'
  END;

  INSERT INTO public.user_profiles (
    id,
    plan,
    generations_used,
    generations_limit,
    is_pro,
    subscription_status,
    dodo_customer_id,
    updated_at
  ) VALUES (
    p_user_id,
    CASE WHEN v_active_subscription THEN 'pro' ELSE 'free' END,
    0,
    CASE WHEN v_active_subscription THEN 20 ELSE 2 END,
    v_active_subscription,
    v_status,
    p_customer_id,
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    plan = CASE
      WHEN v_internal_test THEN public.user_profiles.plan
      WHEN v_active_subscription THEN 'pro'
      ELSE 'free'
    END,
    is_pro = CASE
      WHEN v_internal_test THEN public.user_profiles.is_pro
      ELSE v_active_subscription
    END,
    generations_limit = CASE
      WHEN v_internal_test THEN public.user_profiles.generations_limit
      WHEN v_active_subscription THEN 20
      ELSE 2
    END,
    generations_used = CASE
      WHEN v_active_subscription
       AND p_event_type IN ('subscription.active', 'subscription.renewed')
        THEN 0
      ELSE public.user_profiles.generations_used
    END,
    subscription_status = v_status,
    dodo_customer_id = p_customer_id,
    updated_at = now();

  INSERT INTO public.billing_entitlements (
    user_id,
    entitlement_type,
    source_id,
    status,
    current_period_start,
    current_period_end,
    cycle_key,
    metadata,
    updated_at
  ) VALUES (
    p_user_id,
    'pro_monthly',
    p_subscription_id,
    v_entitlement_status,
    p_period_start,
    p_period_end,
    nullif(btrim(coalesce(p_cycle_key, '')), ''),
    jsonb_build_object(
      'provider', 'dodo',
      'last_event_type', p_event_type,
      'last_event_id', p_event_id,
      'raw_status', v_status,
      'cancel_at_next_billing_date', coalesce(p_cancel_at_next_billing_date, false),
      'internal_test', v_internal_test
    ),
    now()
  )
  ON CONFLICT (entitlement_type, source_id) DO UPDATE SET
    user_id = EXCLUDED.user_id,
    status = EXCLUDED.status,
    current_period_start = EXCLUDED.current_period_start,
    current_period_end = EXCLUDED.current_period_end,
    cycle_key = EXCLUDED.cycle_key,
    metadata = public.billing_entitlements.metadata || EXCLUDED.metadata,
    updated_at = now();

  IF p_grant_credits = 150 THEN
    SELECT g.granted
    INTO v_granted
    FROM public.record_credit_grant_v2(
      p_user_id,
      'monthly_pro',
      150,
      p_subscription_id,
      p_cycle_key,
      p_period_end,
      jsonb_build_object(
        'provider', 'dodo',
        'event_type', p_event_type,
        'event_id', p_event_id,
        'subscription_id', p_subscription_id,
        'internal_test', v_internal_test
      )
    ) g;
  END IF;

  UPDATE public.dodo_webhook_events
  SET processed_at = now()
  WHERE id = v_event_inserted;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.process_dodo_subscription_event_v1(
  text, text, jsonb, uuid, text, text, text, timestamptz, timestamptz,
  text, boolean, integer
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_dodo_subscription_event_v1(
  text, text, jsonb, uuid, text, text, text, timestamptz, timestamptz,
  text, boolean, integer
) TO service_role;

CREATE OR REPLACE FUNCTION public.charge_brand_world_scene(
  p_user_id uuid,
  p_request_id uuid,
  p_brand_name text,
  p_template text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE(charge_id uuid, remaining_credits integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_charge_id uuid;
  v_existing_charge uuid;
  v_remaining integer := 8;
  v_available integer;
  v_spent integer;
  v_total_remaining integer := 0;
  v_paid_eligible boolean := false;
  v_grant record;
BEGIN
  IF p_user_id IS NULL OR p_request_id IS NULL OR btrim(coalesce(p_brand_name, '')) = '' THEN
    RAISE EXCEPTION 'Invalid Brand World charge input';
  END IF;

  SELECT id INTO v_existing_charge
  FROM public.generation_charges
  WHERE user_id = p_user_id
    AND route = 'brand_world_image'
    AND request_id = p_request_id;

  IF v_existing_charge IS NOT NULL THEN
    SELECT coalesce(sum(g.credits - coalesce(spent.credits_used, 0)), 0)::integer
      INTO v_total_remaining
    FROM public.credit_grants g
    LEFT JOIN LATERAL (
      SELECT sum(gca.credits_used) AS credits_used
      FROM public.generation_charge_allocations gca
      JOIN public.generation_charges gc ON gc.id = gca.charge_id
      WHERE gca.grant_id = g.id AND gc.status IN ('pending', 'success')
    ) spent ON true
    WHERE g.user_id = p_user_id
      AND g.revoked_at IS NULL
      AND (g.expires_at IS NULL OR g.expires_at > now());
    RETURN QUERY SELECT v_existing_charge, greatest(v_total_remaining, 0);
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.account_access_overrides o
    WHERE o.user_id = p_user_id
      AND o.access_kind = 'internal_test'
      AND o.enabled = true
      AND (o.expires_at IS NULL OR o.expires_at > now())
  ) OR EXISTS (
    SELECT 1
    FROM public.user_profiles p
    WHERE p.id = p_user_id
      AND (p.is_pro = true OR p.plan <> 'free')
      AND lower(coalesce(p.subscription_status, '')) = 'active'
  ) OR EXISTS (
    SELECT 1
    FROM public.credit_grants g
    WHERE g.user_id = p_user_id
      AND g.grant_type IN ('monthly_pro', 'annual_pro', 'one_time_pack', 'admin_grant')
      AND g.revoked_at IS NULL
      AND (g.expires_at IS NULL OR g.expires_at > now())
  ) INTO v_paid_eligible;

  IF NOT v_paid_eligible THEN
    RAISE EXCEPTION 'BRAND_WORLD_PAID_FEATURE_REQUIRED';
  END IF;

  INSERT INTO public.generation_charges (
    user_id, route, credits_charged, status, request_id, brand_name, metadata
  ) VALUES (
    p_user_id, 'brand_world_image', 8, 'pending', p_request_id::text,
    left(p_brand_name, 120), coalesce(p_metadata, '{}'::jsonb)
  ) RETURNING id INTO v_charge_id;

  FOR v_grant IN
    SELECT g.id, g.credits, g.forfeited_credits
    FROM public.credit_grants g
    WHERE g.user_id = p_user_id
      AND g.revoked_at IS NULL
      AND (g.expires_at IS NULL OR g.expires_at > now())
    ORDER BY g.expires_at ASC NULLS LAST, g.created_at ASC
    FOR UPDATE
  LOOP
    SELECT coalesce(sum(gca.credits_used), 0)::integer INTO v_spent
    FROM public.generation_charge_allocations gca
    JOIN public.generation_charges gc ON gc.id = gca.charge_id
    WHERE gca.grant_id = v_grant.id
      AND gc.status IN ('pending', 'success');

    v_available := greatest(v_grant.credits - v_grant.forfeited_credits - v_spent, 0);
    IF v_available <= 0 THEN CONTINUE; END IF;

    INSERT INTO public.generation_charge_allocations (charge_id, grant_id, credits_used)
    VALUES (v_charge_id, v_grant.id, least(v_available, v_remaining));

    v_remaining := v_remaining - least(v_available, v_remaining);
    EXIT WHEN v_remaining = 0;
  END LOOP;

  IF v_remaining > 0 THEN
    RAISE EXCEPTION 'INSUFFICIENT_CREDITS';
  END IF;

  SELECT coalesce(sum(g.credits - g.forfeited_credits - coalesce(spent.credits_used, 0)), 0)::integer
    INTO v_total_remaining
  FROM public.credit_grants g
  LEFT JOIN LATERAL (
    SELECT sum(gca.credits_used) AS credits_used
    FROM public.generation_charge_allocations gca
    JOIN public.generation_charges gc ON gc.id = gca.charge_id
    WHERE gca.grant_id = g.id AND gc.status IN ('pending', 'success')
  ) spent ON true
  WHERE g.user_id = p_user_id
    AND g.revoked_at IS NULL
    AND (g.expires_at IS NULL OR g.expires_at > now());

  RETURN QUERY SELECT v_charge_id, greatest(v_total_remaining, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.charge_brand_world_scene(uuid, uuid, text, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.charge_brand_world_scene(uuid, uuid, text, text, jsonb)
  TO service_role;

DO $verify$
DECLARE
  v_overrides integer;
  v_test_preserved integer;
BEGIN
  SELECT count(*)::integer
  INTO v_overrides
  FROM public.account_access_overrides
  WHERE access_kind = 'internal_test'
    AND enabled = true
    AND expires_at IS NULL;

  SELECT count(*)::integer
  INTO v_test_preserved
  FROM public.account_access_overrides o
  JOIN public.user_profiles p ON p.id = o.user_id
  WHERE o.access_kind = 'internal_test'
    AND o.enabled = true
    AND p.plan = 'pro'
    AND p.is_pro = true
    AND lower(coalesce(p.subscription_status, '')) = 'cancelled'
    AND p.generations_limit = 100
    AND p.generations_used = 15;

  IF v_overrides <> 1
     OR v_test_preserved <> 1
     OR has_function_privilege('anon', 'public.check_and_increment_generation()', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.check_and_increment_generation()', 'EXECUTE')
     OR has_function_privilege(
       'authenticated',
       'public.process_dodo_subscription_event_v1(text,text,jsonb,uuid,text,text,text,timestamp with time zone,timestamp with time zone,text,boolean,integer)',
       'EXECUTE'
     )
     OR COALESCE((
       SELECT enabled FROM public.credit_system_settings
       WHERE setting_key = 'wallet_v2_enforcement'
     ), true)
     OR COALESCE((
       SELECT enabled FROM public.credit_system_settings
       WHERE setting_key = 'annual_pro_checkout'
     ), true) THEN
    RAISE EXCEPTION 'P0.5 access verification failed: overrides %, preserved %',
      v_overrides,
      v_test_preserved;
  END IF;
END
$verify$;
