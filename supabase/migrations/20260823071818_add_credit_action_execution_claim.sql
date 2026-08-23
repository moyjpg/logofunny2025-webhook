-- Prevent duplicated provider calls for the same Credits v2 reservation.
--
-- reserve_credit_action_v2() already makes the debit idempotent. This
-- additional claim makes the expensive model call single-owner as well: only
-- the first server request may advance a pending reservation into execution.

create or replace function public.claim_credit_action_execution_v2(
  p_user_id uuid,
  p_charge_id uuid,
  p_request_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.generation_charges c
  set metadata = coalesce(c.metadata, '{}'::jsonb)
    || pg_catalog.jsonb_build_object('execution_claimed_at', now())
  where c.id = p_charge_id
    and c.user_id = p_user_id
    and c.request_id = p_request_id::text
    and c.status = 'pending'
    and not (coalesce(c.metadata, '{}'::jsonb) ? 'execution_claimed_at');

  return found;
end;
$$;

revoke all on function public.claim_credit_action_execution_v2(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.claim_credit_action_execution_v2(uuid, uuid, uuid)
  to service_role;
