-- Return the caller's effective LogoFunny access from one database decision.
-- This avoids joining server-only override data in application code while
-- keeping the internal-test table unavailable through the Data API.

CREATE OR REPLACE FUNCTION public.get_current_user_access_v1()
RETURNS TABLE (
  plan text,
  has_pro_access boolean,
  generations_used integer,
  generations_limit integer,
  subscription_status text,
  referral_code text,
  referral_bonus_generations integer,
  is_internal_test boolean,
  access_source text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    p.plan,
    access.is_internal_test OR (
      (p.is_pro OR p.plan <> 'free')
      AND lower(coalesce(p.subscription_status, '')) = 'active'
    ) AS has_pro_access,
    p.generations_used,
    p.generations_limit,
    p.subscription_status,
    p.referral_code,
    coalesce(p.referral_bonus_generations, 0),
    access.is_internal_test,
    CASE
      WHEN access.is_internal_test THEN 'internal_test'
      WHEN (p.is_pro OR p.plan <> 'free')
       AND lower(coalesce(p.subscription_status, '')) = 'active'
        THEN 'active_subscription'
      ELSE 'free'
    END AS access_source
  FROM public.user_profiles p
  CROSS JOIN LATERAL (
    SELECT EXISTS (
      SELECT 1
      FROM public.account_access_overrides o
      WHERE o.user_id = auth.uid()
        AND o.access_kind = 'internal_test'
        AND o.enabled = true
        AND (o.expires_at IS NULL OR o.expires_at > now())
    ) AS is_internal_test
  ) access
  WHERE p.id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.get_current_user_access_v1() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_current_user_access_v1() TO authenticated, service_role;

DO $verify$
BEGIN
  IF has_function_privilege('anon', 'public.get_current_user_access_v1()', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.get_current_user_access_v1()', 'EXECUTE')
     OR (SELECT count(*) FROM public.account_access_overrides WHERE enabled) <> 1 THEN
    RAISE EXCEPTION 'Current-user access RPC verification failed';
  END IF;
END
$verify$;
