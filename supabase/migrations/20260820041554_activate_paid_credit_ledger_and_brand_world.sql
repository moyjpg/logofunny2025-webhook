-- Paid credit ledger activation and the Brand World image transaction.
-- Existing logo generations stay on their legacy counter until they are migrated
-- separately. This migration only enables the already-published paid credit
-- products and the new paid-only Brand World image.

ALTER TABLE public.generation_charges
  DROP CONSTRAINT IF EXISTS generation_charges_status_check;

ALTER TABLE public.generation_charges
  ADD CONSTRAINT generation_charges_status_check
  CHECK (status IN ('pending', 'success', 'failed', 'refunded'));

CREATE UNIQUE INDEX IF NOT EXISTS generation_charges_brand_world_request_unique
  ON public.generation_charges (user_id, route, request_id)
  WHERE route = 'brand_world_image' AND request_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.brand_world_scenes (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_creation_id text NOT NULL,
  source_logo_url    text NOT NULL,
  brand_name         text NOT NULL,
  template           text NOT NULL,
  prompt_version     text NOT NULL DEFAULT 'brand-world-v1',
  model              text NOT NULL,
  r2_key             text NOT NULL UNIQUE,
  image_url          text NOT NULL,
  charge_id          uuid NOT NULL UNIQUE REFERENCES public.generation_charges(id) ON DELETE RESTRICT,
  request_id         uuid NOT NULL UNIQUE,
  status             text NOT NULL DEFAULT 'completed'
                     CHECK (status IN ('completed', 'failed', 'refunded')),
  created_at         timestamptz NOT NULL DEFAULT now(),
  completed_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS brand_world_scenes_user_creation_created_idx
  ON public.brand_world_scenes (user_id, source_creation_id, created_at DESC);

ALTER TABLE public.brand_world_scenes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS brand_world_scenes_select_own ON public.brand_world_scenes;
CREATE POLICY brand_world_scenes_select_own
  ON public.brand_world_scenes
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.brand_world_scenes TO service_role;
REVOKE ALL ON public.brand_world_scenes FROM anon, authenticated;

-- Records a paid grant and its Dodo event together. The event insert is the
-- idempotency gate, so a webhook retry cannot issue credits twice.
CREATE OR REPLACE FUNCTION public.record_paid_credit_grant(
  p_event_id text,
  p_event_type text,
  p_event_payload jsonb,
  p_user_id uuid,
  p_grant_type text,
  p_credits integer,
  p_source_id text DEFAULT NULL,
  p_expires_at timestamptz DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_inserted uuid;
BEGIN
  IF p_event_id IS NULL OR btrim(p_event_id) = '' OR p_user_id IS NULL OR p_credits <= 0 THEN
    RAISE EXCEPTION 'Invalid paid credit grant input';
  END IF;

  IF p_grant_type NOT IN ('monthly_pro', 'one_time_pack') THEN
    RAISE EXCEPTION 'Unsupported paid grant type';
  END IF;

  INSERT INTO public.dodo_webhook_events (event_id, event_type, payload, processed_at)
  VALUES (p_event_id, p_event_type, coalesce(p_event_payload, '{}'::jsonb), now())
  ON CONFLICT (event_id) DO NOTHING
  RETURNING id INTO v_event_inserted;

  IF v_event_inserted IS NULL THEN
    RETURN false;
  END IF;

  INSERT INTO public.credit_grants (user_id, grant_type, credits, source_id, expires_at, metadata)
  VALUES (p_user_id, p_grant_type, p_credits, p_source_id, p_expires_at, coalesce(p_metadata, '{}'::jsonb));

  RETURN true;
END;
$$;

-- Debits 8 credits atomically from active grants. Only the server's service
-- role can call this function; browser clients cannot select or mutate the
-- ledger tables directly.
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
      AND (g.expires_at IS NULL OR g.expires_at > now());
    RETURN QUERY SELECT v_existing_charge, greatest(v_total_remaining, 0);
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.user_profiles p
    WHERE p.id = p_user_id
      AND (p.is_pro = true OR p.plan <> 'free')
  ) OR EXISTS (
    SELECT 1
    FROM public.credit_grants g
    WHERE g.user_id = p_user_id
      AND g.grant_type IN ('monthly_pro', 'one_time_pack', 'admin_grant')
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
    SELECT g.id, g.credits
    FROM public.credit_grants g
    WHERE g.user_id = p_user_id
      AND (g.expires_at IS NULL OR g.expires_at > now())
    ORDER BY g.expires_at ASC NULLS LAST, g.created_at ASC
    FOR UPDATE
  LOOP
    SELECT coalesce(sum(gca.credits_used), 0)::integer INTO v_spent
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

  RETURN QUERY SELECT v_charge_id, greatest(v_total_remaining, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_brand_world_scene(
  p_user_id uuid,
  p_charge_id uuid,
  p_request_id uuid,
  p_source_creation_id text,
  p_source_logo_url text,
  p_brand_name text,
  p_template text,
  p_model text,
  p_r2_key text,
  p_image_url text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_scene_id uuid;
BEGIN
  UPDATE public.generation_charges
  SET status = 'success'
  WHERE id = p_charge_id AND user_id = p_user_id AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Brand World charge is not pending';
  END IF;

  INSERT INTO public.brand_world_scenes (
    user_id, source_creation_id, source_logo_url, brand_name, template,
    model, r2_key, image_url, charge_id, request_id
  ) VALUES (
    p_user_id, p_source_creation_id, p_source_logo_url, left(p_brand_name, 120), p_template,
    p_model, p_r2_key, p_image_url, p_charge_id, p_request_id
  ) RETURNING id INTO v_scene_id;

  RETURN v_scene_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.refund_brand_world_charge(
  p_user_id uuid,
  p_charge_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.generation_charges
  SET status = 'refunded'
  WHERE id = p_charge_id
    AND user_id = p_user_id
    AND status IN ('pending', 'failed');
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.record_paid_credit_grant(text, text, jsonb, uuid, text, integer, text, timestamptz, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.charge_brand_world_scene(uuid, uuid, text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_brand_world_scene(uuid, uuid, uuid, text, text, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refund_brand_world_charge(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_paid_credit_grant(text, text, jsonb, uuid, text, integer, text, timestamptz, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.charge_brand_world_scene(uuid, uuid, text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_brand_world_scene(uuid, uuid, uuid, text, text, text, text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.refund_brand_world_charge(uuid, uuid) TO service_role;
