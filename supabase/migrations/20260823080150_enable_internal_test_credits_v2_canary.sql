-- P0 Credits v2 canary: exercise the real wallet with the owner-confirmed
-- internal test account while every customer continues using the legacy path.

insert into public.credit_system_settings (setting_key, enabled, metadata)
values (
  'wallet_v2_internal_test_canary',
  true,
  jsonb_build_object(
    'scope', 'account_access_overrides.internal_test',
    'public_rollout', false,
    'approved_on', '2026-08-23'
  )
)
on conflict (setting_key) do update set
  enabled = excluded.enabled,
  metadata = excluded.metadata,
  updated_at = now();

create or replace function public.credit_ledger_v2_enabled_for_user(
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce((
      select s.enabled
      from public.credit_system_settings s
      where s.setting_key = 'wallet_v2_enforcement'
    ), false)
    or (
      coalesce((
        select s.enabled
        from public.credit_system_settings s
        where s.setting_key = 'wallet_v2_internal_test_canary'
      ), false)
      and exists (
        select 1
        from public.account_access_overrides o
        where o.user_id = p_user_id
          and o.access_kind = 'internal_test'
          and o.enabled = true
          and (o.expires_at is null or o.expires_at > now())
      )
    );
$$;

revoke all on function public.credit_ledger_v2_enabled_for_user(uuid)
from public, anon, authenticated;
grant execute on function public.credit_ledger_v2_enabled_for_user(uuid)
to service_role;

create or replace function public.reserve_credit_action_v2(
  p_user_id uuid,
  p_request_id uuid,
  p_action_key text,
  p_expected_rule_version text,
  p_project_id uuid default null,
  p_brand_name text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns table(
  charge_id uuid,
  charge_status text,
  credits_reserved integer,
  included boolean,
  remaining_credits integer,
  rule_version text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.generation_charges%rowtype;
  v_quote record;
  v_charge_id uuid;
  v_remaining integer;
  v_available integer;
  v_spent integer;
  v_grant record;
begin
  if p_user_id is null or p_request_id is null or btrim(coalesce(p_action_key, '')) = '' then
    raise exception 'INVALID_CREDIT_RESERVATION_INPUT';
  end if;

  if not public.credit_ledger_v2_enabled_for_user(p_user_id) then
    raise exception 'CREDIT_LEDGER_V2_NOT_ENABLED';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('credits-v2:' || p_user_id::text, 0)
  );

  select * into v_existing
  from public.generation_charges c
  where c.user_id = p_user_id
    and c.action_key = p_action_key
    and c.request_id = p_request_id::text;

  if found then
    return query select
      v_existing.id,
      v_existing.status,
      v_existing.credits_charged,
      v_existing.credits_charged = 0,
      public.credit_available_balance_v2(p_user_id, now()),
      v_existing.catalog_rule_version;
    return;
  end if;

  select * into v_quote
  from public.quote_credit_action_v2(p_user_id, p_action_key, p_project_id, now());

  if v_quote.rule_version <> p_expected_rule_version then
    raise exception 'CREDIT_PRICE_CHANGED';
  end if;
  if not v_quote.eligible then
    raise exception 'PAID_FEATURE_REQUIRED';
  end if;
  if v_quote.current_balance < v_quote.effective_cost then
    raise exception 'INSUFFICIENT_CREDITS';
  end if;

  insert into public.generation_charges (
    user_id, route, credits_charged, status, request_id, brand_name, metadata,
    action_key, project_id, catalog_rule_version, quoted_cost
  ) values (
    p_user_id, p_action_key, v_quote.effective_cost, 'pending', p_request_id::text,
    nullif(left(btrim(coalesce(p_brand_name, '')), 120), ''),
    coalesce(p_metadata, '{}'::jsonb), p_action_key, p_project_id,
    v_quote.rule_version, v_quote.catalog_cost
  ) returning id into v_charge_id;

  if v_quote.included then
    insert into public.credit_included_benefits (
      user_id, action_key, scope_key, charge_id, project_id
    ) values (
      p_user_id, p_action_key, v_quote.included_scope_key, v_charge_id, p_project_id
    );
  end if;

  v_remaining := v_quote.effective_cost;
  for v_grant in
    select g.id, g.credits, g.forfeited_credits
    from public.credit_grants g
    where g.user_id = p_user_id
      and g.revoked_at is null
      and (g.expires_at is null or g.expires_at > now())
    order by g.expires_at asc nulls last, g.created_at asc, g.id asc
    for update
  loop
    exit when v_remaining = 0;

    select coalesce(sum(a.credits_used), 0)::integer into v_spent
    from public.generation_charge_allocations a
    join public.generation_charges c on c.id = a.charge_id
    where a.grant_id = v_grant.id
      and c.status in ('pending', 'success');

    v_available := greatest(v_grant.credits - v_grant.forfeited_credits - v_spent, 0);
    if v_available <= 0 then continue; end if;

    insert into public.generation_charge_allocations (charge_id, grant_id, credits_used)
    values (v_charge_id, v_grant.id, least(v_available, v_remaining));

    v_remaining := v_remaining - least(v_available, v_remaining);
  end loop;

  if v_remaining > 0 then
    raise exception 'INSUFFICIENT_CREDITS';
  end if;

  if v_quote.effective_cost > 0 then
    insert into public.credit_transactions (
      user_id, transaction_type, credits_delta, charge_id, action_key,
      idempotency_key, description, metadata
    ) values (
      p_user_id, 'charge', -v_quote.effective_cost, v_charge_id, p_action_key,
      'charge:' || v_charge_id::text, v_quote.user_label, coalesce(p_metadata, '{}'::jsonb)
    );
  end if;

  return query select
    v_charge_id,
    'pending'::text,
    v_quote.effective_cost,
    v_quote.included,
    public.credit_available_balance_v2(p_user_id, now()),
    v_quote.rule_version;
end;
$$;

revoke all on function public.reserve_credit_action_v2(uuid, uuid, text, text, uuid, text, jsonb)
from public, anon, authenticated;
grant execute on function public.reserve_credit_action_v2(uuid, uuid, text, text, uuid, text, jsonb)
to service_role;

do $canary$
declare
  v_user_id uuid;
begin
  if coalesce((
    select enabled
    from public.credit_system_settings
    where setting_key = 'wallet_v2_enforcement'
  ), true) then
    raise exception 'The public Credits v2 rollout must remain disabled during canary testing';
  end if;

  select o.user_id into v_user_id
  from public.account_access_overrides o
  where o.access_kind = 'internal_test'
    and o.enabled = true
    and (o.expires_at is null or o.expires_at > now());

  if v_user_id is null
     or (select count(*) from public.account_access_overrides o
         where o.access_kind = 'internal_test' and o.enabled = true
           and (o.expires_at is null or o.expires_at > now())) <> 1
     or not public.credit_ledger_v2_enabled_for_user(v_user_id)
     or has_function_privilege('anon', 'public.credit_ledger_v2_enabled_for_user(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.credit_ledger_v2_enabled_for_user(uuid)', 'execute')
     or not has_function_privilege('service_role', 'public.credit_ledger_v2_enabled_for_user(uuid)', 'execute') then
    raise exception 'Internal Credits v2 canary preflight failed';
  end if;

  perform public.record_credit_grant_v2(
    v_user_id,
    'admin_grant',
    1000,
    'internal-test-canary',
    'internal-test-canary-v1',
    null,
    jsonb_build_object(
      'purpose', 'LogoFunny production canary testing',
      'exclude_from_customer_credit_metrics', true,
      'approved_on', '2026-08-23'
    )
  );
end
$canary$;
