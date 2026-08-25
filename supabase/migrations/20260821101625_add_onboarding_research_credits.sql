-- Authenticated public-web research for the LogoFunny onboarding advisor.
--
-- Pricing contract:
--   ordinary brand conversation       0 credits
--   user-confirmed public research     2 credits
--   image-guided 4-logo generation    10 credits (existing generation unit)
--
-- This migration activates only the 2-credit research transaction. Existing
-- logo generation and Brand World charging remain unchanged.

CREATE UNIQUE INDEX IF NOT EXISTS generation_charges_onboarding_research_request_unique
  ON public.generation_charges (user_id, route, request_id)
  WHERE route = 'onboarding_public_research' AND request_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.onboarding_research_reports (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_id         uuid NOT NULL UNIQUE,
  charge_id          uuid NOT NULL UNIQUE REFERENCES public.generation_charges(id) ON DELETE RESTRICT,
  brand_name         text NOT NULL,
  research_question  text NOT NULL,
  summary            text NOT NULL,
  sources            jsonb NOT NULL CHECK (jsonb_typeof(sources) = 'array'),
  model              text NOT NULL,
  provider_response_id text,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS onboarding_research_reports_user_created_idx
  ON public.onboarding_research_reports (user_id, created_at DESC);

ALTER TABLE public.onboarding_research_reports ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.onboarding_research_reports TO service_role;
REVOKE ALL ON public.onboarding_research_reports FROM anon, authenticated;

-- Reserves exactly 2 credits from the user's active grants. A repeated
-- request_id returns the existing charge rather than charging twice.
CREATE OR REPLACE FUNCTION public.charge_onboarding_research(
  p_user_id uuid,
  p_request_id uuid,
  p_brand_name text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE(charge_id uuid, charge_status text, remaining_credits integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_charge_id uuid;
  v_charge_status text;
  v_remaining integer := 2;
  v_available integer;
  v_spent integer;
  v_total_remaining integer := 0;
  v_grant record;
BEGIN
  IF p_user_id IS NULL OR p_request_id IS NULL OR btrim(coalesce(p_brand_name, '')) = '' THEN
    RAISE EXCEPTION 'Invalid onboarding research charge input';
  END IF;

  -- Serialize retries for this user/request pair before the idempotency read.
  -- This closes the narrow race where two identical confirmation clicks could
  -- both pass the initial lookup before either charge row exists.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text || ':' || p_request_id::text, 0)
  );

  SELECT gc.id, gc.status
    INTO v_charge_id, v_charge_status
  FROM public.generation_charges gc
  WHERE gc.user_id = p_user_id
    AND gc.route = 'onboarding_public_research'
    AND gc.request_id = p_request_id::text;

  IF v_charge_id IS NOT NULL THEN
    IF v_charge_status = 'refunded' THEN
      RAISE EXCEPTION 'RESEARCH_REQUEST_ALREADY_REFUNDED';
    END IF;

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
      AND (g.expires_at IS NULL OR g.expires_at > now());

    RETURN QUERY SELECT v_charge_id, v_charge_status, greatest(v_total_remaining, 0);
    RETURN;
  END IF;

  INSERT INTO public.generation_charges (
    user_id, route, credits_charged, status, request_id, brand_name, metadata
  ) VALUES (
    p_user_id,
    'onboarding_public_research',
    2,
    'pending',
    p_request_id::text,
    left(p_brand_name, 120),
    coalesce(p_metadata, '{}'::jsonb)
  ) RETURNING id, status INTO v_charge_id, v_charge_status;

  FOR v_grant IN
    SELECT g.id, g.credits
    FROM public.credit_grants g
    WHERE g.user_id = p_user_id
      AND (g.expires_at IS NULL OR g.expires_at > now())
    ORDER BY g.expires_at ASC NULLS LAST, g.created_at ASC
    FOR UPDATE
  LOOP
    SELECT coalesce(sum(gca.credits_used), 0)::integer
      INTO v_spent
    FROM public.generation_charge_allocations gca
    JOIN public.generation_charges gc ON gc.id = gca.charge_id
    WHERE gca.grant_id = v_grant.id
      AND gc.status IN ('pending', 'success');

    v_available := greatest(v_grant.credits - v_spent, 0);
    IF v_available <= 0 THEN CONTINUE; END IF;

    INSERT INTO public.generation_charge_allocations (charge_id, grant_id, credits_used)
    VALUES (v_charge_id, v_grant.id, least(v_available, v_remaining));

    v_remaining := v_remaining - least(v_available, v_remaining);
    EXIT WHEN v_remaining = 0;
  END LOOP;

  IF v_remaining > 0 THEN
    RAISE EXCEPTION 'INSUFFICIENT_CREDITS';
  END IF;

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
    AND (g.expires_at IS NULL OR g.expires_at > now());

  RETURN QUERY SELECT v_charge_id, v_charge_status, greatest(v_total_remaining, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_onboarding_research(
  p_user_id uuid,
  p_charge_id uuid,
  p_request_id uuid,
  p_brand_name text,
  p_research_question text,
  p_summary text,
  p_sources jsonb,
  p_model text,
  p_provider_response_id text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_report_id uuid;
BEGIN
  SELECT r.id INTO v_report_id
  FROM public.onboarding_research_reports r
  WHERE r.user_id = p_user_id AND r.request_id = p_request_id;

  IF v_report_id IS NOT NULL THEN
    RETURN v_report_id;
  END IF;

  IF btrim(coalesce(p_summary, '')) = ''
     OR jsonb_typeof(coalesce(p_sources, 'null'::jsonb)) <> 'array'
     OR jsonb_array_length(p_sources) = 0 THEN
    RAISE EXCEPTION 'Research result must include a summary and public sources';
  END IF;

  UPDATE public.generation_charges
  SET status = 'success'
  WHERE id = p_charge_id
    AND user_id = p_user_id
    AND route = 'onboarding_public_research'
    AND request_id = p_request_id::text
    AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Onboarding research charge is not pending';
  END IF;

  INSERT INTO public.onboarding_research_reports (
    user_id, request_id, charge_id, brand_name, research_question,
    summary, sources, model, provider_response_id
  ) VALUES (
    p_user_id,
    p_request_id,
    p_charge_id,
    left(btrim(p_brand_name), 120),
    left(btrim(p_research_question), 1000),
    left(btrim(p_summary), 8000),
    p_sources,
    left(btrim(p_model), 120),
    nullif(left(btrim(coalesce(p_provider_response_id, '')), 180), '')
  )
  RETURNING id INTO v_report_id;

  RETURN v_report_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.refund_onboarding_research(
  p_user_id uuid,
  p_charge_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.generation_charges
  SET status = 'refunded'
  WHERE id = p_charge_id
    AND user_id = p_user_id
    AND route = 'onboarding_public_research'
    AND status IN ('pending', 'failed');

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.charge_onboarding_research(uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_onboarding_research(uuid, uuid, uuid, text, text, text, jsonb, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refund_onboarding_research(uuid, uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.charge_onboarding_research(uuid, uuid, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_onboarding_research(uuid, uuid, uuid, text, text, text, jsonb, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.refund_onboarding_research(uuid, uuid) TO service_role;
