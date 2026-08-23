-- LogoFunny Credits Ledger v2 foundation.
--
-- IMPORTANT: this migration deliberately leaves wallet_v2_enforcement=false.
-- It creates the catalog and server-only atomic RPCs, but does not migrate any
-- user balance and does not switch the existing Logo generation route.

-- ---------------------------------------------------------------------------
-- 1. Central action catalog and rollout settings
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.credit_action_catalog (
  action_key            text PRIMARY KEY,
  user_label            text NOT NULL,
  credits_cost          integer NOT NULL CHECK (credits_cost >= 0),
  required_entitlement  text NOT NULL CHECK (required_entitlement IN ('core', 'paid_feature')),
  output_count          integer NOT NULL DEFAULT 1 CHECK (output_count > 0),
  output_type           text NOT NULL,
  included_policy       text NOT NULL DEFAULT 'none'
                        CHECK (included_policy IN ('none', 'account_lifetime_or_active_billing_cycle')),
  refund_on_failure     boolean NOT NULL DEFAULT true,
  confirmation_mode     text NOT NULL DEFAULT 'inline'
                        CHECK (confirmation_mode IN ('inline', 'dialog', 'none')),
  enabled               boolean NOT NULL DEFAULT true,
  rule_version          text NOT NULL,
  effective_at          timestamptz NOT NULL,
  metadata              jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at            timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.credit_action_catalog (
  action_key, user_label, credits_cost, required_entitlement, output_count,
  output_type, included_policy, refund_on_failure, confirmation_mode,
  enabled, rule_version, effective_at, metadata
) VALUES
  ('brand_advisor_conversation', 'Brand conversation', 0, 'core', 1,
   'advisor_message', 'none', false, 'none', true, 'credits-rules-v2', '2026-08-22T00:00:00Z', '{}'::jsonb),
  ('creative_directions', 'Creative Directions', 0, 'core', 4,
   'creative_direction', 'none', false, 'none', true, 'credits-rules-v2', '2026-08-22T00:00:00Z', '{}'::jsonb),
  ('visual_analysis', 'Visual Analysis', 0, 'core', 1,
   'visual_analysis', 'none', false, 'none', true, 'credits-rules-v2', '2026-08-22T00:00:00Z', '{}'::jsonb),
  ('onboarding_public_research', 'Public brand research', 2, 'core', 1,
   'research_report', 'account_lifetime_or_active_billing_cycle', true, 'inline', true,
   'credits-rules-v2', '2026-08-22T00:00:00Z',
   '{"included_copy":"First account research is included; active Pro receives one included research per billing cycle."}'::jsonb),
  ('logo_concepts_standard', 'Generate 4 Logo Concepts', 10, 'core', 4,
   'logo_concept', 'none', true, 'inline', true, 'credits-rules-v2', '2026-08-22T00:00:00Z', '{}'::jsonb),
  ('logo_concepts_image_guided', 'Generate 4 image-guided Logo Concepts', 10, 'core', 4,
   'logo_concept', 'none', true, 'inline', true, 'credits-rules-v2', '2026-08-22T00:00:00Z', '{}'::jsonb),
  ('brand_world_scene', 'Create 1 Brand World Scene', 8, 'paid_feature', 1,
   'brand_world_scene', 'none', true, 'inline', true, 'credits-rules-v2', '2026-08-22T00:00:00Z', '{}'::jsonb)
ON CONFLICT (action_key) DO UPDATE SET
  user_label = EXCLUDED.user_label,
  credits_cost = EXCLUDED.credits_cost,
  required_entitlement = EXCLUDED.required_entitlement,
  output_count = EXCLUDED.output_count,
  output_type = EXCLUDED.output_type,
  included_policy = EXCLUDED.included_policy,
  refund_on_failure = EXCLUDED.refund_on_failure,
  confirmation_mode = EXCLUDED.confirmation_mode,
  rule_version = EXCLUDED.rule_version,
  effective_at = EXCLUDED.effective_at,
  metadata = EXCLUDED.metadata,
  updated_at = now();

CREATE TABLE IF NOT EXISTS public.credit_system_settings (
  setting_key text PRIMARY KEY,
  enabled     boolean NOT NULL DEFAULT false,
  metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.credit_system_settings (setting_key, enabled, metadata)
VALUES
  ('wallet_v2_enforcement', false, '{"reason":"Requires balance reconciliation and explicit production approval"}'::jsonb),
  ('annual_pro_checkout', false, '{"reason":"Public price and launch date are not confirmed"}'::jsonb)
ON CONFLICT (setting_key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Brand projects, billing entitlements, and migration audit
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.brand_projects (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  brand_name  text NOT NULL,
  status      text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS brand_projects_user_created_idx
  ON public.brand_projects (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.billing_entitlements (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entitlement_type     text NOT NULL
                       CHECK (entitlement_type IN ('credit_pack', 'pro_monthly', 'pro_annual')),
  source_id            text NOT NULL,
  status               text NOT NULL
                       CHECK (status IN ('active', 'cancelled', 'on_hold', 'expired', 'failed', 'refunded', 'disputed')),
  current_period_start timestamptz,
  current_period_end   timestamptz,
  cycle_key            text,
  metadata             jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entitlement_type, source_id)
);

CREATE INDEX IF NOT EXISTS billing_entitlements_user_status_idx
  ON public.billing_entitlements (user_id, status, current_period_end DESC);

CREATE TABLE IF NOT EXISTS public.credit_migration_snapshots (
  user_id                       uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  legacy_generations_limit      integer NOT NULL,
  legacy_generations_used       integer NOT NULL,
  legacy_referral_bonus         integer NOT NULL DEFAULT 0,
  computed_remaining_credits    integer NOT NULL CHECK (computed_remaining_credits >= 0),
  review_status                 text NOT NULL DEFAULT 'pending'
                                CHECK (review_status IN ('pending', 'reviewed', 'migrated', 'excluded')),
  source_snapshot               jsonb NOT NULL DEFAULT '{}'::jsonb,
  reviewed_at                   timestamptz,
  migrated_at                   timestamptz,
  created_at                    timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 3. Extend the existing grant/charge ledger without changing live authority
-- ---------------------------------------------------------------------------
ALTER TABLE public.credit_grants
  ADD COLUMN IF NOT EXISTS cycle_key text,
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz,
  ADD COLUMN IF NOT EXISTS revocation_reason text,
  ADD COLUMN IF NOT EXISTS forfeited_credits integer NOT NULL DEFAULT 0;

ALTER TABLE public.credit_grants
  DROP CONSTRAINT IF EXISTS credit_grants_grant_type_check;

ALTER TABLE public.credit_grants
  ADD CONSTRAINT credit_grants_grant_type_check
  CHECK (grant_type IN (
    'free_signup', 'monthly_pro', 'annual_pro', 'one_time_pack',
    'referral_bonus', 'failed_generation_refund', 'migration', 'admin_grant'
  ));

ALTER TABLE public.credit_grants
  DROP CONSTRAINT IF EXISTS credit_grants_forfeited_credits_check;

ALTER TABLE public.credit_grants
  ADD CONSTRAINT credit_grants_forfeited_credits_check
  CHECK (forfeited_credits >= 0 AND forfeited_credits <= credits);

CREATE UNIQUE INDEX IF NOT EXISTS credit_grants_user_type_cycle_unique
  ON public.credit_grants (user_id, grant_type, cycle_key)
  WHERE cycle_key IS NOT NULL;

ALTER TABLE public.generation_charges
  DROP CONSTRAINT IF EXISTS generation_charges_credits_charged_check;

ALTER TABLE public.generation_charges
  ADD CONSTRAINT generation_charges_credits_charged_check
  CHECK (credits_charged >= 0);

ALTER TABLE public.generation_charges
  ADD COLUMN IF NOT EXISTS action_key text REFERENCES public.credit_action_catalog(action_key),
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.brand_projects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS catalog_rule_version text,
  ADD COLUMN IF NOT EXISTS quoted_cost integer,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS refunded_at timestamptz,
  ADD COLUMN IF NOT EXISTS failure_reason text;

CREATE UNIQUE INDEX IF NOT EXISTS generation_charges_v2_request_unique
  ON public.generation_charges (user_id, action_key, request_id)
  WHERE action_key IS NOT NULL AND request_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.credit_included_benefits (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_key  text NOT NULL REFERENCES public.credit_action_catalog(action_key),
  scope_key   text NOT NULL,
  charge_id   uuid NOT NULL UNIQUE REFERENCES public.generation_charges(id) ON DELETE CASCADE,
  project_id  uuid REFERENCES public.brand_projects(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, action_key, scope_key)
);

CREATE TABLE IF NOT EXISTS public.credit_transactions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  transaction_type text NOT NULL
                   CHECK (transaction_type IN ('grant', 'charge', 'refund', 'expired_at_cap', 'revoked', 'migration')),
  credits_delta    integer NOT NULL CHECK (credits_delta <> 0),
  grant_id         uuid REFERENCES public.credit_grants(id) ON DELETE RESTRICT,
  charge_id        uuid REFERENCES public.generation_charges(id) ON DELETE RESTRICT,
  action_key       text REFERENCES public.credit_action_catalog(action_key),
  cycle_key        text,
  idempotency_key  text,
  description      text NOT NULL,
  metadata         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS credit_transactions_user_idempotency_unique
  ON public.credit_transactions (user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS credit_transactions_user_created_idx
  ON public.credit_transactions (user_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 4. Server-only helper functions
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.credit_available_balance_v2(
  p_user_id uuid,
  p_at timestamptz DEFAULT now()
)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT greatest(coalesce(sum(
    greatest(g.credits - g.forfeited_credits - coalesce(spent.credits_used, 0), 0)
  ), 0), 0)::integer
  FROM public.credit_grants g
  LEFT JOIN LATERAL (
    SELECT coalesce(sum(a.credits_used), 0)::integer AS credits_used
    FROM public.generation_charge_allocations a
    JOIN public.generation_charges c ON c.id = a.charge_id
    WHERE a.grant_id = g.id
      AND c.status IN ('pending', 'success')
  ) spent ON true
  WHERE g.user_id = p_user_id
    AND g.revoked_at IS NULL
    AND (g.expires_at IS NULL OR g.expires_at > p_at);
$$;

CREATE OR REPLACE FUNCTION public.credit_active_entitlement_v2(
  p_user_id uuid,
  p_at timestamptz DEFAULT now()
)
RETURNS TABLE(entitlement_type text, cycle_key text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT e.entitlement_type, e.cycle_key
  FROM public.billing_entitlements e
  WHERE e.user_id = p_user_id
    AND (
      (e.entitlement_type = 'credit_pack' AND e.status = 'active')
      OR
      (e.entitlement_type IN ('pro_monthly', 'pro_annual')
       AND e.status IN ('active', 'cancelled')
       AND e.current_period_end > p_at)
    )
  ORDER BY
    CASE e.entitlement_type WHEN 'pro_annual' THEN 1 WHEN 'pro_monthly' THEN 2 ELSE 3 END,
    e.current_period_end DESC NULLS LAST
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.quote_credit_action_v2(
  p_user_id uuid,
  p_action_key text,
  p_project_id uuid DEFAULT NULL,
  p_at timestamptz DEFAULT now()
)
RETURNS TABLE(
  action_key text,
  user_label text,
  output_count integer,
  output_type text,
  required_entitlement text,
  catalog_cost integer,
  effective_cost integer,
  included boolean,
  included_scope_key text,
  eligible boolean,
  current_balance integer,
  balance_after integer,
  refund_on_failure boolean,
  confirmation_mode text,
  rule_version text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_action public.credit_action_catalog%ROWTYPE;
  v_entitlement_type text;
  v_cycle_key text;
  v_scope_key text;
  v_included boolean := false;
  v_eligible boolean := true;
  v_balance integer;
  v_effective_cost integer;
BEGIN
  IF p_user_id IS NULL OR btrim(coalesce(p_action_key, '')) = '' THEN
    RAISE EXCEPTION 'INVALID_CREDIT_QUOTE_INPUT';
  END IF;

  SELECT * INTO v_action
  FROM public.credit_action_catalog c
  WHERE c.action_key = p_action_key AND c.enabled = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CREDIT_ACTION_UNAVAILABLE';
  END IF;

  IF p_project_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.brand_projects p
    WHERE p.id = p_project_id AND p.user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'BRAND_PROJECT_NOT_FOUND';
  END IF;

  SELECT e.entitlement_type, e.cycle_key
    INTO v_entitlement_type, v_cycle_key
  FROM public.credit_active_entitlement_v2(p_user_id, p_at) e;

  IF v_action.required_entitlement = 'paid_feature' AND v_entitlement_type IS NULL THEN
    v_eligible := false;
  END IF;

  IF v_action.included_policy = 'account_lifetime_or_active_billing_cycle' THEN
    IF v_entitlement_type IN ('pro_monthly', 'pro_annual') AND v_cycle_key IS NOT NULL THEN
      v_scope_key := 'billing:' || v_cycle_key;
    ELSE
      v_scope_key := 'account_lifetime';
    END IF;

    v_included := NOT EXISTS (
      SELECT 1 FROM public.credit_included_benefits b
      WHERE b.user_id = p_user_id
        AND b.action_key = p_action_key
        AND b.scope_key = v_scope_key
    );
  END IF;

  v_balance := public.credit_available_balance_v2(p_user_id, p_at);
  v_effective_cost := CASE WHEN v_included THEN 0 ELSE v_action.credits_cost END;

  RETURN QUERY SELECT
    v_action.action_key,
    v_action.user_label,
    v_action.output_count,
    v_action.output_type,
    v_action.required_entitlement,
    v_action.credits_cost,
    v_effective_cost,
    v_included,
    v_scope_key,
    v_eligible,
    v_balance,
    greatest(v_balance - v_effective_cost, 0),
    v_action.refund_on_failure,
    v_action.confirmation_mode,
    v_action.rule_version;
END;
$$;

CREATE OR REPLACE FUNCTION public.reserve_credit_action_v2(
  p_user_id uuid,
  p_request_id uuid,
  p_action_key text,
  p_expected_rule_version text,
  p_project_id uuid DEFAULT NULL,
  p_brand_name text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE(
  charge_id uuid,
  charge_status text,
  credits_reserved integer,
  included boolean,
  remaining_credits integer,
  rule_version text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_existing public.generation_charges%ROWTYPE;
  v_quote record;
  v_charge_id uuid;
  v_remaining integer;
  v_available integer;
  v_spent integer;
  v_grant record;
BEGIN
  IF p_user_id IS NULL OR p_request_id IS NULL OR btrim(coalesce(p_action_key, '')) = '' THEN
    RAISE EXCEPTION 'INVALID_CREDIT_RESERVATION_INPUT';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.credit_system_settings s
    WHERE s.setting_key = 'wallet_v2_enforcement' AND s.enabled = true
  ) THEN
    RAISE EXCEPTION 'CREDIT_LEDGER_V2_NOT_ENABLED';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('credits-v2:' || p_user_id::text, 0)
  );

  SELECT * INTO v_existing
  FROM public.generation_charges c
  WHERE c.user_id = p_user_id
    AND c.action_key = p_action_key
    AND c.request_id = p_request_id::text;

  IF FOUND THEN
    RETURN QUERY SELECT
      v_existing.id,
      v_existing.status,
      v_existing.credits_charged,
      v_existing.credits_charged = 0,
      public.credit_available_balance_v2(p_user_id, now()),
      v_existing.catalog_rule_version;
    RETURN;
  END IF;

  SELECT * INTO v_quote
  FROM public.quote_credit_action_v2(p_user_id, p_action_key, p_project_id, now());

  IF v_quote.rule_version <> p_expected_rule_version THEN
    RAISE EXCEPTION 'CREDIT_PRICE_CHANGED';
  END IF;
  IF NOT v_quote.eligible THEN
    RAISE EXCEPTION 'PAID_FEATURE_REQUIRED';
  END IF;
  IF v_quote.current_balance < v_quote.effective_cost THEN
    RAISE EXCEPTION 'INSUFFICIENT_CREDITS';
  END IF;

  INSERT INTO public.generation_charges (
    user_id, route, credits_charged, status, request_id, brand_name, metadata,
    action_key, project_id, catalog_rule_version, quoted_cost
  ) VALUES (
    p_user_id, p_action_key, v_quote.effective_cost, 'pending', p_request_id::text,
    nullif(left(btrim(coalesce(p_brand_name, '')), 120), ''),
    coalesce(p_metadata, '{}'::jsonb), p_action_key, p_project_id,
    v_quote.rule_version, v_quote.catalog_cost
  ) RETURNING id INTO v_charge_id;

  IF v_quote.included THEN
    INSERT INTO public.credit_included_benefits (
      user_id, action_key, scope_key, charge_id, project_id
    ) VALUES (
      p_user_id, p_action_key, v_quote.included_scope_key, v_charge_id, p_project_id
    );
  END IF;

  v_remaining := v_quote.effective_cost;
  FOR v_grant IN
    SELECT g.id, g.credits, g.forfeited_credits
    FROM public.credit_grants g
    WHERE g.user_id = p_user_id
      AND g.revoked_at IS NULL
      AND (g.expires_at IS NULL OR g.expires_at > now())
    ORDER BY g.expires_at ASC NULLS LAST, g.created_at ASC, g.id ASC
    FOR UPDATE
  LOOP
    EXIT WHEN v_remaining = 0;

    SELECT coalesce(sum(a.credits_used), 0)::integer INTO v_spent
    FROM public.generation_charge_allocations a
    JOIN public.generation_charges c ON c.id = a.charge_id
    WHERE a.grant_id = v_grant.id
      AND c.status IN ('pending', 'success');

    v_available := greatest(v_grant.credits - v_grant.forfeited_credits - v_spent, 0);
    IF v_available <= 0 THEN CONTINUE; END IF;

    INSERT INTO public.generation_charge_allocations (charge_id, grant_id, credits_used)
    VALUES (v_charge_id, v_grant.id, least(v_available, v_remaining));

    v_remaining := v_remaining - least(v_available, v_remaining);
  END LOOP;

  IF v_remaining > 0 THEN
    RAISE EXCEPTION 'INSUFFICIENT_CREDITS';
  END IF;

  IF v_quote.effective_cost > 0 THEN
    INSERT INTO public.credit_transactions (
      user_id, transaction_type, credits_delta, charge_id, action_key,
      idempotency_key, description, metadata
    ) VALUES (
      p_user_id, 'charge', -v_quote.effective_cost, v_charge_id, p_action_key,
      'charge:' || v_charge_id::text, v_quote.user_label, coalesce(p_metadata, '{}'::jsonb)
    );
  END IF;

  RETURN QUERY SELECT
    v_charge_id,
    'pending'::text,
    v_quote.effective_cost,
    v_quote.included,
    public.credit_available_balance_v2(p_user_id, now()),
    v_quote.rule_version;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_credit_action_v2(
  p_user_id uuid,
  p_charge_id uuid,
  p_result_type text,
  p_result_id text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF btrim(coalesce(p_result_type, '')) = '' OR btrim(coalesce(p_result_id, '')) = '' THEN
    RAISE EXCEPTION 'CREDIT_RESULT_REFERENCE_REQUIRED';
  END IF;

  UPDATE public.generation_charges c
  SET status = 'success',
      completed_at = now(),
      metadata = coalesce(c.metadata, '{}'::jsonb) || coalesce(p_metadata, '{}'::jsonb)
        || pg_catalog.jsonb_build_object('result_type', p_result_type, 'result_id', p_result_id)
  WHERE c.id = p_charge_id AND c.user_id = p_user_id AND c.status = 'pending';

  IF FOUND THEN RETURN true; END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.generation_charges c
    WHERE c.id = p_charge_id AND c.user_id = p_user_id AND c.status = 'success'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.refund_credit_action_v2(
  p_user_id uuid,
  p_charge_id uuid,
  p_reason text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_charge public.generation_charges%ROWTYPE;
BEGIN
  SELECT * INTO v_charge
  FROM public.generation_charges c
  WHERE c.id = p_charge_id AND c.user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN RETURN false; END IF;
  IF v_charge.status = 'refunded' THEN RETURN true; END IF;
  IF v_charge.status = 'success' THEN RETURN false; END IF;

  UPDATE public.generation_charges
  SET status = 'refunded', refunded_at = now(), failure_reason = left(coalesce(p_reason, 'generation_failed'), 500)
  WHERE id = p_charge_id;

  DELETE FROM public.credit_included_benefits WHERE charge_id = p_charge_id;

  IF v_charge.credits_charged > 0 THEN
    INSERT INTO public.credit_transactions (
      user_id, transaction_type, credits_delta, charge_id, action_key,
      idempotency_key, description, metadata
    ) VALUES (
      p_user_id, 'refund', v_charge.credits_charged, p_charge_id, v_charge.action_key,
      'refund:' || p_charge_id::text, 'Automatic refund',
      pg_catalog.jsonb_build_object('reason', left(coalesce(p_reason, 'generation_failed'), 500))
    ) ON CONFLICT (user_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING;
  END IF;

  RETURN true;
END;
$$;

-- Atomic, idempotent credit grant. Annual grants are first recorded in full;
-- any annual bucket amount above 600 is then forfeited from the oldest unused
-- annual credits in the same transaction.
CREATE OR REPLACE FUNCTION public.record_credit_grant_v2(
  p_user_id uuid,
  p_grant_type text,
  p_credits integer,
  p_source_id text,
  p_cycle_key text,
  p_expires_at timestamptz DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE(grant_id uuid, granted boolean, available_credits integer, annual_forfeited integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_grant_id uuid;
  v_existing_id uuid;
  v_annual_balance integer := 0;
  v_overflow integer := 0;
  v_forfeit integer := 0;
  v_spent integer;
  v_available integer;
  v_grant record;
BEGIN
  IF p_user_id IS NULL OR p_credits <= 0 OR btrim(coalesce(p_cycle_key, '')) = '' THEN
    RAISE EXCEPTION 'INVALID_CREDIT_GRANT_INPUT';
  END IF;
  IF p_grant_type NOT IN ('free_signup', 'monthly_pro', 'annual_pro', 'one_time_pack', 'referral_bonus', 'migration', 'admin_grant') THEN
    RAISE EXCEPTION 'UNSUPPORTED_CREDIT_GRANT_TYPE';
  END IF;
  IF (p_grant_type = 'free_signup' AND p_credits <> 20)
     OR (p_grant_type IN ('monthly_pro', 'annual_pro') AND p_credits <> 150)
     OR (p_grant_type = 'one_time_pack' AND p_credits <> 200) THEN
    RAISE EXCEPTION 'CREDIT_GRANT_AMOUNT_MISMATCH';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('credits-v2:' || p_user_id::text, 0)
  );

  SELECT g.id INTO v_existing_id
  FROM public.credit_grants g
  WHERE g.user_id = p_user_id AND g.grant_type = p_grant_type AND g.cycle_key = p_cycle_key;

  IF v_existing_id IS NOT NULL THEN
    RETURN QUERY SELECT v_existing_id, false,
      public.credit_available_balance_v2(p_user_id, now()), 0;
    RETURN;
  END IF;

  INSERT INTO public.credit_grants (
    user_id, grant_type, credits, source_id, cycle_key, expires_at, metadata
  ) VALUES (
    p_user_id, p_grant_type, p_credits, nullif(btrim(coalesce(p_source_id, '')), ''),
    p_cycle_key, p_expires_at, coalesce(p_metadata, '{}'::jsonb)
  ) RETURNING id INTO v_grant_id;

  INSERT INTO public.credit_transactions (
    user_id, transaction_type, credits_delta, grant_id, cycle_key,
    idempotency_key, description, metadata
  ) VALUES (
    p_user_id,
    CASE WHEN p_grant_type = 'migration' THEN 'migration' ELSE 'grant' END,
    p_credits, v_grant_id, p_cycle_key,
    'grant:' || p_grant_type || ':' || p_cycle_key,
    CASE p_grant_type
      WHEN 'annual_pro' THEN '150 Annual Pro credits added'
      WHEN 'monthly_pro' THEN '150 Pro Monthly credits added'
      WHEN 'one_time_pack' THEN 'Logo Credit Pack added'
      WHEN 'free_signup' THEN 'Free credits added'
      ELSE 'Credits added'
    END,
    coalesce(p_metadata, '{}'::jsonb)
  );

  IF p_grant_type = 'annual_pro' THEN
    SELECT coalesce(sum(g.credits - g.forfeited_credits - coalesce(spent.credits_used, 0)), 0)::integer
      INTO v_annual_balance
    FROM public.credit_grants g
    LEFT JOIN LATERAL (
      SELECT coalesce(sum(a.credits_used), 0)::integer AS credits_used
      FROM public.generation_charge_allocations a
      JOIN public.generation_charges c ON c.id = a.charge_id
      WHERE a.grant_id = g.id AND c.status IN ('pending', 'success')
    ) spent ON true
    WHERE g.user_id = p_user_id
      AND g.grant_type = 'annual_pro'
      AND g.revoked_at IS NULL
      AND (g.expires_at IS NULL OR g.expires_at > now());

    v_overflow := greatest(v_annual_balance - 600, 0);

    FOR v_grant IN
      SELECT g.id, g.credits, g.forfeited_credits
      FROM public.credit_grants g
      WHERE g.user_id = p_user_id
        AND g.grant_type = 'annual_pro'
        AND g.revoked_at IS NULL
        AND (g.expires_at IS NULL OR g.expires_at > now())
      ORDER BY g.created_at ASC, g.id ASC
      FOR UPDATE
    LOOP
      EXIT WHEN v_overflow = 0;

      SELECT coalesce(sum(a.credits_used), 0)::integer INTO v_spent
      FROM public.generation_charge_allocations a
      JOIN public.generation_charges c ON c.id = a.charge_id
      WHERE a.grant_id = v_grant.id AND c.status IN ('pending', 'success');

      v_available := greatest(v_grant.credits - v_grant.forfeited_credits - v_spent, 0);
      IF v_available <= 0 THEN CONTINUE; END IF;

      v_forfeit := least(v_available, v_overflow);
      UPDATE public.credit_grants
      SET forfeited_credits = forfeited_credits + v_forfeit
      WHERE id = v_grant.id;

      INSERT INTO public.credit_transactions (
        user_id, transaction_type, credits_delta, grant_id, cycle_key,
        idempotency_key, description, metadata
      ) VALUES (
        p_user_id, 'expired_at_cap', -v_forfeit, v_grant.id, p_cycle_key,
        'annual-cap:' || p_cycle_key || ':' || v_grant.id::text,
        'Annual Pro rollover expired at the 600-credit limit',
        pg_catalog.jsonb_build_object('annual_cap', 600, 'source_grant_id', v_grant.id)
      );

      v_overflow := v_overflow - v_forfeit;
    END LOOP;
  END IF;

  RETURN QUERY SELECT
    v_grant_id, true, public.credit_available_balance_v2(p_user_id, now()),
    greatest(v_annual_balance - 600, 0);
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. RLS and least-privilege function access
-- ---------------------------------------------------------------------------
ALTER TABLE public.credit_action_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_migration_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_included_benefits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS brand_projects_select_own ON public.brand_projects;
CREATE POLICY brand_projects_select_own
  ON public.brand_projects FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

REVOKE ALL ON public.credit_action_catalog FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.credit_system_settings FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.brand_projects FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.billing_entitlements FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.credit_migration_snapshots FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.credit_included_benefits FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.credit_transactions FROM PUBLIC, anon, authenticated;

GRANT SELECT ON public.brand_projects TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.credit_action_catalog TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.credit_system_settings TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.brand_projects TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.billing_entitlements TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.credit_migration_snapshots TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.credit_included_benefits TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.credit_transactions TO service_role;

REVOKE ALL ON FUNCTION public.credit_available_balance_v2(uuid, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.credit_active_entitlement_v2(uuid, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.quote_credit_action_v2(uuid, text, uuid, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reserve_credit_action_v2(uuid, uuid, text, text, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_credit_action_v2(uuid, uuid, text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refund_credit_action_v2(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_credit_grant_v2(uuid, text, integer, text, text, timestamptz, jsonb) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.credit_available_balance_v2(uuid, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.credit_active_entitlement_v2(uuid, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.quote_credit_action_v2(uuid, text, uuid, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.reserve_credit_action_v2(uuid, uuid, text, text, uuid, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_credit_action_v2(uuid, uuid, text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.refund_credit_action_v2(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_credit_grant_v2(uuid, text, integer, text, text, timestamptz, jsonb) TO service_role;
