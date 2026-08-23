begin;

create extension if not exists pgtap with schema extensions;
select plan(4);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values (
  '10000000-0000-4000-8000-000000000011',
  'authenticated',
  'authenticated',
  'credits-v2-claim@example.invalid',
  '',
  now(),
  now(),
  now()
);

select lives_ok(
  $$select * from public.record_credit_grant_v2(
    '10000000-0000-4000-8000-000000000011',
    'free_signup',
    20,
    'claim-test',
    'claim-test-free-signup',
    null,
    '{"test":true}'::jsonb
  )$$,
  'the test wallet can receive its free grant'
);

update public.credit_system_settings
set enabled = true
where setting_key = 'wallet_v2_enforcement';

select lives_ok(
  $$select * from public.reserve_credit_action_v2(
    '10000000-0000-4000-8000-000000000011',
    '20000000-0000-4000-8000-000000000011',
    'logo_concepts_standard',
    'credits-rules-v2',
    null,
    'Claim test',
    '{}'::jsonb
  )$$,
  'the Logo Concepts action can reserve credits'
);

select ok(
  public.claim_credit_action_execution_v2(
    '10000000-0000-4000-8000-000000000011',
    (select id from public.generation_charges
     where user_id = '10000000-0000-4000-8000-000000000011'
       and request_id = '20000000-0000-4000-8000-000000000011'),
    '20000000-0000-4000-8000-000000000011'
  ),
  'the first request owns the provider execution'
);

select isnt(
  public.claim_credit_action_execution_v2(
    '10000000-0000-4000-8000-000000000011',
    (select id from public.generation_charges
     where user_id = '10000000-0000-4000-8000-000000000011'
       and request_id = '20000000-0000-4000-8000-000000000011'),
    '20000000-0000-4000-8000-000000000011'
  ),
  true,
  'a duplicate request cannot call the provider again'
);

select * from finish();
rollback;
