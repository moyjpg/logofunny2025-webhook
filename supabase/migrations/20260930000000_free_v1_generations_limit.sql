-- Free V1 entitlement alignment (locked product decision):
-- Free users get 4 generations total (2-logo-only per generation, 5
-- displayed credits each = 20 credits), not the previous 2.
--
-- Two parts:
--   1. check_and_increment_generation()'s "no row yet" bootstrap branch now
--      explicitly inserts generations_limit = 4 for brand-new users, instead
--      of relying on the user_profiles table's column default (unknown/not
--      version-controlled).
--   2. A one-time data migration (below) brings EXISTING normal Free rows'
--      generations_limit to 4 as well, so the locked V1 truth applies
--      uniformly -- not just to users who haven't generated yet. This is
--      deliberately two-directional: a legacy row currently above 4 (e.g. a
--      pre-2026-05-14 "5" row, if any still exist) is brought DOWN to 4, not
--      just rows currently below 4 brought up. generations_used and
--      referral_bonus_generations are never touched by either part.
--
-- Row selection for part 2 is the exact logical negation of the bypass
-- condition already shared, verbatim, by both this function and
-- get_current_user_access_v1() (20260823035035_secure_current_user_access_rpc.sql):
-- a row is left untouched if it is internal_test-overridden, OR
-- (is_pro OR plan <> 'free') AND subscription_status = 'active'. Every other
-- row is exactly what the system's own access_source = 'free' classification
-- already means -- there is no separately-invented heuristic here.
--
-- NOT APPLIED to Production by this commit. Review and run manually.

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
    -- Free V1: explicit generations_limit = 4 for brand-new users, matching
    -- app/api/profile/route.ts's FREE_GENERATIONS_LIMIT. Passed explicitly
    -- so this is correct regardless of the table's own column default.
    INSERT INTO public.user_profiles (id, generations_limit)
    VALUES (v_user_uuid, 4)
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

-- Part 2: align existing normal Free rows' base generations_limit to 4.
-- generations_used and referral_bonus_generations are untouched -- only
-- generations_limit (and updated_at) change, for rows not already at 4.
UPDATE public.user_profiles p
SET generations_limit = 4,
    updated_at = now()
WHERE NOT EXISTS (
    SELECT 1
    FROM public.account_access_overrides o
    WHERE o.user_id = p.id
      AND o.access_kind = 'internal_test'
      AND o.enabled = true
      AND (o.expires_at IS NULL OR o.expires_at > now())
  )
  AND NOT (
    (p.is_pro OR p.plan <> 'free')
    AND lower(coalesce(p.subscription_status, '')) = 'active'
  )
  AND p.generations_limit IS DISTINCT FROM 4;
